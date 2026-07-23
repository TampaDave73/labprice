import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

// Excel export of ONE vendor's full catalog view: EVERY test in the system gets a row, filled in
// with whatever we already have for this vendor (URL/price/active) — blank for a test the vendor
// might actually carry but that never got auto-matched. Fill in the blanks (or fix a wrong URL) and
// re-import via "Import Excel" on the vendor's Catalog section to bulk-create/update the links —
// the one-by-one Catalog table below does the same thing but doesn't scale past a handful of edits.
//
// quest_code/labcorp_code are reference-only (help confirm you're editing the right row) —
// TEXT-formatted for the same reason every other admin workbook here uses it: Excel silently strips
// a leading zero off a code like 004650 on open otherwise.

const COLUMNS = [
  { key: 'offering_id', header: 'offering_id', width: 24, note: "Blank = not linked to this vendor yet. Filled = an existing link. Don't type a value here yourself." },
  { key: 'test_id', header: 'test_id', width: 24, note: "The test's identity. Row anchor — don't edit." },
  { key: 'test_name', header: 'test_name', width: 32, note: 'Reference only.' },
  { key: 'category', header: 'category', width: 20, note: 'Reference only.' },
  { key: 'quest_code', header: 'quest_code', width: 12, note: 'Reference only, to help confirm this is the right test. TEXT-formatted so a leading zero is never dropped.' },
  { key: 'labcorp_code', header: 'labcorp_code', width: 12, note: 'Reference only, to help confirm this is the right test. TEXT-formatted so a leading zero is never dropped.' },
  { key: 'currently_linked', header: 'currently_linked', width: 15, note: 'Reference only — "yes" if this vendor already carries this test. Sort/filter by this column to jump straight to the gaps.' },
  { key: 'external_url', header: 'external_url', width: 44, note: "This vendor's product page for the test. Fill this in for a test they carry but that never got auto-matched, then re-import." },
  { key: 'current_price', header: 'current_price', width: 13, note: "This vendor's price for the test." },
  { key: 'is_active', header: 'is_active', width: 10, note: 'true/false (also accepts 1/0, yes/no, x). A new link defaults to true when left blank.' },
] as const;

const TEXT_FORMAT_COLUMNS = new Set(['quest_code', 'labcorp_code']);

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }
  const { id: vendorId } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, slug: true } });
  if (!vendor) return NextResponse.json({ error: { code: 'not_found', message: 'Vendor not found.' } }, { status: 404 });

  const [tests, offerings] = await Promise.all([
    prisma.test.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, questCode: true, labcorpCode: true, category: { select: { name: true } } },
    }),
    prisma.offering.findMany({
      where: { vendorId, deletedAt: null },
      select: { id: true, testId: true, externalUrl: true, currentPrice: true, isActive: true },
    }),
  ]);
  const offeringByTest = new Map(offerings.map((o) => [o.testId, o]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LabTestCompare';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Catalog');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  COLUMNS.forEach((c, i) => {
    if (TEXT_FORMAT_COLUMNS.has(c.key)) ws.getColumn(i + 1).numFmt = '@';
    ws.getCell(1, i + 1).note = c.note;
  });

  for (const t of tests) {
    const o = offeringByTest.get(t.id);
    ws.addRow({
      offering_id: o?.id ?? '',
      test_id: t.id,
      test_name: t.name,
      category: t.category.name,
      quest_code: t.questCode ?? '',
      labcorp_code: t.labcorpCode ?? '',
      currently_linked: o ? 'yes' : '',
      external_url: o?.externalUrl ?? '',
      current_price: o?.currentPrice != null ? Number(o.currentPrice) : '',
      is_active: o ? String(o.isActive) : '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="labtestcompare-${vendor.slug}-catalog-${stamp}.xlsx"`,
    },
  });
}
