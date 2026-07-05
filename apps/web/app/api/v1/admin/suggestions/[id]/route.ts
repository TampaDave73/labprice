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
  kind: z.enum(['vendor', 'test']),
  status: z.enum(['PENDING', 'REVIEWED', 'DISMISSED']),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const { kind, status } = parsed.data;
  const updated =
    kind === 'vendor'
      ? await prisma.vendorSuggestion.update({ where: { id }, data: { status } }).catch(() => null)
      : await prisma.testSuggestion.update({ where: { id }, data: { status } }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Suggestion not found' } }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
