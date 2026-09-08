// Crawls every active catalog vendor and ingests what it finds into VendorProduct. Used after the
// 2026-09-07 catalog reset to repopulate the ingest layer against the new 30 tests.
//
// This creates NO offerings. runVendorDiscovery only prices offerings that already exist, and after
// the reset there are none — the value here is entirely the ingest pass, which strict-matches every
// crawled product against our tests (exact code, or exact normalized name/alias) and records the
// result on VendorProduct. Task 7's autolist-code-matches.ts turns the code matches into offerings;
// the name matches wait in /admin/discovered.
//
// narrowToAllTests:true, NOT exhaustive:true. discover() still narrows the crawl to catalog entries
// whose name plausibly matches one of our tests — it just narrows against EVERY live test (30 of
// them) instead of "tests this vendor already has offerings for" (empty right after a reset, which
// is exactly why exhaustive:true used to be load-bearing here: a narrow-by-offerings crawl would
// have fetched almost nothing). The full catalog listing is still ingested into VendorProduct either
// way (buildCatalogIndexDetailed always returns the complete `entries`, narrowed or not) — narrowing
// only decides which product DETAIL pages get fetched, not what's recorded. Measured against the
// live 30-test catalog: ~877 detail fetches total across all 18 vendors, down from 9,114 exhaustive
// (~25 min instead of ~4.3 hours), with 166/168 code matches surviving — the 2 losses were closed by
// adding a bare "CBC" alias (see packages/database/data/2026-07-27-master-tests/tests.json).
//
// No --apply / dry-run gate, unlike this project's other destructive scripts — intentionally. This
// script's writes are additive-only (VendorProduct upserts, ScrapeRun/ScrapeJob rows); it creates no
// offerings and deletes/overwrites nothing. A "dry run" of a crawl would just be a crawl that writes
// nothing, which is pointless — the entire point of running it is to populate the ingest layer.
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts            # all vendors
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts good-labs  # one vendor
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';
import { runVendorDiscovery } from '../src/discovery';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// --no-browser forces plain HTTP even for adapters flagged needsBrowser. Those flags exist because
// the vendor's WAF blocks Railway's DATACENTER IP — from a residential connection plain HTTP is often
// fine, and the browser path is both far slower and memory-hungry enough to get the process OOM-killed.
// Verified 2026-09-08: truehealthlabs' product sitemap returns 196 entries over plain HTTP from here,
// while the browser path failed. Never make this the default — on Railway the browser fetch is what
// gets these vendors through at all.
const NO_BROWSER = process.argv.includes('--no-browser');

async function main() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, deletedAt: null, ...(only.length ? { slug: { in: only } } : {}) },
    include: { scrapeConfig: true },
    orderBy: { slug: 'asc' },
  });
  console.log(`Crawling ${vendors.length} vendor(s)\n`);

  const results: { slug: string; products: number; matched: number; error?: string }[] = [];

  for (const v of vendors) {
    const adapter = (v.scrapeConfig?.selectors as Record<string, unknown> | null)?.adapter as string | undefined;
    const before = await prisma.vendorProduct.count({ where: { vendorId: v.id } });
    process.stdout.write(`${v.slug} (${adapter ?? 'goodlabs'})… `);
    // Capture the crawler's own "narrowed to N/M" line rather than discarding every log: it is the
    // only visible proof that narrowing is actually active. Without it, a silently-exhaustive crawl
    // (narrowToAllTests dropped, or zero live tests to narrow against) looks identical to a narrow
    // one until you notice it took four hours instead of twenty minutes.
    let narrowed = '';
    try {
      await runVendorDiscovery({
        vendorId: v.id,
        triggeredBy: 'MANUAL',
        narrowToAllTests: true,
        // Cloudflare/WAF-gated vendors (personalabs, requestatest, truehealthlabs) need a real
        // browser; plain HTTP gets a challenge page, which parses as 0 products and fails the run.
        ...(adapterNeedsBrowser(adapter) && !NO_BROWSER ? { fetchHtml: browserFetchHtml(60_000) } : {}),
        onLog: (m) => { if (m.startsWith('narrowed to')) narrowed = m; },
      });
      const after = await prisma.vendorProduct.count({ where: { vendorId: v.id } });
      const matched = await prisma.vendorProduct.count({ where: { vendorId: v.id, status: 'MATCHED' } });
      // API (fetchAll) vendors never emit a narrowed line — they return the whole catalog in one call.
      console.log(`${after} product(s) (+${after - before}), ${matched} matched${narrowed ? ` [${narrowed}]` : ''}`);
      results.push({ slug: v.slug, products: after, matched });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`FAILED — ${error.slice(0, 120)}`);
      // Keep going: one blocked vendor must not abort the other seventeen.
      results.push({ slug: v.slug, products: 0, matched: 0, error });
    }
  }

  console.log('\n─── summary ───');
  for (const r of results.sort((a, b) => b.matched - a.matched)) {
    console.log(`${r.slug.padEnd(22)} ${String(r.products).padStart(6)} products  ${String(r.matched).padStart(4)} matched${r.error ? '  ← FAILED' : ''}`);
  }
  const failed = results.filter((r) => r.error);
  if (failed.length) console.log(`\n${failed.length} vendor(s) failed: ${failed.map((r) => r.slug).join(', ')}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
