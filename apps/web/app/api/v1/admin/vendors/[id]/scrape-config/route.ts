import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const ENGINES = ['PLAYWRIGHT', 'SELENIUM', 'HTTP'] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }
  const { id } = await params;
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId: id } });
  return NextResponse.json({ data: config });
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const engine = ENGINES.includes(body.engine) ? body.engine : 'HTTP';
  const selectors = {
    priceSelector: typeof body.priceSelector === 'string' ? body.priceSelector : '',
    nameSelector: typeof body.nameSelector === 'string' ? body.nameSelector : '',
    containerSelector: typeof body.containerSelector === 'string' ? body.containerSelector : '',
  } satisfies Prisma.InputJsonValue;

  const shared = {
    engine,
    baseUrl: body.baseUrl || null,
    selectors,
    scheduleCron: body.scheduleCron || null,
    isEnabled: body.isEnabled !== false,
    timeoutMs: Number(body.timeoutMs) || 30000,
    maxRetries: Number(body.maxRetries) || 3,
  };

  const config = await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: id },
    update: shared,
    create: { vendorId: id, ...shared },
  });

  return NextResponse.json({ data: config });
}
