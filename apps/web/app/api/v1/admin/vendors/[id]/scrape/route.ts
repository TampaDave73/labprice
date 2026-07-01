import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { enqueueDiscover, isCatalogMode } from '@/lib/scrape-queue';

type Params = { params: Promise<{ id: string }> };

// Manually trigger a scrape for one vendor: enqueue a scrape:execute job per
// active offering. The worker process (apps/worker) + Redis must be running to
// process them; this just queues the work.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const { id: vendorId } = await params;

  const offerings = await prisma.offering.findMany({
    where: { vendorId, isActive: true, deletedAt: null },
    select: { id: true, testId: true },
  });

  if (offerings.length === 0) {
    return NextResponse.json({ error: { code: 'no_offerings', message: 'This vendor has no active offerings to scrape.' } }, { status: 400 });
  }

  // Catalog-mode vendors (GoodLabs) use one discovery job that crawls the catalog and matches every
  // linked test by code/name — not one fetch-a-URL job per offering.
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId }, select: { selectors: true } });
  if (isCatalogMode(config?.selectors)) {
    await enqueueDiscover(vendorId, undefined, 'MANUAL');
    return NextResponse.json({ data: { enqueued: 1, mode: 'catalog', offerings: offerings.length } });
  }

  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const queue = new Queue('scrape-execute', { connection: connection as never });

  const today = new Date().toISOString().slice(0, 10);
  let enqueued = 0;
  for (let i = 0; i < offerings.length; i++) {
    const o = offerings[i]!;
    await queue.add(
      'scrape',
      { offeringId: o.id, vendorId, testId: o.testId },
      {
        jobId: `manual-${o.id}-${today}-${Date.now()}`,
        delay: i * 2000, // stagger to respect vendor rate limits
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    enqueued++;
  }

  await queue.close();
  await connection.quit();

  return NextResponse.json({ data: { enqueued } });
}
