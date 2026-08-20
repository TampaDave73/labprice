import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  const { testId } = await params;
  const period = request.nextUrl.searchParams.get('period') ?? '30d';
  const days = PERIOD_DAYS[period];

  if (!days) {
    return NextResponse.json(
      { error: 'Invalid period. Use 7d, 30d, 90d, or 1y.' },
      { status: 400 },
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const history = await prisma.priceHistory.findMany({
    where: {
      // vendor filter: don't chart price history for a vendor that's since been removed.
      offering: { testId, isActive: true, deletedAt: null, test: { deletedAt: null }, vendor: { isActive: true, deletedAt: null } },
      observedAt: { gte: since },
    },
    include: {
      offering: {
        include: { vendor: { select: { name: true } } },
      },
    },
    orderBy: { observedAt: 'asc' },
  });

  const data = history.map((h) => ({
    date: h.observedAt.toISOString().slice(0, 10),
    price: Number(h.newPrice).toFixed(2),
    vendorName: h.offering.vendor.name,
  }));

  return NextResponse.json({ data });
}
