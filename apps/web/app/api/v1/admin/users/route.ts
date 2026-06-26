import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 25), 100);
  const cursor = params.get('cursor');

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, name: true, role: true, createdAt: true, image: true },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = users.length > limit;
  const data = hasMore ? users.slice(0, limit) : users;
  const nextCursor = hasMore ? data[data.length - 1]!.id : undefined;

  return NextResponse.json({ data, nextCursor });
}
