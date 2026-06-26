import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { connection } from '../redis';
import { scrapeExecuteQueue } from '../queues';

export function createScheduleWorker() {
  return new Worker(
    'scrape:schedule',
    async (job: Job) => {
      console.log(`[schedule] Starting fan-out job ${job.id}`);

      const offerings = await prisma.offering.findMany({
        where: { isActive: true, deletedAt: null },
        include: { vendor: true, test: true },
      });

      console.log(`[schedule] Found ${offerings.length} active offerings`);

      // Group by vendor for rate limiting
      const byVendor = new Map<string, typeof offerings>();
      for (const o of offerings) {
        const group = byVendor.get(o.vendorId) ?? [];
        group.push(o);
        byVendor.set(o.vendorId, group);
      }

      let enqueued = 0;
      for (const [vendorId, vendorOfferings] of byVendor) {
        for (let i = 0; i < vendorOfferings.length; i++) {
          const offering = vendorOfferings[i]!;
          const delay = i * 2000; // 2s between jobs for the same vendor

          await scrapeExecuteQueue.add(
            'scrape',
            {
              offeringId: offering.id,
              vendorId: offering.vendorId,
              testId: offering.testId,
            },
            {
              jobId: `scrape-${offering.id}-${new Date().toISOString().slice(0, 10)}`,
              delay,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          );
          enqueued++;
        }
      }

      console.log(`[schedule] Enqueued ${enqueued} scrape jobs across ${byVendor.size} vendors`);
      return { enqueued, vendors: byVendor.size };
    },
    { connection },
  );
}
