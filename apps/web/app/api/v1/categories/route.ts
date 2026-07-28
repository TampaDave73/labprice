import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: {
          select: { tests: { where: { deletedAt: null } } },
        },
      },
    });

    const data = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      displayOrder: c.displayOrder,
      isPrimary: c.isPrimary,
      colorBg: c.colorBg,
      colorText: c.colorText,
      testCount: c._count.tests,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[GET /api/v1/categories]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
