import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const vendorId = params.get('vendorId');
  const testId = params.get('testId');
  const sort = params.get('sort') ?? 'test';
  const dir: Prisma.SortOrder = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const limit = Math.min(Number(params.get('limit') ?? 200), 500);

  // Exclude offerings whose vendor is soft-deleted (otherwise orphaned offerings on a removed vendor
  // still surface here — e.g. duplicate vendors that were retired).
  const where: Prisma.OfferingWhereInput = { deletedAt: null, vendor: { deletedAt: null } };
  if (vendorId) where.vendorId = vendorId;
  if (testId) where.testId = testId;

  const orderBy: Prisma.OfferingOrderByWithRelationInput =
    sort === 'vendor' ? { vendor: { name: dir } }
      : sort === 'price' ? { currentPrice: dir }
        : sort === 'updated' ? { priceUpdatedAt: dir }
          : { test: { name: dir } };

  const offerings = await prisma.offering.findMany({
    where,
    orderBy,
    take: limit,
    include: {
      test: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    data: offerings.map((o) => ({
      id: o.id,
      testId: o.test.id,
      testName: o.test.name,
      vendorId: o.vendor.id,
      vendorName: o.vendor.name,
      currentPrice: o.currentPrice ? Number(o.currentPrice) : null,
      previousPrice: o.previousPrice ? Number(o.previousPrice) : null,
      priceUpdatedAt: o.priceUpdatedAt,
      isActive: o.isActive,
    })),
  });
}
