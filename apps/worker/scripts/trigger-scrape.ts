// On-demand catalog scrape for specific vendors: enqueues a `scrape-discover` job per given
// vendor slug (the worker must be running to process them). Run inside the worker container:
//   railway ssh --service scrape-worker "cd /app/apps/worker && pnpm exec tsx scripts/trigger-scrape.ts <vendor-slug> [...]"
import '../src/env';
import { prisma } from '@labprice/database';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main() {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    console.error('usage: trigger-scrape.ts <vendor-slug> [...more slugs]');
    process.exit(1);
  }
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });
  const queue = new Queue('scrape-discover', { connection: connection as never });
  for (const slug of slugs) {
    const vendor = await prisma.vendor.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!vendor) {
      console.error(`vendor not found: ${slug}`);
      continue;
    }
    await queue.add('discover', { vendorId: vendor.id, triggeredBy: 'MANUAL' }, { jobId: `manual-${slug}-${Date.now()}` });
    console.log(`enqueued discover: ${vendor.name}`);
  }
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
