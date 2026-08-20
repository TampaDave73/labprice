import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

// Cross-vendor catalog audit export: one row per LIVE offering (test<->vendor price link actually
// showing on the site), across every vendor at once — sorted by test then vendor, so every vendor's
// entry for the same test sits together and a naming/URL mismatch (e.g. one vendor's product name
// says "Iron", another says "Testosterone" for the same test row) jumps out at a glance. This is a
// bulk-audit tool, not the per-vendor Catalog round-trip (Vendors -> a vendor -> Export/Import) which
// lists every test for ONE vendor including gaps; this lists only what's actually live, across all
// vendors, so an admin can catch and fix an existing wrong match instead of filling a blank.
//
// vendor_product_name is reference-only (what the VENDOR calls the product at that URL, sourced from
// the VendorProduct ingest layer when a match exists) — never imported back; its only job is to sit
// next to our own test_name so a mismatch is visible without opening the URL.

const COLUMNS = [
  { key: 'offering_id', header: 'offering_id', width: 24, note: "Row anchor — don't edit or retype." },
  { key: 'test_name', header: 'test_name', width: 32, note: 'Our canonical test name. Reference only.' },
  { key: 'test_slug', header: 'test_slug', width: 28, note: 'Reference only.' },
  { key: 'quest_code', header: 'quest_code', width: 12, note: 'Reference only. TEXT-formatted so a leading zero is never dropped.' },
  { key: 'labcorp_code', header: 'labcorp_code', width: 12, note: 'Reference only. TEXT-formatted so a leading zero is never dropped.' },
  { key: 'vendor_name', header: 'vendor_name', width: 22, note: 'Reference only.' },
  { key: 'vendor_product_name', header: 'vendor_product_name', width: 40, note: "What THIS VENDOR calls the product at external_url, from the last catalog crawl that matched it. Reference only (not imported back) — compare against test_name to catch a wrong match. Blank means this link was never seen by the ingest crawler (e.g. pasted in by hand), so there's nothing to compare it to." },
  { key: 'external_url', header: 'external_url', width: 50, note: "This vendor's product page for the test. Edit this to fix a wrong link, then re-import." },
  { key: 'current_price', header: 'current_price', width: 13, note: 'Reference only (prices come from the scraper, not this tool) — extra context: a price that looks wrong for the analyte is another mismatch signal.' },
  { key: 'action', header: 'action', width: 12, note: 'Leave blank for no change. Type "deactivate" to unlink this offering (soft — sets it inactive, same as the ✕ button; does not delete data or history).' },
] as const;

const TEXT_FORMAT_COLUMNS = new Set(['quest_code', 'labcorp_code']);

export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const [offerings, matchedProducts] = await Promise.all([
    prisma.offering.findMany({
      // Also exclude offerings whose vendor is soft-deleted — same gap as the old public-page
      // queries: this route's where clause didn't follow the vendor's own status, so a removed
      // vendor's orphaned offerings (e.g. Dirt Cheap Labs, 2026-08-20) kept showing up here even
      // though the on-page table (route.ts) already filtered them out.
      where: { isActive: true, deletedAt: null, vendor: { deletedAt: null } },
      select: {
        id: true, externalUrl: true, currentPrice: true, vendorId: true, testId: true,
        test: { select: { name: true, slug: true, questCode: true, labcorpCode: true } },
        vendor: { select: { name: true } },
      },
      orderBy: [{ test: { name: 'asc' } }, { vendor: { name: 'asc' } }],
    }),
    // One lookup for every (vendor, test) the ingest layer has ever matched — batched instead of a
    // query per row. Keyed "vendorId:testId"; if more than one VendorProduct ever matched the same
    // pair (shouldn't normally happen), the last one wins — this column is a diagnostic hint, not the
    // system of record.
    prisma.vendorProduct.findMany({
      where: { status: 'MATCHED', testId: { not: null } },
      select: { vendorId: true, testId: true, name: true },
    }),
  ]);

  const vendorProductName = new Map(matchedProducts.map((p) => [`${p.vendorId}:${p.testId}`, p.name]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LabTestCompare';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Offerings');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  COLUMNS.forEach((c, i) => {
    if (TEXT_FORMAT_COLUMNS.has(c.key)) ws.getColumn(i + 1).numFmt = '@';
    ws.getCell(1, i + 1).note = c.note;
  });

  for (const o of offerings) {
    ws.addRow({
      offering_id: o.id,
      test_name: o.test.name,
      test_slug: o.test.slug,
      quest_code: o.test.questCode ?? '',
      labcorp_code: o.test.labcorpCode ?? '',
      vendor_name: o.vendor.name,
      vendor_product_name: vendorProductName.get(`${o.vendorId}:${o.testId}`) ?? '',
      external_url: o.externalUrl ?? '',
      current_price: o.currentPrice != null ? Number(o.currentPrice) : '',
      action: '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="labtestcompare-offerings-audit-${stamp}.xlsx"`,
    },
  });
}
