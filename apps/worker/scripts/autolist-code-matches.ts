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
  const rows = await prisma.vendorProduct.findMany({
    where: {
      status: 'MATCHED',
      isPanel: false,
      testId: { not: null },
      price: { not: null },
      matchedBy: { in: [...CODE_MATCHED_BY] },
      vendor: { isActive: true, deletedAt: null },
    },
    select: {
      id: true, name: true, url: true, price: true, vendorId: true, labProvider: true, testId: true,
      vendor: { select: { slug: true } },
      test: { select: { name: true } },
    },
    orderBy: [{ vendorId: 'asc' }, { name: 'asc' }],
  });

  // Skip pairs that already have an offering — attachProductsToTest is idempotent, but not listing
  // them keeps the report honest about what this run actually changed.
  const existing = await prisma.offering.findMany({ where: { deletedAt: null }, select: { testId: true, vendorId: true } });
  const has = new Set(existing.map((o) => `${o.testId}:${o.vendorId}`));
  const todo = rows.filter((r) => !has.has(`${r.testId}:${r.vendorId}`));

  console.log(`${rows.length} code-matched product(s); ${todo.length} not yet listed\n`);
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

  let created = 0;
  let aliases = 0;
  for (const [testId, group] of byTest) {
    const products = group.map((p) => ({
      id: p.id, name: p.name, url: p.url, price: p.price, vendorId: p.vendorId,
      labProvider: p.labProvider, vendorSlug: p.vendor.slug,
    }));
    const result = await prisma.$transaction((tx) => attachProductsToTest(tx, testId, products, { markMatched: false }));
    created += result.offeringsCreated;
    aliases += result.aliasesLearned;
  }
  console.log(`\nCreated ${created} offering(s), learned ${aliases} alias(es).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
