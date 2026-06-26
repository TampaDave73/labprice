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

  const tests = await prisma.test.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      _count: { select: { offerings: true } },
    },
  });

  const hasMore = tests.length > limit;
  const data = hasMore ? tests.slice(0, limit) : tests;
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
  const { name, shortName, slug, categoryId, description, purpose, preparation, normalRange, isPopular, displayOrder } = body;

  const test = await prisma.test.create({
    data: { name, shortName, slug, categoryId, description, purpose, preparation, normalRange, isPopular, displayOrder },
    include: { category: true },
  });

  return NextResponse.json({ data: test }, { status: 201 });
}
