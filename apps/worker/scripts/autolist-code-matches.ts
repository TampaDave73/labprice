// Turns code-matched VendorProduct rows into live offerings after the 2026-09-07 catalog reset.
// Dry-run unless --apply.
//
// Only rows whose matchedBy is an exact lab-code hit are listed (see catalog/autolist.ts for why).
// exact-name/alias matches are left alone: they already show up in /admin/discovered's "Matched" tab
// (which means precisely "MATCHED with no offering yet") for one-click bulk listing by a human.
//
// Listing goes through attachProductsToTest — the SAME function the admin UI's list action calls — so
// this script and the UI cannot drift apart about what listing means. markMatched:false because these
// rows are already MATCHED; passing true would overwrite their real matchedBy with 'manual' and
// destroy the provenance this script depends on.
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/autolist-code-matches.ts
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/autolist-code-matches.ts --apply
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { attachProductsToTest } from '@labprice/scrapers/src/catalog/discovered-actions';
import { CODE_MATCHED_BY } from '@labprice/scrapers/src/catalog/autolist';

const APPLY = process.argv.includes('--apply');

async function main() {
  // price: { gt: 0 } — not just { not: null }. A $0 row is a parse failure, not a real free test,
  // and on a price-COMPARISON site it would sort first as the "cheapest" option and be the most
  // prominent thing on the page. Reported separately below so a systemic parse failure is visible.
  const baseWhere = {
    status: 'MATCHED' as const,
    isPanel: false,
    testId: { not: null },
    matchedBy: { in: [...CODE_MATCHED_BY] },
    vendor: { isActive: true, deletedAt: null },
    // Soft-deleted tests stay referenced by VendorProduct.testId — that FK is only SetNull on a HARD
    // delete (schema.prisma), so a soft-deleted test (Test.deletedAt, set by the admin delete route)
    // leaves stale-but-present testId links that must not get a revived/new Offering.
    test: { deletedAt: null },
  };
  const rows = await prisma.vendorProduct.findMany({
    where: { ...baseWhere, price: { gt: 0 } },
    select: {
      id: true, name: true, url: true, price: true, vendorId: true, labProvider: true, testId: true,
      vendor: { select: { slug: true } },
      test: { select: { name: true } },
    },
    // Cheapest FIRST within each vendor. Offering is unique on (testId, vendorId), so when one vendor
    // has two products code-matching the same test, only the first survives — attachProductsToTest
    // takes them in the order given. Ordering by name would decide that on alphabetical luck; ordering
    // by price makes the cheapest win, which is both the right answer for a price-comparison site and
    // the right answer semantically: the pricier twin is invariably a panel or bundle that happened to
    // carry the same lab code. Measured live on 2026-09-08 — healthlabs listed "Vitamin D 25-Hydroxy"
    // at $59 alongside a "Comprehensive Vitamin Panel" at $599, and name order would have published
    // the $599 one. Same shape for healthlabs B12 ($35 vs a $59 B12+folate bundle), walk-in-lab free
    // testosterone ($69 vs a $125 bundle) and anabolic-insights TSH ($7 vs $19).
    orderBy: [{ vendorId: 'asc' }, { price: 'asc' }],
  });
  const nonPositivePriceCount = await prisma.vendorProduct.count({
    where: { ...baseWhere, price: { not: null, lte: 0 } },
  });

  // Skip pairs that already have an offering — attachProductsToTest is idempotent, but not listing
  // them keeps the report honest about what this run actually changed.
  const existing = await prisma.offering.findMany({ where: { deletedAt: null }, select: { testId: true, vendorId: true } });
  const has = new Set(existing.map((o) => `${o.testId}:${o.vendorId}`));
  const todo = rows.filter((r) => !has.has(`${r.testId}:${r.vendorId}`));

  console.log(`${rows.length} code-matched product(s); ${todo.length} not yet listed`);
  if (nonPositivePriceCount > 0) {
    console.log(`WARNING: ${nonPositivePriceCount} code-matched row(s) excluded for price <= 0 — likely a parser bug, not a real free test.`);
  }
  console.log('');
  // Print every match and READ IT. Grepping only for wrong patterns you already know about just
  // confirms what you went looking for (CLAUDE.md gotcha 14).
  for (const r of todo) {
    console.log(`  ${r.vendor.slug.padEnd(20)} ${String(r.test?.name).padEnd(46)} ← ${r.name}  $${r.price}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Read the matches above, then re-run with --apply.');
    return;
  }

  const byTest = new Map<string, typeof todo>();
  for (const r of todo) byTest.set(r.testId!, [...(byTest.get(r.testId!) ?? []), r]);
  // Resolve vendorId -> slug for the dropped-duplicates report below (attachProductsToTest only
  // knows vendorId; the operator wants the readable slug, matching the match-line format above).
  const vendorSlugById = new Map(todo.map((r) => [r.vendorId, r.vendor.slug]));

  let created = 0;
  let aliases = 0;
  // attachProductsToTest can silently skip a same-vendor duplicate within one test's group (Offering
  // is unique on testId+vendorId — see its doc comment). offeringsCreated/aliasesLearned alone hide
  // that from the operator, so accumulate and print droppedDuplicates too.
  const droppedDuplicates: { vendorId: string; name: string }[] = [];
  for (const [testId, group] of byTest) {
    const products = group.map((p) => ({
      id: p.id, name: p.name, url: p.url, price: p.price, vendorId: p.vendorId,
      labProvider: p.labProvider, vendorSlug: p.vendor.slug,
    }));
    // WHY the explicit timeout/maxWait: Prisma 6's default interactive-transaction timeout is 5,000
    // ms, but attachProductsToTest issues ~4 sequential round trips per product (alias create,
    // offering findUnique, offering create, priceHistory create) plus one findUnique up front, with
    // no batching. Measured prod latency is ~106 ms/query, and a widely-carried test (TSH, Total
    // Testosterone) can pull in up to 14 vendors: 14 * 4 + 1 = 57 queries * 106ms ~= 6.0s > 5.0s ->
    // P2028 "Transaction already closed", and re-running just retries the same oversized group and
    // fails identically. 120s comfortably covers the worst-case group; maxWait is how long we'll wait
    // to even acquire a transaction slot under load.
    const result = await prisma.$transaction(
      (tx) => attachProductsToTest(tx, testId, products, { markMatched: false }),
      { timeout: 120_000, maxWait: 30_000 },
    );
    created += result.offeringsCreated;
    aliases += result.aliasesLearned;
    droppedDuplicates.push(...result.droppedDuplicates);
  }
  console.log(`\nCreated ${created} offering(s), learned ${aliases} alias(es).`);
  if (droppedDuplicates.length > 0) {
    console.log(`\nDROPPED DUPLICATES (${droppedDuplicates.length}) — same vendor matched the same test twice; only the first got an offering, the rest are back in the Discovered queue, UNMATCHED, for manual routing:`);
    for (const d of droppedDuplicates) {
      console.log(`  ${(vendorSlugById.get(d.vendorId) ?? d.vendorId).padEnd(20)} ${d.name}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
