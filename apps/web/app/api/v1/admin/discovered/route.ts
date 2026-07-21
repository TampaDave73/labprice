import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { nameTokens } from '@labprice/scrapers/src/catalog/matcher';
import { attachProductsToTest, createPromotedTest, clusterKey } from '@/lib/discovered-actions';

// The /admin/discovered review queue over the VendorProduct ingest layer.
//
// GET — four views plus the demand report:
//   clusters (default): UNMATCHED, non-panel products grouped across vendors by shared code /
//     distinctive name tokens — "5 vendors sell something that looks like Ferritin" as ONE card.
//   matched: MATCHED products, flagged by whether a live offering exists yet (matching alone never
//     creates offerings — listing is the deliberate step here).
//   panels / ignored: excluded-by-decision and admin-dismissed rows, kept visible + restorable.
//   demand: zero-result searches whose terms overlap an unmatched product name → "people search
//     for it AND vendors sell it" (returned alongside clusters).
//
// POST — the review actions: ignore/restore, attach (to an existing test), list (create offerings
// for matched products), promote (create a new test from a cluster). Attach/promote LEARN: each
// confirmed product name that differs from the test's known names is stored as a TestAlias, so the
// same vendor naming auto-matches next crawl.

const Decimal = Prisma.Decimal;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const tab = params.get('tab') ?? 'clusters';
  const search = (params.get('search') ?? '').trim();

  const productSelect = {
    id: true, slug: true, name: true, normalizedName: true, url: true, price: true,
    questCode: true, labcorpCode: true, labProvider: true, isPanel: true, status: true,
    matchedBy: true, lastSeenAt: true,
    vendor: { select: { id: true, name: true, slug: true } },
    test: { select: { id: true, name: true } },
    suggestedTest: { select: { id: true, name: true } },
  } satisfies Prisma.VendorProductSelect;

  const searchWhere: Prisma.VendorProductWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  // Tab badge counts are always computed so the UI can show all four numbers regardless of view.
  const [unmatchedCount, matchedRows, panelCount, ignoredCount] = await Promise.all([
    prisma.vendorProduct.count({ where: { status: 'UNMATCHED', isPanel: false } }),
    prisma.vendorProduct.findMany({ where: { status: 'MATCHED' }, select: { id: true, testId: true, vendorId: true } }),
    prisma.vendorProduct.count({ where: { isPanel: true, status: { not: 'IGNORED' } } }),
    prisma.vendorProduct.count({ where: { status: 'IGNORED' } }),
  ]);

  // "Matched but not yet listed" = MATCHED rows whose (test, vendor) pair has no live offering.
  const offerings = await prisma.offering.findMany({
    where: { deletedAt: null, isActive: true },
    select: { testId: true, vendorId: true },
  });
  const offeringKeys = new Set(offerings.map((o) => `${o.testId}:${o.vendorId}`));
  const unlistedMatchedIds = new Set(
    matchedRows.filter((r) => r.testId && !offeringKeys.has(`${r.testId}:${r.vendorId}`)).map((r) => r.id),
  );

  const counts = {
    clusters: unmatchedCount,
    matched: unlistedMatchedIds.size,
    panels: panelCount,
    ignored: ignoredCount,
  };

  if (tab === 'matched') {
    const rows = await prisma.vendorProduct.findMany({
      where: { status: 'MATCHED', ...searchWhere },
      select: productSelect,
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
    });
    return NextResponse.json({
      data: { counts, products: rows.map((r) => ({ ...r, hasOffering: !unlistedMatchedIds.has(r.id) })) },
    });
  }

  if (tab === 'panels' || tab === 'ignored') {
    const where: Prisma.VendorProductWhereInput = tab === 'panels'
      ? { isPanel: true, status: { not: 'IGNORED' }, ...searchWhere }
      : { status: 'IGNORED', ...searchWhere };
    const rows = await prisma.vendorProduct.findMany({ where, select: productSelect, orderBy: { name: 'asc' }, take: 500 });
    return NextResponse.json({ data: { counts, products: rows } });
  }

  // clusters (default)
  const unmatched = await prisma.vendorProduct.findMany({
    where: { status: 'UNMATCHED', isPanel: false, ...searchWhere },
    select: productSelect,
    orderBy: { name: 'asc' },
  });

  const clusterMap = new Map<string, typeof unmatched>();
  for (const p of unmatched) {
    const key = clusterKey(p);
    clusterMap.set(key, [...(clusterMap.get(key) ?? []), p]);
  }

  const clusters = [...clusterMap.entries()]
    .map(([key, products]) => {
      // The cluster's display name: the most common product name across vendors.
      const nameCounts = new Map<string, number>();
      for (const p of products) nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
      const name = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      const prices = products.map((p) => p.price).filter((p): p is Prisma.Decimal => p != null).map(Number).sort((a, b) => a - b);
      const suggested = products.map((p) => p.suggestedTest).find(Boolean) ?? null;
      return {
        key,
        name,
        vendorCount: new Set(products.map((p) => p.vendor.id)).size,
        priceMin: prices[0] ?? null,
        priceMax: prices[prices.length - 1] ?? null,
        questCode: products.map((p) => p.questCode).find(Boolean) ?? null,
        labcorpCode: products.map((p) => p.labcorpCode).find(Boolean) ?? null,
        suggestedTest: suggested,
        products,
      };
    })
    // Most cross-vendor demand first — those are the highest-value catalog additions.
    .sort((a, b) => b.vendorCount - a.vendorCount || a.name.localeCompare(b.name));

  // Demand report: zero-result searches whose query token-matches an unmatched product name.
  const zeroSearches = await prisma.searchLog.groupBy({
    by: ['query'],
    where: { resultsCount: 0 },
    _count: { _all: true },
    orderBy: { _count: { query: 'desc' } },
    take: 100,
  });
  // `nameMatches` re-tokenizes both of its arguments (regex split + Set build) on every call — fine
  // for a one-off comparison, but this loop is up to 100 searches × every cluster × every product in
  // it, so a naive call here is O(searches × clusters × products) tokenizations. With ~6k clusters
  // that's well over a million retokenizations and multi-second latency (found live 2026-07-21, once
  // the first "scrape all" run put real volume through this for the first time). Tokenize each
  // distinct string once and reuse the cached Set instead.
  const tokenCache = new Map<string, Set<string>>();
  const tokensOf = (s: string) => {
    let t = tokenCache.get(s);
    if (!t) { t = nameTokens(s); tokenCache.set(s, t); }
    return t;
  };
  const isSubsetMatch = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 || b.size === 0) return false;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const t of small) if (!large.has(t)) return false;
    return true;
  };
  const demand = zeroSearches
    .map((s) => {
      const qTokens = tokensOf(s.query);
      const hits = clusters.filter((c) => isSubsetMatch(qTokens, tokensOf(c.name)) || c.products.some((p) => isSubsetMatch(qTokens, tokensOf(p.name))));
      return { query: s.query, searches: s._count._all, clusterKeys: hits.slice(0, 3).map((h) => h.key), clusterNames: hits.slice(0, 3).map((h) => h.name) };
    })
    .filter((d) => d.clusterKeys.length > 0)
    .sort((a, b) => b.searches - a.searches)
    .slice(0, 20);

  return NextResponse.json({ data: { counts, clusters: clusters.slice(0, 200), demand } });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;
  const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds.filter(Boolean) : [];
  if (!action || productIds.length === 0) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Body must include action and productIds.' } }, { status: 400 });
  }

  const products = await prisma.vendorProduct.findMany({
    where: { id: { in: productIds } },
    include: { vendor: { select: { id: true, slug: true, name: true } } },
  });
  if (products.length === 0) {
    return NextResponse.json({ error: { code: 'not_found', message: 'No such products.' } }, { status: 404 });
  }

  if (action === 'ignore' || action === 'restore') {
    await prisma.vendorProduct.updateMany({
      where: { id: { in: productIds } },
      // Restore re-opens review (UNMATCHED); the next crawl's auto-match pass may re-match it.
      data: action === 'ignore' ? { status: 'IGNORED' } : { status: 'UNMATCHED', testId: null, matchedBy: null },
    });
    return NextResponse.json({ data: { updated: products.length } });
  }

  if (action === 'attach' || action === 'list' || action === 'promote') {
    let testId: string | null = null;

    if (action === 'attach') {
      testId = typeof body.testId === 'string' ? body.testId : null;
      if (!testId) return NextResponse.json({ error: { code: 'validation_error', message: 'attach requires a testId.' } }, { status: 400 });
      const test = await prisma.test.findFirst({ where: { id: testId, deletedAt: null } });
      if (!test) return NextResponse.json({ error: { code: 'not_found', message: 'Test not found.' } }, { status: 404 });
    }

    if (action === 'promote') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const categoryId = typeof body.categoryId === 'string' ? body.categoryId : '';
      if (!name || !categoryId) {
        return NextResponse.json({ error: { code: 'validation_error', message: 'promote requires name and categoryId.' } }, { status: 400 });
      }
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) return NextResponse.json({ error: { code: 'not_found', message: 'Category not found.' } }, { status: 404 });
      const slug = (typeof body.slug === 'string' && body.slug.trim())
        || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const existingSlug = await prisma.test.findUnique({ where: { slug } });
      if (existingSlug) {
        return NextResponse.json({ error: { code: 'validation_error', message: `Slug "${slug}" is already taken.` } }, { status: 400 });
      }
      const { testId: created } = await prisma.$transaction((tx) =>
        createPromotedTest(tx, {
          name, slug, categoryId,
          shortName: typeof body.shortName === 'string' ? body.shortName : undefined,
          questCode: typeof body.questCode === 'string' ? body.questCode : undefined,
          labcorpCode: typeof body.labcorpCode === 'string' ? body.labcorpCode : undefined,
        }),
      );
      testId = created;
      await prisma.auditLog.create({
        data: {
          actorId: session.user.id, action: 'test_promoted', entityType: 'test', entityId: created,
          newValues: { name, slug, from: products.map((p) => `${p.vendor.name}: ${p.name}`) },
        },
      });
    }

    // 'list' works on already-MATCHED rows: each product carries its own testId, so they may not
    // all share one target — group first, then attach each group (usually just one).
    let offeringsCreated = 0;
    let aliasesLearned = 0;
    const groups = new Map<string, typeof products>();
    for (const p of products) {
      const targetTestId = testId ?? p.testId;
      if (!targetTestId) continue; // 'list' on an unmatched row — nothing to do
      groups.set(targetTestId, [...(groups.get(targetTestId) ?? []), p]);
    }
    for (const [targetTestId, group] of groups) {
      const withVendorSlug = group.map((p) => ({ ...p, vendorSlug: p.vendor.slug }));
      const result = await prisma.$transaction((tx) => attachProductsToTest(tx, targetTestId, withVendorSlug, { markMatched: action !== 'list' }));
      offeringsCreated += result.offeringsCreated;
      aliasesLearned += result.aliasesLearned;
    }

    if (action !== 'promote') {
      await prisma.auditLog.create({
        data: {
          actorId: session.user.id,
          action: action === 'list' ? 'products_listed' : 'products_attached',
          entityType: 'test',
          entityId: testId ?? 'various',
          newValues: { products: products.map((p) => `${p.vendor.name}: ${p.name}`), offeringsCreated, aliasesLearned },
        },
      });
    }

    return NextResponse.json({ data: { testId, offeringsCreated, aliasesLearned } });
  }

  return NextResponse.json({ error: { code: 'validation_error', message: `Unknown action "${action}".` } }, { status: 400 });
}
