// Mark a vendor/test suggestion reviewed or dismissed. `kind` disambiguates the two tables since a
// suggestion id from one could theoretically collide with the other's cuid space.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const patchSchema = z.object({
  kind: z.enum(['vendor', 'test', 'report']),
  status: z.enum(['PENDING', 'REVIEWED', 'DISMISSED']),
});

// Prisma's "record to update not found" — the only update failure that means 404 rather than 500.
function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025';
}

const KINDS = ['vendor', 'test', 'report'] as const;
type Kind = (typeof KINDS)[number];

function deleteByKind(kind: Kind, id: string) {
  return kind === 'vendor'
    ? prisma.vendorSuggestion.delete({ where: { id } })
    : kind === 'test'
      ? prisma.testSuggestion.delete({ where: { id } })
      : prisma.resultErrorReport.delete({ where: { id } });
}

// Permanent delete — these are lightweight, spam-prone public-form leads (not price/audit data), so
// unlike most admin deletes there's no soft-delete/undo: once triaged (reviewed/dismissed) or
// obviously spam, just remove it. Dismiss (PATCH status=DISMISSED) is the reversible "archive" step.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const { id } = await params;
  const kindParam = req.nextUrl.searchParams.get('kind');
  if (!kindParam || !(KINDS as readonly string[]).includes(kindParam)) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: `?kind= must be one of ${KINDS.join(', ')}` } },
      { status: 400 },
    );
  }

  try {
    await deleteByKind(kindParam as Kind, id);
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: { code: 'not_found', message: 'Suggestion not found' } }, { status: 404 });
    }
    console.error('[DELETE /api/v1/admin/suggestions/[id]]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const { kind, status } = parsed.data;
  try {
    const updated =
      kind === 'vendor'
        ? await prisma.vendorSuggestion.update({ where: { id }, data: { status } })
        : kind === 'test'
          ? await prisma.testSuggestion.update({ where: { id }, data: { status } })
          : await prisma.resultErrorReport.update({ where: { id }, data: { status } });
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: { code: 'not_found', message: 'Suggestion not found' } }, { status: 404 });
    }
    console.error('[PATCH /api/v1/admin/suggestions/[id]]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
