import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const test = await prisma.test.findUnique({
    where: { id, deletedAt: null },
    include: {
      category: true,
      categories: { select: { categoryId: true } }, // additional (m2m) categories
      codes: true,
      biomarkers: { include: { biomarker: true } },
      offerings: { include: { vendor: true } },
    },
  });

  if (!test) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Test not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: test });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json();

  // Whitelist updatable scalar fields. `categoryId` is NOT directly settable — it's
  // derived from the selected category set below.
  const fields = [
    'name', 'shortName', 'slug', 'description', 'purpose',
    'procedure', 'preparation', 'normalRange', 'questCode', 'labcorpCode',
    'isPopular', 'displayOrder',
  ] as const;
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in body) data[f] = body[f];
  }

  // Category set (m2m). When provided, require ≥1 and recompute the display pointer.
  const categoryIds: string[] | null = Array.isArray(body.categoryIds) ? body.categoryIds.filter(Boolean) : null;
  if (categoryIds) {
    if (categoryIds.length === 0) {
      return NextResponse.json({ error: { code: 'validation_error', message: 'At least one category is required.' } }, { status: 400 });
    }
    const cats = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, displayOrder: true } });
    if (cats.length === 0) {
      return NextResponse.json({ error: { code: 'validation_error', message: 'Selected categories were not found.' } }, { status: 400 });
    }
    data.categoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;
  }

  const test = await prisma.test.update({
    where: { id },
    data,
    include: { category: true },
  });

  if (categoryIds) {
    await prisma.$transaction([
      prisma.testCategory.deleteMany({ where: { testId: id } }),
      prisma.testCategory.createMany({
        data: categoryIds.map((categoryId) => ({ testId: id, categoryId })),
        skipDuplicates: true,
      }),
    ]);
  }

  return NextResponse.json({ data: test });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  await prisma.test.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ data: { success: true } });
}
