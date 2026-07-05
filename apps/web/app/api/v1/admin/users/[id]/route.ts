import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

// Guards against locking every admin out: true when `id` is currently a SUPER_ADMIN AND no other
// active SUPER_ADMIN exists — the only role that can grant SUPER_ADMIN/ADMIN in the first place.
async function isLastSuperAdmin(id: string): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (target?.role !== 'SUPER_ADMIN') return false;
  const otherSuperAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN', deletedAt: null, id: { not: id } } });
  return otherSuperAdmins === 0;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const { role } = await req.json();

  if (['ADMIN', 'SUPER_ADMIN'].includes(role) && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Only SUPER_ADMIN can grant admin roles' } },
      { status: 403 },
    );
  }

  if (role !== 'SUPER_ADMIN' && (await isLastSuperAdmin(id))) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'This is the last SUPER_ADMIN — promote someone else first, or the whole team could get locked out of admin' } },
      { status: 403 },
    );
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, name: true, role: true, createdAt: true, image: true },
  });

  return NextResponse.json({ data: user });
}

// Soft-delete + downgrade to USER (in case they're re-invited without an explicit role later) + revoke
// every active session so removal takes effect immediately, not just on their next sign-in — Auth.js's
// PrismaAdapter doesn't know about our `deletedAt` convention, so a lingering Session row would keep
// working otherwise.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: "You can't remove your own account" } },
      { status: 403 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (target && ['ADMIN', 'SUPER_ADMIN'].includes(target.role) && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Only SUPER_ADMIN can remove an admin' } },
      { status: 403 },
    );
  }

  if (await isLastSuperAdmin(id)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'This is the last SUPER_ADMIN — promote someone else first, or the whole team could get locked out of admin' } },
      { status: 403 },
    );
  }

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.user.update({ where: { id }, data: { deletedAt: new Date(), role: 'USER' } }),
  ]);

  return NextResponse.json({ data: { success: true } });
}
