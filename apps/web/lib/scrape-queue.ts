// Thin helpers for enqueuing scrape work from Next API routes. The web app doesn't run BullMQ
// workers; it just pushes jobs onto Redis for apps/worker to consume. Each call opens and closes a
// short-lived connection (route handlers are stateless) — mirrors the pattern in the scrape route.
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function withQueue<T>(name: string, fn: (q: Queue) => Promise<T>): Promise<T> {
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const queue = new Queue(name, { connection: connection as never });
  try {
    return await fn(queue);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

/**
 * Enqueue a catalog-discovery job for a vendor. Pass `offeringIds` to price only newly-linked
 * tests (requeue-on-add); omit to rediscover the vendor's whole catalog.
 */
export async function enqueueDiscover(vendorId: string, offeringIds?: string[], triggeredBy: 'SCHEDULE' | 'MANUAL' = 'MANUAL'): Promise<void> {
  await withQueue('scrape-discover', async (queue) => {
    const scope = offeringIds && offeringIds.length ? offeringIds.join(',') : 'all';
    await queue.add(
      'discover',
      { vendorId, offeringIds, triggeredBy },
      {
        // Dedupe rapid successive adds to the same scope into one job for ~30s.
        jobId: `discover-${vendorId}-${scope}-${Math.floor(Date.now() / 30_000)}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    );
  });
}

/** True when a vendor's scraper is configured for catalog mode (crawl + match) vs. per-URL. */
export function isCatalogMode(selectors: unknown): boolean {
  return !!selectors && typeof selectors === 'object' && (selectors as Record<string, unknown>).mode === 'catalog';
}
