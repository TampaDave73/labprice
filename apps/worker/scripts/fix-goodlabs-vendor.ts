// One-off cleanup: the e2e test script (discover-goodlabs.ts) created a SECOND GoodLabs vendor
// (slug 'goodlabs') separate from the user's admin-created 'Good Labs' (slug 'good-labs'). This
// retires the test duplicate and configures the user's real vendor as a catalog scraper, then prices
// its linked tests. Run (from apps/worker): DOTENV_CONFIG_PATH=../../.env npx tsx scripts/fix-goodlabs-vendor.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const CATALOG_SELECTORS = { mode: 'catalog', catalogPath: '/book-tests?step=PANEL_SELECTION' };

async function main() {
  // 1. Retire the test-created duplicate (slug 'goodlabs'), if present.
  const dup = await prisma.vendor.findUnique({ where: { slug: 'goodlabs' } });
  if (dup) {
    const offs = await prisma.offering.findMany({ where: { vendorId: dup.id }, select: { id: true } });
    const offIds = offs.map((o) => o.id);
    const delStaged = await prisma.stagedPriceChange.deleteMany({ where: { offeringId: { in: offIds } } });
    await prisma.offering.updateMany({ where: { vendorId: dup.id }, data: { deletedAt: new Date(), isActive: false } });
    await prisma.vendor.update({ where: { id: dup.id }, data: { deletedAt: new Date(), isActive: false } });
    console.log(`Retired duplicate vendor '${dup.name}' (${dup.id}): soft-deleted ${offIds.length} offerings, cleared ${delStaged.count} staged changes.`);
  } else {
    console.log("No duplicate 'goodlabs' vendor found (already cleaned).");
  }

  // 2. Configure the user's real vendor as a catalog scraper.
  const vendor = await prisma.vendor.findFirst({ where: { slug: { in: ['good-labs', 'goodlabs'] }, deletedAt: null } });
  if (!vendor) { console.log('No live Good Labs vendor to configure — create one in the admin first.'); return; }
  await prisma.vendor.update({ where: { id: vendor.id }, data: { websiteUrl: vendor.websiteUrl ?? 'https://goodlabs.com' } });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: 'https://goodlabs.com', isEnabled: true, selectors: CATALOG_SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: 'https://goodlabs.com', isEnabled: true, selectors: CATALOG_SELECTORS },
  });
  console.log(`Configured '${vendor.name}' (${vendor.id}) as catalog scraper.`);

  // 3. Price its currently-linked tests (only those — not all).
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);

  const offerings = await prisma.offering.findMany({
    where: { vendorId: vendor.id, deletedAt: null },
    include: { test: { select: { name: true } } },
  });
  console.log(`\n'${vendor.name}' now has ${offerings.length} linked test(s):`);
  for (const o of offerings) console.log(`  ${o.currentPrice != null ? '$' + o.currentPrice : '(pending review)'} · ${o.test.name} · ${o.externalUrl ?? 'no url'}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
