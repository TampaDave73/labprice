import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

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

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, name: true, role: true, createdAt: true, image: true },
  });

  return NextResponse.json({ data: user });
}
