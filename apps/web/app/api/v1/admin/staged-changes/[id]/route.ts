import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { publishStagedChange } from '@/lib/publish-change';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json();
  const { status, reviewNote } = body as { status: 'APPROVED' | 'REJECTED'; reviewNote?: string };

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'status must be APPROVED or REJECTED' } },
      { status: 400 },
    );
  }

  const existing = await prisma.stagedPriceChange.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Staged change not found' } },
      { status: 404 },
    );
  }

  if (existing.status !== 'PENDING') {
    return NextResponse.json(
      { error: { code: 'conflict', message: `Change already ${existing.status}` } },
      { status: 409 },
    );
  }

  const updated = await prisma.stagedPriceChange.update({
    where: { id },
    data: {
      status,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: reviewNote ?? null,
    },
  });

  // If approving, publish the new price to the live offering inline (no worker needed).
  if (status === 'APPROVED') {
    await publishStagedChange(id);
  }

  return NextResponse.json({ data: updated });
}
