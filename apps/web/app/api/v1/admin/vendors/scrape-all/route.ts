import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { isCatalogMode } from '@/lib/catalog-mode';
import { redisConnectionOptions } from '@/lib/redis-options';

// Bulk trigger: queue a catalog discovery scrape for EVERY active catalog-mode vendor in one click
// (replaces opening 15 vendor pages and clicking Scrape Now one at a time). Everything goes to the
// `scrape-discover` worker — unlike the single-vendor route, nothing runs inline here: 15 sequential
// catalog crawls inside one HTTP request would time out, and the worker already staggers/retries.
// Per-URL vendors are intentionally excluded; they're scraped per-offering by the daily schedule.
export async function POST() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const configs = await prisma.scrapeVendorConfig.findMany({
    where: { isEnabled: true, vendor: { deletedAt: null, isActive: true } },
    select: { vendorId: true, selectors: true, vendor: { select: { name: true } } },
  });
  const catalogVendors = configs.filter((c) => isCatalogMode(c.selectors));

  if (catalogVendors.length === 0) {
    return NextResponse.json({ error: { code: 'no_catalog_vendors', message: 'No active catalog-mode vendors to scrape.' } }, { status: 400 });
  }

  const connection = new IORedis(redisConnectionOptions());
  const queue = new Queue('scrape-discover', { connection: connection as never });
  try {
    const stamp = Date.now();
    for (const c of catalogVendors) {
      await queue.add(
        'discover',
        { vendorId: c.vendorId, triggeredBy: 'MANUAL' },
        { jobId: `bulk-discover-${c.vendorId}-${stamp}`, attempts: 2, backoff: { type: 'exponential', delay: 60_000 } },
      );
    }
  } finally {
    await queue.close();
    await connection.quit();
  }

  return NextResponse.json({
    data: { queued: catalogVendors.length, vendors: catalogVendors.map((c) => c.vendor.name).sort() },
  });
}
