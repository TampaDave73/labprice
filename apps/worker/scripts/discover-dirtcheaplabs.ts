// End-to-end DB test for the Dirt Cheap Labs catalog scraper (API vendor, adapter='dirtcheaplabs').
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-dirtcheaplabs.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SELECTORS = { mode: 'catalog', adapter: 'dirtcheaplabs', catalogPath: '/alacarte' };
const SEED_TEST_SLUGS = [
  'ferritin', 'comprehensive-metabolic-panel', 'cbc-complete-blood-count', 'lipid-panel',
  'hba1c-hemoglobin-a1c', 'tsh-thyroid-stimulating-hormone', 'vitamin-d-25-hydroxy',
  'testosterone-total', 'psa-prostate-specific-antigen', 'cortisol', 'vitamin-b12', 'estradiol',
];

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'dirt-cheap-labs' },
    update: { websiteUrl: 'https://dirtcheaplabs.com', isActive: true },
    create: { name: 'Dirt Cheap Labs', slug: 'dirt-cheap-labs', websiteUrl: 'https://dirtcheaplabs.com', isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://dirtcheaplabs.com', isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://dirtcheaplabs.com', isEnabled: true, selectors: SELECTORS },
  });
  const tests = await prisma.test.findMany({ where: { slug: { in: SEED_TEST_SLUGS } }, select: { id: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`Dirt Cheap Labs ${vendor.id} · linked ${tests.length} seed tests\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);
  console.log(`\n=== ${((Date.now() - t0) / 1000).toFixed(1)}s: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.autoApprovedStagedIds.length} published ===\n`);

  const offs = await prisma.offering.findMany({ where: { vendorId: vendor.id, deletedAt: null }, include: { test: { select: { name: true } } }, orderBy: { test: { name: 'asc' } } });
  for (const o of offs) console.log(`  ${o.currentPrice != null ? ('$' + o.currentPrice).padEnd(8) : '(review)'.padEnd(8)} ${o.test.name}`);

  const staged = await prisma.stagedPriceChange.findMany({ where: { scrapeRunId: summary.runId, status: 'PENDING' }, include: { offering: { include: { test: { select: { name: true } } } } } });
  if (staged.length) { console.log('\nPending (review):'); for (const s of staged) console.log(`  ${s.offering.test.name}: ${s.reviewNote}`); }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
