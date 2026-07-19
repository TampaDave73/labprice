// Scrape catalog vendors FROM THIS MACHINE, writing to whatever database DATABASE_URL points at.
// Exists for vendors whose WAFs (Cloudflare) block datacenter IPs: run from a residential
// connection, where the challenge clears, against the LIVE database's public URL — see
// scrape-blocked-vendors.ps1 at the repo root for the one-click wrapper.
//
// Usage:
//   pnpm --filter @labprice/worker exec tsx scripts/scrape-vendor-local.ts            # all "Manual only" vendors
//   pnpm --filter @labprice/worker exec tsx scripts/scrape-vendor-local.ts <slug> ... # specific vendors
//
// Runs inline (no Redis/worker needed). Auto-approved price changes publish immediately; ambiguous
// ones land in the admin Change Queue as usual.
import '../src/env';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, publishStagedChange, adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? '').hostname || '(unset)';
  console.log(`Database: ${dbHost}`);

  let vendors: { id: string; name: string; adapter: string | undefined }[];
  const slugs = process.argv.slice(2);
  const rows = await prisma.vendor.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(slugs.length
        ? { slug: { in: slugs } }
        : // Default: every catalog vendor set to "Manual only" — exactly the ones the cloud skips.
          { scrapeConfig: { frequencyDays: 0, isEnabled: true } }),
    },
    select: { id: true, name: true, scrapeConfig: { select: { selectors: true } } },
  });
  vendors = rows.map((v) => ({
    id: v.id,
    name: v.name,
    adapter: (v.scrapeConfig?.selectors as Record<string, unknown> | null)?.adapter as string | undefined,
  }));

  if (vendors.length === 0) {
    console.log(slugs.length ? `No vendors match: ${slugs.join(', ')}` : 'No vendors are set to "Manual only" — nothing to scrape.');
    return;
  }

  console.log(`Scraping ${vendors.length} vendor(s): ${vendors.map((v) => v.name).join(', ')}\n`);
  let failures = 0;

  for (const vendor of vendors) {
    console.log(`── ${vendor.name} ──`);
    try {
      const summary = await runVendorDiscovery({
        vendorId: vendor.id,
        triggeredBy: 'MANUAL',
        ...(adapterNeedsBrowser(vendor.adapter) ? { fetchHtml: browserFetchHtml() } : {}),
        onLog: (m) => console.log(`   ${m}`),
      });
      let published = 0;
      for (const id of summary.autoApprovedStagedIds) if (await publishStagedChange(id)) published++;
      console.log(`   ✔ ${summary.matched} matched, ${published} price(s) published, ${summary.ambiguous} need review, ${summary.unmatched} not found\n`);
    } catch (err) {
      failures++;
      console.error(`   ✖ FAILED: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log(failures === 0 ? 'Done — all vendors scraped.' : `Done — ${failures} vendor(s) failed (see above).`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
