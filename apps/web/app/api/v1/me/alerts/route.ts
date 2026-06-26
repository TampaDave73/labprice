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

  const alerts = await prisma.priceAlert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      test: {
        select: { name: true, slug: true, category: { select: { name: true } } },
      },
    },
  });

  const data = alerts.map((a) => ({
    id: a.id,
    testId: a.testId,
    targetPrice: a.targetPrice ? Number(a.targetPrice) : null,
    thresholdPercent: a.thresholdPercent,
    isActive: a.isActive,
    lastTriggeredAt: a.lastTriggeredAt,
    createdAt: a.createdAt,
    test: {
      name: a.test.name,
      slug: a.test.slug,
      category: a.test.category.name,
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
  const { testId, targetPrice, thresholdPercent } = body as {
    testId?: string;
    targetPrice?: number;
    thresholdPercent?: number;
  };

  if (!testId || typeof testId !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'testId is required' } },
      { status: 400 },
    );
  }

  const hasTarget = targetPrice != null;
  const hasThreshold = thresholdPercent != null;

  if ((!hasTarget && !hasThreshold) || (hasTarget && hasThreshold)) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Provide exactly one of targetPrice or thresholdPercent' } },
      { status: 400 },
    );
  }

  const test = await prisma.test.findUnique({ where: { id: testId }, select: { id: true } });
  if (!test) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Test not found' } },
      { status: 404 },
    );
  }

  const alert = await prisma.priceAlert.create({
    data: {
      userId: session.user.id,
      testId,
      targetPrice: hasTarget ? targetPrice : null,
      thresholdPercent: hasThreshold ? thresholdPercent : null,
    },
    include: {
      test: { select: { name: true, slug: true } },
    },
  });

  return NextResponse.json({
    data: {
      id: alert.id,
      testId: alert.testId,
      targetPrice: alert.targetPrice ? Number(alert.targetPrice) : null,
      thresholdPercent: alert.thresholdPercent,
      isActive: alert.isActive,
      createdAt: alert.createdAt,
      test: { name: alert.test.name, slug: alert.test.slug },
    },
  }, { status: 201 });
}
