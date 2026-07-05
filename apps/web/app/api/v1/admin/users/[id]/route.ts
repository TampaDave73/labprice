// Admin user management for a single user: role changes (PATCH) and removal (DELETE).
// Both mutations run their permission checks and the write inside one SERIALIZABLE transaction —
// the "last SUPER_ADMIN" guard is a check-then-act, and two concurrent demotes/deletes of the two
// remaining SUPER_ADMINs would otherwise both pass the check and lock everyone out of admin.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'] as const;
type Role = (typeof ROLES)[number];

const LAST_SUPER_ADMIN_MSG =
  'This is the last SUPER_ADMIN — promote someone else first, or the whole team could get locked out of admin';

function errorJson(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Serializable transactions abort with P2034 when two of them genuinely race; surface that as a
// retryable 409 instead of a generic 500.
function isTxConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return errorJson('forbidden', 'Admin access required', 403);
  }

  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  const role = body && typeof body === 'object' ? (body as Record<string, unknown>).role : undefined;
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
    return errorJson('validation_error', `A role is required — one of ${ROLES.join(', ')}`, 400);
  }

  if (['ADMIN', 'SUPER_ADMIN'].includes(role) && session.user.role !== 'SUPER_ADMIN') {
    return errorJson('forbidden', 'Only SUPER_ADMIN can grant admin roles', 403);
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { role: true, deletedAt: true } });
        if (!target || target.deletedAt) return { error: 'not_found' as const };
        // Demoting an admin is as sensitive as granting the role — mirror DELETE's rule so a plain
        // ADMIN can't strip another ADMIN/SUPER_ADMIN.
        if (['ADMIN', 'SUPER_ADMIN'].includes(target.role) && session.user.role !== 'SUPER_ADMIN') {
          return { error: 'not_super_admin' as const };
        }
        if (role !== 'SUPER_ADMIN' && target.role === 'SUPER_ADMIN') {
          const others = await tx.user.count({ where: { role: 'SUPER_ADMIN', deletedAt: null, id: { not: id } } });
          if (others === 0) return { error: 'last_super_admin' as const };
        }
        const user = await tx.user.update({
          where: { id },
          data: { role: role as Role },
          select: { id: true, email: true, name: true, role: true, createdAt: true, image: true },
        });
        return { user };
      },
      { isolationLevel: 'Serializable' },
    );

    if ('error' in result) {
      if (result.error === 'not_found') return errorJson('not_found', 'User not found', 404);
      if (result.error === 'not_super_admin') {
        return errorJson('forbidden', "Only SUPER_ADMIN can change an admin's role", 403);
      }
      return errorJson('forbidden', LAST_SUPER_ADMIN_MSG, 403);
    }
    return NextResponse.json({ data: result.user });
  } catch (err) {
    if (isTxConflict(err)) return errorJson('conflict', 'Another change raced this one — try again', 409);
    console.error('[PATCH /api/v1/admin/users/[id]]', err);
    return errorJson('INTERNAL_ERROR', 'Internal server error', 500);
  }
}

// Soft-delete + downgrade to USER (in case they're re-invited without an explicit role later) + revoke
// every active session so removal takes effect immediately, not just on their next sign-in — Auth.js's
// PrismaAdapter doesn't know about our `deletedAt` convention, so a lingering Session row would keep
// working otherwise.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return errorJson('forbidden', 'Admin access required', 403);
  }

  const { id } = await params;
  if (id === session.user.id) {
    return errorJson('forbidden', "You can't remove your own account", 403);
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { role: true, deletedAt: true } });
        if (!target || target.deletedAt) return { error: 'not_found' as const };
        if (['ADMIN', 'SUPER_ADMIN'].includes(target.role) && session.user.role !== 'SUPER_ADMIN') {
          return { error: 'not_super_admin' as const };
        }
        if (target.role === 'SUPER_ADMIN') {
          const others = await tx.user.count({ where: { role: 'SUPER_ADMIN', deletedAt: null, id: { not: id } } });
          if (others === 0) return { error: 'last_super_admin' as const };
        }
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.user.update({ where: { id }, data: { deletedAt: new Date(), role: 'USER' } });
        return { ok: true as const };
      },
      { isolationLevel: 'Serializable' },
    );

    if ('error' in result) {
      if (result.error === 'not_found') return errorJson('not_found', 'User not found', 404);
      if (result.error === 'not_super_admin') return errorJson('forbidden', 'Only SUPER_ADMIN can remove an admin', 403);
      return errorJson('forbidden', LAST_SUPER_ADMIN_MSG, 403);
    }
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    if (isTxConflict(err)) return errorJson('conflict', 'Another change raced this one — try again', 409);
    console.error('[DELETE /api/v1/admin/users/[id]]', err);
    return errorJson('INTERNAL_ERROR', 'Internal server error', 500);
  }
}
