// Small site-wide counts that appear in chrome shared by every page (the header's live-prices
// badge, for one).
//
// Cached rather than queried per request: these are two `COUNT(*)`s that change a few times a month,
// and the header renders on every route including statically-rendered ones. `unstable_cache` keeps
// the count fresh without making a prose page pay for a database round trip.
import { prisma } from '@labprice/database';
import { unstable_cache } from 'next/cache';

export interface SiteStats {
  vendorCount: number;
  testCount: number;
}

async function read(): Promise<SiteStats> {
  try {
    const [vendorCount, testCount] = await Promise.all([
      prisma.vendor.count({ where: { isActive: true, deletedAt: null } }),
      prisma.test.count({ where: { deletedAt: null } }),
    ]);
    return { vendorCount, testCount };
  } catch {
    // Zeros mean "unknown" to every caller, which renders as no badge rather than a wrong number.
    return { vendorCount: 0, testCount: 0 };
  }
}

const cachedRead = unstable_cache(read, ['site-stats-v1'], { revalidate: 900, tags: ['site-stats'] });

/**
 * Zeros are never a real answer — this site has vendors and tests — so a cached zero means the read
 * failed, and the most likely place for that is the production build, which runs with no
 * DATABASE_URL at all. Without this re-read, one failed build-time query would suppress the header
 * badge on every page for the next fifteen minutes. A live count is one indexed `COUNT(*)`.
 */
export async function siteStats(): Promise<SiteStats> {
  const cached = await cachedRead();
  return cached.vendorCount > 0 ? cached : read();
}
