// Read-only forensics for the scraper digest: for each vendor, print the last few scrape jobs, what
// each run actually covered, and the vendor's current trust score — so a wall of "Failed" rows in the
// weekly email can be traced to a specific run rather than guessed at.
//
// Written for the 2026-07-28 incident, where 11 vendors reported "catalog crawl returned 0 products
// — likely blocked (WAF/challenge page)" on the same day. That message was wrong: those were
// requeue-on-add runs pricing ONE newly-linked test the vendor doesn't sell, so name-narrowing chose
// zero product pages and the empty-catalog guard misread it as a block (fixed in persist.ts). This
// script exists to tell the two apart on the LIVE database, which is the only place the evidence
// lives: a genuinely blocked crawl fails no matter how many offerings the run covered, while a
// misfire only ever happens on a run that covered a small hand-picked subset.
//
// Nothing here writes. Usage (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env npx tsx scripts/audit-scrape-failures.ts
//   DOTENV_CONFIG_PATH=../../.env npx tsx scripts/audit-scrape-failures.ts --days=14 --vendor=<slug>
import 'dotenv/config';
import { prisma, getVendorTrustMetrics } from '@labprice/database';

// The exact guard message that misfired. Matching on it lets us flag suspect rows explicitly instead
// of leaving the reader to eyeball error text.
const ZERO_PRODUCTS = 'catalog crawl returned 0 products';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const days = Number(arg('days') ?? 14);
  const vendorSlug = arg('vendor');
  const since = new Date(Date.now() - days * 86_400_000);

  const vendors = await prisma.vendor.findMany({
    where: { deletedAt: null, isActive: true, ...(vendorSlug ? { slug: vendorSlug } : {}) },
    select: { id: true, name: true, slug: true, trustOverride: true },
    orderBy: { name: 'asc' },
  });

  console.log(`Scrape audit — last ${days} day(s), ${vendors.length} active vendor(s)\n`);
  let suspect = 0;
  let genuine = 0;

  for (const vendor of vendors) {
    const jobs = await prisma.scrapeJob.findMany({
      where: { vendorId: vendor.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const activeOfferings = await prisma.offering.count({
      where: { vendorId: vendor.id, isActive: true, deletedAt: null },
    });
    const trust = await getVendorTrustMetrics(vendor.id);
    const override = vendor.trustOverride ? ` (override: ${vendor.trustOverride})` : '';

    console.log(`${vendor.name} [${vendor.slug}]`);
    console.log(
      `  trust ${trust.computed}${override} · score ${trust.score} · ` +
        `${trust.successfulRuns}/${trust.totalRuns} recent runs succeeded · ${activeOfferings} active offering(s)`,
    );

    if (jobs.length === 0) {
      console.log('  no jobs in window\n');
      continue;
    }

    for (const job of jobs) {
      const run = job.runs[0];
      const when = (job.startedAt ?? job.createdAt).toISOString().slice(0, 16).replace('T', ' ');
      // testsFound is tests ATTEMPTED (persist.ts sets it to matches.length) — on a failed run it's
      // null, so fall back to the offering count the run would have covered.
      const covered = run?.testsFound ?? null;
      const failed = job.status === 'FAILED' || run?.status === 'FAILED';
      const zeroProducts = failed && (job.errorMessage ?? '').includes(ZERO_PRODUCTS);

      // A run that covered ~every offering and still crawled nothing is a real block. A `partial` run
      // (or one that covered a small fraction) hitting the same error is the narrowing misfire.
      // `partial` is only populated for jobs created after the fix ships, hence the coverage fallback.
      const looksPartial = job.partial || (covered != null && activeOfferings > 3 && covered <= Math.max(2, activeOfferings * 0.1));
      let verdict = '';
      if (zeroProducts && looksPartial) {
        verdict = '  <-- SUSPECT: narrowing misfire, not a block';
        suspect++;
      } else if (failed) {
        verdict = '  <-- genuine failure, investigate the vendor site';
        genuine++;
      }

      console.log(
        `  ${when}  ${job.status.padEnd(9)} ${job.triggeredBy.padEnd(8)} ` +
          `${job.partial ? 'partial' : 'full   '} covered=${covered ?? '—'}${verdict}`,
      );
      if (failed && job.errorMessage) console.log(`      ${job.errorMessage.slice(0, 160)}`);
    }
    console.log('');
  }

  console.log(`Summary: ${suspect} suspect (narrowing misfire), ${genuine} genuine failure(s).`);
  console.log('Suspect rows need no action beyond the persist.ts fix — trust recovers as new runs succeed.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
