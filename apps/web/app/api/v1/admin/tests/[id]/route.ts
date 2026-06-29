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

  // Whitelist updatable scalar fields (avoid mass-assignment and relation errors)
  const fields = [
    'name', 'shortName', 'slug', 'categoryId', 'description', 'purpose',
    'procedure', 'preparation', 'normalRange', 'questCode', 'labcorpCode',
    'isPopular', 'displayOrder',
  ] as const;
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in body) data[f] = body[f];
  }

  const test = await prisma.test.update({
    where: { id },
    data,
    include: { category: true },
  });

  // Additional (m2m) categories — replace the set, excluding the primary category.
  if (Array.isArray(body.categoryIds)) {
    const extra = (body.categoryIds as string[]).filter((c) => c && c !== test.categoryId);
    await prisma.$transaction([
      prisma.testCategory.deleteMany({ where: { testId: id } }),
      prisma.testCategory.createMany({
        data: extra.map((categoryId) => ({ testId: id, categoryId })),
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
