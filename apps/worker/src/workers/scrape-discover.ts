// `scrape-discover` worker: run a catalog-based vendor scrape (GoodLabs-style) and stage results.
// Unlike scrape-execute (one known URL per offering), this crawls the vendor's whole catalog and
// matches OUR tests into it by Quest code / LabCorp code / name — see apps/worker/src/discovery.ts.
// Auto-approved changes are handed to the scrape-publish queue, exactly like scrape-execute.
import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';
import { redisConnection } from '../redis';
import { scrapePublishQueue } from '../queues';
import { runVendorDiscovery } from '../discovery';
import { sendScrapeFailureAlert } from '../report';

interface DiscoverJobData {
  vendorId: string;
  triggeredBy?: 'SCHEDULE' | 'MANUAL' | 'RETRY';
  offeringIds?: string[]; // set by requeue-on-add to price just the newly-linked test(s)
}

export function createDiscoverWorker() {
  return new Worker<DiscoverJobData>(
    'scrape-discover',
    async (job: Job<DiscoverJobData>) => {
      const { vendorId, triggeredBy, offeringIds } = job.data;
      console.log(`[discover] vendor=${vendorId} offerings=${offeringIds?.length ?? 'all'}`);

      // A few adapters (Request A Test) are JS-challenge-gated and need stealth Playwright instead of
      // plain HTTP — this queue never checked that (bug found live 2026-07-04 alongside the identical
      // gap in the web app's inline "Scrape now"), so every scheduled/queued Request A Test run failed
      // the same way the inline one did.
      const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId }, select: { selectors: true } });
      const selectors = config?.selectors as Record<string, unknown> | null;
      const needsBrowser = adapterNeedsBrowser(selectors?.adapter as string | undefined);

      let summary;
      try {
        summary = await runVendorDiscovery({
          vendorId,
          triggeredBy: triggeredBy ?? 'SCHEDULE',
          offeringIds,
          ...(needsBrowser ? { fetchHtml: browserFetchHtml() } : {}),
          onLog: (m) => console.log(`[discover]   ${m}`),
        });
      } catch (err) {
        // Alert admins immediately when an UNATTENDED (scheduled) crawl dies on its final attempt —
        // manual runs already surface errors in the admin UI. Alert then rethrow so BullMQ records
        // the failure.
        const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if ((triggeredBy ?? 'SCHEDULE') === 'SCHEDULE' && finalAttempt) {
          const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });
          await sendScrapeFailureAlert(vendorId, vendor?.name ?? vendorId, err instanceof Error ? err.message : String(err));
        }
        throw err;
      }

      // Publish auto-approved changes through the normal publish queue.
      for (const stagedChangeId of summary.autoApprovedStagedIds) {
        await scrapePublishQueue.add('publish', { stagedChangeId });
      }

      return summary;
    },
    { connection: redisConnection, concurrency: 1 }, // one catalog crawl at a time per worker — be polite to vendors
  );
}
