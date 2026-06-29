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

  // Attach effective trust (override ?? computed) for display and trust-sorting.
  // Trust is computed for the whole page in TWO queries (batched) to avoid an
  // N+1 that made this list very slow.
  const needCompute = vendors.filter((v) => !v.trustOverride).map((v) => v.id);
  const computedMap = await getVendorTrustMap(needCompute);
  let data = vendors.map((v) => ({
    ...v,
    effectiveTrust: (v.trustOverride ?? computedMap.get(v.id) ?? 'MEDIUM') as TrustLevel,
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
