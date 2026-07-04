// End-to-end DB test for the Request A Test catalog scraper (adapter='requestatest'). This vendor is
// Cloudflare-JS-challenged on every path except the homepage, so — unlike every other catalog vendor
// so far — this uses `browserFetchHtml` (stealth headless Chromium) instead of the default plain-HTTP
// fetcher. That also means "Scrape now" in the web admin won't work for this vendor yet (it defaults to
// plain HTTP); only this standalone script / a future worker job wired the same way will.
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-requestatest.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SELECTORS = { mode: 'catalog', adapter: 'requestatest', catalogPath: '/tests' };
const SEED_TEST_SLUGS = [
  'ferritin', 'comprehensive-metabolic-panel', 'cbc-complete-blood-count', 'lipid-panel',
  'hba1c-hemoglobin-a1c', 'tsh-thyroid-stimulating-hormone', 'vitamin-d-25-hydroxy',
  'testosterone-total', 'psa-prostate-specific-antigen', 'vitamin-b12', 'estradiol',
];

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'request-a-test' },
    update: { websiteUrl: 'https://requestatest.com', isActive: true },
    create: { name: 'Request A Test', slug: 'request-a-test', websiteUrl: 'https://requestatest.com', isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://requestatest.com', isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://requestatest.com', isEnabled: true, selectors: SELECTORS },
  });

  const tests = await prisma.test.findMany({ where: { slug: { in: SEED_TEST_SLUGS } }, select: { id: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`Request A Test vendor ${vendor.id} · linked ${tests.length}/${SEED_TEST_SLUGS.length} seed tests\n`);

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
  process.exit(0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
