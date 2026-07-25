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
import { JASONHEALTH_ALGOLIA_HEADERS } from './jasonhealth-parser';
import { matchTestToProducts, nameMatches, normalizeName, sharesStrongToken, testNames } from './matcher';
import type { CatalogEntry, CatalogProduct, MatchTier, TestKey } from './types';

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
  {
    baseUrl: string;
    catalogPath: string;
    apiBase?: string;
    matchPriority?: MatchTier[];
    codeMatchAnyProvider?: boolean;
    mergeCodeTiers?: boolean;
    extraHeaders?: Record<string, string>;
    /**
     * Documentation-only flag (not consumed here): this vendor is gated behind a JS challenge a plain
     * `fetch()` can't clear, so `runVendorDiscovery` callers must pass `opts.fetchHtml:
     * browserFetchHtml()` (`catalog/browser-fetch.ts`) explicitly — inline "Scrape now" in the web app
     * defaults to plain HTTP and will fail for this vendor until that's wired up.
     */
    needsBrowser?: boolean;
  }
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
  // No lab order codes anywhere on this vendor's site at all (checked live) — name-only, like
  // MitoHealth. The catalog is paginated via an AJAX endpoint (same URL, `page=N`) that only returns
  // JSON instead of a full HTML page when this header is present — no browser needed, just one header.
  privatemdlabs: {
    baseUrl: 'https://www.privatemdlabs.com',
    catalogPath: '/tests?view=all',
    matchPriority: ['name'],
    extraHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
  },
  // Cloudflare JS-challenges every path except the homepage — see `needsBrowser` above. Otherwise a
  // standard GoodLabs-shaped vendor: each product page has per-lab price + labelled Test Code.
  requestatest: { baseUrl: 'https://requestatest.com', catalogPath: '/tests', needsBrowser: true },
  // API vendor: the Angular SPA store needs JS to render, but its underlying JSON API (categoryID-
  // scoped, no "list all" endpoint — see directlabs-parser.ts) is plain, ungated HTTP. No lab codes
  // anywhere → name-only, like MitoHealth/Private MD Labs.
  directlabs: { baseUrl: 'https://directlabs.com', catalogPath: '', apiBase: 'https://store.directlabs.com', matchPriority: ['name'] },
  // Magento store, plain HTTP. Lab codes are opportunistic (only some product pages link out to
  // labcorp.com/tests/<code>/...), so name is still in the priority list as a fallback.
  discountedlabs: { baseUrl: 'https://www.discountedlabs.com', catalogPath: '/choose-a-test' },
  // Dedicated product-only sitemap (single flat fetch, no pagination). The WooCommerce SKU literally
  // encodes "<Lab>_<code>", explicitly labelled per product — strict per-lab tiers, no
  // codeMatchAnyProvider needed.
  // needsBrowser (2026-07-19): plain HTTP worked from residential IPs, but from Railway's datacenter
  // IP the WAF 403s even the sitemap — the stealth browser fetch clears it like a real visitor.
  truehealthlabs: { baseUrl: 'https://truehealthlabs.com', catalogPath: '/product-sitemap.xml', needsBrowser: true },
  // Quest's own first-party store (Salesforce Commerce Cloud). Sitemap embeds the Quest order code
  // directly in the URL; every product is Quest-fulfilled by definition.
  questhealth: { baseUrl: 'https://www.questhealth.com', catalogPath: '/sitemap_0.xml' },
  // LabCorp's own first-party store (Adobe Experience Manager). Sitemap lists every /lab-tests/<slug>
  // page; each page's own `data-isbundleproduct` flag tells us panels explicitly (a real vendor-
  // supplied signal, unlike most other name-only-matching vendors this session).
  labcorpondemand: { baseUrl: 'https://www.ondemand.labcorp.com', catalogPath: '/sitemap.xml' },
  // Shopify store. sitemap.xml is an INDEX, not flat — catalogPath points straight at the products
  // sub-sitemap (its from/to id range only shifts as the catalog grows). Best code exposure of any
  // vendor: the product page's own JSON-LD `mpn` field IS the Quest code directly.
  marekdiagnostics: {
    baseUrl: 'https://marekdiagnostics.com',
    catalogPath: '/sitemap_products_1.xml?from=8117663924498&to=10338644590866',
    matchPriority: ['quest', 'name'],
  },
  // API vendor (Algolia search, public referer-restricted key embedded in the page — see
  // jasonhealth-parser.ts). Every url_code IS the Quest order code; no LabCorp codes exposed.
  jasonhealth: {
    baseUrl: 'https://www.jasonhealth.com',
    catalogPath: '',
    apiBase: 'https://76U86Z1DD2-dsn.algolia.net/1/indexes/production_store_panels',
    matchPriority: ['quest', 'name'],
    extraHeaders: JASONHEALTH_ALGOLIA_HEADERS, // the search-only key 403s without the referer header.
  },
  // WordPress, sitemap.xml is small/inconsistent (see drsays-parser.ts) — real coverage here is
  // deliberately partial. matchPriority is LabCorp-code-ONLY, no name fallback: found live that this
  // vendor's own LabCorp code for "Cortisol" and "Vitamin B12" don't match our stored codes for those
  // same-named tests (a real variant discrepancy) — a name fallback would have silently matched the
  // wrong price. An exact code miss becomes an honest unmatched instead.
  drsays: { baseUrl: 'https://www.drsays.com', catalogPath: '/sitemap.xml', matchPriority: ['labcorp'] },
};

/**
 * True for adapters that are JS-challenge-gated and need `browserFetchHtml` instead of plain HTTP
 * (currently just Request A Test). Callers that can import Playwright (the web app's Node API routes,
 * worker scripts) use this to decide whether to pass `opts.fetchHtml: browserFetchHtml()` — this module
 * itself stays Playwright-free so it's still safe to deep-import from anywhere.
 */
export function adapterNeedsBrowser(adapterName: string | null | undefined): boolean {
  return !!ADAPTER_DEFAULTS[getAdapter(adapterName ?? undefined).name]?.needsBrowser;
}

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
    ...(defaults.extraHeaders ? { extraHeaders: defaults.extraHeaders } : {}),
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
    include: {
      test: {
        select: { id: true, name: true, questCode: true, labcorpCode: true, aliases: { select: { alias: true } } },
      },
    },
  });
  log(`${offerings.length} active offering(s) to price`);

  const tests: TestKey[] = offerings.map((o) => ({
    id: o.test.id,
    name: o.test.name,
    questCode: o.test.questCode,
    labcorpCode: o.test.labcorpCode,
    aliases: o.test.aliases.map((a) => a.alias),
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
  let catalogEntries: CatalogEntry[] = [];
  try {
    const result = await discover(tests, { fetchHtml: opts.fetchHtml ?? httpFetchHtml(45_000, cfg.extraHeaders), onLog: log }, cfg, { narrow: !opts.exhaustive });
    matches = result.matches;
    catalogProducts = result.products;
    catalogEntries = result.entries;
    // A real catalog is never empty — 0 products means the crawl was silently blocked (an
    // unresolved WAF challenge page parses as "no products") or the site layout changed. Treat it
    // as a FAILED run so it alerts/digests as a failure instead of masquerading as a successful
    // scrape that matched nothing.
    if (catalogProducts.length === 0) {
      throw new Error(`catalog crawl returned 0 products for ${vendor.name} — likely blocked (WAF/challenge page) or the site layout changed`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.scrapeRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorsCount: 1, completedAt: new Date(), durationMs: Date.now() - started } });
    await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date(), errorMessage: message } });
    await prisma.scrapeError.create({ data: { runId: run.id, errorType: 'OTHER', message } });
    throw e;
  }

  const summary: DiscoverySummary = { runId: run.id, matched: 0, ambiguous: 0, unmatched: 0, staged: 0, autoApprovedStagedIds: [] };
  let pricesChanged = 0; // matched AND price moved — the true "updated" count for the run record
  const fetchHtml = opts.fetchHtml ?? httpFetchHtml(45_000, cfg.extraHeaders);
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
    // Queue, which governs only the compared non-member currentPrice). lastCheckedAt is stamped on
    // EVERY match — an unchanged price is still a verified price, and the site's "checked N ago"
    // freshness reads it (priceUpdatedAt only moves on a change).
    // labProvider/altLab* are set unconditionally (not `if present`, unlike externalUrl/memberPrice
    // above) so a lab that stops carrying this test clears its stale alt price next scrape instead
    // of leaving a phantom "also available at $X" forever.
    const offeringUpdate: Record<string, unknown> = {
      lastCheckedAt: new Date(),
      labProvider: result.provider ?? null,
      altLabPrice: result.altPrice != null ? new Decimal(result.altPrice) : null,
      altLabProvider: result.altProvider ?? null,
    };
    if (result.sourceUrl && result.sourceUrl !== offering.externalUrl) offeringUpdate.externalUrl = result.sourceUrl;
    if (result.memberPrice != null) offeringUpdate.memberPrice = new Decimal(result.memberPrice);
    await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
    const price = new Decimal(result.price!);
    const priceChanged = !offering.currentPrice || !price.equals(offering.currentPrice);
    await prisma.scrapeResult.create({
      data: { runId: run.id, testId: test.id, status: priceChanged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: price },
    });
    if (priceChanged) {
      pricesChanged++;
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

  // pricesUpdated = prices that actually CHANGED (staged for publish), not matches — recording
  // summary.matched here made every run look like a mass update when most prices were merely
  // re-verified unchanged (misled the 2026-07-19 staleness investigation).
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status: 'SUCCESS', testsFound: matches.length, pricesUpdated: pricesChanged, pricesUnchanged: summary.matched - pricesChanged,
      errorsCount: 0, durationMs: Date.now() - started, completedAt: new Date(),
    },
  });
  await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

  // Ingest layer: persist EVERYTHING this crawl saw (not just what priced our offerings) into
  // VendorProduct. Non-fatal on purpose — a failed ingest must not turn a successful pricing run
  // into a failed one (it would wrongly ding vendor trust).
  try {
    const ingested = await ingestVendorProducts(opts.vendorId, catalogEntries, catalogProducts, matches, cfg.matchOptions?.codeMatchAnyProvider ?? false);
    log(`ingest: ${ingested.upserted} product(s) recorded, ${ingested.autoMatched} auto-matched`);
  } catch (e) {
    log(`ingest failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }

  log(`done: ${summary.matched} matched, ${summary.ambiguous} ambiguous, ${summary.unmatched} unmatched, ${summary.staged} staged`);
  return summary;
}

// Name-only heuristic for entries whose detail page wasn't fetched (narrow crawls): vendors' own
// isPanel flag is authoritative when we have it; otherwise a bundle-ish word in the name is the
// best available signal. Panels are excluded from matching/clustering (decision 2026-07-20).
const PANEL_NAME_RE = /\b(panel|profile|package|bundle|check\s?-?up|checkup|kit)\b/i;

/**
 * Persist every product this crawl saw into the VendorProduct ingest layer, and auto-match the
 * unmatched ones under STRICT rules: an exact Quest/LabCorp code hit (guarded by a shared
 * distinctive name token, same as pricing) or an exact normalized name/alias hit auto-links;
 * anything fuzzier only sets `suggestedTestId` for the /admin/discovered review queue.
 * Admin decisions are never overwritten: rows already MATCHED or IGNORED only get freshness/detail
 * updates. Matching a product here does NOT create an offering — listing is a review-UI action.
 */
async function ingestVendorProducts(
  vendorId: string,
  entries: CatalogEntry[],
  products: CatalogProduct[],
  matches: OfferingMatch[],
  codeMatchAnyProvider = false,
): Promise<{ upserted: number; autoMatched: number }> {
  type Detail = {
    name: string;
    url: string | null;
    price: number | null;
    labProvider: string | null;
    questCode: string | null;
    labcorpCode: string | null;
    // Populated instead of questCode/labcorpCode for codeMatchAnyProvider vendors, whose per-provider
    // `labProvider` label can't be trusted to say which lab a code actually belongs to (HealthLabs/
    // Walk-In Lab hardcode 'quest', OYL hardcodes 'labcorp' for genuinely unlabelled codes — the same
    // reason the pricing matcher uses codeMatchAnyProvider for these vendors). Checked against BOTH
    // byQuest/byLabcorp in autoMatch, mirroring matcher.ts's array-membership (not label) semantics.
    anyProviderCodes: string[];
    isPanel: boolean;
    hasDetail: boolean;
  };

  // Merge full product detail over listing entries (a slug can appear in both; detail wins).
  const bySlug = new Map<string, Detail>();
  for (const e of entries) {
    bySlug.set(e.slug, {
      name: e.name, url: e.url || null, price: null, labProvider: null,
      questCode: null, labcorpCode: null, anyProviderCodes: [], isPanel: PANEL_NAME_RE.test(e.name), hasDetail: false,
    });
  }
  for (const p of products) {
    const nonPanel = p.providers.filter((pr) => !pr.isPanel);
    const cheapest = [...nonPanel].filter((pr) => pr.price != null).sort((a, b) => a.price! - b.price!)[0];
    const codeOf = (lab: string) => p.providers.find((pr) => pr.labProvider === lab)?.labTestIDs[0] ?? null;
    bySlug.set(p.slug, {
      name: p.name,
      url: p.url || null,
      price: cheapest?.price ?? null,
      labProvider: cheapest?.labProvider ?? null,
      questCode: codeMatchAnyProvider ? null : codeOf('quest'),
      labcorpCode: codeMatchAnyProvider ? null : codeOf('labcorp'),
      anyProviderCodes: codeMatchAnyProvider
        ? [...new Set(nonPanel.flatMap((pr) => pr.labTestIDs))]
        : [],
      // A product whose every provider is a bundle is a panel; a mixed product is orderable singly.
      isPanel: p.providers.length > 0 && p.providers.every((pr) => pr.isPanel),
      hasDetail: true,
    });
  }
  if (bySlug.size === 0) return { upserted: 0, autoMatched: 0 };

  // Products that priced one of our offerings this run are matched by definition (the offering IS
  // the confirmed vendor↔test relationship). Resolved via sourceUrl → slug — but ONLY when a URL
  // uniquely identifies a product. API vendors (Dirt Cheap Labs) give every product the SAME url
  // (`/alacarte`), so a URL→slug map would collapse to one arbitrary slug and misattribute every
  // offering match to it (found in review: "hs-CRP" mislabelled as Ferritin). For those vendors
  // the strict code/name auto-match below already matches the same products correctly, so skipping
  // the ambiguous URL attribution loses nothing but the (redundant) 'offering' label.
  const slugsByUrl = new Map<string, string[]>();
  for (const p of products) if (p.url) slugsByUrl.set(p.url, [...(slugsByUrl.get(p.url) ?? []), p.slug]);
  const offeringMatchBySlug = new Map<string, string>(); // slug → testId
  for (const m of matches) {
    if (m.result.status === 'matched' && m.result.sourceUrl) {
      const slugs = slugsByUrl.get(m.result.sourceUrl);
      if (slugs && slugs.length === 1) offeringMatchBySlug.set(slugs[0]!, m.test.id);
    }
  }

  // Canonical tests + aliases, indexed for strict auto-match and fuzzy suggestion.
  const allTests = await prisma.test.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, questCode: true, labcorpCode: true, aliases: { select: { alias: true } } },
  });
  const keys: TestKey[] = allTests.map((t) => ({
    id: t.id, name: t.name, questCode: t.questCode, labcorpCode: t.labcorpCode, aliases: t.aliases.map((a) => a.alias),
  }));
  const byQuest = new Map<string, TestKey[]>();
  const byLabcorp = new Map<string, TestKey[]>();
  const byNorm = new Map<string, { id: string; via: 'exact-name' | 'alias' }>();
  for (const t of keys) {
    if (t.questCode) byQuest.set(t.questCode, [...(byQuest.get(t.questCode) ?? []), t]);
    if (t.labcorpCode) byLabcorp.set(t.labcorpCode, [...(byLabcorp.get(t.labcorpCode) ?? []), t]);
    const norm = normalizeName(t.name);
    if (norm && !byNorm.has(norm)) byNorm.set(norm, { id: t.id, via: 'exact-name' });
    for (const a of t.aliases ?? []) {
      const na = normalizeName(a);
      if (na && !byNorm.has(na)) byNorm.set(na, { id: t.id, via: 'alias' });
    }
  }

  const autoMatch = (d: Detail): { testId: string; matchedBy: string } | { suggestedTestId: string } | null => {
    if (d.isPanel) return null; // panels never match or suggest (product decision)
    // 1. Exact code, guarded by a shared distinctive token (codes can be stale/wrong — same guard
    //    the pricing matcher uses). Ambiguous code (2+ plausible tests) → no auto-link.
    for (const [code, map, label] of [
      [d.questCode, byQuest, 'quest-code'],
      [d.labcorpCode, byLabcorp, 'labcorp-code'],
    ] as const) {
      if (!code) continue;
      const hits = (map.get(code) ?? []).filter((t) => testNames(t).some((n) => sharesStrongToken(n, d.name)));
      if (hits.length === 1) return { testId: hits[0]!.id, matchedBy: label };
    }
    // 1b. codeMatchAnyProvider vendors: the label can't be trusted, so check every code this product
    //     carries against BOTH our Quest and LabCorp codes (mirrors matcher.ts's array-membership
    //     check rather than a label lookup). Ambiguous (2+ plausible tests) → no auto-link.
    if (d.anyProviderCodes.length > 0) {
      const hits = new Map<string, TestKey>();
      for (const code of d.anyProviderCodes) {
        for (const t of [...(byQuest.get(code) ?? []), ...(byLabcorp.get(code) ?? [])]) {
          if (testNames(t).some((n) => sharesStrongToken(n, d.name))) hits.set(t.id, t);
        }
      }
      if (hits.size === 1) {
        const only = [...hits.values()][0]!;
        return { testId: only.id, matchedBy: 'any-code' };
      }
    }
    // 2. Exact normalized name/alias.
    const norm = byNorm.get(normalizeName(d.name));
    if (norm) return { testId: norm.id, matchedBy: norm.via };
    // 3. Fuzzy (token subset + distinctive token) → suggestion only, strict mode.
    const fuzzy = keys.find((t) => testNames(t).some((n) => nameMatches(n, d.name) && sharesStrongToken(n, d.name)));
    return fuzzy ? { suggestedTestId: fuzzy.id } : null;
  };

  const existing = await prisma.vendorProduct.findMany({
    where: { vendorId, slug: { in: [...bySlug.keys()] } },
    select: { id: true, slug: true, status: true },
  });
  const existingBySlug = new Map(existing.map((r) => [r.slug, r]));

  const now = new Date();
  let upserted = 0;
  let autoMatched = 0;
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const [slug, d] of bySlug) {
    const offeringTestId = offeringMatchBySlug.get(slug);
    const prior = existingBySlug.get(slug);
    // Only UNMATCHED (or new) rows get (re)matched — MATCHED/IGNORED are admin-owned state.
    const decideMatch = () => {
      if (offeringTestId) return { status: 'MATCHED' as const, testId: offeringTestId, matchedBy: 'offering', suggestedTestId: null };
      const m = autoMatch(d);
      if (m && 'testId' in m) { autoMatched++; return { status: 'MATCHED' as const, testId: m.testId, matchedBy: m.matchedBy, suggestedTestId: null }; }
      return { status: 'UNMATCHED' as const, testId: null, matchedBy: null, suggestedTestId: m && 'suggestedTestId' in m ? m.suggestedTestId : null };
    };

    // Detail-less rows (narrow crawl skipped the page) must not null out previously-seen detail.
    const detailFields = d.hasDetail
      ? { price: d.price != null ? new Decimal(d.price) : null, labProvider: d.labProvider, questCode: d.questCode, labcorpCode: d.labcorpCode, isPanel: d.isPanel }
      : {};

    if (!prior) {
      const match = decideMatch();
      ops.push(prisma.vendorProduct.create({
        data: {
          vendorId, slug, name: d.name, normalizedName: normalizeName(d.name), url: d.url,
          ...(d.hasDetail ? detailFields : { isPanel: d.isPanel }),
          ...match, firstSeenAt: now, lastSeenAt: now,
        },
      }));
    } else {
      const match = prior.status === 'UNMATCHED' ? decideMatch() : {};
      ops.push(prisma.vendorProduct.update({
        where: { id: prior.id },
        data: { name: d.name, normalizedName: normalizeName(d.name), url: d.url, ...detailFields, ...match, lastSeenAt: now },
      }));
    }
    upserted++;
  }

  // Chunked so a 1,200-product vendor doesn't build one giant transaction.
  for (let i = 0; i < ops.length; i += 100) await prisma.$transaction(ops.slice(i, i + 100));
  return { upserted, autoMatched };
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

/** Publish one approved/auto-approved staged change to the live offering. Single choke point for
 * every publish path (worker queue, inline "Scrape now", the local CF-blocked-vendor script) — the
 * `price_published` audit-log write used to live only in the worker's `scrape-publish` job, so any
 * inline/local publish silently skipped it and the admin dashboard's "Recent Activity" feed went
 * stale even though prices were updating fine (caught 2026-07-19). Keep publish logic here, not
 * duplicated per-caller, so this can't drift out of sync again. */
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const staged = await tx.stagedPriceChange.findUnique({ where: { id: stagedChangeId } });
    if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;

    // Claim the row atomically (status filter in the WHERE, not just the read above) so two
    // concurrent publish calls for the same staged change can't both pass the check and double-write
    // price history / the audit log.
    const claimed = await tx.stagedPriceChange.updateMany({
      where: { id: stagedChangeId, status: staged.status },
      data: { reviewedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    await tx.offering.update({
      where: { id: staged.offeringId },
      data: { previousPrice: staged.oldPrice, currentPrice: staged.newPrice, priceUpdatedAt: new Date(), lastCheckedAt: new Date() },
    });
    await tx.priceHistory.create({
      data: { offeringId: staged.offeringId, oldPrice: staged.oldPrice, newPrice: staged.newPrice, observedAt: staged.scrapedAt, source: 'SCRAPE', scrapeRunId: staged.scrapeRunId },
    });
    await tx.auditLog.create({
      data: {
        action: 'price_published',
        entityType: 'offering',
        entityId: staged.offeringId,
        oldValues: { price: staged.oldPrice?.toString() ?? null },
        newValues: { price: staged.newPrice.toString() },
      },
    });
    return true;
  });
}
