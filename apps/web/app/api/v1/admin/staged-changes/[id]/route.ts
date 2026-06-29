import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

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

  // If approving, enqueue publish job
  if (status === 'APPROVED') {
    const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const publishQueue = new Queue('scrape-publish', { connection: connection as any });
    await publishQueue.add('publish', { stagedChangeId: id });
    await publishQueue.close();
    await connection.quit();
  }

  return NextResponse.json({ data: updated });
}
