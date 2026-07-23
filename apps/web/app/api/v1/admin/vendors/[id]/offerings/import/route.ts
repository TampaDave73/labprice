import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { parseWorkbookSheet } from '@/lib/xlsx';

type Params = { params: Promise<{ id: string }> };

// Write-back half of the vendor Catalog Excel round-trip (see export/route.ts for the read half and
// the reasoning). NEVER blind: apply:false always returns a preview computed fresh against the live
// DB; only apply:true executes, in one transaction, audit-logged. test_id anchors every row (present
// on every exported row, since the export lists ALL tests, not just linked ones); offering_id
// anchors an EXISTING link when present.
//
// Only creates and updates — never unlinks. A row with a blank offering_id and both external_url and
// current_price still blank is just an untouched reference row (skipped, not an error); an admin who
// wants to remove a link uses the ✕ button in the one-by-one Catalog table, same reasoning as the
// Tests importer not supporting delete-by-CSV.

type RowPlan = {
  line: number;
  action: 'create' | 'update';
  offeringId?: string;
  testId: string;
  testName: string;
  fields: { externalUrl: string | null; currentPrice: number | null; isActive: boolean };
  changes?: Record<string, { from: string; to: string }>;
};

const parseBool = (s: string) => ['true', '1', 'yes', 'y', 'x'].includes(s.toLowerCase());

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }
  const { id: vendorId } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true } });
  if (!vendor) return NextResponse.json({ error: { code: 'not_found', message: 'Vendor not found.' } }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const apply = form?.get('apply') === 'true';
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Body must include a file.' } }, { status: 400 });
  }

  const parsed = await parseWorkbookSheet(await file.arrayBuffer(), 'Catalog').catch(() => ({ error: "Could not read that file as an Excel workbook. Start from an Export to get a file in the right shape." }));
  if ('error' in parsed) {
    return NextResponse.json({ error: { code: 'validation_error', message: parsed.error } }, { status: 400 });
  }
  const { header, records } = parsed;

  const required = ['test_id'];
  const missing = required.filter((c) => !header.includes(c));
  if (records.length === 0 || missing.length > 0) {
    const msg = records.length === 0
      ? 'The Catalog sheet has no data rows.'
      : `The Catalog sheet is missing required column(s): ${missing.join(', ')}. Start from an export to get the right columns.`;
    return NextResponse.json({ error: { code: 'validation_error', message: msg } }, { status: 400 });
  }
  if (records.length > 3000) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'More than 3,000 rows — split it up.' } }, { status: 400 });
  }

  const [tests, offerings] = await Promise.all([
    prisma.test.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.offering.findMany({
      where: { vendorId, deletedAt: null },
      select: { id: true, testId: true, externalUrl: true, currentPrice: true, isActive: true },
    }),
  ]);
  const testById = new Map(tests.map((t) => [t.id, t]));
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const offeringByTestId = new Map(offerings.map((o) => [o.testId, o]));

  const errors: { line: number; message: string }[] = [];
  const plans: RowPlan[] = [];
  const seenTestIds = new Set<string>();
  let unchanged = 0;
  let skippedBlank = 0;

  records.forEach((rec, i) => {
    const line = i + 2;
    const testId = (rec.test_id ?? '').trim();
    if (!testId) { errors.push({ line, message: 'Missing test_id.' }); return; }
    const test = testById.get(testId);
    if (!test) { errors.push({ line, message: `No test with id ${testId} (deleted, or the id was hand-edited).` }); return; }
    if (seenTestIds.has(testId)) { errors.push({ line, message: `Duplicate test_id ${testId} in the file.` }); return; }
    seenTestIds.add(testId);

    const offeringIdRaw = (rec.offering_id ?? '').trim();
    const existing = offeringIdRaw ? offeringById.get(offeringIdRaw) : offeringByTestId.get(testId);
    if (offeringIdRaw && !existing) { errors.push({ line, message: `No offering ${offeringIdRaw} for this vendor (deleted, or the id was hand-edited).` }); return; }
    if (offeringIdRaw && existing && existing.testId !== testId) { errors.push({ line, message: `offering_id ${offeringIdRaw} belongs to a different test — don't hand-edit this column.` }); return; }

    const url = (rec.external_url ?? '').trim() || null;
    const priceStr = (rec.current_price ?? '').trim();
    if (priceStr && Number.isNaN(Number(priceStr))) { errors.push({ line, message: `current_price "${priceStr}" is not a number.` }); return; }
    const price = priceStr ? Number(priceStr) : null;
    const isActive = 'is_active' in rec && rec.is_active.trim() !== '' ? parseBool(rec.is_active) : (existing?.isActive ?? true);

    if (!existing) {
      if (!url && price == null) { skippedBlank++; return; } // still-unlinked reference row — nothing to do
      plans.push({ line, action: 'create', testId, testName: test.name, fields: { externalUrl: url, currentPrice: price, isActive } });
      return;
    }

    const changes: Record<string, { from: string; to: string }> = {};
    const cmp = (key: string, from: string, to: string) => { if (from !== to) changes[key] = { from, to }; };
    cmp('external_url', existing.externalUrl ?? '', url ?? '');
    cmp('current_price', existing.currentPrice != null ? String(Number(existing.currentPrice)) : '', price != null ? String(price) : '');
    cmp('is_active', String(existing.isActive), String(isActive));
    if (Object.keys(changes).length === 0) { unchanged++; return; }
    plans.push({ line, action: 'update', offeringId: existing.id, testId, testName: test.name, fields: { externalUrl: url, currentPrice: price, isActive }, changes });
  });

  const summary = {
    creates: plans.filter((p) => p.action === 'create').map((p) => ({ line: p.line, testName: p.testName, externalUrl: p.fields.externalUrl, currentPrice: p.fields.currentPrice })),
    updates: plans.filter((p) => p.action === 'update').map((p) => ({ line: p.line, testName: p.testName, changes: p.changes })),
    unchanged,
    skippedBlank,
    errors,
    applied: false,
  };

  // Dry run, or nothing to do, or blocked by errors: report only.
  if (!apply || errors.length > 0 || plans.length === 0) {
    return NextResponse.json({ data: summary }, { status: !apply || errors.length === 0 ? 200 : 422 });
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      if (plan.action === 'create') {
        // Same upsert-on-(testId,vendorId) the one-by-one "Add" button uses — reactivates a
        // soft-deleted offering rather than erroring if one already exists under the hood.
        await tx.offering.upsert({
          where: { testId_vendorId: { testId: plan.testId, vendorId } },
          update: {
            deletedAt: null,
            isActive: plan.fields.isActive,
            externalUrl: plan.fields.externalUrl,
            ...(plan.fields.currentPrice != null ? { currentPrice: plan.fields.currentPrice } : {}),
          },
          create: {
            testId: plan.testId, vendorId,
            externalUrl: plan.fields.externalUrl, currentPrice: plan.fields.currentPrice, isActive: plan.fields.isActive,
          },
        });
      } else {
        await tx.offering.update({
          where: { id: plan.offeringId! },
          data: { externalUrl: plan.fields.externalUrl, currentPrice: plan.fields.currentPrice, isActive: plan.fields.isActive },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'vendor_offerings.xlsx_import',
        entityType: 'vendor',
        entityId: vendorId,
        newValues: { vendor: vendor.name, created: summary.creates.length, updated: summary.updates.length, unchanged },
      },
    });
  });

  return NextResponse.json({ data: { ...summary, applied: true } });
}
