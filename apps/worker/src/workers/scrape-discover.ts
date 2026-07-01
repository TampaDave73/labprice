// `scrape-discover` worker: run a catalog-based vendor scrape (GoodLabs-style) and stage results.
// Unlike scrape-execute (one known URL per offering), this crawls the vendor's whole catalog and
// matches OUR tests into it by Quest code / LabCorp code / name — see apps/worker/src/discovery.ts.
// Auto-approved changes are handed to the scrape-publish queue, exactly like scrape-execute.
import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../redis';
import { scrapePublishQueue } from '../queues';
import { runVendorDiscovery } from '../discovery';

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

      const summary = await runVendorDiscovery({
        vendorId,
        triggeredBy: triggeredBy ?? 'SCHEDULE',
        offeringIds,
        onLog: (m) => console.log(`[discover]   ${m}`),
      });

      // Publish auto-approved changes through the normal publish queue.
      for (const stagedChangeId of summary.autoApprovedStagedIds) {
        await scrapePublishQueue.add('publish', { stagedChangeId });
      }

      return summary;
    },
    { connection: redisConnection, concurrency: 1 }, // one catalog crawl at a time per worker — be polite to vendors
  );
}
