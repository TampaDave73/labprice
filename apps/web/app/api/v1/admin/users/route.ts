import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'];

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

// Invite a user by email — no password: they sign in via the existing magic-link/Google providers,
// which attach to this row by email match (Auth.js's standard adapter behavior). Only SUPER_ADMIN can
// pre-grant an admin-level role, matching the same rule PATCH already enforces for role changes.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const role = ROLES.includes(body.role) ? body.role : 'USER';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'A valid email is required' } },
      { status: 400 },
    );
  }
  if (['ADMIN', 'SUPER_ADMIN'].includes(role) && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Only SUPER_ADMIN can grant admin roles' } },
      { status: 403 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.deletedAt) {
      return NextResponse.json(
        { error: { code: 'conflict', message: 'A user with this email already exists' } },
        { status: 409 },
      );
    }
    // Re-inviting a previously-removed user: restore them instead of creating a duplicate row.
    const restored = await prisma.user.update({
      where: { id: existing.id },
      data: { deletedAt: null, role, name: name ?? existing.name },
      select: { id: true, email: true, name: true, role: true, createdAt: true, image: true },
    });
    return NextResponse.json({ data: restored });
  }

  const user = await prisma.user.create({
    data: { email, name, role },
    select: { id: true, email: true, name: true, role: true, createdAt: true, image: true },
  });

  return NextResponse.json({ data: user }, { status: 201 });
}
