// Catalog-discovery persistence: run a catalog-based vendor scrape (GoodLabs-style) and write the
// results into our DB — ScrapeJob/Run/Result rows plus StagedPriceChanges. Shared by the web app
// (inline "Scrape now" / add-test) and the worker so both take the exact same code path.
//
// This module lives in @labprice/scrapers (not the worker) so the web app can run discovery inline —
// no BullMQ/Redis, no dependency on the worker process. It imports only the catalog scraper (HTTP +
// cheerio), never Playwright, so it's safe to deep-import from Next.js server code.
//
// Match → persistence mapping:
//   matched   → ScrapeResult(PRICE_CHANGED|PRICE_SAME) + externalUrl stored; stage a change if the
//               price moved, auto-approving within trust/settings thresholds (like scrape-execute).
//   ambiguous → ScrapeResult(MATCHED, no price); stage the LOWEST candidate as PENDING (never auto-
//               approved) with a reviewNote listing every candidate → lands in the Change Queue.
//   unmatched → ScrapeResult(UNMATCHED); nothing staged.
import { prisma, Prisma, getEffectiveTrust, getScrapeSettings, type TrustLevel } from '@labprice/database';
import { discover, httpFetchHtml, type CatalogScrapeConfig, type OfferingMatch } from './catalog-scraper';
import { getAdapter } from './adapters';
import { matchTestToProducts } from './matcher';
import type { CatalogProduct, MatchTier, TestKey } from './types';

const Decimal = Prisma.Decimal;

export interface DiscoveryOptions {
  vendorId: string;
  triggeredBy?: 'SCHEDULE' | 'MANUAL' | 'RETRY';
  /** Only rediscover these offering ids (used by add-test). Omit = all active offerings. */
  offeringIds?: string[];
  /** Fetch every catalog page instead of just name-matches (exhaustive; default false = narrow). */
  exhaustive?: boolean;
  /** Inject a fetcher for tests; defaults to plain HTTP (no browser needed). */
  fetchHtml?: (url: string) => Promise<string>;
  onLog?: (msg: string) => void;
}

export interface DiscoverySummary {
  runId: string;
  matched: number;
  ambiguous: number;
  unmatched: number;
  staged: number;
  autoApprovedStagedIds: string[];
}

/**
 * Per-adapter defaults: base URL, catalog path, and match options that differ per vendor site. All
 * are overridable per-vendor via `ScrapeVendorConfig.selectors` (`catalogPath`, `apiBase`,
 * `preferredProvider`). Keyed by `CatalogAdapter.name`; falls back to the GoodLabs defaults.
 */
const ADAPTER_DEFAULTS: Record<
  string,
  { baseUrl: string; catalogPath: string; apiBase?: string; matchPriority?: MatchTier[]; codeMatchAnyProvider?: boolean; mergeCodeTiers?: boolean }
> = {
  goodlabs: { baseUrl: 'https://goodlabs.com', catalogPath: '/book-tests?step=PANEL_SELECTION' },
  ownyourlabs: { baseUrl: 'https://ownyourlabs.com', catalogPath: '/shop', codeMatchAnyProvider: true },
  dirtcheaplabs: { baseUrl: 'https://dirtcheaplabs.com', catalogPath: '/alacarte', apiBase: 'https://api.dirtcheaplabs.com', mergeCodeTiers: true },
  mitohealth: { baseUrl: 'https://mitohealth.com', catalogPath: '/shop', apiBase: 'https://trpc-bdhnb7m5vq-uc.a.run.app', matchPriority: ['name'] },
  // Walk-In Lab exposes BOTH lab codes together on one product; Personalabs labels the provider
  // directly per product, so it uses strict per-lab tiers (no codeMatchAnyProvider).
  walkinlab: { baseUrl: 'https://www.walkinlab.com', catalogPath: '/categories/view/all-products', codeMatchAnyProvider: true },
  personalabs: { baseUrl: 'https://www.personalabs.com', catalogPath: '/products/all-test/' },
  // No dedicated catalog page at all — sitemap.xml doubles as the full product index (single fetch,
  // no pagination); codes are unlabelled per-lab like Walk-In Lab.
  healthlabs: { baseUrl: 'https://www.healthlabs.com', catalogPath: '/sitemap.xml', codeMatchAnyProvider: true },
};

/**
 * Build the catalog config from the vendor's DB config. `selectors.adapter` picks the site parser +
 * product-URL shape (see `ADAPTERS`); the catalog path and match options default per adapter above.
 */
function buildConfig(dbBaseUrl: string | null, websiteUrl: string | null, selectors: Record<string, unknown>): CatalogScrapeConfig {
  const adapter = getAdapter(selectors.adapter as string | undefined);
  const defaults = ADAPTER_DEFAULTS[adapter.name] ?? ADAPTER_DEFAULTS.goodlabs!;
  // Strip a trailing slash so `${baseUrl}${path}` / `${baseUrl}/test/...` don't get a double slash.
  const base = (dbBaseUrl || websiteUrl || defaults.baseUrl).replace(/\/+$/, '');
  const apiBase = (selectors.apiBase as string) || defaults.apiBase;
  return {
    baseUrl: base,
    catalogPath: (selectors.catalogPath as string) || defaults.catalogPath,
    adapter,
    ...(apiBase ? { apiBase } : {}),
    rateLimitMs: 500,
    matchOptions: {
      matchPriority: defaults.matchPriority ?? ['quest', 'labcorp', 'name'],
      includePanels: false,
      flagAmbiguous: true,
      codeMatchAnyProvider: defaults.codeMatchAnyProvider ?? false,
      mergeCodeTiers: defaults.mergeCodeTiers ?? false,
      ...(typeof selectors.preferredProvider === 'string' ? { preferredProvider: selectors.preferredProvider } : {}),
    },
  };
}

export async function runVendorDiscovery(opts: DiscoveryOptions): Promise<DiscoverySummary> {
  const log = opts.onLog ?? (() => {});
  const vendor = await prisma.vendor.findUnique({ where: { id: opts.vendorId }, include: { scrapeConfig: true } });
  if (!vendor) throw new Error(`Vendor ${opts.vendorId} not found`);

  const selectors = (vendor.scrapeConfig?.selectors as Record<string, unknown> | null) ?? {};
  const cfg = buildConfig(vendor.scrapeConfig?.baseUrl ?? null, vendor.websiteUrl, selectors);

  const offerings = await prisma.offering.findMany({
    where: {
      vendorId: opts.vendorId,
      isActive: true,
      deletedAt: null,
      ...(opts.offeringIds ? { id: { in: opts.offeringIds } } : {}),
    },
    include: { test: { select: { id: true, name: true, questCode: true, labcorpCode: true } } },
  });
  log(`${offerings.length} active offering(s) to price`);

  const tests: TestKey[] = offerings.map((o) => ({
    id: o.test.id,
    name: o.test.name,
    questCode: o.test.questCode,
    labcorpCode: o.test.labcorpCode,
  }));
  const testToOffering = new Map(offerings.map((o) => [o.test.id, o]));

  // Resolve trust BEFORE creating this run — otherwise the in-progress (RUNNING, not-yet-succeeded)
  // run would count against the vendor's success rate and force a brand-new vendor to LOW.
  const trust = await getEffectiveTrust(opts.vendorId, vendor.trustOverride);
  const settings = await getScrapeSettings();

  const job = await prisma.scrapeJob.create({
    data: { vendorId: opts.vendorId, triggeredBy: opts.triggeredBy ?? 'MANUAL', status: 'RUNNING', startedAt: new Date() },
  });
  const run = await prisma.scrapeRun.create({
    data: { jobId: job.id, vendorId: opts.vendorId, status: 'RUNNING', startedAt: new Date() },
  });

  const started = Date.now();
  let matches: OfferingMatch[];
  let catalogProducts: CatalogProduct[] = [];
  try {
    const result = await discover(tests, { fetchHtml: opts.fetchHtml ?? httpFetchHtml(), onLog: log }, cfg, { narrow: !opts.exhaustive });
    matches = result.matches;
    catalogProducts = result.products;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.scrapeRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorsCount: 1, completedAt: new Date(), durationMs: Date.now() - started } });
    await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date(), errorMessage: message } });
    await prisma.scrapeError.create({ data: { runId: run.id, errorType: 'OTHER', message } });
    throw e;
  }

  const summary: DiscoverySummary = { runId: run.id, matched: 0, ambiguous: 0, unmatched: 0, staged: 0, autoApprovedStagedIds: [] };
  const fetchHtml = opts.fetchHtml ?? httpFetchHtml();
  const productsBySlug = new Map(catalogProducts.map((p) => [p.slug, p]));

  for (const { test, result: rawResult } of matches) {
    const offering = testToOffering.get(test.id)!;

    // Manual-URL override: if the admin pinned a product URL, price that exact product and trust it
    // over the automatic match — by looking its slug up in the fetched catalog (works for API vendors
    // like MitoHealth/DCL) or by fetching the page (page vendors GoodLabs/OYL). Covers BOTH
    // 'unmatched' (narrowing found nothing) and 'ambiguous' (narrowing found several candidates and
    // refused to guess) — a pinned URL is the admin resolving that ambiguity by hand, so it should
    // always win, not just when there were zero automatic candidates. (Bug: an ambiguous test like
    // Cortisol — two name-matched HealthLabs products at different prices — never got its pinned URL
    // consulted at all, staying stuck in the Change Queue even after the admin confirmed the right page.)
    let result = rawResult;
    if ((rawResult.status === 'unmatched' || rawResult.status === 'ambiguous') && offering.externalUrl) {
      const pinned = await priceFromPinnedUrl(offering.externalUrl, test, cfg, fetchHtml, productsBySlug).catch(() => null);
      if (pinned) {
        log(`  pinned URL priced ${test.name} → $${pinned.price}`);
        result = { status: 'matched', matchedBy: 'name', price: pinned.price, memberPrice: pinned.memberPrice, provider: pinned.provider, sourceUrl: pinned.sourceUrl, candidates: [], reason: `Priced from pinned URL` };
      }
    }

    if (result.status === 'unmatched') {
      summary.unmatched++;
      await prisma.scrapeResult.create({ data: { runId: run.id, testId: test.id, status: 'UNMATCHED', matchedOfferingId: offering.id } });
      continue;
    }

    if (result.status === 'ambiguous') {
      summary.ambiguous++;
      // Point the offering at the cheapest candidate's product page so the "verify" link resolves
      // somewhere useful (instead of the vendor homepage) while it awaits review.
      const cheapest = [...result.candidates].filter((c) => c.price != null).sort((a, b) => a.price! - b.price!)[0];
      if (cheapest?.url && cheapest.url !== offering.externalUrl) {
        await prisma.offering.update({ where: { id: offering.id }, data: { externalUrl: cheapest.url } });
      }
      const prices = result.candidates.map((c) => c.price).filter((p): p is number => p != null).sort((a, b) => a - b);
      const suggested = prices[0];
      await prisma.scrapeResult.create({
        data: { runId: run.id, testId: test.id, status: 'MATCHED', matchedOfferingId: offering.id, scrapedPrice: suggested != null ? new Decimal(suggested) : null },
      });
      if (suggested != null) {
        const note = `AMBIGUOUS (${result.candidates.length} candidates): ` +
          result.candidates.map((c) => `${c.productName} [${c.labProvider}] ${c.price != null ? '$' + c.price : '—'}${c.isPanel ? ' (panel)' : ''}`).join('; ');
        await prisma.stagedPriceChange.create({
          data: { offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: new Decimal(suggested), scrapedAt: new Date(), scrapeRunId: run.id, status: 'PENDING', reviewNote: note.slice(0, 1000) },
        });
        summary.staged++;
      }
      continue;
    }

    // matched
    summary.matched++;
    // Store the product URL + member price (secondary info, updated live — not subject to the Change
    // Queue, which governs only the compared non-member currentPrice).
    const offeringUpdate: Record<string, unknown> = {};
    if (result.sourceUrl && result.sourceUrl !== offering.externalUrl) offeringUpdate.externalUrl = result.sourceUrl;
    if (result.memberPrice != null) offeringUpdate.memberPrice = new Decimal(result.memberPrice);
    if (Object.keys(offeringUpdate).length > 0) {
      await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
    }
    const price = new Decimal(result.price!);
    const priceChanged = !offering.currentPrice || !price.equals(offering.currentPrice);
    await prisma.scrapeResult.create({
      data: { runId: run.id, testId: test.id, status: priceChanged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: price },
    });
    if (priceChanged) {
      const autoApprove = shouldAutoApprove(offering.currentPrice, price, trust, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
      const staged = await prisma.stagedPriceChange.create({
        data: {
          offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: price, scrapedAt: new Date(),
          scrapeRunId: run.id, status: autoApprove ? 'AUTO_APPROVED' : 'PENDING',
          reviewNote: `Matched by ${result.matchedBy} → ${result.provider} @ ${result.sourceUrl}`,
        },
      });
      summary.staged++;
      if (autoApprove) summary.autoApprovedStagedIds.push(staged.id);
    }
  }

  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status: 'SUCCESS', testsFound: matches.length, pricesUpdated: summary.matched, pricesUnchanged: 0,
      errorsCount: 0, durationMs: Date.now() - started, completedAt: new Date(),
    },
  });
  await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

  log(`done: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.staged} staged`);
  return summary;
}

/**
 * Price a test from an admin-pinned product URL (page-based adapters only). Fetches the page, parses
 * it with the vendor adapter, and returns the cheapest non-panel provider. Returns null if the vendor
 * is an API adapter (no per-product page) or the page can't be priced.
 */
async function priceFromPinnedUrl(
  url: string,
  test: TestKey,
  cfg: CatalogScrapeConfig,
  fetchHtml: (u: string) => Promise<string>,
  productsBySlug: Map<string, CatalogProduct>,
): Promise<{ price: number; memberPrice: number | null; sourceUrl: string; provider: string } | null> {
  const slug = (url.split(/[?#]/)[0] ?? url).split('/').filter(Boolean).pop();
  // 1. Look the slug up in the fetched catalog (API vendors fetch the whole catalog, so it's there).
  let product = slug ? productsBySlug.get(slug) : undefined;
  // 2. Page vendors: the narrowed crawl may not have fetched it — get the page directly.
  if (!product && cfg.adapter?.parseProduct) {
    const html = await fetchHtml(url);
    product = cfg.adapter.parseProduct(html, cfg.baseUrl, slug) ?? undefined;
  }
  if (!product) return null;

  // Prefer the code/name match on the pinned product — this picks the RIGHT provider (e.g. our Quest
  // code → the Quest variant), not just the cheapest. Fall back to the cheapest non-panel provider
  // when nothing matches (the admin pinned this URL, so trust it).
  const m = matchTestToProducts(test, [product], cfg.matchOptions);
  if (m.status === 'matched' && m.price != null) {
    return { price: m.price, memberPrice: m.memberPrice ?? null, sourceUrl: m.sourceUrl ?? product.url, provider: m.provider ?? '' };
  }
  const best = product.providers
    .filter((p) => !p.isPanel && p.price != null)
    .sort((a, b) => a.price! - b.price!)[0];
  if (!best) return null;
  return { price: best.price!, memberPrice: best.memberPrice ?? null, sourceUrl: product.url || url, provider: best.labProvider };
}

/** Same trust-modulated auto-approve rules as scrape-execute (BR-6..BR-9). */
function shouldAutoApprove(oldPrice: Prisma.Decimal | null, newPrice: Prisma.Decimal, trust: TrustLevel, baseDecrease: number, baseIncrease: number): boolean {
  if (trust === 'LOW') return false;
  if (!oldPrice) return true;
  const old = oldPrice.toNumber();
  const nw = newPrice.toNumber();
  if (old === 0) return true;
  const changePercent = ((nw - old) / old) * 100;
  const factor = trust === 'HIGH' ? 1.5 : 1;
  if (changePercent < 0 && Math.abs(changePercent) <= baseDecrease * factor) return true;
  if (changePercent > 0 && changePercent <= baseIncrease * factor) return true;
  return false;
}

/** Publish one approved/auto-approved staged change to the live offering. */
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  const staged = await prisma.stagedPriceChange.findUnique({ where: { id: stagedChangeId } });
  if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;
  await prisma.offering.update({
    where: { id: staged.offeringId },
    data: { previousPrice: staged.oldPrice, currentPrice: staged.newPrice, priceUpdatedAt: new Date() },
  });
  await prisma.priceHistory.create({
    data: { offeringId: staged.offeringId, oldPrice: staged.oldPrice, newPrice: staged.newPrice, observedAt: staged.scrapedAt, source: 'SCRAPE', scrapeRunId: staged.scrapeRunId },
  });
  await prisma.stagedPriceChange.update({ where: { id: stagedChangeId }, data: { reviewedAt: new Date() } });
  return true;
}
