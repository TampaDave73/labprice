// Reconciles 29 duplicate Test rows created by the 2026-07-27 master-list import
// (import-master-tests.ts). That import upserts by slug; for these 29 tests the master research
// re-slugged/relabeled a test that already existed in production under a DIFFERENT slug, so the
// import created a NEW, empty (zero-offering) row instead of updating the existing one — confirmed
// duplicates because questCode/labcorpCode match exactly between old and new in every pair.
//
// Merge direction: the OLD row (pre-existing slug) is KEPT — it carries the real Offering/
// PriceHistory data that took real scraping effort to build. It's updated with the master row's
// researched methodology/confidence/notes/categories/aliases, since that's the more authoritative,
// independently-researched source (the NEW row was mechanically created by an importer and carries
// no independent judgment of its own). The NEW row is then soft-deleted (never hard-deleted — see
// CLAUDE.md gotcha #5-adjacent convention: Test uses deletedAt, not row removal).
//
// Three additional slugs (apolipoprotein-b-apob, iron-panel, testosterone-free-total) are KNOWN
// orphans with their own unresolved data questions (see orphaned-pre-existing-tests.json) and are
// deliberately NOT in the PAIRS list below — do not add them without resolving those questions first.
//
// Dry-run by default; pass --apply to write. Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/merge-duplicate-tests.ts [--apply]
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction
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

// [oldSlug (kept, has real offerings), newSlug (empty duplicate from the master import, soft-deleted)]
const PAIRS: [string, string][] = [
  ['cbc-complete-blood-count', 'complete-blood-count-w-differential-platelets'],
  ['hba1c-hemoglobin-a1c', 'hemoglobin-a1c'],
  ['comprehensive-metabolic-panel', 'comprehensive-metabolic-panel-14'],
  ['psa-prostate-specific-antigen', 'psa-total'],
  ['cortisol', 'cortisol-total'],
  ['estradiol', 'estradiol-ultrasensitive-lc-ms-ms'],
  ['folate-red-blood-cell', 'folate-rbc'],
  ['testosterone-free-calculated-and-total', 'testosterone-free-bioavailable-total-ms'],
  ['testosterone-free-direct', 'testosterone-free-calculation'],
  ['hs-crp-high-sensitivity-c-reactive-protein', 'c-reactive-protein-high-sensitivity'],
  ['mercury', 'mercury-blood'],
  ['lead', 'lead-blood'],
  ['magnesium', 'magnesium-serum'],
  ['zinc-red-blood-cell', 'zinc-rbc'],
  ['psa-total-free-percent-free', 'psa-free-total-free'],
  ['igf-1-insulin-like-growth-factor', 'igf-1-lc-ms'],
  ['vitamin-b12-and-folate-panel', 'vitamin-b12-folate-panel'],
  ['lipoprotein-a-lp-a', 'lipoprotein-a'],
  ['ggt-gamma-glutamyl-transferase', 'gamma-glutamyl-transferase'],
  ['iodine', 'iodine-serum-plasma'],
  ['copper', 'copper-serum'],
  ['luteinizing-hormone-lh', 'luteinizing-hormone'],
  ['arsenic-blood-test', 'arsenic-blood'],
  ['follicle-stimulating-hormone-fsh', 'follicle-stimulating-hormone'],
  ['fsh-and-lh', 'fsh-lh'],
  ['vitamin-b6', 'vitamin-b6-pyridoxine'],
  ['bilirubin', 'bilirubin-total'],
  ['vitamin-a', 'vitamin-a-retinol'],
  ['sex-hormone-binding-globulin-shbg', 'sex-hormone-binding-globulin'],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const rowsBySlug = new Map((tests as Row[]).map((r) => [r.slug, r]));

  const categories = await prisma.category.findMany({ select: { id: true, name: true, displayOrder: true } });
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  // Pre-flight validation across ALL 29 pairs before writing anything — a bad pair should abort the
  // whole batch's dry-run print (so it can be caught by the human read-through) rather than surface
  // mid-transaction-loop.
  const problems: string[] = [];
  for (const [oldSlug, newSlug] of PAIRS) {
    const masterRow = rowsBySlug.get(newSlug);
    if (!masterRow) { problems.push(`${newSlug}: not found in tests.json`); continue; }
    const catNames = splitPipes(masterRow.categories);
    if (catNames.length === 0) problems.push(`${newSlug}: master row has no categories`);
    for (const catName of catNames) {
      if (!categoryByName.has(catName)) problems.push(`${newSlug}: unknown category "${catName}"`);
    }
    if (!['High', 'Medium', 'Low'].includes(masterRow.confidence)) {
      problems.push(`${newSlug}: unrecognized confidence "${masterRow.confidence}"`);
    }
  }
  if (problems.length > 0) {
    console.error(`ABORTED — problem(s) found before any write:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }

  let merged = 0;
  let skipped = 0;

  for (const [oldSlug, newSlug] of PAIRS) {
    const [oldTest, newTest] = await Promise.all([
      prisma.test.findUnique({ where: { slug: oldSlug }, include: { categories: true, aliases: true, offerings: true } }),
      prisma.test.findUnique({ where: { slug: newSlug }, include: { offerings: true } }),
    ]);

    if (!oldTest || !newTest) {
      console.log(`SKIP  ${oldSlug} <- ${newSlug}: ${!oldTest ? 'old row missing' : 'new row missing'}`);
      skipped++;
      continue;
    }
    // Sanity guards this brief called out explicitly as "stop and ask" conditions — a pair that fails
    // these isn't a normal merge candidate, so we skip it and keep going (per instructions: don't block
    // the whole batch on one anomaly if the rest look clean).
    if (oldTest.offerings.length === 0) {
      console.log(`SKIP  ${oldSlug} <- ${newSlug}: OLD row unexpectedly has zero offerings (expected it to hold the real data)`);
      skipped++;
      continue;
    }
    if (newTest.offerings.length > 0) {
      console.log(`SKIP  ${oldSlug} <- ${newSlug}: NEW row unexpectedly HAS offerings (${newTest.offerings.length}) — not an empty duplicate`);
      skipped++;
      continue;
    }
    if (oldTest.deletedAt || newTest.deletedAt) {
      console.log(`SKIP  ${oldSlug} <- ${newSlug}: already soft-deleted (old=${oldTest.deletedAt}, new=${newTest.deletedAt})`);
      skipped++;
      continue;
    }

    const masterRow = rowsBySlug.get(newSlug)!;
    const catNames = splitPipes(masterRow.categories);
    const cats = catNames.map((n) => categoryByName.get(n)!);
    const displayCategoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;
    const confidence = masterRow.confidence.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW';

    const aliasRows = splitPipes(masterRow.aliases)
      .map((a) => ({ testId: oldTest.id, alias: a, normalized: normalizeName(a), source: 'master-import-merge' }));
    const seenAlias = new Set<string>();
    const dedupedAliases = aliasRows.filter((a) => a.normalized && !seenAlias.has(a.normalized) && seenAlias.add(a.normalized));

    const newIsPopular = oldTest.isPopular || toBool(masterRow.is_popular);
    const newCodeVerifiedAt = confidence === 'HIGH' ? new Date() : null;

    const updateData = {
      methodology: toNull(masterRow.methodology),
      labVariant: toNull(masterRow.lab_variant),
      cardioIq: toBool(masterRow.cardio_iq),
      confidence,
      thirdPartyOnly: toBool(masterRow.third_party_only),
      notes: toNull(masterRow.notes),
      isPopular: newIsPopular,
      codeVerifiedAt: newCodeVerifiedAt,
      categoryId: displayCategoryId,
    };

    console.log(`${apply ? 'MERGE' : 'WOULD MERGE'}  ${oldSlug} (id=${oldTest.id}, ${oldTest.offerings.length} offerings)  <-  ${newSlug} (id=${newTest.id}, empty duplicate)`);
    console.log(`  methodology:  "${oldTest.methodology ?? ''}" -> "${updateData.methodology ?? ''}"`);
    console.log(`  labVariant:   "${oldTest.labVariant ?? ''}" -> "${updateData.labVariant ?? ''}"`);
    console.log(`  cardioIq:     ${oldTest.cardioIq} -> ${updateData.cardioIq}`);
    console.log(`  confidence:   ${oldTest.confidence} -> ${updateData.confidence}`);
    console.log(`  thirdPartyOnly: ${oldTest.thirdPartyOnly} -> ${updateData.thirdPartyOnly}`);
    console.log(`  notes:        "${oldTest.notes ?? ''}" -> "${updateData.notes ?? ''}"`);
    console.log(`  isPopular:    ${oldTest.isPopular} -> ${newIsPopular}  (OR of old=${oldTest.isPopular} / master=${toBool(masterRow.is_popular)})`);
    console.log(`  codeVerifiedAt: ${oldTest.codeVerifiedAt ?? 'null'} -> ${newCodeVerifiedAt ? newCodeVerifiedAt.toISOString() : 'null'}`);
    console.log(`  categories:   [${oldTest.categories.length} existing] -> [${catNames.join(', ')}] (displayCategoryId=${displayCategoryId})`);
    console.log(`  aliases:      [${oldTest.aliases.length} existing] -> [${dedupedAliases.map((a) => a.alias).join(', ')}]`);
    console.log(`  new row ${newSlug} (id=${newTest.id}): would set deletedAt = now()`);

    merged++;
    if (!apply) continue;

    const oldValues = {
      keptSlug: oldSlug,
      mergedFromSlug: newSlug,
      mergedFromTestId: newTest.id,
      methodology: oldTest.methodology,
      labVariant: oldTest.labVariant,
      cardioIq: oldTest.cardioIq,
      confidence: oldTest.confidence,
      thirdPartyOnly: oldTest.thirdPartyOnly,
      notes: oldTest.notes,
      isPopular: oldTest.isPopular,
      codeVerifiedAt: oldTest.codeVerifiedAt,
      categoryCount: oldTest.categories.length,
      aliasCount: oldTest.aliases.length,
    };
    const newValues = {
      keptSlug: oldSlug,
      mergedFromSlug: newSlug,
      mergedFromTestId: newTest.id,
      methodology: updateData.methodology,
      labVariant: updateData.labVariant,
      cardioIq: updateData.cardioIq,
      confidence: updateData.confidence,
      thirdPartyOnly: updateData.thirdPartyOnly,
      notes: updateData.notes,
      isPopular: newIsPopular,
      codeVerifiedAt: newCodeVerifiedAt,
      categories: catNames,
      aliases: dedupedAliases.map((a) => a.alias),
    };

    const now = new Date();
    await prisma.$transaction([
      prisma.test.update({ where: { id: oldTest.id }, data: updateData }),
      prisma.testCategory.deleteMany({ where: { testId: oldTest.id } }),
      prisma.testCategory.createMany({ data: cats.map((c) => ({ testId: oldTest.id, categoryId: c.id })), skipDuplicates: true }),
      prisma.testAlias.deleteMany({ where: { testId: oldTest.id } }),
      ...(dedupedAliases.length > 0 ? [prisma.testAlias.createMany({ data: dedupedAliases })] : []),
      prisma.test.update({ where: { id: newTest.id }, data: { deletedAt: now } }),
      prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'test.merge_duplicate',
          entityType: 'test',
          entityId: oldTest.id,
          oldValues,
          newValues,
        },
      }),
    ]);
  }

  console.log(`\n${apply ? '' : '[dry run] '}${merged} ${apply ? 'merged' : 'would merge'}, ${skipped} skipped.`);
  if (!apply) console.log('Dry run only — re-run with --apply to write.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
