import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

// Whitelisted, type-checked updatable fields. Without this a non-string questCode (or any wrong-typed
// value) reached prisma.update() and surfaced as an opaque 500 instead of a clean 400. `categoryId`
// is intentionally absent — it's derived from `categoryIds` below, never set directly.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    shortName: z.string().trim().max(100).nullable(),
    slug: z.string().trim().min(1).max(200),
    description: z.string().max(8000).nullable(),
    purpose: z.string().max(8000).nullable(),
    procedure: z.string().max(8000).nullable(),
    preparation: z.string().max(8000).nullable(),
    normalRange: z.string().max(8000).nullable(),
    questCode: z.string().trim().max(50).nullable(),
    labcorpCode: z.string().trim().max(50).nullable(),
    isPopular: z.boolean(),
    displayOrder: z.number().int(),
    categoryIds: z.array(z.string()),
    methodology: z.string().trim().max(200).nullable(),
    labVariant: z.string().trim().max(100).nullable(),
    cardioIq: z.boolean(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    thirdPartyOnly: z.boolean(),
    notes: z.string().max(2000).nullable(),
  })
  .partial();

// Prisma's "record to update/delete not found" — a 404, not a 500.
function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025';
}

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
  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid update', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  // Only the fields the client actually sent (zod omits absent optionals). `categoryIds` is handled
  // separately — it drives both the m2m rows and the derived `categoryId` display pointer.
  const { categoryIds: rawCategoryIds, ...scalars } = parsed.data;
  const data: Record<string, unknown> = { ...scalars };

  const categoryIds = rawCategoryIds ? rawCategoryIds.filter(Boolean) : null;
  let cats: { id: string; displayOrder: number }[] = [];
  if (categoryIds) {
    if (categoryIds.length === 0) {
      return NextResponse.json({ error: { code: 'validation_error', message: 'At least one category is required.' } }, { status: 400 });
    }
    cats = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, displayOrder: true } });
    if (cats.length === 0) {
      return NextResponse.json({ error: { code: 'validation_error', message: 'Selected categories were not found.' } }, { status: 400 });
    }
    data.categoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;
  }

  try {
    // One transaction so the test row and its category membership can't commit separately — a
    // failure partway used to leave `test.categoryId` updated with stale `TestCategory` rows.
    const test = await prisma.$transaction(async (tx) => {
      const updated = await tx.test.update({
        where: { id },
        data,
        include: { category: true },
      });

      if (categoryIds) {
        // Use `cats` (validated to actually exist), not the raw `categoryIds` — a stale/bogus id in
        // the request would otherwise FK-violate here.
        await tx.testCategory.deleteMany({ where: { testId: id } });
        await tx.testCategory.createMany({
          data: cats.map((c) => ({ testId: id, categoryId: c.id })),
          skipDuplicates: true,
        });
      }

      return updated;
    });

    return NextResponse.json({ data: test });
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: { code: 'not_found', message: 'Test not found' } }, { status: 404 });
    }
    console.error('[PATCH /api/v1/admin/tests/[id]]', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, { status: 500 });
  }
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
  try {
    await prisma.test.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: { code: 'not_found', message: 'Test not found' } }, { status: 404 });
    }
    console.error('[DELETE /api/v1/admin/tests/[id]]', err);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, { status: 500 });
  }
}
