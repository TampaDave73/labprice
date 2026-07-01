import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { enqueueDiscover, isCatalogMode } from '@/lib/scrape-queue';

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });

// Vendor catalog: which tests this vendor offers (+ product URL & price).
export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: vendorId } = await params;

  const offerings = await prisma.offering.findMany({
    where: { vendorId, deletedAt: null },
    include: { test: { select: { id: true, name: true, slug: true } } },
    orderBy: { test: { name: 'asc' } },
  });

  const linkedTestIds = new Set(offerings.map((o) => o.testId));
  const allTests = await prisma.test.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const availableTests = allTests.filter((t) => !linkedTestIds.has(t.id));

  return NextResponse.json({
    data: {
      offerings: offerings.map((o) => ({
        id: o.id,
        testId: o.testId,
        testName: o.test.name,
        externalUrl: o.externalUrl,
        currentPrice: o.currentPrice ? Number(o.currentPrice) : null,
        isActive: o.isActive,
      })),
      availableTests,
    },
  });
}

// Link a test to this vendor (creates/re-activates an Offering).
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: vendorId } = await params;
  const body = await req.json();
  const testId = String(body.testId ?? '');
  if (!testId) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'testId is required' } }, { status: 400 });
  }
  const externalUrl = body.externalUrl ? String(body.externalUrl) : null;
  const currentPrice = body.currentPrice != null && body.currentPrice !== '' ? Number(body.currentPrice) : null;

  const offering = await prisma.offering.upsert({
    where: { testId_vendorId: { testId, vendorId } },
    update: { deletedAt: null, isActive: true, externalUrl, ...(currentPrice != null ? { currentPrice } : {}) },
    create: { testId, vendorId, externalUrl, currentPrice, isActive: true },
  });

  // Requeue-on-add: for catalog-mode vendors (e.g. GoodLabs), a newly-linked test has no price yet.
  // Enqueue a discovery job scoped to just this offering so the scraper finds its price. Best-effort:
  // if Redis/worker is down, the link still succeeds and a later full run will pick it up.
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId }, select: { selectors: true, isEnabled: true } });
  if (config?.isEnabled && isCatalogMode(config.selectors)) {
    try {
      await enqueueDiscover(vendorId, [offering.id]);
    } catch (e) {
      console.error('[offerings] failed to enqueue discovery for new offering', e);
    }
  }

  return NextResponse.json({ data: offering }, { status: 201 });
}

// Update an existing link's URL / price.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: vendorId } = await params;
  const body = await req.json();
  const offeringId = String(body.offeringId ?? '');
  if (!offeringId) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'offeringId is required' } }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ('externalUrl' in body) data.externalUrl = body.externalUrl ? String(body.externalUrl) : null;
  if ('currentPrice' in body) data.currentPrice = body.currentPrice != null && body.currentPrice !== '' ? Number(body.currentPrice) : null;
  if ('isActive' in body) data.isActive = Boolean(body.isActive);

  const offering = await prisma.offering.update({
    where: { id: offeringId, vendorId },
    data,
  });

  return NextResponse.json({ data: offering });
}

// Unlink a test from this vendor (soft delete).
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: vendorId } = await params;
  const offeringId = req.nextUrl.searchParams.get('offeringId');
  if (!offeringId) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'offeringId is required' } }, { status: 400 });
  }

  await prisma.offering.update({
    where: { id: offeringId, vendorId },
    data: { deletedAt: new Date(), isActive: false },
  });

  return NextResponse.json({ data: { success: true } });
}
