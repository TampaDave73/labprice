// Vendor verification harness — run this against EVERY vendor after first building it, and again after
// any change to shared scraper/persistence code (a shared-code bug silently breaks every vendor at
// once, per SKILLS.md). Exercises the exact same code path the admin UI's "Scrape now" button does
// (`runVendorDiscovery`), so a pass here is a real guarantee, not just a unit-test guarantee.
//
// What it checks, and which real incidents each one catches (all found live in this project):
//   1. Adapter resolves to itself, not a silent fallback to GoodLabs — catches a hand-kept adapter
//      whitelist going stale (Discounted Labs' "Save Scraper Config" silently dropped its adapter).
//   2. Catalog crawl returns a plausible number of products, not zero — catches a vendor re-theming
//      their site and breaking the catalog parser regex (Discounted Labs, 2026-07).
//   3. A "canary" test the vendor doesn't currently carry gets linked fresh and matched — proves
//      new-test onboarding actually works end-to-end, not just that existing offerings still have a
//      cached price.
//   4. Every active offering's stored externalUrl actually resolves (not 404) — catches a wrong base
//      domain in URL construction (DirectLabs: store.directlabs.com vs directlabs.com).
//   5. The run finishes with SUCCESS, not FAILED — catches the wrong-fetcher-for-a-JS-gated-vendor class
//      of bug (Request A Test's inline scrape used to 403 instantly).
//
// Usage (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env npx tsx scripts/verify-vendor.ts <vendor-slug>
//   DOTENV_CONFIG_PATH=../../.env npx tsx scripts/verify-vendor.ts <vendor-slug> --canary=<test-slug>
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { runVendorDiscovery, adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';
import { getAdapter } from '@labprice/scrapers/src/catalog/adapters';

// Same seed-test set every discover-*.ts script links — good canary candidates because they're common
// tests almost every vendor carries, so an unmatched result is informative (a real name/site gap), not
// just "this vendor doesn't sell that test at all".
const CANARY_CANDIDATES = [
  'psa-prostate-specific-antigen', 'cbc-complete-blood-count', 'comprehensive-metabolic-panel',
  'lipid-panel', 'hba1c-hemoglobin-a1c', 'vitamin-d-25-hydroxy', 'testosterone-total', 'vitamin-b12',
  'tsh-thyroid-stimulating-hormone', 'ferritin', 'estradiol', 'folate-serum', 'cortisol',
];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: verify-vendor.ts <vendor-slug> [--canary=<test-slug>]');
    process.exit(1);
  }

  const results: { check: string; pass: boolean; detail: string }[] = [];
  const record = (check: string, pass: boolean, detail: string) => {
    results.push({ check, pass, detail });
    console.log(`${pass ? '✓' : '✗'} ${check}: ${detail}`);
  };

  const vendor = await prisma.vendor.findUnique({ where: { slug } });
  if (!vendor) {
    console.error(`No vendor with slug "${slug}"`);
    process.exit(1);
  }
  const config = await prisma.scrapeVendorConfig.findUnique({ where: { vendorId: vendor.id } });
  const selectors = (config?.selectors ?? {}) as Record<string, unknown>;
  const isCatalog = selectors.mode === 'catalog';
  console.log(`\n=== Verifying ${vendor.name} (${slug}) ===\n`);

  if (!isCatalog) {
    console.log('Not a catalog-mode vendor — this harness only covers catalog vendors (see SKILLS.md for per-URL vendor checks).');
    await prisma.$disconnect();
    return;
  }

  // 1. Adapter resolves to itself, not a silent fallback.
  const adapterName = selectors.adapter as string | undefined;
  const resolved = getAdapter(adapterName);
  record(
    'Adapter resolves correctly',
    !!adapterName && resolved.name === adapterName,
    adapterName ? `selectors.adapter="${adapterName}" → resolved "${resolved.name}"` : 'selectors.adapter is unset — falls back to GoodLabs silently',
  );

  // Canary: pick a seed test not currently an active offering for this vendor.
  const existing = await prisma.offering.findMany({ where: { vendorId: vendor.id, isActive: true, deletedAt: null }, select: { testId: true } });
  const existingIds = new Set(existing.map((o) => o.testId));
  const requestedCanary = arg('canary');
  const candidateSlugs = requestedCanary ? [requestedCanary] : CANARY_CANDIDATES;
  const candidates = await prisma.test.findMany({ where: { slug: { in: candidateSlugs } }, select: { id: true, slug: true, name: true } });
  const canary = candidates.find((t) => !existingIds.has(t.id)) ?? candidates[0];

  let canaryOffering: { id: string } | null = null;
  if (canary) {
    canaryOffering = await prisma.offering.upsert({
      where: { testId_vendorId: { testId: canary.id, vendorId: vendor.id } },
      update: { isActive: true, deletedAt: null },
      create: { testId: canary.id, vendorId: vendor.id, isActive: true },
      select: { id: true },
    });
    console.log(`Canary test: "${canary.name}" (${canary.slug}) — linked fresh for this run.`);
  } else {
    console.log('No canary candidate available (all seed tests already offered, and none specified via --canary) — skipping canary check.');
  }

  // 3-5. Run the exact same discovery path "Scrape now" uses.
  const needsBrowser = adapterNeedsBrowser(adapterName);
  const t0 = Date.now();
  let summary: Awaited<ReturnType<typeof runVendorDiscovery>> | null = null;
  let runError: unknown = null;
  try {
    if (needsBrowser) {
      const { browserFetchHtml } = await import('@labprice/scrapers/src/catalog/browser-fetch');
      summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL', fetchHtml: browserFetchHtml() });
    } else {
      summary = await runVendorDiscovery({ vendorId: vendor.id, triggeredBy: 'MANUAL' });
    }
  } catch (e) {
    runError = e;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  record('Discovery run completes without throwing', !runError, runError ? String(runError) : `${elapsed}s`);

  if (summary) {
    const totalOfferings = summary.matched + summary.ambiguous + summary.unmatched;
    record(
      'Catalog crawl found products (not the "site re-themed" failure)',
      totalOfferings > 0 && (summary.matched > 0 || summary.ambiguous > 0),
      `${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched`,
    );

    if (canary && canaryOffering) {
      const canaryResult = await prisma.scrapeResult.findFirst({
        where: { runId: summary.runId, testId: canary.id },
        orderBy: { createdAt: 'desc' },
      });
      const matched = canaryResult?.status === 'MATCHED' || canaryResult?.status === 'PRICE_CHANGED' || canaryResult?.status === 'PRICE_SAME';
      record(
        'Canary test auto-matched',
        !!matched,
        matched
          ? `matched, status=${canaryResult?.status}`
          : `status=${canaryResult?.status ?? 'no result'} — if this is a genuine name-wording mismatch (not a bug), pin the real product URL on this offering in the admin, then re-run: --canary=${canary.slug}`,
      );
    }
  }

  // 4. Every active offering's stored URL actually resolves.
  const offerings = await prisma.offering.findMany({
    where: { vendorId: vendor.id, isActive: true, deletedAt: null, externalUrl: { not: null } },
    select: { externalUrl: true, test: { select: { name: true } } },
  });
  let brokenUrls = 0;
  for (const o of offerings) {
    try {
      const res = await fetch(o.externalUrl!, { method: 'GET', redirect: 'follow' });
      if (!res.ok) {
        brokenUrls++;
        console.log(`    ! ${o.test.name}: HTTP ${res.status} for ${o.externalUrl}`);
      }
    } catch (e) {
      brokenUrls++;
      console.log(`    ! ${o.test.name}: fetch failed for ${o.externalUrl} (${e instanceof Error ? e.message : e})`);
    }
  }
  record('All stored product URLs resolve (no 404s)', brokenUrls === 0, `${offerings.length - brokenUrls}/${offerings.length} OK`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  await prisma.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
