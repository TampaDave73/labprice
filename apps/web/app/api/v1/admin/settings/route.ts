import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const [settings, featureFlags] = await Promise.all([
    prisma.systemSetting.findMany(),
    prisma.featureFlag.findMany(),
  ]);

  return NextResponse.json({ data: { settings, featureFlags } });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { settings, featureFlags } = body;

  if (settings) {
    for (const { key, value } of settings) {
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: session.user.id },
        update: { value, updatedBy: session.user.id },
      });
    }
  }

  if (featureFlags) {
    for (const { key, isEnabled } of featureFlags) {
      await prisma.featureFlag.upsert({
        where: { key },
        create: { key, isEnabled },
        update: { isEnabled },
      });
    }
  }

  const [updatedSettings, updatedFlags] = await Promise.all([
    prisma.systemSetting.findMany(),
    prisma.featureFlag.findMany(),
  ]);

  return NextResponse.json({ data: { settings: updatedSettings, featureFlags: updatedFlags } });
}
