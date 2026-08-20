// Catalog ingest for AlgoRx (adapter='algorx'). INGEST-ONLY BY DESIGN — read this before adding
// a `--link` style shortcut.
//
// AlgoRx publishes no lab order codes anywhere, so matching is name-only with nothing to corroborate
// it. Measured against the live catalog + our real test list, that produces confidently-wrong matches
// — "Vitamin D, 25-Hydroxy" → "Vitamin B12" ($12), "Arsenic Blood Test" → "Phosphate" ($9.50),
// "Deamidated Gliadin Peptide Ab" → "C-Peptide" ($25) — and tightening `flagAmbiguous` only moves most
// of them to the Change Queue, not all (Arsenic→Phosphate still auto-matched).
//
// So this script deliberately creates NO offerings. It crawls the catalog so every product lands in
// `VendorProduct` and shows up in /admin/discovered, where an admin promotes the genuine matches by
// hand. A promoted offering carries a pinned product URL, which prices reliably on later scrapes even
// when the name tier stays ambiguous (see `priceFromPinnedUrl` in catalog/persist.ts).
//
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-algorx.ts
//   --dry   show what the catalog contains and what name-matching WOULD do; writes nothing at all.
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { getAdapter } from '@labprice/scrapers/src/catalog/adapters';
import { matchTestToProducts } from '@labprice/scrapers/src/catalog/matcher';
import type { TestKey } from '@labprice/scrapers/src/catalog/types';
import { runVendorDiscovery } from '../src/discovery';

const SLUG = 'algorx';
const BASE_URL = 'https://algorx.com';
const SELECTORS = { mode: 'catalog', adapter: 'algorx', catalogPath: '/biomarkers' };
const OPTS = { matchPriority: ['name'] as const, includePanels: false, flagAmbiguous: true };
const DRY = process.argv.includes('--dry');

const fetchHtml = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'LabTestCompare/1.0 (+catalog discovery)' } });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.text();
};

async function main() {
  const products = await getAdapter('algorx').fetchAll!({ fetchHtml, onLog: (m) => console.log('·', m) }, { baseUrl: BASE_URL });

  if (DRY) {
    const tests = await prisma.test.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, questCode: true, labcorpCode: true, confidence: true, aliases: { select: { alias: true } } },
    });
    let matched = 0, ambiguous = 0;
    console.log('\n--- name-match preview (nothing written) ---');
    for (const t of tests) {
      const key: TestKey = {
        id: t.id, name: t.name, questCode: t.questCode, labcorpCode: t.labcorpCode,
        aliases: t.aliases.map((a) => a.alias), confidence: t.confidence as TestKey['confidence'],
      };
      const r = matchTestToProducts(key, products, OPTS);
      if (r.status === 'unmatched') continue;
      if (r.status === 'matched') matched++; else ambiguous++;
      const p = r.candidates.find((c) => c.price === r.price)?.productName ?? '(ambiguous)';
      console.log(`  ${(r.status === 'matched' ? '$' + r.price : 'AMBIG').padEnd(10)} ${t.name.padEnd(44)} <- ${p}`);
    }
    console.log(`\n${matched} would auto-match, ${ambiguous} ambiguous — REVIEW THESE, name-only matching is unreliable here.`);
    await prisma.$disconnect();
    return;
  }

  const vendor = await prisma.vendor.upsert({
    where: { slug: SLUG },
    update: { websiteUrl: BASE_URL, isActive: true },
    create: { name: 'AlgoRx', slug: SLUG, websiteUrl: BASE_URL, isActive: true, trustLevel: 'MEDIUM' },
  });
  await prisma.scrapeVendorConfig.upsert({
    where: { vendorId: vendor.id },
    update: { engine: 'HTTP', baseUrl: BASE_URL, isEnabled: true, selectors: SELECTORS },
    create: { vendorId: vendor.id, engine: 'HTTP', baseUrl: BASE_URL, isEnabled: true, selectors: SELECTORS },
  });
  console.log(`vendor ${vendor.name} (${vendor.id}) ready · creating NO offerings by design\n`);

  // Runs with zero linked offerings: `fetchAll` adapters skip name-narrowing, so the crawl still sees
  // the whole catalog and the ingest layer records every product in VendorProduct.
  const summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', onLog: (m) => console.log('·', m) });
  console.log(`\n=== ingest complete: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched ===`);

  const [ingested, offerings] = await Promise.all([
    prisma.vendorProduct.count({ where: { vendorId: vendor.id } }),
    prisma.offering.count({ where: { vendorId: vendor.id, deletedAt: null } }),
  ]);
  console.log(`VendorProduct rows: ${ingested} · offerings: ${offerings} (expected 0)`);
  console.log('\nNext: promote the genuine matches in /admin/discovered.');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
