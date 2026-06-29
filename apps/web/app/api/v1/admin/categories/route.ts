import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return null;
  }
  return session;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const categories = await prisma.category.findMany({
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { tests: true } } },
  });

  return NextResponse.json({ data: categories });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Category name is required' } }, { status: 400 });
  }

  const slug = body.slug ? slugify(String(body.slug)) : slugify(name);

  const existing = await prisma.category.findFirst({ where: { OR: [{ name }, { slug }] } });
  if (existing) {
    return NextResponse.json({ error: { code: 'conflict', message: 'A category with that name or slug already exists' } }, { status: 409 });
  }

  const max = await prisma.category.aggregate({ _max: { displayOrder: true } });
  const category = await prisma.category.create({
    data: {
      name,
      slug,
      displayOrder: (max._max.displayOrder ?? 0) + 1,
      colorBg: body.colorBg ?? null,
      colorText: body.colorText ?? null,
    },
  });

  return NextResponse.json({ data: category }, { status: 201 });
}
