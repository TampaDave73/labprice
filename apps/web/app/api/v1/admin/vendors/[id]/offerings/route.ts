import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { isCatalogMode } from '@/lib/catalog-mode';
import { runVendorDiscovery, publishStagedChange } from '@labprice/scrapers/src/catalog/persist';

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

  // For catalog-mode vendors (e.g. GoodLabs), a newly-linked test has no price yet. Run discovery
  // INLINE, scoped to just this offering (name-narrowed → a couple of fetches, ~1-3s), so the price
  // appears immediately. Best-effort: if the site is unreachable, the link still succeeds.
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId }, select: { selectors: true, isEnabled: true } });
  let discovery: { matched: number; ambiguous: number; unmatched: number } | null = null;
  if (config?.isEnabled && isCatalogMode(config.selectors)) {
    try {
      const summary = await runVendorDiscovery({ vendorId, triggeredBy: 'MANUAL', offeringIds: [offering.id] });
      for (const sid of summary.autoApprovedStagedIds) await publishStagedChange(sid);
      discovery = { matched: summary.matched, ambiguous: summary.ambiguous, unmatched: summary.unmatched };
    } catch (e) {
      console.error('[offerings] inline discovery failed for new offering', e);
    }
  }

  return NextResponse.json({ data: offering, discovery }, { status: 201 });
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
