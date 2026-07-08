// `scrape-schedule` worker: the DAILY TICK that drives automatic scraping. Fires once a day (job
// scheduler registered in index.ts), finds vendors that are DUE (per-vendor frequencyDays vs their
// latest ScrapeJob), and enqueues the right kind of work per vendor:
//   - catalog-mode vendors  → one `scrape-discover` job (crawl catalog, match all linked tests)
//   - per-URL vendors       → one `scrape-execute` job per active offering (staggered)
// The `scrape_enabled` system setting is the master kill switch. A manual "Scrape now" also resets
// the clock — "due" counts ANY prior job, so a vendor scraped by hand yesterday isn't re-scraped
// today by the tick.
import { Worker, type Job } from 'bullmq';
import { prisma, getScrapeSettings } from '@labprice/database';
import { redisConnection } from '../redis';
import { scrapeExecuteQueue, scrapeDiscoverQueue } from '../queues';

const DAY_MS = 24 * 60 * 60 * 1000;
// Grace window so a weekly vendor scraped AT tick time isn't perpetually "not quite due" the next
// week (elapsed would be 7d minus queue latency). Anything within 6h of its interval counts as due.
const DUE_SLACK_MS = 6 * 60 * 60 * 1000;

// Same rule as apps/web/lib/catalog-mode.ts (kept dependency-free there; 3 lines, duplicated here).
function isCatalogMode(selectors: unknown): boolean {
  return !!selectors && typeof selectors === 'object' && (selectors as Record<string, unknown>).mode === 'catalog';
}

export function createScheduleWorker() {
  return new Worker(
    'scrape-schedule',
    async (job: Job) => {
      console.log(`[schedule] Tick ${job.id}`);

      const settings = await getScrapeSettings();
      if (!settings.scrapeEnabled) {
        console.log('[schedule] scrape_enabled is off — skipping tick');
        return { skipped: 'scrape_enabled off' };
      }

      // Enabled configs with a schedule (frequencyDays 0 = manual only), for live vendors only.
      const configs = await prisma.scrapeVendorConfig.findMany({
        where: { isEnabled: true, frequencyDays: { gt: 0 }, vendor: { deletedAt: null, isActive: true } },
        include: { vendor: { select: { name: true, slug: true } } },
      });

      // Latest job per vendor (any trigger/status — a failed run still counts as an attempt; BullMQ
      // retries cover transient failures, and persistent ones surface in the report, not by hammering
      // the vendor daily).
      const lastJobs = await prisma.scrapeJob.groupBy({
        by: ['vendorId'],
        where: { vendorId: { in: configs.map((c) => c.vendorId) } },
        _max: { createdAt: true },
      });
      const lastByVendor = new Map(lastJobs.map((j) => [j.vendorId, j._max.createdAt]));

      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      let discoverEnqueued = 0;
      let executeEnqueued = 0;
      const dueVendors: string[] = [];

      for (const config of configs) {
        const last = lastByVendor.get(config.vendorId);
        const due = !last || now - last.getTime() >= config.frequencyDays * DAY_MS - DUE_SLACK_MS;
        if (!due) continue;
        dueVendors.push(config.vendor.name);

        if (isCatalogMode(config.selectors)) {
          await scrapeDiscoverQueue.add(
            'discover',
            { vendorId: config.vendorId, triggeredBy: 'SCHEDULE' },
            { jobId: `sched-discover-${config.vendorId}-${today}`, attempts: 2, backoff: { type: 'exponential', delay: 60_000 } },
          );
          discoverEnqueued++;
          continue;
        }

        // Per-URL vendor: one execute job per active offering, staggered for politeness.
        const offerings = await prisma.offering.findMany({
          where: { vendorId: config.vendorId, isActive: true, deletedAt: null },
          select: { id: true, testId: true },
        });
        for (let i = 0; i < offerings.length; i++) {
          const o = offerings[i]!;
          await scrapeExecuteQueue.add(
            'scrape',
            { offeringId: o.id, vendorId: config.vendorId, testId: o.testId, triggeredBy: 'SCHEDULE' },
            {
              jobId: `scrape-${o.id}-${today}`,
              delay: i * 2000, // 2s between jobs for the same vendor
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          );
          executeEnqueued++;
        }
      }

      console.log(
        `[schedule] ${dueVendors.length}/${configs.length} vendor(s) due (${dueVendors.join(', ') || 'none'}); ` +
        `enqueued ${discoverEnqueued} discover + ${executeEnqueued} execute job(s)`,
      );
      return { due: dueVendors.length, discoverEnqueued, executeEnqueued };
    },
    { connection: redisConnection },
  );
}
