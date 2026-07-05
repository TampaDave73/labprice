// Admin analytics summary: what people search for (incl. zero-result queries — the gap-finding signal
// for "should we add this test?"), which vendors get clicked the most (CTR), and which tests get the
// most page views. Backed by SearchLog/AffiliateClick/PageView, all logged live (see
// lib/services/analytics-service.ts and its call sites).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

// Clamp ?days= to [1, 365]; non-numeric input (e.g. ?days=abc) falls back to 30 instead of
// producing NaN → Invalid Date → a Prisma error deep in the query.
function parseDays(raw: string | null): number {
  const n = Number(raw ?? 30);
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(Math.trunc(n), 1), 365);
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  try {
    const days = parseDays(req.nextUrl.searchParams.get('days'));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // All six base queries are independent — run them in one parallel batch (was a 7-deep sequential
    // chain; only the two lookups below actually depend on earlier results).
    const [searchRows, clickGroups, viewGroups, totalSearches, totalClicks, totalPageViews] = await Promise.all([
      // Searches: fetched raw and aggregated in JS (case/whitespace-normalized) — SearchLog.query is free
      // text, so a DB-level groupBy can't collapse "Vitamin D" vs "vitamin d". Capped at 20k rows so this
      // stays cheap even on a busy day; that's a lot of searches for one admin view to need more than.
      prisma.searchLog.findMany({
        where: { createdAt: { gte: since } },
        select: { query: true, resultsCount: true },
        take: 20_000,
        orderBy: { createdAt: 'desc' },
      }),
      // Vendor clicks (CTR): group by offering, then map offerings -> vendor for a per-vendor rollup.
      prisma.affiliateClick.groupBy({
        by: ['offeringId'],
        where: { clickedAt: { gte: since } },
        _count: { offeringId: true },
      }),
      // Most-viewed tests.
      prisma.pageView.groupBy({
        by: ['testId'],
        where: { createdAt: { gte: since }, testId: { not: null } },
        _count: { testId: true },
        orderBy: { _count: { testId: 'desc' } },
        take: 25,
      }),
      prisma.searchLog.count({ where: { createdAt: { gte: since } } }),
      prisma.affiliateClick.count({ where: { clickedAt: { gte: since } } }),
      prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    ]);

    // Second (and last) round trip: resolve the grouped ids to display names, both lookups in parallel.
    const offeringIds = clickGroups.map((g) => g.offeringId);
    const viewedTestIds = viewGroups.map((g) => g.testId).filter((id): id is string => !!id);
    const [offerings, viewedTests] = await Promise.all([
      prisma.offering.findMany({
        where: { id: { in: offeringIds } },
        select: { id: true, vendor: { select: { name: true, slug: true } }, test: { select: { name: true } } },
      }),
      prisma.test.findMany({ where: { id: { in: viewedTestIds } }, select: { id: true, name: true, slug: true } }),
    ]);

    const bySearch = new Map<string, { query: string; count: number; zeroResultCount: number }>();
    for (const row of searchRows) {
      const key = row.query.trim().toLowerCase();
      if (!key) continue;
      const entry = bySearch.get(key) ?? { query: row.query.trim(), count: 0, zeroResultCount: 0 };
      entry.count++;
      if (row.resultsCount === 0) entry.zeroResultCount++;
      bySearch.set(key, entry);
    }
    const allSearches = [...bySearch.values()];
    const topSearches = [...allSearches].sort((a, b) => b.count - a.count).slice(0, 25);
    const zeroResultSearches = allSearches
      .filter((s) => s.zeroResultCount > 0)
      .sort((a, b) => b.zeroResultCount - a.zeroResultCount)
      .slice(0, 25);

    const offeringById = new Map(offerings.map((o) => [o.id, o]));
    const byVendor = new Map<string, { vendorName: string; vendorSlug: string; clicks: number }>();
    const topOfferingClicks: { testName: string; vendorName: string; clicks: number }[] = [];
    for (const g of clickGroups) {
      const o = offeringById.get(g.offeringId);
      if (!o) continue;
      const clicks = g._count.offeringId;
      const entry = byVendor.get(o.vendor.slug) ?? { vendorName: o.vendor.name, vendorSlug: o.vendor.slug, clicks: 0 };
      entry.clicks += clicks;
      byVendor.set(o.vendor.slug, entry);
      topOfferingClicks.push({ testName: o.test.name, vendorName: o.vendor.name, clicks });
    }
    const vendorClicks = [...byVendor.values()].sort((a, b) => b.clicks - a.clicks);
    topOfferingClicks.sort((a, b) => b.clicks - a.clicks);

    const testById = new Map(viewedTests.map((t) => [t.id, t]));
    const topViewedTests = viewGroups
      .map((g) => ({ test: g.testId ? testById.get(g.testId) : undefined, views: g._count.testId }))
      .filter((v): v is { test: { id: string; name: string; slug: string }; views: number } => !!v.test);

    return NextResponse.json({
      data: {
        days,
        totals: { searches: totalSearches, clicks: totalClicks, pageViews: totalPageViews },
        topSearches,
        zeroResultSearches,
        vendorClicks,
        topOfferingClicks: topOfferingClicks.slice(0, 25),
        topViewedTests: topViewedTests.slice(0, 25),
      },
    });
  } catch (err) {
    console.error('[GET /api/v1/admin/analytics]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
