import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { toCsv } from '@/lib/csv';

// CSV export of the CANONICAL tests layer — identity only (names, codes, categories, aliases),
// deliberately no prices: the spreadsheet owns what a test IS, the scrape pipeline owns what it
// costs. Row anchor is `id`, so a re-import matches rows unambiguously (blank id = create new).
export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const tests = await prisma.test.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      categories: { include: { category: { select: { name: true, displayOrder: true } } } },
      category: { select: { name: true, displayOrder: true } },
      aliases: { orderBy: { alias: 'asc' }, select: { alias: true } },
    },
  });

  const header = ['id', 'name', 'short_name', 'slug', 'quest_code', 'labcorp_code', 'categories', 'aliases', 'is_popular'];
  const rows = tests.map((t) => [
    t.id,
    t.name,
    t.shortName,
    t.slug,
    t.questCode ?? '',
    t.labcorpCode ?? '',
    // Pipe-separated, ordered by category displayOrder so the derived display pointer is predictable.
    // Falls back to the primary category when the many-to-many set is empty (older rows predate the
    // join table) — the primary IS a real membership, and it keeps every exported row importable.
    (t.categories.length ? t.categories.map((tc) => tc.category) : [t.category])
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => c.name)
      .join('|'),
    t.aliases.map((a) => a.alias).join('|'),
    t.isPopular,
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="labtestcompare-tests-${stamp}.csv"`,
    },
  });
}
