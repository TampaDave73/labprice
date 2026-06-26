import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Sign in required' } },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'User not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: user });
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
  const { name } = body as { name?: string };

  if (name !== undefined && typeof name !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'name must be a string' } },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { name: name ?? null },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return NextResponse.json({ data: user });
}
