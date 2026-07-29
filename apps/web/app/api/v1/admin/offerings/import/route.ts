import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { parseWorkbookSheet } from '@/lib/xlsx';

// Write-back half of the cross-vendor Offerings audit round-trip (see export/route.ts for the read
// half and the reasoning). Row-anchored on offering_id — this tool only fixes/unlinks EXISTING live
// offerings, it never creates one (that's what the per-vendor Catalog round-trip and the scraper are
// for). NEVER blind: apply:false always returns a preview computed fresh against the live DB; only
// apply:true executes, in one transaction, audit-logged.
//
// Two editable columns: external_url (fix a wrong link) and action ("deactivate" to unlink a wrong
// offering — soft, sets isActive:false, never deletes data/history; blank = no change to active
// status). vendor_product_name/current_price are reference-only and ignored even if present/edited.

type RowPlan = {
  line: number;
  offeringId: string;
  testName: string;
  fields: { externalUrl: string | null; deactivate: boolean };
  changes: Record<string, { from: string; to: string }>;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const apply = form?.get('apply') === 'true';
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Body must include a file.' } }, { status: 400 });
  }

  const parsed = await parseWorkbookSheet(await file.arrayBuffer(), 'Offerings').catch(() => ({ error: "Could not read that file as an Excel workbook. Start from an Export to get a file in the right shape." }));
  if ('error' in parsed) {
    return NextResponse.json({ error: { code: 'validation_error', message: parsed.error } }, { status: 400 });
  }
  const { header, records } = parsed;

  const required = ['offering_id'];
  const missing = required.filter((c) => !header.includes(c));
  if (records.length === 0 || missing.length > 0) {
    const msg = records.length === 0
      ? 'The Offerings sheet has no data rows.'
      : `The Offerings sheet is missing required column(s): ${missing.join(', ')}. Start from an export to get the right columns.`;
    return NextResponse.json({ error: { code: 'validation_error', message: msg } }, { status: 400 });
  }
  if (records.length > 5000) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'More than 5,000 rows — split it up.' } }, { status: 400 });
  }

  const offerings = await prisma.offering.findMany({
    where: { deletedAt: null },
    select: { id: true, externalUrl: true, isActive: true, test: { select: { name: true } } },
  });
  const offeringById = new Map(offerings.map((o) => [o.id, o]));

  const errors: { line: number; message: string }[] = [];
  const plans: RowPlan[] = [];
  const seenIds = new Set<string>();
  let unchanged = 0;

  records.forEach((rec, i) => {
    const line = i + 2;
    const offeringId = (rec.offering_id ?? '').trim();
    if (!offeringId) { errors.push({ line, message: 'Missing offering_id.' }); return; }
    const existing = offeringById.get(offeringId);
    if (!existing) { errors.push({ line, message: `No offering ${offeringId} (deleted, or the id was hand-edited).` }); return; }
    if (seenIds.has(offeringId)) { errors.push({ line, message: `Duplicate offering_id ${offeringId} in the file.` }); return; }
    seenIds.add(offeringId);

    const actionRaw = (rec.action ?? '').trim().toLowerCase();
    if (actionRaw && actionRaw !== 'deactivate') {
      errors.push({ line, message: `Unrecognized action "${rec.action}" — leave blank or type "deactivate".` });
      return;
    }
    const deactivate = actionRaw === 'deactivate';

    const url = 'external_url' in rec ? ((rec.external_url ?? '').trim() || null) : existing.externalUrl;

    const changes: Record<string, { from: string; to: string }> = {};
    const cmp = (key: string, from: string, to: string) => { if (from !== to) changes[key] = { from, to }; };
    cmp('external_url', existing.externalUrl ?? '', url ?? '');
    if (deactivate && existing.isActive) changes.action = { from: 'active', to: 'deactivated' };

    if (Object.keys(changes).length === 0) { unchanged++; return; }
    plans.push({ line, offeringId, testName: existing.test.name, fields: { externalUrl: url, deactivate }, changes });
  });

  const summary = {
    updates: plans.map((p) => ({ line: p.line, testName: p.testName, changes: p.changes })),
    unchanged,
    errors,
    applied: false,
  };

  // Dry run, or nothing to do, or blocked by errors: report only.
  if (!apply || errors.length > 0 || plans.length === 0) {
    return NextResponse.json({ data: summary }, { status: !apply || errors.length === 0 ? 200 : 422 });
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      await tx.offering.update({
        where: { id: plan.offeringId },
        data: {
          externalUrl: plan.fields.externalUrl,
          ...(plan.fields.deactivate ? { isActive: false } : {}),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'offerings.audit_import',
        entityType: 'offering',
        entityId: 'bulk',
        newValues: { updated: summary.updates.length, unchanged },
      },
    });
  });

  return NextResponse.json({ data: { ...summary, applied: true } });
}
