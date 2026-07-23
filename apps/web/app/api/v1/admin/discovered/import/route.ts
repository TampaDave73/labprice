import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { attachProductsToTest, createPromotedTest } from '@/lib/discovered-actions';
import { parseWorkbookSheet } from '@/lib/xlsx';

// Write-back half of the Discovered Excel round-trip (see export/route.ts for the read half and the
// reasoning). NEVER blind: same two-phase contract as the Tests importer — apply:false always
// returns a preview computed fresh against the live DB; only apply:true executes, in one
// transaction, audit-logged. Decisions are per VENDOR PRODUCT ROW, not per cluster, so a reviewer
// can attach 8 of a cluster's 9 vendors to a test and leave the price-outlier 9th blank for later.
//
// decision column, per row:
//   (blank)  → skip — leave for a future pass, not an error.
//   ignore   → same as the one-by-one "Ignore" button.
//   attach   → requires attach_test_slug (must match an existing, non-deleted test).
//   promote  → requires new_test_name + new_test_category. new_test_category accepts a comma-
//              separated list ("Hormones, Metabolic") — same many-to-many categories every other
//              test can have; Test.categoryId is just the derived display pointer (lowest
//              displayOrder among them), same rule as the regular admin Test editor. new_test_slug
//              is optional (derived from the name when blank) and is the GROUPING key: every row
//              sharing a slug becomes one new test with one offering per vendor — that's how a
//              9-vendor cluster becomes one test in a single import instead of nine.
//
// A row whose VendorProduct drifted out of UNMATCHED since the CSV was exported (someone else
// already matched/ignored it in the UI) is reported under `skipped`, not `errors` — that's expected
// for a slow offline pass, not a file problem.

const MAX_ROWS = 2000;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

type AttachGroup = { testId: string; testName: string; lines: number[]; vendorProductIds: string[] };
type PromoteGroup = {
  slug: string; name: string; categoryNames: string[];
  questCode: string | null; labcorpCode: string | null;
  lines: number[]; vendorProductIds: string[];
};

/** new_test_category supports a comma-separated list ("Hormones, Metabolic") — same many-to-many
 * categories every other test in the catalog can have. Trims each name and drops case-insensitive
 * duplicates within the cell (keeping the first casing seen). */
function parseCategoryNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

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

  const parsed = await parseWorkbookSheet(await file.arrayBuffer(), 'Discovered').catch(() => ({ error: "Could not read that file as an Excel workbook. Start from an Export to get a file in the right shape." }));
  if ('error' in parsed) {
    return NextResponse.json({ error: { code: 'validation_error', message: parsed.error } }, { status: 400 });
  }
  const { header, records } = parsed;
  const required = ['vendor_product_id', 'decision'];
  const missing = required.filter((c) => !header.includes(c));
  if (records.length === 0 || missing.length > 0) {
    const msg = records.length === 0
      ? 'The Discovered sheet has no data rows.'
      : `The Discovered sheet is missing required column(s): ${missing.join(', ')}. Start from an export to get the right columns.`;
    return NextResponse.json({ error: { code: 'validation_error', message: msg } }, { status: 400 });
  }
  const decided = records.filter((r) => (r.decision ?? '').trim() !== '');
  if (decided.length > MAX_ROWS) {
    return NextResponse.json({ error: { code: 'validation_error', message: `${decided.length} rows have a decision — more than ${MAX_ROWS}. Split the file and import in batches.` } }, { status: 400 });
  }

  const ids = [...new Set(records.map((r) => r.vendor_product_id).filter((id): id is string => Boolean(id)))];
  const [products, tests, categories] = await Promise.all([
    prisma.vendorProduct.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, url: true, price: true, vendorId: true, labProvider: true, status: true },
    }),
    prisma.test.findMany({ where: { deletedAt: null }, select: { id: true, slug: true, name: true } }),
    prisma.category.findMany({ select: { id: true, name: true, displayOrder: true } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const testBySlug = new Map(tests.map((t) => [t.slug, t]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const errors: { line: number; message: string }[] = [];
  const skipped: { line: number; vendorProductId: string; reason: string }[] = [];
  const seenIds = new Set<string>();
  const ignoreIds: string[] = [];
  const attachGroups = new Map<string, AttachGroup>();
  const promoteGroups = new Map<string, PromoteGroup>();
  const newCategories = new Map<string, string>(); // lowercase name -> original casing, deduped across rows

  records.forEach((rec, i) => {
    const line = i + 2;
    const decision = (rec.decision ?? '').trim().toLowerCase();
    if (!decision) return; // blank = leave for later, not an error

    const vpId = rec.vendor_product_id ?? '';
    if (!vpId) { errors.push({ line, message: 'Missing vendor_product_id.' }); return; }
    if (seenIds.has(vpId)) { errors.push({ line, message: `Duplicate vendor_product_id ${vpId} in the file.` }); return; }
    seenIds.add(vpId);

    const product = productById.get(vpId);
    if (!product) { errors.push({ line, message: `No discovered product with id ${vpId}.` }); return; }
    if (product.status !== 'UNMATCHED') {
      skipped.push({ line, vendorProductId: vpId, reason: `Already ${product.status.toLowerCase()} since this was exported.` });
      return;
    }

    if (decision === 'ignore') {
      ignoreIds.push(vpId);
      return;
    }

    if (decision === 'attach') {
      const slug = (rec.attach_test_slug ?? '').trim();
      if (!slug) { errors.push({ line, message: 'attach requires attach_test_slug.' }); return; }
      const test = testBySlug.get(slug);
      if (!test) { errors.push({ line, message: `No existing test with slug "${slug}".` }); return; }
      const g = attachGroups.get(test.id) ?? { testId: test.id, testName: test.name, lines: [], vendorProductIds: [] };
      g.lines.push(line);
      g.vendorProductIds.push(vpId);
      attachGroups.set(test.id, g);
      return;
    }

    if (decision === 'promote') {
      const name = (rec.new_test_name ?? '').trim();
      const categoryNames = parseCategoryNames(rec.new_test_category ?? '');
      if (!name || categoryNames.length === 0) { errors.push({ line, message: 'promote requires new_test_name and new_test_category.' }); return; }
      const slug = (rec.new_test_slug ?? '').trim() || slugify(name);
      if (!slug) { errors.push({ line, message: 'new_test_name produced an empty slug.' }); return; }
      const existingOwner = testBySlug.get(slug);
      if (existingOwner) { errors.push({ line, message: `Slug "${slug}" already belongs to the existing test "${existingOwner.name}".` }); return; }
      for (const catName of categoryNames) {
        if (!categoryByName.has(catName.toLowerCase()) && !newCategories.has(catName.toLowerCase())) {
          newCategories.set(catName.toLowerCase(), catName);
        }
      }

      const categoryKey = categoryNames.map((c) => c.toLowerCase()).sort().join('|');
      const g = promoteGroups.get(slug);
      if (g) {
        const gKey = g.categoryNames.map((c) => c.toLowerCase()).sort().join('|');
        if (g.name !== name || gKey !== categoryKey) {
          errors.push({ line, message: `Row conflicts with an earlier row also using new_test_slug "${slug}" (different name/category) — give it a distinct new_test_slug.` });
          return;
        }
        g.lines.push(line);
        g.vendorProductIds.push(vpId);
        g.questCode = g.questCode ?? (rec.quest_code || null);
        g.labcorpCode = g.labcorpCode ?? (rec.labcorp_code || null);
      } else {
        promoteGroups.set(slug, {
          slug, name, categoryNames, lines: [line], vendorProductIds: [vpId],
          questCode: rec.quest_code || null, labcorpCode: rec.labcorp_code || null,
        });
      }
      return;
    }

    errors.push({ line, message: `Unknown decision "${decision}" — must be ignore, attach, or promote (or blank).` });
  });

  const offeringsWithoutPrice = [...attachGroups.values(), ...promoteGroups.values()]
    .flatMap((g) => g.vendorProductIds)
    .filter((id) => productById.get(id)?.price == null).length;

  // Same-vendor duplicates WITHIN a group: since Offering is unique on (testId, vendorId), only the
  // first of two same-vendor rows routed to the same test would ever get an offering — the rest
  // silently vanish (see attachProductsToTest's droppedDuplicates). Surfaced here so it shows in the
  // dry-run preview, before anything is applied, not just in the apply response after the fact.
  const duplicatesInGroup = (ids: string[]) => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of ids) {
      const vid = productById.get(id)?.vendorId;
      if (!vid) continue;
      if (seen.has(vid)) dupes.push(id);
      else seen.add(vid);
    }
    return dupes.length;
  };

  const summary = {
    ignore: { count: ignoreIds.length },
    attach: [...attachGroups.values()].map((g) => ({ testSlug: tests.find((t) => t.id === g.testId)!.slug, testName: g.testName, count: g.vendorProductIds.length, duplicateVendorRows: duplicatesInGroup(g.vendorProductIds) })),
    promote: [...promoteGroups.values()].map((g) => ({ slug: g.slug, name: g.name, categories: g.categoryNames, count: g.vendorProductIds.length, questCode: g.questCode, labcorpCode: g.labcorpCode, duplicateVendorRows: duplicatesInGroup(g.vendorProductIds) })),
    skipped,
    errors,
    newCategories: [...newCategories.values()],
    offeringsWithoutPrice,
    applied: false,
  };

  const totalPlanned = ignoreIds.length + attachGroups.size + promoteGroups.size;
  if (!apply || errors.length > 0 || totalPlanned === 0) {
    return NextResponse.json({ data: { ...summary, droppedDuplicates: [] } }, { status: !apply || errors.length === 0 ? 200 : 422 });
  }

  const droppedDuplicates: { vendorId: string; name: string }[] = [];
  await prisma.$transaction(async (tx) => {
    let nextOrder = Math.max(0, ...categories.map((c) => c.displayOrder)) + 1;
    for (const catName of newCategories.values()) {
      const created = await tx.category.create({ data: { name: catName, slug: slugify(catName), displayOrder: nextOrder++ } });
      categoryByName.set(catName.toLowerCase(), { id: created.id, name: created.name, displayOrder: created.displayOrder });
    }

    if (ignoreIds.length > 0) {
      await tx.vendorProduct.updateMany({ where: { id: { in: ignoreIds } }, data: { status: 'IGNORED' } });
    }

    let offeringsCreated = 0;
    let aliasesLearned = 0;
    let testsCreated = 0;

    for (const g of promoteGroups.values()) {
      const categoryIds = g.categoryNames.map((n) => categoryByName.get(n.toLowerCase())!.id);
      const { testId } = await createPromotedTest(tx, {
        name: g.name, slug: g.slug, categoryIds, questCode: g.questCode, labcorpCode: g.labcorpCode,
      });
      testsCreated++;
      const groupProducts = g.vendorProductIds.map((id) => productById.get(id)!);
      const r = await attachProductsToTest(tx, testId, groupProducts, { markMatched: true });
      offeringsCreated += r.offeringsCreated;
      aliasesLearned += r.aliasesLearned;
      droppedDuplicates.push(...r.droppedDuplicates);
    }

    for (const g of attachGroups.values()) {
      const groupProducts = g.vendorProductIds.map((id) => productById.get(id)!);
      const r = await attachProductsToTest(tx, g.testId, groupProducts, { markMatched: true });
      offeringsCreated += r.offeringsCreated;
      aliasesLearned += r.aliasesLearned;
      droppedDuplicates.push(...r.droppedDuplicates);
    }

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'discovered.csv_import',
        entityType: 'vendorProduct',
        entityId: 'bulk',
        newValues: { ignored: ignoreIds.length, testsCreated, attachedToExisting: attachGroups.size, offeringsCreated, aliasesLearned, droppedDuplicates },
      },
    });
  });

  return NextResponse.json({ data: { ...summary, applied: true, droppedDuplicates } });
}
