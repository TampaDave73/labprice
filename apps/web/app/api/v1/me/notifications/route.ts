import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Sign in required' } },
      { status: 401 },
    );
  }

  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 25), 100);
  const cursor = params.get('cursor');

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = notifications.length > limit;
  const data = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore ? data[data.length - 1]!.id : undefined;

  return NextResponse.json({ data, nextCursor });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Sign in required' } },
      { status: 401 },
    );
  }

  const body = await req.json();
  const { ids } = body as { ids?: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'ids array is required' } },
      { status: 400 },
    );
  }

  await prisma.notification.updateMany({
    where: {
      id: { in: ids },
      userId: session.user.id,
    },
    data: { isRead: true },
  });

  return NextResponse.json({ data: { updated: ids.length } });
}
