import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Sign in required' } },
      { status: 401 },
    );
  }

  const { id } = await params;

  const saved = await prisma.savedTest.findUnique({ where: { id } });
  if (!saved || saved.userId !== session.user.id) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Saved test not found' } },
      { status: 404 },
    );
  }

  await prisma.savedTest.delete({ where: { id } });

  return NextResponse.json({ data: { id } });
}
