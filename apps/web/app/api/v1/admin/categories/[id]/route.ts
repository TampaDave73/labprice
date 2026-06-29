import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Rename / recolor / reorder a category.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.slug === 'string' && body.slug.trim()) data.slug = slugify(body.slug);
  if ('displayOrder' in body) data.displayOrder = Number(body.displayOrder) || 0;
  if ('colorBg' in body) data.colorBg = body.colorBg || null;
  if ('colorText' in body) data.colorText = body.colorText || null;

  // Guard name/slug uniqueness with a friendly message.
  if (data.name || data.slug) {
    const clash = await prisma.category.findFirst({
      where: {
        id: { not: id },
        OR: [...(data.name ? [{ name: data.name as string }] : []), ...(data.slug ? [{ slug: data.slug as string }] : [])],
      },
    });
    if (clash) {
      return NextResponse.json({ error: { code: 'conflict', message: 'Another category already uses that name or slug.' } }, { status: 409 });
    }
  }

  const category = await prisma.category.update({ where: { id }, data });
  return NextResponse.json({ data: category });
}

/**
 * Delete a category, with contingency handling:
 *  - If removing it would leave ANY test with zero categories, the delete is
 *    BLOCKED and the orphaned test names are returned (so the admin can reassign).
 *  - Otherwise, any test whose *display* category is this one is reassigned to its
 *    next remaining category (lowest displayOrder), then the category is deleted
 *    (its m2m membership rows cascade away).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  // Tests affected = members of this category (m2m) plus any whose display pointer is this one.
  const [memberLinks, directTests] = await Promise.all([
    prisma.testCategory.findMany({ where: { categoryId: id }, select: { testId: true } }),
    prisma.test.findMany({ where: { categoryId: id, deletedAt: null }, select: { id: true } }),
  ]);
  const affectedIds = new Set<string>([...memberLinks.map((l) => l.testId), ...directTests.map((t) => t.id)]);

  if (affectedIds.size === 0) {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ data: { success: true } });
  }

  const affected = await prisma.test.findMany({
    where: { id: { in: [...affectedIds] }, deletedAt: null },
    select: { id: true, name: true, categoryId: true, categories: { select: { categoryId: true } } },
  });

  const orphans: string[] = [];
  const reassign: { testId: string; remaining: string[] }[] = [];
  for (const t of affected) {
    const remaining = new Set<string>([t.categoryId, ...t.categories.map((c) => c.categoryId)]);
    remaining.delete(id);
    if (remaining.size === 0) {
      orphans.push(t.name);
    } else if (t.categoryId === id) {
      reassign.push({ testId: t.id, remaining: [...remaining] });
    }
  }

  if (orphans.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'would_orphan',
          message: `Cannot delete: ${orphans.length} test(s) would be left with no category — ${orphans.join(', ')}. Give them another category first.`,
          orphans,
        },
      },
      { status: 409 },
    );
  }

  // Pick each reassigned test's new display category = lowest displayOrder among its remaining.
  const remIds = [...new Set(reassign.flatMap((r) => r.remaining))];
  const cats = await prisma.category.findMany({ where: { id: { in: remIds } }, select: { id: true, displayOrder: true } });
  const orderMap = new Map(cats.map((c) => [c.id, c.displayOrder]));

  const ops = reassign.map((r) => {
    const newPrimary = [...r.remaining].sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0))[0]!;
    return prisma.test.update({ where: { id: r.testId }, data: { categoryId: newPrimary } });
  });

  await prisma.$transaction([...ops, prisma.category.delete({ where: { id } })]);
  return NextResponse.json({ data: { success: true, reassigned: reassign.length } });
}
