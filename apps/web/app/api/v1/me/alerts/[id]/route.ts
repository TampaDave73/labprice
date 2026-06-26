import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
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

  const alert = await prisma.priceAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== session.user.id) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Alert not found' } },
      { status: 404 },
    );
  }

  const body = await req.json();
  const { targetPrice, thresholdPercent, isActive } = body as {
    targetPrice?: number | null;
    thresholdPercent?: number | null;
    isActive?: boolean;
  };

  const updateData: Record<string, unknown> = {};

  if (isActive !== undefined) {
    updateData.isActive = isActive;
  }

  if (targetPrice !== undefined || thresholdPercent !== undefined) {
    const newTarget = targetPrice !== undefined ? targetPrice : (alert.targetPrice ? Number(alert.targetPrice) : null);
    const newThreshold = thresholdPercent !== undefined ? thresholdPercent : alert.thresholdPercent;

    const hasTarget = newTarget != null;
    const hasThreshold = newThreshold != null;

    if ((!hasTarget && !hasThreshold) || (hasTarget && hasThreshold)) {
      return NextResponse.json(
        { error: { code: 'bad_request', message: 'Exactly one of targetPrice or thresholdPercent must be set' } },
        { status: 400 },
      );
    }

    updateData.targetPrice = newTarget;
    updateData.thresholdPercent = newThreshold;
  }

  const updated = await prisma.priceAlert.update({
    where: { id },
    data: updateData,
    include: { test: { select: { name: true, slug: true } } },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      testId: updated.testId,
      targetPrice: updated.targetPrice ? Number(updated.targetPrice) : null,
      thresholdPercent: updated.thresholdPercent,
      isActive: updated.isActive,
      lastTriggeredAt: updated.lastTriggeredAt,
      test: { name: updated.test.name, slug: updated.test.slug },
    },
  });
}

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

  const alert = await prisma.priceAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== session.user.id) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Alert not found' } },
      { status: 404 },
    );
  }

  await prisma.priceAlert.delete({ where: { id } });

  return NextResponse.json({ data: { id } });
}
