// Imports the 246-row 2026-07-27 master biomarker list. Upserts on slug (create if new, update if a
// test with that slug already exists); never deletes. Run AFTER apply-master-test-fixes.ts.
//
// Category names are validated against the already-seeded 21-category taxonomy (seed-category-
// taxonomy.ts) — an unrecognized category FAILS THE WHOLE IMPORT (nothing partially applied), per the
// migration spec: a plausible-looking wrong category is worse than a loud rejection.
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction (see apply-master-test-fixes.ts)
import { prisma } from '@labprice/database';
import { normalizeName } from '@labprice/scrapers/src/catalog/matcher';
import tests from '../../../packages/database/data/2026-07-27-master-tests/tests.json';

type Row = {
  name: string; short_name: string; slug: string; quest_code: string; labcorp_code: string;
  methodology: string; lab_variant: string; cardio_iq: string; categories: string; aliases: string;
  confidence: string; third_party_only: string; is_popular: string; notes: string;
};

const toBool = (s: string) => s.trim().toUpperCase() === 'TRUE';
const toNull = (s: string) => (s.trim() === '' ? null : s.trim());
const splitPipes = (s: string) => s.split('|').map((p) => p.trim()).filter(Boolean);
const CONFIDENCE = new Set(['High', 'Medium', 'Low']);

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = tests as Row[];

  const categories = await prisma.category.findMany({ select: { id: true, name: true, displayOrder: true } });
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  // Fail fast on any unknown category BEFORE touching the DB — "fail the import" means the whole
  // file, not a partial apply.
  const unknown = new Set<string>();
  for (const row of rows) {
    for (const catName of splitPipes(row.categories)) {
      if (!categoryByName.has(catName)) unknown.add(`${catName} (row: ${row.name})`);
    }
    if (!CONFIDENCE.has(row.confidence)) unknown.add(`confidence="${row.confidence}" (row: ${row.name})`);
  }
  if (unknown.size > 0) {
    console.error(`Import ABORTED — unknown category/confidence value(s):\n  ${[...unknown].join('\n  ')}`);
    process.exit(1);
  }

  const existing = await prisma.test.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } });
  const existingBySlug = new Map(existing.map((t) => [t.slug, t]));
  const touchedSlugs = new Set<string>();

  let created = 0, updated = 0;
  for (const row of rows) {
    touchedSlugs.add(row.slug);
    const cats = splitPipes(row.categories).map((n) => categoryByName.get(n)!);
    const displayCategoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;
    const confidence = row.confidence.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW';

    const data = {
      name: row.name,
      shortName: row.short_name || row.name,
      slug: row.slug,
      questCode: toNull(row.quest_code),
      labcorpCode: toNull(row.labcorp_code),
      methodology: toNull(row.methodology),
      labVariant: toNull(row.lab_variant),
      cardioIq: toBool(row.cardio_iq),
      confidence,
      thirdPartyOnly: toBool(row.third_party_only),
      isPopular: toBool(row.is_popular),
      notes: toNull(row.notes),
      categoryId: displayCategoryId,
      codeVerifiedAt: confidence === 'HIGH' ? new Date() : null,
    };

    const already = existingBySlug.get(row.slug);
    const testId = apply
      ? (already
          ? (await prisma.test.update({ where: { id: already.id }, data })).id
          : (await prisma.test.create({ data })).id)
      : already?.id ?? '(new)';

    if (apply && testId !== '(new)') {
      await prisma.testCategory.deleteMany({ where: { testId } });
      await prisma.testCategory.createMany({ data: cats.map((c) => ({ testId, categoryId: c.id })), skipDuplicates: true });

      const aliasRows = splitPipes(row.aliases)
        .map((a) => ({ testId, alias: a, normalized: normalizeName(a), source: 'master-import' }));
      const seen = new Set<string>();
      const deduped = aliasRows.filter((a) => a.normalized && !seen.has(a.normalized) && seen.add(a.normalized));
      await prisma.testAlias.deleteMany({ where: { testId } });
      if (deduped.length > 0) await prisma.testAlias.createMany({ data: deduped });
    }

    if (already) updated++; else created++;
  }

  console.log(`${apply ? '' : '[dry run] '}${created} to create, ${updated} to update.`);

  // Flag existing tests NOT present in the master list — kept (never deleted), just surfaced.
  const orphaned = existing.filter((t) => !touchedSlugs.has(t.slug));
  if (orphaned.length > 0) {
    console.log(`\n${orphaned.length} existing test(s) NOT in the master list (kept, flagged for manual review):`);
    orphaned.forEach((t) => console.log(`  - ${t.slug}`));
  }

  if (apply) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'tests.master_import',
        entityType: 'test',
        entityId: 'bulk',
        newValues: { created, updated, orphaned: orphaned.map((t) => t.slug) },
      },
    });
  } else {
    console.log('\nDry run only — re-run with --apply to write.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
