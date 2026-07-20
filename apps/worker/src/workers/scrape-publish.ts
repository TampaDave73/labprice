import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { publishStagedChange } from '@labprice/scrapers/src/catalog/persist';
import { redisConnection } from '../redis';

interface PublishJobData {
  stagedChangeId: string;
}

// Thin wrapper around the shared publishStagedChange (update + history + audit log all live there
// now — this job used to duplicate that logic with its own copy, which is how the audit-log write
// drifted out of sync with the inline/local publish paths; see persist.ts's doc comment).
export function createPublishWorker() {
  return new Worker<PublishJobData>(
    'scrape-publish',
    async (job: Job<PublishJobData>) => {
      const { stagedChangeId } = job.data;
      console.log(`[publish] Publishing staged change ${stagedChangeId}`);

      const staged = await prisma.stagedPriceChange.findUnique({ where: { id: stagedChangeId } });
      if (!staged) {
        throw new Error(`Staged change ${stagedChangeId} not found`);
      }
      if (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED') {
        console.log(`[publish] Skipping ${stagedChangeId} — status is ${staged.status}`);
        return { skipped: true };
      }

      await publishStagedChange(stagedChangeId);
      console.log(`[publish] Published offering=${staged.offeringId} price=${staged.newPrice}`);
      return { published: true, offeringId: staged.offeringId };
    },
    { connection: redisConnection },
  );
}
