// Wipes the test catalog ahead of the 2026-09-07 reseed to 30 curated tests. DESTRUCTIVE — dry-run
// unless --apply is passed.
//
// KEEPS: vendors, scrape configs, the 21-category taxonomy, users/sessions, settings, feature flags,
// SEO pages, VendorSuggestion + TestSuggestion, audit log, page views, and search logs. Page views
// survive with their test_id nulled (the FK is onDelete: SetNull); search logs have no test FK at
// all. Keeping analytics is what lets the Monday traffic digest (Task 10) be useful immediately
// instead of in three weeks. NOTE: ResultErrorReport is the third "suggestions"-section table but
// does NOT survive — see below.
//
// DELETES: tests and everything hanging off them — offerings, vendor products, aliases, price
// history, staged changes, scrape runs/results/errors/jobs. Two more tables are wiped as a side
// effect of deleting Test rows, via the database's own ON DELETE CASCADE (not an explicit step in
// this script — Postgres does it when `test` is deleted): `result_error_reports.test_id` and
// `test_codes.test_id` are both CASCADE (schema.prisma). ResultErrorReport lives in the schema's
// "user-submitted suggestions" section next to VendorSuggestion/TestSuggestion, which DO survive —
// but unlike those two, a report is *about* a specific test result, so once its test is gone the
// report is orphaned junk; wiping it via cascade is the correct outcome, not an oversight. Both
// cascade counts are printed in WILL DELETE (labelled "(cascade)") so the operator sees the true
// blast radius, even though no code here calls a delete on either table directly.
//
// AffiliateClick is onDelete: Restrict against Offering, so its 5,848 rows physically block the
// delete. They are flattened into affiliate_click_archive (denormalized to names, nothing to
// cascade) before being removed, so the click history survives the reset.
//
// TestCode (`test_codes`) is confirmed dead code with zero readers or writers anywhere (CLAUDE.md
// gotcha 11) — there's no reason to add a step for it. But it is NOT untouched: its `test_id` FK is
// CASCADE, so all of its rows disappear automatically the moment their parent Test is deleted. Don't
// mistake "no step in this script" for "survives the reset".
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts          # dry run
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts --apply
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction
import { prisma } from '@labprice/database';

const APPLY = process.argv.includes('--apply');

async function main() {
  // Every table this script deletes (directly or via cascade), so WILL DELETE is the whole picture —
  // a prior version only counted 8 of the 13 explicit-step tables and omitted the two cascades
  // entirely, most notably scrape_results (the single largest table this script destroys).
  const counts = {
    tests: await prisma.test.count(),
    offerings: await prisma.offering.count(),
    vendorProducts: await prisma.vendorProduct.count(),
    testAliases: await prisma.testAlias.count(),
    testCategories: await prisma.testCategory.count(),
    testBiomarkers: await prisma.testBiomarker.count(),
    priceHistory: await prisma.priceHistory.count(),
    stagedChanges: await prisma.stagedPriceChange.count(),
    scrapeRuns: await prisma.scrapeRun.count(),
    scrapeResults: await prisma.scrapeResult.count(),
    scrapeErrors: await prisma.scrapeError.count(),
    scrapeJobs: await prisma.scrapeJob.count(),
    affiliateClicks: await prisma.affiliateClick.count(),
  };
  // Not explicit steps below — Postgres removes these automatically via ON DELETE CASCADE on
  // test_id when `test` rows are deleted. Shown separately so they aren't mistaken for a step.
  const cascades = {
    'resultErrorReports (cascade)': await prisma.resultErrorReport.count(),
    'testCodes (cascade)': await prisma.testCode.count(),
  };
  const kept = {
    vendors: await prisma.vendor.count(),
    categories: await prisma.category.count(),
    pageViews: await prisma.pageView.count(),
    searchLogs: await prisma.searchLog.count(),
  };

  console.log('WILL DELETE:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(28)} ${v}`);
  for (const [k, v] of Object.entries(cascades)) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log('WILL KEEP:');
  for (const [k, v] of Object.entries(kept)) console.log(`  ${k.padEnd(28)} ${v}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to perform the reset.');
    return;
  }

  // 1. Archive affiliate clicks (flattened — the archive has no foreign keys of its own).
  //    Batched: 5,848 rows joined to offering+vendor+test is fine in one read, but createMany is
  //    chunked so a much larger click table later can't blow the statement size.
  //
  //    Guard: every delete step below is a bare deleteMany(), so a mid-run failure is safe to fix by
  //    re-running the whole script. The archive step is the one exception — AffiliateClickArchive has
  //    an autoincrement PK and no unique constraint, so a second createMany pass (e.g. the script died
  //    after archiving but before affiliateClick.deleteMany()) would silently double-insert every
  //    click and corrupt any later analysis. Refuse rather than guess.
  const alreadyArchived = await prisma.affiliateClickArchive.count();
  if (alreadyArchived > 0) {
    console.error(
      `\nRefusing to continue: affiliate_click_archive already has ${alreadyArchived} row(s). ` +
      `Re-running the archive step now would insert duplicates (no unique constraint prevents it). ` +
      `If the prior run already archived and just failed during/after the affiliateClick delete, ` +
      `skip archiving and resume from the delete steps by hand. If this archive data is wrong ` +
      `(e.g. a prior aborted/duplicate run), clear affiliate_click_archive deliberately first, then re-run.`,
    );
    process.exit(1);
  }
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
