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

  const settings = await prisma.systemSetting.findMany();
  return NextResponse.json({ data: { settings } });
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
  const { settings } = body;

  if (settings) {
    for (const { key, value } of settings) {
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: session.user.id },
        update: { value, updatedBy: session.user.id },
      });
    }
  }

  const updatedSettings = await prisma.systemSetting.findMany();
  return NextResponse.json({ data: { settings: updatedSettings } });
}
