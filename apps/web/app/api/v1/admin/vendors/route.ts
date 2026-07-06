import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma, getVendorTrustMap, type TrustLevel } from '@labprice/database';
import { auth } from '@/lib/auth';

const TRUST_RANK: Record<TrustLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const search = params.get('search');
  const sort = params.get('sort') ?? 'name';
  const dir: Prisma.SortOrder = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const where: Prisma.VendorWhereInput = { deletedAt: null };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const orderBy: Prisma.VendorOrderByWithRelationInput =
    sort === 'offerings'
      ? { offerings: { _count: dir } }
      : sort === 'active'
        ? { isActive: dir }
        : { name: dir };

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy,
    include: { _count: { select: { offerings: true } } },
  });

  // How many of each vendor's offerings actually have a product URL. Missing URLs are what the admin
  // needs to review, so the list shows `withUrl/total` and flags incomplete vendors. Counted over the
  // same population as `_count.offerings` (all offerings) so the denominator matches the total shown.
  const withUrlGroups = await prisma.offering.groupBy({
    by: ['vendorId'],
    where: { vendorId: { in: vendors.map((v) => v.id) }, NOT: [{ externalUrl: null }, { externalUrl: '' }] },
    _count: { _all: true },
  });
  const withUrlMap = new Map(withUrlGroups.map((g) => [g.vendorId, g._count._all]));

  // Attach effective trust (override ?? computed) for display and trust-sorting.
  // Trust is computed for the whole page in TWO queries (batched) to avoid an
  // N+1 that made this list very slow.
  const needCompute = vendors.filter((v) => !v.trustOverride).map((v) => v.id);
  const computedMap = await getVendorTrustMap(needCompute);
  let data = vendors.map((v) => ({
    ...v,
    effectiveTrust: (v.trustOverride ?? computedMap.get(v.id) ?? 'MEDIUM') as TrustLevel,
    offeringsWithUrl: withUrlMap.get(v.id) ?? 0,
  }));

  if (sort === 'trust') {
    data = data.sort((a, b) => {
      const d = TRUST_RANK[a.effectiveTrust] - TRUST_RANK[b.effectiveTrust];
      return dir === 'asc' ? d : -d;
    });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { name, slug, websiteUrl, affiliateUrlTemplate, logoUrl, trustLevel, isActive } = body;

  const vendor = await prisma.vendor.create({
    data: { name, slug, websiteUrl, affiliateUrlTemplate, logoUrl, trustLevel, isActive },
  });

  return NextResponse.json({ data: vendor }, { status: 201 });
}
