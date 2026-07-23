import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

// Excel export of the CANONICAL tests layer — identity only (names, codes, categories, aliases),
// deliberately no prices: the spreadsheet owns what a test IS, the scrape pipeline owns what it
// costs. Row anchor is `id`, so a re-import matches rows unambiguously (blank id = create new).
//
// Was plain CSV; moved to a real workbook (2026-07-24) for the same reason the Discovered export
// already made this switch: Excel auto-detects a "numeric-looking" cell on open and silently strips
// a leading zero off a LabCorp code like "004650" — a real correctness bug, not a cosmetic one.
// quest_code/labcorp_code get TEXT number format so that can't happen.

const COLUMNS = [
  { key: 'id', header: 'id', width: 24, note: "The test's identity. Blank = create a new test on import. Don't type a value here yourself." },
  { key: 'name', header: 'name', width: 30, note: 'Full test name.' },
  { key: 'short_name', header: 'short_name', width: 18, note: 'Concise common name/abbreviation shown in compact UI. Blank on a new row defaults to name.' },
  { key: 'slug', header: 'slug', width: 24, note: 'URL slug. Leave blank on a new row to derive it from name.' },
  { key: 'quest_code', header: 'quest_code', width: 12, note: 'Quest order code. Formatted as TEXT so a leading zero is never dropped.' },
  { key: 'labcorp_code', header: 'labcorp_code', width: 12, note: 'LabCorp order code. Formatted as TEXT so a leading zero is never dropped.' },
  { key: 'categories', header: 'categories', width: 32, note: 'Full category set, pipe-separated (e.g. "Hormones|Metabolic"). REPLACES the existing set on import — not additive. See the Categories sheet for existing names; an unrecognized name is created automatically.' },
  { key: 'aliases', header: 'aliases', width: 32, note: "Alternate names this test is matched under (vendor naming variants), pipe-separated. REPLACES the full set on import." },
  { key: 'is_popular', header: 'is_popular', width: 10, note: 'true/false (also accepts 1/0, yes/no, x).' },
] as const;

const TEXT_FORMAT_COLUMNS = new Set(['quest_code', 'labcorp_code']);

function addCategoriesSheet(workbook: ExcelJS.Workbook, categoryNames: string[]) {
  const ws = workbook.addWorksheet('Categories');
  ws.getColumn(1).width = 32;
  const header = ws.getCell(1, 1);
  header.value = 'Existing categories (reference — copy exact names into the categories column, pipe-separated)';
  header.font = { bold: true };
  categoryNames.forEach((name, i) => { ws.getCell(i + 2, 1).value = name; });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const [tests, categories] = await Promise.all([
    prisma.test.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        categories: { include: { category: { select: { name: true, displayOrder: true } } } },
        category: { select: { name: true, displayOrder: true } },
        aliases: { orderBy: { alias: 'asc' }, select: { alias: true } },
      },
    }),
    prisma.category.findMany({ select: { name: true }, orderBy: { displayOrder: 'asc' } }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LabTestCompare';
  workbook.created = new Date();

  addCategoriesSheet(workbook, categories.map((c) => c.name));

  const ws = workbook.addWorksheet('Tests');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  COLUMNS.forEach((c, i) => {
    if (TEXT_FORMAT_COLUMNS.has(c.key)) ws.getColumn(i + 1).numFmt = '@';
    ws.getCell(1, i + 1).note = c.note;
  });

  for (const t of tests) {
    // Full category set = m2m memberships ∪ the (legacy) display pointer. Falls back to the primary
    // category when the many-to-many set is empty (older rows predate the join table) — the primary
    // IS a real membership, and it keeps every exported row importable.
    const catNames = (t.categories.length ? t.categories.map((tc) => tc.category) : [t.category])
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => c.name);

    ws.addRow({
      id: t.id,
      name: t.name,
      short_name: t.shortName,
      slug: t.slug,
      quest_code: t.questCode ?? '',
      labcorp_code: t.labcorpCode ?? '',
      categories: catNames.join('|'),
      aliases: t.aliases.map((a) => a.alias).join('|'),
      is_popular: t.isPopular,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="labtestcompare-tests-${stamp}.xlsx"`,
    },
  });
}
