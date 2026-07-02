// End-to-end DB test for the GoodLabs catalog scraper. Sets up GoodLabs as a catalog-mode vendor,
// links a spread of seed tests (matched / ambiguous / unmatched cases), runs discovery against the
// live site + real Postgres, publishes auto-approved changes inline, and prints the result.
//
// Run (from apps/worker):  npx tsx scripts/discover-goodlabs.ts
// Requires: pnpm docker:dev (Postgres) + seeded tests.
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SEED_TEST_SLUGS = [
  'ferritin',                         // → matched by Quest code
  'comprehensive-metabolic-panel',    // → matched by Quest code
  'cbc-complete-blood-count',         // → matched by Quest code
  'lipid-panel',                      // → matched by LabCorp code (fallback)
  'hba1c-hemoglobin-a1c',             // → matched by Quest code
  'testosterone-total',               // → ambiguous (name matches several products)
  'tsh-thyroid-stimulating-hormone',  // → unmatched (only inside GoodLabs' Thyroid panel)
  'vitamin-d-25-hydroxy',             // → matched by Quest code
];

async function main() {
  // 1. GoodLabs vendor (catalog mode).
  const vendor = await prisma.vendor.upsert({
    where: { slug: 'good-labs' },
    update: { websiteUrl: 'https://goodlabs.com', isActive: true },
    create: { name: 'Good Labs', slug: 'good-labs', websiteUrl: 'https://goodlabs.com', isActive: true, trustLevel: 'MEDIUM' },
  });

  // 2. Scraper config → catalog mode.
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://goodlabs.com', isEnabled: true, selectors: { mode: 'catalog', catalogPath: '/book-tests?step=PANEL_SELECTION' } },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://goodlabs.com', isEnabled: true, selectors: { mode: 'catalog', catalogPath: '/book-tests?step=PANEL_SELECTION' } },
  });

  // 3. Link seed tests as offerings (no pre-set price — the scraper discovers it).
  const tests = await prisma.test.findMany({ where: { slug: { in: SEED_TEST_SLUGS } }, select: { id: true, slug: true } });
  for (const t of tests) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: t.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: t.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`GoodLabs vendor ${vendor.id} · linked ${tests.length}/${SEED_TEST_SLUGS.length} seed tests\n`);

  // 4. Run discovery against the live site + DB.
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });

  // 5. Publish auto-approved changes to live offerings.
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);

  // 6. Report.
  console.log(`\n=== Run ${summary.runId}: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.staged} staged ===\n`);

  const offerings = await prisma.offering.findMany({
    where: { vendorId: vendor.id, deletedAt: null },
    include: { test: { select: { name: true } } },
    orderBy: { test: { name: 'asc' } },
  });
  console.log('Live offering prices (auto-approved & published):');
  for (const o of offerings) console.log(`  ${o.currentPrice != null ? ('$' + o.currentPrice).padEnd(7) : '—'.padEnd(7)} ${o.test.name}`);

  const staged = await prisma.stagedPriceChange.findMany({
    where: { scrapeRunId: summary.runId },
    include: { offering: { include: { test: { select: { name: true } } } } },
    orderBy: { status: 'asc' },
  });
  console.log('\nStaged price changes:');
  for (const s of staged) console.log(`  [${s.status.padEnd(13)}] $${s.newPrice} · ${s.offering.test.name}\n       ${s.reviewNote ?? ''}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
