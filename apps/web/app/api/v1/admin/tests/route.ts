import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, Prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

// The 6 fields the 2026-07-27 master-test-catalog-expansion added to Test (methodology/labVariant/
// cardioIq/confidence/thirdPartyOnly/notes). Mirrors [id]/route.ts's patchSchema for the same fields —
// the admin form always sends all 6 (new test or edit), so without this validation+create-side wiring
// a NEW test silently dropped them and `confidence` landed on the schema default instead of what the
// admin picked.
const newFieldsSchema = z.object({
  methodology: z.string().trim().max(200).nullable().optional(),
  labVariant: z.string().trim().max(100).nullable().optional(),
  cardioIq: z.boolean().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  thirdPartyOnly: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

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

  const parsedNewFields = newFieldsSchema.safeParse(body);
  if (!parsedNewFields.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid field value', details: parsedNewFields.error.flatten() } },
      { status: 400 },
    );
  }
  const { methodology, labVariant, cardioIq, confidence, thirdPartyOnly, notes } = parsedNewFields.data;

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

  // One transaction so the test row and its category membership can't commit separately.
  const test = await prisma.$transaction(async (tx) => {
    const created = await tx.test.create({
      data: {
        name, shortName, slug, categoryId: displayCategoryId, description, purpose, procedure, preparation, normalRange, questCode, labcorpCode, isPopular, displayOrder,
        methodology, labVariant, cardioIq, confidence, thirdPartyOnly, notes,
      },
      include: { category: true },
    });

    await tx.testCategory.createMany({
      data: cats.map((c) => ({ testId: created.id, categoryId: c.id })),
      skipDuplicates: true,
    });

    return created;
  });

  return NextResponse.json({ data: test }, { status: 201 });
}
