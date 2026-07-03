// Test ↔ vendor links, managed from the test side (mirror of vendors/[id]/offerings).
//
// Lets an admin pick which vendors offer a test right from the test editor. Attaching a catalog-mode
// vendor runs discovery INLINE (scoped to the new offering) so the price appears immediately — same
// behavior as attaching from the vendor screen.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { isCatalogMode } from '@/lib/catalog-mode';
import { runVendorDiscovery, publishStagedChange } from '@labprice/scrapers/src/catalog/persist';

type Params = { params: Promise<{ id: string }> };

// Inline discovery can crawl a live catalog; give the attach request room.
export const maxDuration = 60;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });

// Which vendors offer this test (+ price), alongside the full vendor list for the multiselect.
export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: testId } = await params;

  const [vendors, offerings] = await Promise.all([
    prisma.vendor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.offering.findMany({
      where: { testId, deletedAt: null, vendor: { deletedAt: null } },
      select: { id: true, vendorId: true, currentPrice: true, externalUrl: true, isActive: true },
    }),
  ]);

  const byVendor = new Map(offerings.map((o) => [o.vendorId, o]));
  return NextResponse.json({
    data: vendors.map((v) => {
      const o = byVendor.get(v.id);
      return {
        vendorId: v.id,
        vendorName: v.name,
        offered: Boolean(o),
        offeringId: o?.id ?? null,
        currentPrice: o?.currentPrice != null ? Number(o.currentPrice) : null,
        externalUrl: o?.externalUrl ?? null,
        isActive: o?.isActive ?? false,
      };
    }),
  });
}

// Attach a vendor to this test (creates/re-activates an Offering) + inline auto-scrape for catalog vendors.
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: testId } = await params;
  const body = await req.json().catch(() => ({}));
  const vendorId = String(body.vendorId ?? '');
  if (!vendorId) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'vendorId is required' } }, { status: 400 });
  }

  const offering = await prisma.offering.upsert({
    where: { testId_vendorId: { testId, vendorId } },
    update: { deletedAt: null, isActive: true },
    create: { testId, vendorId, isActive: true },
  });

  // Auto-scrape the price now for catalog-mode vendors (best-effort; link succeeds regardless).
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId }, select: { selectors: true, isEnabled: true } });
  let discovery: { matched: number; ambiguous: number; unmatched: number } | null = null;
  if (config?.isEnabled && isCatalogMode(config.selectors)) {
    try {
      const summary = await runVendorDiscovery({ vendorId, triggeredBy: 'MANUAL', offeringIds: [offering.id] });
      for (const sid of summary.autoApprovedStagedIds) await publishStagedChange(sid);
      discovery = { matched: summary.matched, ambiguous: summary.ambiguous, unmatched: summary.unmatched };
    } catch (e) {
      console.error('[tests/vendors] inline discovery failed for new offering', e);
    }
  }

  // Return the fresh price (discovery may have set it).
  const fresh = await prisma.offering.findUnique({ where: { id: offering.id }, select: { currentPrice: true, externalUrl: true } });
  return NextResponse.json(
    {
      data: {
        offeringId: offering.id,
        currentPrice: fresh?.currentPrice != null ? Number(fresh.currentPrice) : null,
        externalUrl: fresh?.externalUrl ?? null,
      },
      discovery,
    },
    { status: 201 },
  );
}

// Detach a vendor from this test (soft delete).
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return forbidden();
  const { id: testId } = await params;
  const vendorId = req.nextUrl.searchParams.get('vendorId');
  if (!vendorId) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'vendorId is required' } }, { status: 400 });
  }

  await prisma.offering.updateMany({
    where: { testId, vendorId, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });

  return NextResponse.json({ data: { success: true } });
}
