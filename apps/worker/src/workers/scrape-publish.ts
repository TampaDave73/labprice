import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { connection } from '../redis';

interface PublishJobData {
  stagedChangeId: string;
}

export function createPublishWorker() {
  return new Worker<PublishJobData>(
    'scrape:publish',
    async (job: Job<PublishJobData>) => {
      const { stagedChangeId } = job.data;
      console.log(`[publish] Publishing staged change ${stagedChangeId}`);

      const staged = await prisma.stagedPriceChange.findUnique({
        where: { id: stagedChangeId },
        include: { offering: true },
      });

      if (!staged) {
        throw new Error(`Staged change ${stagedChangeId} not found`);
      }

      if (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED') {
        console.log(`[publish] Skipping ${stagedChangeId} — status is ${staged.status}`);
        return { skipped: true };
      }

      // Update the offering with the new price
      await prisma.offering.update({
        where: { id: staged.offeringId },
        data: {
          previousPrice: staged.oldPrice,
          currentPrice: staged.newPrice,
          priceUpdatedAt: new Date(),
        },
      });

      // Insert price history record
      await prisma.priceHistory.create({
        data: {
          offeringId: staged.offeringId,
          oldPrice: staged.oldPrice,
          newPrice: staged.newPrice,
          observedAt: staged.scrapedAt,
          source: 'SCRAPE',
          scrapeRunId: staged.scrapeRunId,
        },
      });

      // Log to audit
      await prisma.auditLog.create({
        data: {
          action: 'price_published',
          entityType: 'offering',
          entityId: staged.offeringId,
          oldValues: { price: staged.oldPrice?.toString() ?? null },
          newValues: { price: staged.newPrice.toString() },
        },
      });

      console.log(`[publish] Published offering=${staged.offeringId} price=${staged.newPrice}`);
      return { published: true, offeringId: staged.offeringId };
    },
    { connection },
  );
}
