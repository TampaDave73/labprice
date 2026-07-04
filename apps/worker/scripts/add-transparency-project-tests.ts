// One-time data expansion: add the tests from "The Lab Test Transparency Project" community spreadsheet
// (a Reddit-maintained cross-vendor price comparison, v1.0 June 2026, u/Purebredbison) that we don't
// already carry. Quest codes come from that sheet's column B; LabCorp codes are left blank — they get
// filled in by real vendor-catalog matching (Dirt Cheap Labs' authoritative code catalog, or the
// per-test ✨ Auto-fill button) rather than guessed here.
//
// Tests already in our catalog by name (CBC, CMP, TSH, Vitamin D, Ferritin, HbA1c, Lipid Panel,
// Cortisol, Testosterone Total, Vitamin B12, Estradiol) are intentionally NOT duplicated even though the
// sheet's Quest code sometimes differs from ours (Quest has had multiple valid codes for the same test
// over time) — our existing codes were verified live against real vendor catalogs this project, so they
// stay authoritative. "Testosterone Free (calculated) + Total", "Testosterone Free Direct", and "PSA,
// Total + Free + % Free" ARE added as distinct tests from our existing basic Testosterone Total / PSA —
// they're genuinely different, more comprehensive panels with different real-world prices.
//
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/add-transparency-project-tests.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';

const NEW_CATEGORIES = [
  { name: 'Genetics', slug: 'genetics', displayOrder: 9 },
  { name: 'Inflammation', slug: 'inflammation', displayOrder: 10 },
  { name: 'Heavy Metals', slug: 'heavy-metals', displayOrder: 11 },
  { name: 'Cardiovascular', slug: 'cardiovascular', displayOrder: 12 },
];

const NEW_TESTS: { name: string; shortName: string; slug: string; questCode: string; category: string }[] = [
  { name: 'Testosterone Free (calculated) + Total', shortName: 'Testosterone Free + Total', slug: 'testosterone-free-calculated-and-total', questCode: '14966', category: 'hormones' },
  { name: 'Testosterone Free Direct', shortName: 'Testosterone Free (Direct)', slug: 'testosterone-free-direct', questCode: '18944', category: 'hormones' },
  { name: 'MTHFR Genetic Test', shortName: 'MTHFR Test', slug: 'mthfr-genetic-test', questCode: '17911', category: 'genetics' },
  { name: 'C-Reactive Protein, High Sensitivity (hs-CRP)', shortName: 'hs-CRP', slug: 'hs-crp-high-sensitivity-c-reactive-protein', questCode: '10124', category: 'inflammation' },
  { name: 'Mercury', shortName: 'Mercury', slug: 'mercury', questCode: '636', category: 'heavy-metals' },
  { name: 'Lead', shortName: 'Lead', slug: 'lead', questCode: '599', category: 'heavy-metals' },
  { name: 'Magnesium', shortName: 'Magnesium', slug: 'magnesium', questCode: '622', category: 'vitamins-minerals' },
  { name: 'Zinc', shortName: 'Zinc', slug: 'zinc', questCode: '945', category: 'vitamins-minerals' },
  { name: 'Lipase', shortName: 'Lipase', slug: 'lipase', questCode: '606', category: 'metabolic' },
  { name: 'Amylase', shortName: 'Amylase', slug: 'amylase', questCode: '243', category: 'metabolic' },
  { name: 'PSA, Total + Free + % Free', shortName: 'PSA (Total + Free)', slug: 'psa-total-free-percent-free', questCode: '31348', category: 'cancer-markers' },
  { name: 'IGF-1 (Insulin-like Growth Factor 1), LC/MS', shortName: 'IGF-1', slug: 'igf-1-insulin-like-growth-factor', questCode: '16293', category: 'hormones' },
  { name: 'Vitamin B12 and Folate Panel, Serum', shortName: 'B12 + Folate Panel', slug: 'vitamin-b12-and-folate-panel', questCode: '7065', category: 'vitamins-minerals' },
  { name: 'Apolipoprotein B (ApoB)', shortName: 'ApoB', slug: 'apolipoprotein-b-apob', questCode: '5224', category: 'cardiovascular' },
  { name: 'Homocysteine', shortName: 'Homocysteine', slug: 'homocysteine', questCode: '91733', category: 'cardiovascular' },
  { name: 'Lipoprotein(a) (Lp(a))', shortName: 'Lp(a)', slug: 'lipoprotein-a-lp-a', questCode: '34604', category: 'cardiovascular' },
  { name: 'Cystatin C with eGFR', shortName: 'Cystatin C', slug: 'cystatin-c-with-egfr', questCode: '94588', category: 'metabolic' },
  { name: 'Progesterone', shortName: 'Progesterone', slug: 'progesterone', questCode: '17180', category: 'hormones' },
  { name: 'Iron Panel (Iron, Transferrin Saturation, TIBC, UIBC)', shortName: 'Iron Panel', slug: 'iron-panel', questCode: '5616', category: 'blood-count' },
  { name: 'Gamma-Glutamyl Transferase (GGT)', shortName: 'GGT', slug: 'ggt-gamma-glutamyl-transferase', questCode: '482', category: 'metabolic' },
  { name: 'Insulin (Fasting)', shortName: 'Fasting Insulin', slug: 'insulin-fasting', questCode: '561', category: 'metabolic' },
];

async function main() {
  for (const c of NEW_CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  console.log(`Categories ready: ${NEW_CATEGORIES.map((c) => c.name).join(', ')}`);

  // Fix a pre-existing data issue found while auditing categories for this task: CBC was tagged with
  // leftover test/dev categories ("Male Enhancement", "Test", "Daves Test") instead of "Blood Count",
  // which already existed but had zero tests using it.
  const cbc = await prisma.test.findUnique({ where: { slug: 'cbc-complete-blood-count' } });
  const bloodCount = await prisma.category.findUniqueOrThrow({ where: { slug: 'blood-count' } });
  if (cbc) {
    await prisma.testCategory.deleteMany({ where: { testId: cbc.id } });
    await prisma.testCategory.create({ data: { testId: cbc.id, categoryId: bloodCount.id } });
    await prisma.test.update({ where: { id: cbc.id }, data: { categoryId: bloodCount.id } });
    console.log('Fixed CBC category → Blood Count (was leftover "Male Enhancement/Test/Daves Test")');
  }

  let created = 0;
  for (const t of NEW_TESTS) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: t.category } });
    const existing = await prisma.test.findUnique({ where: { slug: t.slug } });
    if (existing) continue;
    const test = await prisma.test.create({
      data: { name: t.name, shortName: t.shortName, slug: t.slug, questCode: t.questCode, categoryId: category.id, isPopular: false, displayOrder: 0 },
    });
    await prisma.testCategory.create({ data: { testId: test.id, categoryId: category.id } });
    created++;
    console.log(`  + ${t.name} (${t.slug}, quest=${t.questCode}) → ${category.name}`);
  }
  console.log(`\n${created}/${NEW_TESTS.length} new tests created (${NEW_TESTS.length - created} already existed).`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
