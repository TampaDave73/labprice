import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const status = params.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED' | null;
  const limit = Math.min(Number(params.get('limit') ?? 25), 100);
  const cursor = params.get('cursor');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const changes = await prisma.stagedPriceChange.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      offering: {
        include: {
          test: { select: { id: true, name: true } },
          vendor: { select: { id: true, name: true, slug: true } },
        },
      },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = changes.length > limit;
  const data = hasMore ? changes.slice(0, limit) : changes;
  const nextCursor = hasMore ? data[data.length - 1]!.id : undefined;

  return NextResponse.json({ data, nextCursor });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { action, ids } = body as { action: 'approve' | 'reject'; ids: string[] };

  if (!action || !['approve', 'reject'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Body must include action (approve|reject) and non-empty ids array' } },
      { status: 400 },
    );
  }

  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.stagedPriceChange.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: {
      status: newStatus as 'APPROVED' | 'REJECTED',
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  });

  // If approving, enqueue publish jobs
  if (action === 'approve') {
    const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const publishQueue = new Queue('scrape:publish', { connection: connection as any });

    for (const id of ids) {
      await publishQueue.add('publish', { stagedChangeId: id });
    }

    await publishQueue.close();
    await connection.quit();
  }

  return NextResponse.json({ data: { updated: updated.count, action } });
}
