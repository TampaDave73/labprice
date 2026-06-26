import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 25), 100);
  const cursor = params.get('cursor');
  const search = params.get('search');

  const where: Record<string, unknown> = { deletedAt: null };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const vendors = await prisma.vendor.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { offerings: true } } },
  });

  const hasMore = vendors.length > limit;
  const data = hasMore ? vendors.slice(0, limit) : vendors;
  const nextCursor = hasMore ? data[data.length - 1]!.id : undefined;

  return NextResponse.json({ data, nextCursor });
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
