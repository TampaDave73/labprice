// Gathers the weekly traffic topline for the Monday digest. GA4 supplies visitors/sessions/sources
// (our own tables record neither referrer nor country); our database supplies exact search queries
// and affiliate click-throughs (which GA4 does not have in usable form).
//
// GA4 failure is NEVER fatal — the digest must send regardless, with the database half intact.
import { prisma } from '@labprice/database';
import { fetchGa4Traffic } from '@labprice/shared/src/ga4';
import type { TrafficSummary } from '@labprice/shared/src/traffic-render';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function collectTraffic(days: number): Promise<TrafficSummary> {
  const since = new Date(Date.now() - days * DAY_MS);

  // Swallow GA4 errors deliberately: a Google outage or an expired service-account key must degrade
  // this section, not kill the whole scraper-health digest it is attached to.
  const ga4 = await fetchGa4Traffic(days).catch((e) => {
    console.warn('[traffic] GA4 pull failed, continuing without it:', e instanceof Error ? e.message : e);
    return null;
  });

  const [searches, pageViewRows, clicks, totalPageViews] = await Promise.all([
    prisma.searchLog.groupBy({
      by: ['query', 'resultsCount'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.pageView.groupBy({
      by: ['testId'],
      where: { createdAt: { gte: since }, testId: { not: null } },
      _count: { _all: true },
    }),
    prisma.affiliateClick.groupBy({
      by: ['offeringId'],
      where: { clickedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
  ]);

  // groupBy splits the same query across different resultsCount values; fold them back together and
  // treat a query as "zero results" only when EVERY logged occurrence returned nothing.
  const byQuery = new Map<string, { count: number; anyResults: boolean }>();
  for (const s of searches) {
    const prev = byQuery.get(s.query) ?? { count: 0, anyResults: false };
    byQuery.set(s.query, { count: prev.count + s._count._all, anyResults: prev.anyResults || s.resultsCount > 0 });
  }
  const allSearches = [...byQuery.entries()]
    .map(([query, v]) => ({ query, count: v.count, zeroResults: !v.anyResults }))
    .sort((a, b) => b.count - a.count);

  const testIds = pageViewRows.map((r) => r.testId!).filter(Boolean);
  const tests = await prisma.test.findMany({ where: { id: { in: testIds } }, select: { id: true, name: true } });
  const testName = new Map(tests.map((t) => [t.id, t.name]));

  const offeringIds = clicks.map((c) => c.offeringId);
  const offerings = await prisma.offering.findMany({
    where: { id: { in: offeringIds } },
    select: { id: true, vendor: { select: { name: true } } },
  });
  const vendorOf = new Map(offerings.map((o) => [o.id, o.vendor.name]));
  const clicksByVendorMap = new Map<string, number>();
  for (const c of clicks) {
    const v = vendorOf.get(c.offeringId);
    if (v) clicksByVendorMap.set(v, (clicksByVendorMap.get(v) ?? 0) + c._count._all);
  }

  return {
    days,
    ga4,
    topSearches: allSearches.slice(0, 10),
    zeroResultSearches: allSearches.filter((s) => s.zeroResults).slice(0, 10),
    topTests: pageViewRows
      // A page view whose test was deleted has a nulled test_id or an unresolvable id — drop it
      // rather than printing "undefined" in the email.
      .map((r) => ({ name: testName.get(r.testId!) ?? '', views: r._count._all }))
      .filter((r) => r.name !== '')
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
    clicksByVendor: [...clicksByVendorMap.entries()]
      .map(([vendor, clicks]) => ({ vendor, clicks }))
      .sort((a, b) => b.clicks - a.clicks),
    totalPageViews,
  };
}
