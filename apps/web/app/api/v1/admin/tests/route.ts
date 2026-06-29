import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@labprice/database';
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
  const sort = params.get('sort') ?? 'name';
  const dir: Prisma.SortOrder = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const where: Record<string, unknown> = { deletedAt: null };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const orderBy: Prisma.TestOrderByWithRelationInput | Prisma.TestOrderByWithRelationInput[] =
    sort === 'category'
      ? { category: { name: dir } }
      : sort === 'created'
        ? { createdAt: dir }
        : sort === 'popular'
          ? [{ isPopular: dir }, { name: 'asc' }]
          : { name: dir };

  const tests = await prisma.test.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy,
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
  const { name, shortName, slug, categoryId, description, purpose, procedure, preparation, normalRange, questCode, labcorpCode, isPopular, displayOrder } = body;

  const test = await prisma.test.create({
    data: { name, shortName, slug, categoryId, description, purpose, procedure, preparation, normalRange, questCode, labcorpCode, isPopular, displayOrder },
    include: { category: true },
  });

  // Additional (m2m) categories beyond the primary.
  if (Array.isArray(body.categoryIds)) {
    const extra = (body.categoryIds as string[]).filter((c) => c && c !== categoryId);
    if (extra.length > 0) {
      await prisma.testCategory.createMany({
        data: extra.map((cid) => ({ testId: test.id, categoryId: cid })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ data: test }, { status: 201 });
}
