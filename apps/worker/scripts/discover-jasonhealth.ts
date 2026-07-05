// End-to-end DB test for the Jason Health catalog scraper (adapter='jasonhealth'). Sets up Jason
// Health as a catalog-mode vendor, links every test currently in our catalog, runs discovery against
// the live Algolia API + real Postgres, publishes auto-approved changes, and prints the result.
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-jasonhealth.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SELECTORS = { mode: 'catalog', adapter: 'jasonhealth' };

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'jason-health' },
    update: { websiteUrl: 'https://www.jasonhealth.com', isActive: true },
    create: { name: 'Jason Health', slug: 'jason-health', websiteUrl: 'https://www.jasonhealth.com', isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://www.jasonhealth.com', isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://www.jasonhealth.com', isEnabled: true, selectors: SELECTORS },
  });

  const tests = await prisma.test.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`Jason Health vendor ${vendor.id} · linked ${tests.length}/${tests.length} tests\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
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
