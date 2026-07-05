// End-to-end DB test for the DrSays catalog scraper (adapter='drsays'). Sets up DrSays as a
// catalog-mode vendor, links every test currently in our catalog, runs discovery against the live site
// + real Postgres, publishes auto-approved changes, and prints the result. Coverage is deliberately
// small — see drsays-parser.ts's module comment for why.
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-drsays.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SELECTORS = { mode: 'catalog', adapter: 'drsays', catalogPath: '/sitemap.xml' };

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'drsays' },
    update: { websiteUrl: 'https://www.drsays.com', isActive: true },
    create: { name: 'DrSays', slug: 'drsays', websiteUrl: 'https://www.drsays.com', isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://www.drsays.com', isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://www.drsays.com', isEnabled: true, selectors: SELECTORS },
  });

  const tests = await prisma.test.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`DrSays vendor ${vendor.id} · linked ${tests.length}/${tests.length} tests\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);
  console.log(`\n=== ${((Date.now() - t0) / 1000).toFixed(1)}s: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.autoApprovedStagedIds.length} published ===\n`);

  const offs = await prisma.offering.findMany({ where: { vendorId: vendor.id, deletedAt: null, currentPrice: { not: null } }, include: { test: { select: { name: true } } }, orderBy: { test: { name: 'asc' } } });
  for (const o of offs) console.log(`  $${o.currentPrice}  ${o.test.name}  ${o.externalUrl ?? ''}`);

  const staged = await prisma.stagedPriceChange.findMany({ where: { scrapeRunId: summary.runId, status: 'PENDING' }, include: { offering: { include: { test: { select: { name: true } } } } } });
  if (staged.length) {
    console.log('\nPending (review):');
    for (const s of staged) console.log(`  $${s.newPrice} · ${s.offering.test.name}\n     ${s.reviewNote}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
