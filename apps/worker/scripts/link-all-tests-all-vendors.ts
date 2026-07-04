// Bulk expansion: link every active (non-deleted) test to every active vendor, then run catalog
// discovery per vendor so newly-linked tests (e.g. the Lab Test Transparency Project additions) get
// priced immediately instead of sitting unmatched until the next "Scrape now" click.
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/link-all-tests-all-vendors.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange, adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';

async function main() {
  const tests = await prisma.test.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const vendors = await prisma.vendor.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, slug: true } });
  console.log(`Linking ${tests.length} tests × ${vendors.length} vendors...\n`);

  for (const vendor of vendors) {
    let linked = 0;
    for (const test of tests) {
      const res = await prisma.offering.upsert({
        where: { testId_vendorId: { testId: test.id, vendorId: vendor.id } },
        update: { isActive: true, deletedAt: null },
        create: { testId: test.id, vendorId: vendor.id, isActive: true },
      });
      if (res) linked++;
    }
    console.log(`${vendor.name}: ${linked}/${tests.length} offerings active`);
  }

  console.log(`\n=== Running discovery per vendor ===\n`);
  for (const vendor of vendors) {
    const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId: vendor.id }, select: { selectors: true, isEnabled: true } });
    const selectors = (config?.selectors ?? {}) as Record<string, unknown>;
    if (selectors.mode !== 'catalog' || config?.isEnabled === false) {
      console.log(`--- ${vendor.name}: skipped (not catalog mode or disabled) ---`);
      continue;
    }
    const needsBrowser = adapterNeedsBrowser(selectors.adapter as string | undefined);
    const t0 = Date.now();
    try {
      const opts: Parameters<typeof runVendorDiscovery>[0] = { vendorId: vendor.id, triggeredBy: 'MANUAL' };
      if (needsBrowser) {
        const { browserFetchHtml } = await import('@labprice/scrapers/src/catalog/browser-fetch');
        opts.fetchHtml = browserFetchHtml();
      }
      const summary = await runVendorDiscovery(opts);
      let published = 0;
      for (const id of summary.autoApprovedStagedIds) if (await publishStagedChange(id)) published++;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`--- ${vendor.name} (${elapsed}s): ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${published} published ---`);
    } catch (e) {
      console.log(`--- ${vendor.name}: ERROR ${e instanceof Error ? e.message : e} ---`);
    }
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
