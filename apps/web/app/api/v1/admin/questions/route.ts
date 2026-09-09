// Admin review queue for harvested question candidates. List, and set a status.
//
// Nothing in this queue is public. Candidates arrive from
// apps/worker/scripts/harvest-questions.ts and go no further until someone acts on them here.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const status = req.nextUrl.searchParams.get('status') ?? 'NEW';
  const where = status === 'ALL' ? {} : { status: status as 'NEW' | 'APPROVED' | 'REJECTED' | 'DRAFTED' };

  const [candidates, counts] = await Promise.all([
    prisma.questionCandidate.findMany({
      where,
      orderBy: [{ score: 'desc' }, { capturedAt: 'desc' }],
      take: 200,
    }),
    prisma.questionCandidate.groupBy({ by: ['status'], _count: { status: true } }),
  ]);

  return NextResponse.json({
    data: {
      candidates,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count.status])),
    },
  });
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(['NEW', 'APPROVED', 'REJECTED', 'DRAFTED']),
  notes: z.string().trim().max(2000).nullish(),
});

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid update', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const { id, status, notes } = parsed.data;

  const existing = await prisma.questionCandidate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Candidate not found' } }, { status: 404 });
  }

  const candidate = await prisma.questionCandidate.update({
    where: { id },
    data: { status, ...(notes !== undefined && { notes: notes?.trim() || null }) },
  });
  return NextResponse.json({ data: { candidate } });
}
