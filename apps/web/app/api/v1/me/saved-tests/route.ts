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

  const saved = await prisma.savedTest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      test: {
        include: {
          category: true,
          offerings: {
            where: { isActive: true, deletedAt: null, currentPrice: { not: null } },
            orderBy: { currentPrice: 'asc' },
            take: 1,
            select: { currentPrice: true },
          },
        },
      },
    },
  });

  const data = saved.map((s) => ({
    id: s.id,
    testId: s.testId,
    createdAt: s.createdAt,
    test: {
      name: s.test.name,
      slug: s.test.slug,
      category: s.test.category.name,
      categorySlug: s.test.category.slug,
      bestPrice: s.test.offerings[0]?.currentPrice
        ? Number(s.test.offerings[0].currentPrice)
        : null,
    },
  }));

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Sign in required' } },
      { status: 401 },
    );
  }

  const body = await req.json();
  const { testId } = body as { testId?: string };

  if (!testId || typeof testId !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'testId is required' } },
      { status: 400 },
    );
  }

  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: { id: true, name: true, slug: true, category: { select: { name: true, slug: true } } },
  });

  if (!test) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Test not found' } },
      { status: 404 },
    );
  }

  const saved = await prisma.savedTest.upsert({
    where: { userId_testId: { userId: session.user.id, testId } },
    create: { userId: session.user.id, testId },
    update: {},
  });

  return NextResponse.json({
    data: {
      id: saved.id,
      testId: saved.testId,
      createdAt: saved.createdAt,
      test: {
        name: test.name,
        slug: test.slug,
        category: test.category.name,
        categorySlug: test.category.slug,
      },
    },
  }, { status: 201 });
}
