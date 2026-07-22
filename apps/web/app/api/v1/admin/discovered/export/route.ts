import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma, getVendorTrustMap } from '@labprice/database';
import { auth } from '@/lib/auth';
import { clusterKey, computeConfidence } from '@/lib/discovered-actions';

// Excel export of the Discovered review queue (UNMATCHED, non-panel VendorProduct rows) for offline
// triage — the one-by-one /admin/discovered UI doesn't scale to a quarterly catch-up pass across
// thousands of rows. One row per VENDOR PRODUCT (not per cluster): a cluster is only a grouping hint
// here, so a reviewer can approve 8 of a cluster's 9 vendors and leave the price-outlier one for
// later, which the cluster-level UI actions can't do. `vendor_product_id` is the row's real identity;
// re-import matches on it, never on name. See api/v1/admin/discovered/import for the write-back half.
//
// Was plain CSV; moved to a real workbook (2026-07-22) for three things CSV can't do: a category
// dropdown sourced from a live list (still allows typing a new one — the importer creates it), TEXT
// number format on quest_code/labcorp_code so Excel can't mangle a leading-zero code into a number,
// and header cell notes + a proper instructions sheet instead of inert rows wedged into the data.

const COLUMNS = [
  { key: 'vendor_product_id', header: 'vendor_product_id', width: 26, note: "The row's real identity. Never edit this — re-import matches on it, not on name." },
  { key: 'cluster_id', header: 'cluster_id', width: 18, note: 'Internal grouping key. A reading aid only, not actionable.' },
  { key: 'cluster_label', header: 'cluster_label', width: 26, note: 'Human-readable name for the cluster this row belongs to (the most common name across its vendors).' },
  { key: 'vendor_name', header: 'vendor_name', width: 18, note: 'Which vendor sells this listing.' },
  { key: 'vendor_trust', header: 'vendor_trust', width: 12, note: "That vendor's HIGH/MEDIUM/LOW scraper trust — weigh a HIGH-trust vendor's evidence more." },
  { key: 'raw_name', header: 'raw_name', width: 36, note: "The exact name the vendor uses. Your primary 'is this really the same test' signal." },
  { key: 'price', header: 'price', width: 10, note: "Observed price. Blank = the vendor's detail page wasn't fetched yet — fills in on the next scrape once listed." },
  { key: 'quest_code', header: 'quest_code', width: 12, note: 'Quest order code, when known. Formatted as TEXT so a leading zero is never dropped.' },
  { key: 'labcorp_code', header: 'labcorp_code', width: 12, note: 'LabCorp order code, when known. Formatted as TEXT so a leading zero is never dropped.' },
  { key: 'product_url', header: 'product_url', width: 30, note: "Link to the vendor's page — open it when a row is uncertain." },
  { key: 'confidence', header: 'confidence', width: 12, note: 'high = shares a lab code with another vendor here (strong). low = price is a big outlier vs. the group — double-check it.' },
  { key: 'duplicate_vendor_in_cluster', header: 'duplicate_vendor_in_cluster', width: 14, note: 'yes = this vendor has 2 rows in this cluster — a near-certain sign it still mixes two different products. Decide them separately.' },
  { key: 'suggested_test_name', header: 'suggested_test_name', width: 26, note: "THE key attach-vs-promote signal. Filled in = the auto-matcher thinks this is a test you already have — check it, then usually attach. Blank = usually promote." },
  { key: 'suggested_test_slug', header: 'suggested_test_slug', width: 22, note: 'Paste straight into attach_test_slug once you confirm the suggested match is right.' },
  { key: 'decision', header: 'decision', width: 12, note: 'ignore, attach, or promote — or leave blank to skip this row for now (safe, not an error).' },
  { key: 'attach_test_slug', header: 'attach_test_slug', width: 22, note: "decision=attach only: the EXISTING test's slug to link this vendor to." },
  { key: 'new_test_name', header: 'new_test_name', width: 26, note: 'decision=promote only: name for the new test. Give every row of the same new test the SAME name to merge them into one test.' },
  { key: 'new_test_slug', header: 'new_test_slug', width: 22, note: 'decision=promote only, optional: leave blank to derive it from new_test_name.' },
  { key: 'new_test_category', header: 'new_test_category', width: 20, note: "decision=promote only. Pick from the dropdown or type a new one — unrecognized names are created automatically on Apply." },
] as const;

const TEXT_FORMAT_COLUMNS = new Set(['quest_code', 'labcorp_code']);
const DECISION_COL = COLUMNS.findIndex((c) => c.key === 'decision') + 1;
const CATEGORY_COL = COLUMNS.findIndex((c) => c.key === 'new_test_category') + 1;

function addInstructionsSheet(workbook: ExcelJS.Workbook) {
  const ws = workbook.addWorksheet('How it works');
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 100;

  let row = 1;
  const title = (text: string) => {
    const c = ws.getCell(row, 2);
    c.value = text;
    c.font = { bold: true, size: 14 };
    row += 2;
  };
  const heading = (text: string) => {
    const c = ws.getCell(row, 2);
    c.value = text;
    c.font = { bold: true, size: 11 };
    row += 1;
  };
  const body = (text: string) => {
    const c = ws.getCell(row, 2);
    c.value = text;
    c.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(row).height = Math.max(15, Math.ceil(text.length / 95) * 15);
    row += 2;
  };

  title('Discovered products — how to work this file');
  body("This is the review queue: every vendor product the catalog scrapers found that isn't a listed test yet. Fill in 'decision' on the Discovered sheet for any row you're ready to act on, then re-upload it via Import on /admin/discovered — you'll get a preview of every change before anything is applied. Leave 'decision' blank on a row to skip it for now; nothing happens to a blank-decision row, ever.");

  heading('decision — one of these, or blank to skip');
  body('ignore — this listing is not something to add (a mismatch, a duplicate, not worth carrying). Reversible from the one-by-one UI\'s Ignored tab.\nattach — this vendor sells a test you ALREADY have listed. Links this vendor to it and records the price.\npromote — this is a BRAND NEW test, nothing like it exists on the site yet. Creates it.');

  heading('>>> The core question: attach or promote? <<<');
  body("Check the 'suggested_test_name' column first — that's the auto-matcher's fuzzy candidate (never applied automatically, always your call).\n\n  • Filled in → this vendor's product looks like a test you already have. Open the product_url, confirm it's really the same test (same analyte, same specimen type), then set decision=attach and copy suggested_test_slug into attach_test_slug.\n\n  • Blank → the matcher didn't find anything close. It's probably a new test. Set decision=promote, fill in new_test_name and new_test_category (new_test_slug is optional — leave it blank and it's derived from the name).\n\n  • Still not sure → leave decision blank and come back to it later. That's always safe.");

  heading('Example');
  body("Row: raw_name='Vitamin D, Serum', suggested_test_name='Vitamin D 25-Hydroxy', suggested_test_slug='vitamin-d-25-hydroxy'.\n→ That's the same test. Set decision=attach, attach_test_slug=vitamin-d-25-hydroxy.\n\nRow: raw_name='Apolipoprotein E Genotype', suggested_test_name=(blank).\n→ Nothing like it exists yet. Set decision=promote, new_test_name='Apolipoprotein E Genotype', new_test_category='Genetic Testing' (typed fresh — created automatically on Apply since it doesn't exist yet).");

  heading('Merging multiple vendors into ONE new test');
  body("If several rows are all the same brand-new test sold by different vendors, give every one of them decision=promote with the EXACT SAME new_test_name (and same new_test_slug, or leave slug blank on all of them so it derives identically). They merge into one new test with one offering per vendor — not a separate test per vendor.");

  heading('Categories');
  body("new_test_category (promote only) has a dropdown on the Discovered sheet, sourced from the 'Categories' sheet — pick an existing one, or just type a name that isn't in the list. Either way, on Apply: a recognized name is used as-is; an unrecognized name is created as a brand new category automatically. No separate step needed.");

  heading('confidence and duplicate_vendor_in_cluster');
  body('confidence=high: this row shares a Quest/LabCorp code with another vendor in its cluster — strong evidence it\'s the same test. confidence=low: this row\'s price is a big outlier vs. the cluster — double check before deciding.\n\nduplicate_vendor_in_cluster=yes: this vendor has 2 rows in the same cluster (usually because the cluster still mixes two different products). Decide those rows separately — don\'t route both to the same test, or the second one\'s price is silently skipped (Offering only allows one price per vendor per test).');

  heading('quest_code / labcorp_code');
  body("Formatted as TEXT on the Discovered sheet specifically so Excel can't strip a leading zero from a code like '081950'. If you ever retype one of these, keep the cell formatted as Text (Home → Number → Text) before typing, or the leading zero will vanish.");
}

function addCategoriesSheet(workbook: ExcelJS.Workbook, categoryNames: string[]) {
  const ws = workbook.addWorksheet('Categories');
  ws.getColumn(1).width = 30;
  const header = ws.getCell(1, 1);
  header.value = 'Existing categories (reference — pick one on the Discovered sheet, or type a new name there)';
  header.font = { bold: true };
  categoryNames.forEach((name, i) => { ws.getCell(i + 2, 1).value = name; });
  return categoryNames.length;
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const [rows, categories] = await Promise.all([
    prisma.vendorProduct.findMany({
      where: { status: 'UNMATCHED', isPanel: false },
      select: {
        id: true, name: true, normalizedName: true, url: true, price: true,
        questCode: true, labcorpCode: true,
        vendor: { select: { id: true, name: true, trustOverride: true } },
        // The auto-matcher's fuzzy (never auto-applied) candidate — surfaced as the key signal for
        // the attach-vs-promote call: filled in means "this looks like a test you already have."
        suggestedTest: { select: { name: true, slug: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({ select: { name: true }, orderBy: { displayOrder: 'asc' } }),
  ]);

  const trustMap = await getVendorTrustMap([...new Set(rows.map((r) => r.vendor.id))]);

  const clusterMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = clusterKey(r);
    clusterMap.set(key, [...(clusterMap.get(key) ?? []), r]);
  }

  // Cluster label = most common product name in the group, same rule the review UI uses.
  const labelOf = (products: typeof rows) => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };

  const clusters = [...clusterMap.entries()]
    .map(([key, products]) => ({ key, label: labelOf(products), vendorCount: new Set(products.map((p) => p.vendor.id)).size, products }))
    .sort((a, b) => b.vendorCount - a.vendorCount || a.label.localeCompare(b.label));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LabTestCompare';
  workbook.created = new Date();

  addInstructionsSheet(workbook);
  const categoryRowCount = addCategoriesSheet(workbook, categories.map((c) => c.name));

  const ws = workbook.addWorksheet('Discovered');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  COLUMNS.forEach((c, i) => {
    if (TEXT_FORMAT_COLUMNS.has(c.key)) ws.getColumn(i + 1).numFmt = '@';
    ws.getCell(1, i + 1).note = c.note;
  });

  let rowNum = 1; // header is row 1
  for (const c of clusters) {
    const vendorCounts = new Map<string, number>();
    for (const p of c.products) vendorCounts.set(p.vendor.id, (vendorCounts.get(p.vendor.id) ?? 0) + 1);

    const sorted = [...c.products].sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
    for (const p of sorted) {
      rowNum++;
      const trust = p.vendor.trustOverride ?? trustMap.get(p.vendor.id) ?? 'MEDIUM';
      const confidence = computeConfidence(p, c.products);
      const duplicateVendor = (vendorCounts.get(p.vendor.id) ?? 0) > 1 ? 'yes' : '';
      ws.addRow({
        vendor_product_id: p.id,
        cluster_id: c.key,
        cluster_label: c.label,
        vendor_name: p.vendor.name,
        vendor_trust: trust,
        raw_name: p.name,
        price: p.price != null ? Number(p.price) : '',
        quest_code: p.questCode ?? '',
        labcorp_code: p.labcorpCode ?? '',
        product_url: p.url ?? '',
        confidence,
        duplicate_vendor_in_cluster: duplicateVendor,
        suggested_test_name: p.suggestedTest?.name ?? '',
        suggested_test_slug: p.suggestedTest?.slug ?? '',
        decision: '',
        attach_test_slug: '',
        new_test_name: '',
        new_test_slug: '',
        new_test_category: '',
      });

      // Dropdowns: decision from a fixed list; category from the Categories sheet. Both allow typing
      // something not on the list (showErrorMessage: false) — the category one needs to, since a new
      // category name is exactly the "not on the list yet" case.
      ws.getCell(rowNum, DECISION_COL).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: false,
        formulae: ['"ignore,attach,promote"'],
      };
      ws.getCell(rowNum, CATEGORY_COL).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: false,
        formulae: [`'Categories'!$A$2:$A$${1 + Math.max(categoryRowCount, 1)}`],
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="labtestcompare-discovered-${stamp}.xlsx"`,
    },
  });
}
