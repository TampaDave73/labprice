// Admin user management: list active users (cursor-paginated) and invite new ones by email.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function forbidden(message: string) {
  return NextResponse.json({ error: { code: 'forbidden', message } }, { status: 403 });
}

// List active (non-deleted) users, newest first.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return forbidden('Admin access required');
  }

  const params = req.nextUrl.searchParams;
  const rawLimit = Number(params.get('limit') ?? 25);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
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
    return forbidden('Admin access required');
  }

  try {
    // Malformed JSON (or a non-object body) is a client error, not a server crash.
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'A JSON body is required' } },
        { status: 400 },
      );
    }
    const b = body as Record<string, unknown>;

    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : null;
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'A valid email is required' } },
        { status: 400 },
      );
    }
    // An unknown role is rejected outright rather than silently downgraded to USER — a typo'd
    // "SUPERADMIN" invite should fail loudly, not create a regular user.
    const roleInput = b.role ?? 'USER';
    if (typeof roleInput !== 'string' || !(ROLES as readonly string[]).includes(roleInput)) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: `Unknown role — expected one of ${ROLES.join(', ')}` } },
        { status: 400 },
      );
    }
    const role = roleInput as Role;
    if (['ADMIN', 'SUPER_ADMIN'].includes(role) && session.user.role !== 'SUPER_ADMIN') {
      return forbidden('Only SUPER_ADMIN can grant admin roles');
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
  } catch (err) {
    console.error('[POST /api/v1/admin/users]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
