import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

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
  // Accepts one testId (the Add form) or many (Add all remaining). Bulk goes in a single request so
  // linking 30 tests is one round trip rather than 30, and so it can't half-apply across a dropped
  // connection. url/price are single-add only — they describe one specific product page.
  const bulkIds: string[] = Array.isArray(body.testIds)
    ? [...new Set((body.testIds as unknown[]).map((v) => String(v)).filter((v): v is string => v.length > 0))]
    : [];
  const testId = String(body.testId ?? '');
  if (!testId && bulkIds.length === 0) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'testId or testIds is required' } }, { status: 400 });
  }
  const externalUrl = body.externalUrl ? String(body.externalUrl) : null;
  const currentPrice = body.currentPrice != null && body.currentPrice !== '' ? Number(body.currentPrice) : null;

  if (bulkIds.length > 0) {
    // Reject unknown/deleted ids up front rather than letting the upsert fail on a foreign key
    // mid-batch, which would leave an arbitrary prefix linked.
    const live = await prisma.test.findMany({ where: { id: { in: bulkIds }, deletedAt: null }, select: { id: true } });
    const liveIds = live.map((t) => t.id);
    if (liveIds.length === 0) {
      return NextResponse.json({ error: { code: 'validation_error', message: 'None of those tests exist.' } }, { status: 400 });
    }
    const created = await prisma.$transaction(
      liveIds.map((tid) =>
        prisma.offering.upsert({
          where: { testId_vendorId: { testId: tid, vendorId } },
          update: { deletedAt: null, isActive: true },
          create: { testId: tid, vendorId, externalUrl: null, currentPrice: null, isActive: true },
        }),
      ),
    );
    const unpriced = created.filter((o) => o.currentPrice == null).length;
    return NextResponse.json({ data: { linked: created.length, skipped: bulkIds.length - liveIds.length }, needsPricing: unpriced > 0 }, { status: 201 });
  }

  // A URL given at add-time is a deliberate pin too (see PATCH below / schema.prisma's comment).
  const urlPinned = Boolean(externalUrl);
  const offering = await prisma.offering.upsert({
    where: { testId_vendorId: { testId, vendorId } },
    update: { deletedAt: null, isActive: true, externalUrl, urlPinned, ...(currentPrice != null ? { currentPrice } : {}) },
    create: { testId, vendorId, externalUrl, urlPinned, currentPrice, isActive: true },
  });

  // Linking a test no longer prices it inline. It used to run discovery here, scoped to the one new
  // offering, on the assumption that was "a couple of fetches, ~1-3s". It isn't: discovery fetches the
  // vendor's ENTIRE catalog listing before it can match anything (1,200+ products on Walk-In Lab,
  // 3,100+ on Private MD Labs), so every single add paid a full catalog crawl — minutes per test, and
  // N times over when adding N tests. Because that listing fetch dominates, pricing many offerings
  // costs the same as pricing one, so the right shape is: add instantly, then price everything in a
  // single pass via "Scrape now" (POST /vendors/[id]/scrape), which already does exactly that and
  // additionally handles the browser-gated vendors by queueing them to the worker.
  const needsPricing = offering.currentPrice == null;

  return NextResponse.json({ data: offering, needsPricing }, { status: 201 });
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
  // Setting a URL here is an admin pin, not the scraper's own auto-cache of "last matched product" in
  // the same field — urlPinned is what makes runVendorDiscovery trust it over a confident-but-wrong
  // automatic match instead of silently overwriting it next scrape (see schema.prisma's comment).
  // Clearing the URL un-pins it, so the next scrape is free to auto-match again.
  if ('externalUrl' in body) {
    data.externalUrl = body.externalUrl ? String(body.externalUrl) : null;
    data.urlPinned = Boolean(data.externalUrl);
  }
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
