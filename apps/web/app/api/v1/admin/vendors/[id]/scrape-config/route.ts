import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { ADAPTERS } from '@labprice/scrapers/src/catalog/adapters';

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
  // Catalog mode = the scraper crawls the vendor's catalog and matches our tests by code/name
  // (GoodLabs), rather than fetching a per-offering product URL. When on, the CSS selectors below are
  // ignored; catalogPath / preferredProvider steer the catalog scraper instead.
  const isCatalog = body.mode === 'catalog';
  // Validated against the scraper package's own adapter registry (not a hand-kept copy here) so a new
  // adapter never silently gets its `adapter` field stripped on save — this exact staleness bug (found
  // live 2026-07-04: Save Scraper Config silently wiped `adapter` for every catalog vendor added after
  // the original 4, falling back to the GoodLabs parser and returning 0 matches) is what this guards.
  const selectors = {
    ...(isCatalog ? { mode: 'catalog' as const } : {}),
    ...(isCatalog && Object.prototype.hasOwnProperty.call(ADAPTERS, body.adapter) ? { adapter: body.adapter } : {}),
    ...(isCatalog && typeof body.catalogPath === 'string' && body.catalogPath ? { catalogPath: body.catalogPath } : {}),
    ...(isCatalog && typeof body.preferredProvider === 'string' && body.preferredProvider ? { preferredProvider: body.preferredProvider } : {}),
    priceSelector: typeof body.priceSelector === 'string' ? body.priceSelector : '',
    nameSelector: typeof body.nameSelector === 'string' ? body.nameSelector : '',
    containerSelector: typeof body.containerSelector === 'string' ? body.containerSelector : '',
  } satisfies Prisma.InputJsonValue;

  // Automatic scrape cadence for the worker's daily tick. 0 = manual only. Clamped to the same set
  // the UI offers so a bad payload can't set a nonsense interval.
  const ALLOWED_FREQUENCIES = [0, 1, 3, 7, 14, 30];
  const frequencyDays = ALLOWED_FREQUENCIES.includes(Number(body.frequencyDays)) ? Number(body.frequencyDays) : 7;

  const shared = {
    engine,
    baseUrl: body.baseUrl || null,
    selectors,
    frequencyDays,
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
