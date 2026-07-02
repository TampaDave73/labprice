// End-to-end DB test for the MitoHealth catalog scraper (API vendor, adapter='mitohealth').
// MitoHealth has member/non-member pricing; we compare on non-member and store member as a discount.
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-mitohealth.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SELECTORS = { mode: 'catalog', adapter: 'mitohealth', catalogPath: '/shop' };
const SEED_TEST_SLUGS = [
  'ferritin', 'comprehensive-metabolic-panel', 'cbc-complete-blood-count', 'lipid-panel',
  'hba1c-hemoglobin-a1c', 'tsh-thyroid-stimulating-hormone', 'vitamin-d-25-hydroxy',
  'testosterone-total', 'psa-prostate-specific-antigen', 'vitamin-b12', 'estradiol',
];

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'mito-health' },
    update: { websiteUrl: 'https://mitohealth.com', isActive: true, membershipNote: '$9/mo membership' },
    create: { name: 'Mito Health', slug: 'mito-health', websiteUrl: 'https://mitohealth.com', isActive: true, trustLevel: 'MEDIUM', membershipNote: '$9/mo membership' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://mitohealth.com', isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://mitohealth.com', isEnabled: true, selectors: SELECTORS },
  });
  const tests = await prisma.test.findMany({ where: { slug: { in: SEED_TEST_SLUGS } }, select: { id: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`Mito Health ${vendor.id} · linked ${tests.length} seed tests · membership: ${vendor.membershipNote}\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);
  console.log(`\n=== ${((Date.now() - t0) / 1000).toFixed(1)}s: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched ===\n`);

  const offs = await prisma.offering.findMany({ where: { vendorId: vendor.id, deletedAt: null }, include: { test: { select: { name: true } } }, orderBy: { test: { name: 'asc' } } });
  for (const o of offs) {
    const nm = o.currentPrice != null ? `$${o.currentPrice}` : '(review)';
    const mem = o.memberPrice != null ? ` · member $${o.memberPrice}` : '';
    console.log(`  ${nm.padEnd(9)}${mem.padEnd(16)} ${o.test.name}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
