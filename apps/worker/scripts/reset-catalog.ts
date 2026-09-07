// Wipes the test catalog ahead of the 2026-09-07 reseed to 30 curated tests. DESTRUCTIVE — dry-run
// unless --apply is passed.
//
// KEEPS: vendors, scrape configs, the 21-category taxonomy, users/sessions, settings, feature flags,
// SEO pages, suggestions, audit log, page views, and search logs. Page views survive with their
// test_id nulled (the FK is onDelete: SetNull); search logs have no test FK at all. Keeping analytics
// is what lets the Monday traffic digest (Task 10) be useful immediately instead of in three weeks.
//
// DELETES: tests and everything hanging off them — offerings, vendor products, aliases, price
// history, staged changes, scrape runs/results/errors/jobs.
//
// AffiliateClick is onDelete: Restrict against Offering, so its 5,848 rows physically block the
// delete. They are flattened into affiliate_click_archive (denormalized to names, nothing to
// cascade) before being removed, so the click history survives the reset.
//
// TestCode (`test_codes`) is deliberately NOT touched — it is confirmed dead code with zero readers
// or writers anywhere (CLAUDE.md gotcha 11). Leave it alone rather than give it a reason to look alive.
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts          # dry run
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts --apply
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction
import { prisma } from '@labprice/database';

const APPLY = process.argv.includes('--apply');

async function main() {
  const counts = {
    tests: await prisma.test.count(),
    offerings: await prisma.offering.count(),
    vendorProducts: await prisma.vendorProduct.count(),
    testAliases: await prisma.testAlias.count(),
    priceHistory: await prisma.priceHistory.count(),
    stagedChanges: await prisma.stagedPriceChange.count(),
    scrapeRuns: await prisma.scrapeRun.count(),
    affiliateClicks: await prisma.affiliateClick.count(),
  };
  const kept = {
    vendors: await prisma.vendor.count(),
    categories: await prisma.category.count(),
    pageViews: await prisma.pageView.count(),
    searchLogs: await prisma.searchLog.count(),
  };

  console.log('WILL DELETE:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log('WILL KEEP:');
  for (const [k, v] of Object.entries(kept)) console.log(`  ${k.padEnd(18)} ${v}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to perform the reset.');
    return;
  }

  // 1. Archive affiliate clicks (flattened — the archive has no foreign keys of its own).
  //    Batched: 5,848 rows joined to offering+vendor+test is fine in one read, but createMany is
  //    chunked so a much larger click table later can't blow the statement size.
  const clicks = await prisma.affiliateClick.findMany({
    include: { offering: { include: { vendor: { select: { slug: true, name: true } }, test: { select: { slug: true, name: true } } } } },
  });
  const archiveRows = clicks.map((c) => ({
    vendorSlug: c.offering.vendor.slug,
    vendorName: c.offering.vendor.name,
    testSlug: c.offering.test?.slug ?? null,
    testName: c.offering.test?.name ?? null,
    price: c.offering.currentPrice,
    referrer: c.referrer,
    sessionId: c.sessionId,
    clickedAt: c.clickedAt,
  }));
  for (let i = 0; i < archiveRows.length; i += 500) {
    await prisma.affiliateClickArchive.createMany({ data: archiveRows.slice(i, i + 500) });
  }
  console.log(`archived ${archiveRows.length} affiliate click(s)`);

  // 2. Delete in FK-safe order (children before parents). deleteMany with no `where` truncates.
  //    Order matters: scrapeResult/scrapeError reference scrapeRun; scrapeRun references scrapeJob;
  //    stagedPriceChange and priceHistory reference offering AND scrapeRun, so they go first.
  const steps: [string, () => Promise<{ count: number }>][] = [
    ['stagedPriceChange', () => prisma.stagedPriceChange.deleteMany()],
    ['priceHistory', () => prisma.priceHistory.deleteMany()],
    ['scrapeResult', () => prisma.scrapeResult.deleteMany()],
    ['scrapeError', () => prisma.scrapeError.deleteMany()],
    ['scrapeRun', () => prisma.scrapeRun.deleteMany()],
    ['scrapeJob', () => prisma.scrapeJob.deleteMany()],
    ['affiliateClick', () => prisma.affiliateClick.deleteMany()],
    ['offering', () => prisma.offering.deleteMany()],
    ['vendorProduct', () => prisma.vendorProduct.deleteMany()],
    ['testAlias', () => prisma.testAlias.deleteMany()],
    ['testCategory', () => prisma.testCategory.deleteMany()],
    ['testBiomarker', () => prisma.testBiomarker.deleteMany()],
    ['test', () => prisma.test.deleteMany()],
  ];
  for (const [name, run] of steps) {
    const { count } = await run();
    console.log(`  deleted ${String(count).padStart(6)} ${name}`);
  }
  console.log('\nReset complete. Next: import the core catalog (Task 3), then recrawl (Task 5).');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
