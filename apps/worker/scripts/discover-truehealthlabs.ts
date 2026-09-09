// End-to-end DB test for the True Health Labs catalog scraper (adapter='truehealthlabs'). Sets up
// True Health Labs as a catalog-mode vendor, links a spread of seed tests, runs discovery against the
// live site + real Postgres, publishes auto-approved changes, and prints the result.
//
// MUST pass `fetchHtml: browserFetchHtml()` (see persist.ts's `needsBrowser` on this adapter, re-added
// 2026-09-09): Cloudflare started 403-ing the Store API from Railway's datacenter IP. Runs fine from
// Railway anyway — the stealth browser path clears it, unlike Request A Test's block. This script
// predates that flag on this adapter and was missing the override until now — same mistake
// discover-personalabs.ts made (see its own comment); check every E2E script's adapter against the
// needsBrowser list in persist.ts before assuming `runVendorDiscovery` defaults it for you (it can't —
// Playwright can't be pulled into persist.ts, see browser-fetch.ts's module comment).
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-truehealthlabs.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';

// catalogPath is informational only (this adapter is fetchAll — see truehealthlabs-parser.ts).
const SELECTORS = { mode: 'catalog', adapter: 'truehealthlabs', catalogPath: '/wp-json/wc/store/v1/products' };
const SEED_TEST_SLUGS = [
  'ferritin', 'comprehensive-metabolic-panel', 'cbc-complete-blood-count', 'lipid-panel',
  'hba1c-hemoglobin-a1c', 'tsh-thyroid-stimulating-hormone', 'vitamin-d-25-hydroxy',
  'testosterone-total', 'psa-prostate-specific-antigen', 'vitamin-b12', 'estradiol',
];

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'true-health-labs' },
    update: { websiteUrl: 'https://truehealthlabs.com', isActive: true },
    create: { name: 'True Health Labs', slug: 'true-health-labs', websiteUrl: 'https://truehealthlabs.com', isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://truehealthlabs.com', isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://truehealthlabs.com', isEnabled: true, selectors: SELECTORS },
  });

  const tests = await prisma.test.findMany({ where: { slug: { in: SEED_TEST_SLUGS } }, select: { id: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`True Health Labs vendor ${vendor.id} · linked ${tests.length}/${SEED_TEST_SLUGS.length} seed tests\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', fetchHtml: browserFetchHtml(), onLog: (m) => console.log('·', m) });
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);
  console.log(`\n=== ${((Date.now() - t0) / 1000).toFixed(1)}s: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.autoApprovedStagedIds.length} published ===\n`);

  const offs = await prisma.offering.findMany({ where: { vendorId: vendor.id, deletedAt: null }, include: { test: { select: { name: true } } }, orderBy: { test: { name: 'asc' } } });
  for (const o of offs) console.log(`  ${o.currentPrice != null ? ('$' + o.currentPrice).padEnd(8) : '(review)'.padEnd(8)} ${o.test.name}  ${o.externalUrl ?? ''}`);

  const staged = await prisma.stagedPriceChange.findMany({ where: { scrapeRunId: summary.runId, status: 'PENDING' }, include: { offering: { include: { test: { select: { name: true } } } } } });
  if (staged.length) {
    console.log('\nPending (review):');
    for (const s of staged) console.log(`  $${s.newPrice} · ${s.offering.test.name}\n     ${s.reviewNote}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
