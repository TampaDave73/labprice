// Exhaustively crawls every active catalog vendor and ingests what it finds into VendorProduct.
// Used after the 2026-09-07 catalog reset to repopulate the ingest layer against the new 30 tests.
//
// This creates NO offerings. runVendorDiscovery only prices offerings that already exist, and after
// the reset there are none — the value here is entirely the ingest pass, which strict-matches every
// crawled product against our tests (exact code, or exact normalized name/alias) and records the
// result on VendorProduct. Task 7's autolist-code-matches.ts turns the code matches into offerings;
// the name matches wait in /admin/discovered.
//
// exhaustive:true matters. discover() narrows the crawl to pages whose names overlap a test, and with
// zero offerings that test list is empty — a narrow crawl would fetch almost nothing. Exhaustive
// ignores the test list entirely (catalog-scraper.ts: `narrow ? tests : undefined`).
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
    try {
      await runVendorDiscovery({
        vendorId: v.id,
        triggeredBy: 'MANUAL',
        exhaustive: true,
        // Cloudflare/WAF-gated vendors (personalabs, requestatest, truehealthlabs) need a real
        // browser; plain HTTP gets a challenge page, which parses as 0 products and fails the run.
        ...(adapterNeedsBrowser(adapter) ? { fetchHtml: browserFetchHtml(60_000) } : {}),
        onLog: () => {},
      });
      const after = await prisma.vendorProduct.count({ where: { vendorId: v.id } });
      const matched = await prisma.vendorProduct.count({ where: { vendorId: v.id, status: 'MATCHED' } });
      console.log(`${after} product(s) (+${after - before}), ${matched} matched`);
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
