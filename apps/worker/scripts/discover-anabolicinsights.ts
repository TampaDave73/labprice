// End-to-end DB runner for the Anabolic Insights catalog scraper (API vendor, adapter='anabolicinsights').
//
// Anabolic Insights prices the same test at up to three labs (Quest/LabCorp/Bioreference), so this
// vendor runs with `mergeCodeTiers` — the cheapest code-matching lab becomes currentPrice and the
// other is kept as altLabPrice (see catalog/anabolicinsights-parser.ts).
//
// Unlike the older runners this does NOT hardcode seed slugs: the vendor carries ~110 tests and our
// catalog is ~250, so it computes the overlap by running the real matcher against the live catalog and
// links exactly the tests the vendor actually carries (matched + ambiguous — ambiguous ones still need
// an offering to exist so they surface in the Change Queue for review rather than being dropped).
//
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-anabolicinsights.ts
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { getAdapter } from '@labprice/scrapers/src/catalog/adapters';
import { matchTestToProducts } from '@labprice/scrapers/src/catalog/matcher';
import type { TestKey } from '@labprice/scrapers/src/catalog/types';
import { runVendorDiscovery, publishStagedChange } from '../src/discovery';

const SLUG = 'anabolic-insights';
const BASE_URL = 'https://www.anabolicinsights.ai';
const API_BASE = 'https://api.anabolicinsights.ai';
const SELECTORS = { mode: 'catalog', adapter: 'anabolicinsights', catalogPath: '/labs/panels/biomarkers' };
const OPTS = { mergeCodeTiers: true, includePanels: false, flagAmbiguous: true };

const fetchHtml = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'LabTestCompare/1.0 (+catalog discovery)' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.text();
};

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { slug: SLUG },
    update: { websiteUrl: BASE_URL, isActive: true },
    create: { name: 'Anabolic Insights', slug: SLUG, websiteUrl: BASE_URL, isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: BASE_URL, isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: BASE_URL, isEnabled: true, selectors: SELECTORS },
  });

  // Which of our tests does this vendor actually carry? Ask the real matcher against the live catalog.
  const products = await getAdapter('anabolicinsights').fetchAll!({ fetchHtml, onLog: (m) => console.log('·', m) }, { baseUrl: BASE_URL, apiBase: API_BASE });
  const tests = await prisma.test.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, questCode: true, labcorpCode: true, confidence: true, aliases: { select: { alias: true } } },
  });

  const carried: { id: string; name: string; status: string }[] = [];
  for (const t of tests) {
    const key: TestKey = {
      id: t.id, name: t.name, questCode: t.questCode, labcorpCode: t.labcorpCode,
      aliases: t.aliases.map((a) => a.alias), confidence: t.confidence as TestKey['confidence'],
    };
    const r = matchTestToProducts(key, products, OPTS);
    if (r.status !== 'unmatched') carried.push({ id: t.id, name: t.name, status: r.status });
  }
  console.log(`\nvendor carries ${carried.length} of our ${tests.length} tests ` +
    `(${carried.filter((c) => c.status === 'matched').length} matched, ${carried.filter((c) => c.status === 'ambiguous').length} ambiguous)`);

  for (const c of carried) {
    await prisma.offering.upsert({
      where: { testId_vendorId: { testId: c.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: c.id, vendorId: vendor.id, isActive: true },
    });
  }
  console.log(`linked ${carried.length} offerings to ${vendor.name} (${vendor.id})\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
  let published = 0;
  for (const id of summary.autoApprovedStagedIds) if (await publishStagedChange(id)) published++;
  console.log(`\n=== ${((Date.now() - t0) / 1000).toFixed(1)}s: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched · ${published} published ===\n`);

  const offs = await prisma.offering.findMany({
    where: { vendorId: vendor.id, deletedAt: null, isActive: true },
    include: { test: { select: { name: true } } },
    orderBy: { test: { name: 'asc' } },
  });
  const priced = offs.filter((o) => o.currentPrice != null);
  console.log(`offerings with a live price: ${priced.length}/${offs.length}`);
  for (const o of priced.slice(0, 30)) {
    const alt = o.altLabPrice != null ? ` · alt $${o.altLabPrice} @${o.altLabProvider}` : '';
    console.log(`  $${String(o.currentPrice).padEnd(8)} @${(o.labProvider ?? '?').padEnd(13)} ${o.test.name}${alt}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
