import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { isCatalogMode } from '@/lib/catalog-mode';
import { runVendorDiscovery, publishStagedChange, adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';

type Params = { params: Promise<{ id: string }> };

// `localhost` intermittently resolves to IPv6 (::1) on Windows, which this Docker Desktop setup's port
// forwarding doesn't reliably answer on — connections "succeed" (TCP connects) then reset on the first
// real read/write (ECONNRESET storm, found live 2026-07-04). Same fix as `apps/worker/src/redis.ts`
// (127.0.0.1, not localhost) — duplicated here rather than shared since it's two lines and the two
// packages don't otherwise share a redis util.
function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname === 'localhost' ? '127.0.0.1' : url.hostname,
    port: Number(url.port) || 6379,
    maxRetriesPerRequest: null as null,
  };
}

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

  // Catalog-mode vendors (GoodLabs): crawl the catalog and match every linked test by code/name,
  // INLINE — no worker/Redis needed — so the admin gets an immediate result summary. Auto-approved
  // changes are published here too; ambiguous ones land in the Change Queue.
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId }, select: { selectors: true } });
  if (isCatalogMode(config?.selectors)) {
    const selectors = config?.selectors as Record<string, unknown> | null;
    // A few vendors (Request A Test) are behind a JS challenge plain HTTP can't clear and need
    // `browserFetchHtml` (stealth Playwright) — that module can't be statically imported here: Turbopack
    // fails to bundle the stealth plugin for the Next.js server ("utils.typeOf is not a function" inside
    // its own merge-deep helper — confirmed live, not theoretical). So for exactly those adapters, queue
    // the run to the `scrape-discover` worker (which already imports it safely as a plain tsx process)
    // instead of running inline. Every other catalog vendor is unaffected — still runs inline below.
    if (adapterNeedsBrowser(selectors?.adapter as string | undefined)) {
      const connection = new IORedis(redisConnectionOptions());
      const queue = new Queue('scrape-discover', { connection: connection as never });
      await queue.add('discover', { vendorId, triggeredBy: 'MANUAL' }, { jobId: `manual-discover-${vendorId}-${Date.now()}` });
      await queue.close();
      await connection.quit();
      return NextResponse.json({ data: { mode: 'catalog-queued', offerings: offerings.length } });
    }

    const summary = await runVendorDiscovery({ vendorId, triggeredBy: 'MANUAL' });
    let published = 0;
    for (const id of summary.autoApprovedStagedIds) if (await publishStagedChange(id)) published++;
    return NextResponse.json({
      data: {
        mode: 'catalog',
        offerings: offerings.length,
        matched: summary.matched,
        ambiguous: summary.ambiguous,
        unmatched: summary.unmatched,
        published,
      },
    });
  }

  const connection = new IORedis(redisConnectionOptions());
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
