import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({
    where: { id, deletedAt: null },
    include: {
      _count: { select: { offerings: true } },
      scrapeConfig: true,
    },
  });

  if (!vendor) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Vendor not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: vendor });
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
  const body = await req.json();

  const vendor = await prisma.vendor.update({
    where: { id },
    data: body,
  });

  return NextResponse.json({ data: vendor });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;
  await prisma.vendor.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ data: { success: true } });
}
