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
    select: { vendorId: true, selectors: true, frequencyDays: true, vendor: { select: { name: true } } },
  });
  const catalogConfigs = configs.filter((c) => isCatalogMode(c.selectors));
  // `frequencyDays: 0` means "Manual only", which on this project means ONE specific thing: the
  // vendor's WAF blocks Railway's datacenter IP, so it's scraped from a residential connection with
  // scripts/scrape-vendor-local.ts instead. Queueing it here anyway (which this route used to do)
  // bought a guaranteed FAILED ScrapeRun every click — and a failed run counts against the vendor's
  // computed trust (packages/database/src/vendor-trust.ts), so the bulk button was quietly pushing
  // exactly these vendors toward LOW trust, which then forces manual review of their real prices.
  // The daily scheduler and the weekly digest both already filter on frequencyDays > 0; this route
  // was the one place that didn't.
  const catalogVendors = catalogConfigs.filter((c) => c.frequencyDays > 0);
  const skipped = catalogConfigs.filter((c) => c.frequencyDays === 0).map((c) => c.vendor.name).sort();

  if (catalogVendors.length === 0) {
    const message = skipped.length
      ? `No cloud-scrapable catalog vendors — the ${skipped.length} active catalog vendor(s) are all "Manual only" (${skipped.join(', ')}). Run them locally with scrape-blocked-vendors.ps1.`
      : 'No active catalog-mode vendors to scrape.';
    return NextResponse.json({ error: { code: 'no_catalog_vendors', message } }, { status: 400 });
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
    data: { queued: catalogVendors.length, vendors: catalogVendors.map((c) => c.vendor.name).sort(), skipped },
  });
}
