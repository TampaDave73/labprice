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
  const test = await prisma.test.findUnique({
    where: { id, deletedAt: null },
    include: {
      category: true,
      codes: true,
      biomarkers: { include: { biomarker: true } },
      offerings: { include: { vendor: true } },
    },
  });

  if (!test) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Test not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: test });
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

  const test = await prisma.test.update({
    where: { id },
    data: body,
    include: { category: true },
  });

  return NextResponse.json({ data: test });
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
  await prisma.test.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ data: { success: true } });
}
