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
      // Count only live offerings on live vendors, so the "Offerings" column matches what's listed.
      _count: { select: { offerings: { where: { deletedAt: null, vendor: { deletedAt: null } } } } },
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
  const { name, shortName, slug, description, purpose, procedure, preparation, normalRange, questCode, labcorpCode, isPopular, displayOrder } = body;

  // A test must have at least one category. The `categoryId` column is kept only as a
  // derived "display" pointer (the selected category with the lowest displayOrder).
  const categoryIds: string[] = Array.isArray(body.categoryIds) ? body.categoryIds.filter(Boolean) : [];
  if (categoryIds.length === 0) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'At least one category is required.' } }, { status: 400 });
  }
  const cats = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, displayOrder: true } });
  if (cats.length === 0) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Selected categories were not found.' } }, { status: 400 });
  }
  const displayCategoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;

  const test = await prisma.test.create({
    data: { name, shortName, slug, categoryId: displayCategoryId, description, purpose, procedure, preparation, normalRange, questCode, labcorpCode, isPopular, displayOrder },
    include: { category: true },
  });

  await prisma.testCategory.createMany({
    data: cats.map((c) => ({ testId: test.id, categoryId: c.id })),
    skipDuplicates: true,
  });

  return NextResponse.json({ data: test }, { status: 201 });
}
