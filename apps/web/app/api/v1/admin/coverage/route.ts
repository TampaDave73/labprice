import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

// Coverage matrix: every test × every active vendor. A cell is 'listed' (live offering, with
// price), 'found' (the ingest layer matched a vendor product to this test but no offering exists
// yet — i.e. the vendor sells it and we aren't showing it), or empty. Makes the invisible gap —
// carried-but-unlisted — visible at a glance.
export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const [vendors, tests, offerings, matchedProducts] = await Promise.all([
    prisma.vendor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.test.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.offering.findMany({
      where: { deletedAt: null, isActive: true },
      select: { testId: true, vendorId: true, currentPrice: true, lastCheckedAt: true },
    }),
    prisma.vendorProduct.findMany({
      where: { status: 'MATCHED', testId: { not: null } },
      select: { testId: true, vendorId: true },
    }),
  ]);

  type Cell = { s: 'listed'; price: string | null } | { s: 'found' };
  const cells: Record<string, Cell> = {}; // `${testId}:${vendorId}`
  for (const m of matchedProducts) cells[`${m.testId}:${m.vendorId}`] = { s: 'found' };
  // Offerings win over 'found' — a listed cell is by definition also carried.
  for (const o of offerings) cells[`${o.testId}:${o.vendorId}`] = { s: 'listed', price: o.currentPrice?.toString() ?? null };

  return NextResponse.json({ data: { vendors, tests, cells } });
}
