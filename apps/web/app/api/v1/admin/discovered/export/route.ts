import { NextResponse } from 'next/server';
import { prisma, Prisma, getVendorTrustMap } from '@labprice/database';
import { auth } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { clusterKey, computeConfidence } from '@/lib/discovered-actions';

// CSV export of the Discovered review queue (UNMATCHED, non-panel VendorProduct rows) for offline
// triage — the one-by-one /admin/discovered UI doesn't scale to a quarterly catch-up pass across
// thousands of rows. One row per VENDOR PRODUCT (not per cluster): a cluster is only a grouping hint
// here, so a reviewer can approve 8 of a cluster's 9 vendors and leave the price-outlier one for
// later, which the cluster-level UI actions can't do. `vendor_product_id` is the row's real identity;
// re-import matches on it, never on name. See api/v1/admin/discovered/import for the write-back half.
export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const rows = await prisma.vendorProduct.findMany({
    where: { status: 'UNMATCHED', isPanel: false },
    select: {
      id: true, name: true, normalizedName: true, url: true, price: true,
      questCode: true, labcorpCode: true,
      vendor: { select: { id: true, name: true, trustOverride: true } },
      // The auto-matcher's fuzzy (never auto-applied) candidate — surfaced here as the single most
      // useful signal for the attach-vs-promote call: filled in means "this looks like a test you
      // already have," which is exactly what attach is for.
      suggestedTest: { select: { name: true, slug: true } },
    },
    orderBy: { name: 'asc' },
  });

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

  const header = [
    'vendor_product_id', 'cluster_id', 'cluster_label', 'vendor_name', 'vendor_trust',
    'raw_name', 'price', 'quest_code', 'labcorp_code', 'product_url', 'confidence', 'duplicate_vendor_in_cluster',
    'suggested_test_name', 'suggested_test_slug',
    'decision', 'attach_test_slug', 'new_test_name', 'new_test_slug', 'new_test_category',
  ];
  const COLS = header.length;

  // Baked-in instructions, not a separate doc nobody opens. Every one of these has `decision` blank,
  // which the importer already treats as "skip, not an error" (see import/route.ts) — so they're
  // 100% inert on upload whether the reviewer deletes them or leaves them in. Two columns carry the
  // text (a short label in `vendor_name`, the explanation in `raw_name`) since those are the widest,
  // most naturally-read columns in Excel/Sheets; every other column stays blank.
  const note = (label: string, text: string): string[] => {
    const row = new Array(COLS).fill('');
    row[3] = label; // vendor_name
    row[5] = text; // raw_name
    return row;
  };
  const instructionRows: string[][] = [
    note('HOW TO USE THIS FILE', "Fill in the 'decision' column for any row you're ready to act on, then re-upload via Import CSV — you'll get a preview before anything is applied. Leave 'decision' blank on a row (including these instruction rows) to skip it for now; nothing happens to a blank-decision row."),
    note('DECISION VALUES', "decision must be exactly: ignore, attach, or promote — or blank to skip."),
    note(">>> attach — use when <<<", "This vendor is selling a test labtestcompare.com ALREADY LISTS (maybe from other vendors already). Check 'suggested_test_name' first — if it's filled in, that's very likely your match. Fill attach_test_slug with that existing test's slug."),
    note(">>> promote — use when <<<", "This is a BRAND NEW test — nothing like it exists on the site yet. Fill new_test_name + new_test_category (new_test_slug is optional). Give every vendor row for the SAME new test the SAME new_test_name — they merge into ONE new test with one offering per vendor, instead of creating a separate test per vendor."),
    note('NOT SURE WHICH ONE?', "Empty 'suggested_test_name' → it's probably new → promote. Filled in → check it's really the same test (right specimen type, right analyte) → attach. Still unsure → leave decision blank and come back to it."),
    note('CATEGORY (promote only)', "new_test_category: type any category name. If it doesn't already exist, it's created automatically the moment you Apply — no separate step needed."),
    note('CONFIDENCE / DUPLICATE FLAGS', "confidence=high: shares a lab code with another vendor in this cluster (strong evidence). confidence=low: price is a big outlier vs. the group — double-check it's really the same test before deciding. duplicate_vendor_in_cluster=yes: this vendor has 2 rows in this group — decide them separately, don't route both to the same test or the second one's price is dropped."),
    note('THESE ROWS ARE SAFE', "This whole block is safe to leave in the file when you re-upload — decision is blank, so it's always skipped. Delete it for a cleaner sheet if you'd rather; either way works."),
  ];

  const csvRows = clusters.flatMap((c) => {
    // Same vendor appears more than once in this cluster — a near-certain sign it still mixes two
    // distinct products (see clusterKey's comment). Flagged per-row so it's sortable/filterable in
    // the sheet, not just visible one card at a time in the UI.
    const vendorCounts = new Map<string, number>();
    for (const p of c.products) vendorCounts.set(p.vendor.id, (vendorCounts.get(p.vendor.id) ?? 0) + 1);

    return [...c.products]
      .sort((a, b) => a.vendor.name.localeCompare(b.vendor.name))
      .map((p) => {
        const trust = p.vendor.trustOverride ?? trustMap.get(p.vendor.id) ?? 'MEDIUM';
        const confidence = computeConfidence(p, c.products);
        const duplicateVendor = (vendorCounts.get(p.vendor.id) ?? 0) > 1 ? 'yes' : '';
        return [
          p.id, c.key, c.label, p.vendor.name, trust,
          p.name, p.price != null ? Number(p.price).toFixed(2) : '', p.questCode ?? '', p.labcorpCode ?? '',
          p.url ?? '', confidence, duplicateVendor,
          p.suggestedTest?.name ?? '', p.suggestedTest?.slug ?? '',
          '', '', '', '', '', // decision + the four fill-in-offline columns start blank
        ];
      });
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(header, [...instructionRows, ...csvRows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="labtestcompare-discovered-${stamp}.csv"`,
    },
  });
}
