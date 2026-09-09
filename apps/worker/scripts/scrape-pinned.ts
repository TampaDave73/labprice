// Lightweight, pinned-URL-only scrape for one vendor — no catalog crawl at all, just fetches and prices
// whatever offerings already have an admin-pinned `externalUrl` (`Offering.urlPinned`). Built for
// Request A Test: its `/tests` catalog listing is Cloudflare-JS-challenged from Railway's datacenter IP
// (confirmed live 2026-09-09 — works fine from a residential connection), so the normal crawl-based
// discovery fails outright before ever trying a single pinned URL, even though pricing a pin never
// needed the catalog listing in the first place (see `priceFromPinnedUrl` in persist.ts). Meant to be
// run from home, on a schedule or by hand — "click and it prices your pinned URLs."
//
// Needs DATABASE_URL pointed at a REACHABLE Postgres. Production's default DATABASE_URL uses Railway's
// internal-only hostname, which doesn't resolve outside Railway's network — reaching production from
// home needs a public TCP proxy on the Postgres service (Railway dashboard → Postgres → Settings →
// Networking → TCP Proxy) and a `.env.production` (or similar) pointed at that public host:port.
//
// Usage (from apps/worker):
//   npx tsx -r dotenv/config scripts/scrape-pinned.ts <vendor-slug>
//   DOTENV_CONFIG_PATH=path\to\.env.production npx tsx scripts/scrape-pinned.ts request-a-test
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange, adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: npx tsx scripts/scrape-pinned.ts <vendor-slug>');
    process.exit(1);
  }

  const vendor = await prisma.vendor.findUnique({ where: { slug }, include: { scrapeConfig: true } });
  if (!vendor) {
    console.error(`No vendor with slug "${slug}"`);
    process.exit(1);
  }

  const adapterName = (vendor.scrapeConfig?.selectors as Record<string, unknown> | null)?.adapter as string | undefined;
  const needsBrowser = adapterNeedsBrowser(adapterName);
  console.log(`${vendor.name} · pinned-URL-only run${needsBrowser ? ' (headless browser)' : ''}\n`);

  const t0 = Date.now();
  const summary = await runVendorDiscovery({
    vendorId: vendor.id,
    triggeredBy: 'MANUAL',
    pinnedOnly: true,
    // Only adapters actually flagged needsBrowser get the (slower, heavier) browser fetch — same rule
    // every other caller of runVendorDiscovery follows (see persist.ts's adapterNeedsBrowser comment).
    ...(needsBrowser ? { fetchHtml: browserFetchHtml() } : {}),
    onLog: (m) => console.log('·', m),
  });
  for (const id of summary.autoApprovedStagedIds) await publishStagedChange(id);
  console.log(
    `\n${((Date.now() - t0) / 1000).toFixed(1)}s: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ` +
      `${summary.unmatched} unmatched, ${summary.autoApprovedStagedIds.length} published`,
  );

  const offerings = await prisma.offering.findMany({
    where: { vendorId: vendor.id, urlPinned: true, externalUrl: { not: null }, deletedAt: null },
    include: { test: { select: { name: true } } },
    orderBy: { test: { name: 'asc' } },
  });
  console.log('');
  for (const o of offerings) {
    console.log(`  ${(o.currentPrice != null ? '$' + o.currentPrice : '(unpriced)').padEnd(10)} ${o.test.name}  ${o.externalUrl}`);
  }

  const staged = await prisma.stagedPriceChange.findMany({
    where: { scrapeRunId: summary.runId, status: 'PENDING' },
    include: { offering: { include: { test: { select: { name: true } } } } },
  });
  if (staged.length) {
    console.log('\nPending (review):');
    for (const s of staged) console.log(`  $${s.newPrice} · ${s.offering.test.name}\n     ${s.reviewNote}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
