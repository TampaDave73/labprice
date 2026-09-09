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
//               mergeCodeTiers vendors (Dirt Cheap Labs today) instead stage EACH lab (Quest/LabCorp)
//               as its own independent StagedPriceChange — see the isMergeCodeTiers branch inside the
//               matched case below; the derived currentPrice/labProvider ranking across both labs is
//               recomputed by publishStagedChange (or immediately, on a lab dropping out entirely).
//   ambiguous → ScrapeResult(MATCHED, no price); stage the LOWEST candidate as PENDING (never auto-
//               approved) with a reviewNote listing every candidate → lands in the Change Queue.
//   unmatched → ScrapeResult(UNMATCHED); nothing staged.
import { prisma, Prisma, getEffectiveTrust, getScrapeSettings, type TrustLevel } from '@labprice/database';
import { discover, httpFetchHtml, type CatalogScrapeConfig, type OfferingMatch } from './catalog-scraper';
import { getAdapter } from './adapters';
import { JASONHEALTH_ALGOLIA_HEADERS } from './jasonhealth-parser';
import { matchTestToProducts, nameMatches, normalizeLabCode, normalizeName, sharesStrongToken, testNames } from './matcher';
import { rankDualLabPrices } from './dual-lab-pricing';
import type { CatalogEntry, CatalogProduct, MatchTier, TestKey } from './types';

const Decimal = Prisma.Decimal;

export interface DiscoveryOptions {
  vendorId: string;
  triggeredBy?: 'SCHEDULE' | 'MANUAL' | 'RETRY';
  /** Only rediscover these offering ids (used by add-test). Omit = all active offerings. */
  offeringIds?: string[];
  /** Fetch every catalog page instead of just name-matches (exhaustive; default false = narrow). */
  exhaustive?: boolean;
  /**
   * Narrow the crawl using EVERY live test (name + confirmed aliases) rather than only the tests
   * linked to this vendor's existing offerings — for a freshly-reseeded catalog where no offerings
   * exist yet, so narrowing by "tests with offerings" would narrow to nothing and force a full crawl.
   * Does NOT change what gets matched/staged — that's still driven by this vendor's own offerings.
   * If `exhaustive` is also set, `exhaustive` wins (see below) — narrowing is only an optimization,
   * so the safer/more-complete behavior takes precedence over the cheaper one.
   */
  narrowToAllTests?: boolean;
  /**
   * Skip the catalog crawl entirely and price ONLY offerings with `urlPinned: true` (each fetched
   * directly via its own `externalUrl`, page-based adapters only). For a vendor whose catalog listing
   * is itself blocked (Request A Test's `/tests` is Cloudflare-JS-challenged from Railway's datacenter
   * IP, confirmed live 2026-09-09 — works fine from a residential IP, so this is meant to be run from
   * one), the normal crawl fails outright before any pinned URL ever gets a chance, even though pricing
   * a pinned URL never needed the catalog listing in the first place (see `priceFromPinnedUrl`). Every
   * other offering (no pin) is left untouched, not reported as unmatched.
   */
  pinnedOnly?: boolean;
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
  // AlgoRx: whole catalog on one server-rendered page (RSC flight payload). Publishes NO lab order
  // codes anywhere, so name-only matching — and with nothing to corroborate a name, loose matches are
  // real (measured live: "Vitamin D, 25-Hydroxy" matches "Vitamin B12", "Arsenic Blood Test" matches
  // "Phosphate"). This vendor is therefore INGEST-ONLY: crawl it to populate VendorProduct, then
  // promote genuine matches by hand in /admin/discovered. Don't bulk-auto-link its offerings.
  algorx: { baseUrl: 'https://algorx.com', catalogPath: '/biomarkers', matchPriority: ['name'] },
  // Anabolic Insights prices the SAME test at up to three labs (Quest/LabCorp/Bioreference), each with
  // its own order code — so mergeCodeTiers (cheapest code-matching lab wins, the other shows as the
  // secondary price), exactly like Dirt Cheap Labs. `catalogPath` is the human catalog page; the data
  // itself comes from `apiBase` (the page's own HTML is a client-rendered shell with no prices in it).
  anabolicinsights: {
    baseUrl: 'https://www.anabolicinsights.ai',
    catalogPath: '/labs/panels/biomarkers',
    apiBase: 'https://api.anabolicinsights.ai',
    mergeCodeTiers: true,
  },
  // Walk-In Lab exposes BOTH lab codes together on one product; Personalabs labels the provider
  // directly per product, so it uses strict per-lab tiers (no codeMatchAnyProvider).
  walkinlab: { baseUrl: 'https://www.walkinlab.com', catalogPath: '/categories/view/all-products', codeMatchAnyProvider: true },
  // needsBrowser (2026-07-26): the displayed price is NOT the WooCommerce product price — a
  // "Discount Rules for WooCommerce" plugin (woo-discount-rules) recalculates it client-side via an
  // AJAX call (admin-ajax.php?action=awdr_get_product_discount, nonce-protected) and rewrites the DOM
  // after load. Confirmed live on the Copper listing: plain HTTP (and even the page's own Yoast/
  // WooCommerce Product JSON-LD, which is server-rendered) both report the pre-discount $122, while
  // the page actually shows $79.30 struck through against "Reg. $122" once JS runs. Replaying the
  // AJAX call directly (matching cookies + a freshly-scraped nonce) still 400s ("Invalid token") —
  // it's tied to a live browser session, not just a static token — so a real headless browser (which
  // lets the plugin's own JS compute and render the true price) is the only reliable fix, same
  // mechanism already used for Request A Test/True Health Labs above.
  personalabs: { baseUrl: 'https://www.personalabs.com', catalogPath: '/products/all-test/', needsBrowser: true },
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
  // fetchAll: WooCommerce's own public Store API (`/wp-json/wc/store/v1/products`, paginated) — see
  // truehealthlabs-parser.ts's module comment. Switched 2026-09-09 from a product-sitemap.xml catalog
  // page: that sitemap turned out to list well under 200 of the site's real ~1,900 products. The `sku`
  // field literally encodes "<Lab>_<code>", explicitly labelled per product — strict per-lab tiers, no
  // codeMatchAnyProvider needed.
  // needsBrowser: true RE-ADDED 2026-09-09 (was removed 2026-07-08, then this vendor moved to the
  // Store API entirely — see above). Cloudflare started 403-ing the Store API from Railway's datacenter
  // IP; verified from inside the scrape-worker container per the old comment's own advice before
  // re-adding the flag (plain fetch: 403 + "Just a moment..."; the stealth browser path other vendors
  // already use: clears it fine, 1.5MB of real JSON). `browser-fetch.ts` needed a JSON-viewer unwrap
  // (Chromium wraps a raw JSON response in a lone `<pre>`) — see its module comment.
  truehealthlabs: { baseUrl: 'https://truehealthlabs.com', catalogPath: '/wp-json/wc/store/v1/products', needsBrowser: true },
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
      ...(opts.pinnedOnly ? { urlPinned: true, externalUrl: { not: null } } : {}),
    },
    include: {
      test: {
        select: { id: true, name: true, questCode: true, labcorpCode: true, confidence: true, aliases: { select: { alias: true } } },
      },
    },
  });
  log(`${offerings.length} ${opts.pinnedOnly ? 'pinned' : 'active'} offering(s) to price`);

  const tests: TestKey[] = offerings.map((o) => ({
    id: o.test.id,
    name: o.test.name,
    questCode: o.test.questCode,
    labcorpCode: o.test.labcorpCode,
    aliases: o.test.aliases.map((a) => a.alias),
    confidence: o.test.confidence,
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

  // narrowToAllTests: load every live test (not just this vendor's own offerings) to narrow the
  // crawl against — see DiscoveryOptions.narrowToAllTests. Same TestKey shape the offerings query
  // above builds, so the name tier/alias matching behaves identically either way. Skipped entirely
  // when `exhaustive` is set: exhaustive already ignores narrowing, so this query would be wasted.
  let narrowTests: TestKey[] | undefined;
  if (opts.narrowToAllTests && !opts.exhaustive) {
    const allLiveTests = await prisma.test.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, questCode: true, labcorpCode: true, confidence: true, aliases: { select: { alias: true } } },
    });
    narrowTests = allLiveTests.map((t) => ({
      id: t.id,
      name: t.name,
      questCode: t.questCode,
      labcorpCode: t.labcorpCode,
      aliases: t.aliases.map((a) => a.alias),
      confidence: t.confidence,
    }));
  }

  const started = Date.now();
  let matches: OfferingMatch[];
  let catalogProducts: CatalogProduct[] = [];
  let catalogEntries: CatalogEntry[] = [];
  try {
    if (opts.pinnedOnly) {
      // No catalog crawl at all — every offering here is already `urlPinned` (see the query above), so
      // seed `matches` with a placeholder 'unmatched' result per test. The per-test loop below tries
      // the pin whenever `offering.urlPinned` is true regardless of this status (see its own comment),
      // fetching each pinned URL directly — exactly what a page-based adapter's `priceFromPinnedUrl`
      // already does without ever touching the catalog listing.
      matches = tests.map((test) => ({
        test,
        result: { status: 'unmatched', matchedBy: null, price: null, provider: null, sourceUrl: null, candidates: [], reason: 'pinnedOnly run' },
      }));
    } else {
      // exhaustive wins over narrowToAllTests if both are somehow passed (see DiscoveryOptions doc) —
      // `narrow: !opts.exhaustive` already forces a full crawl in that case, so narrowTests is simply
      // unused (and left undefined above, since we skip loading it when exhaustive is set).
      const result = await discover(
        tests,
        { fetchHtml: opts.fetchHtml ?? httpFetchHtml(45_000, cfg.extraHeaders), onLog: log },
        cfg,
        { narrow: !opts.exhaustive, narrowTests },
      );
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

    // Manual-URL override: if the admin pinned a product URL (Offering.urlPinned — set by the admin
    // PATCH/import routes, NOT by the scraper's own auto-cache of "last matched product" in the same
    // externalUrl field), price that exact product and trust it over the automatic match — ALWAYS, not
    // just when the automatic match failed. Regression found live 2026-09-09: MitoHealth's Testosterone,
    // Free (Calculation) kept reverting to a pinned testosterone-total no matter how many times the
    // admin re-pinned testosterone-free, because urlPinned didn't exist yet and this only consulted the
    // pin when rawResult was unmatched/ambiguous — a *confident* automatic match (routine on a name-only
    // vendor: an alias like "Testosterone, Free+Total LC/MS" token-subset-matches a plain "Total"
    // product) silently overwrote the pin every run at line ~370 below, despite this block's own
    // original comment already promising to "trust it over the automatic match" unconditionally.
    // Un-pinned offerings keep the old behavior: pin consulted only as a fallback for 'unmatched' (no
    // automatic candidates) or 'ambiguous' (several candidates, refused to guess) — for those, the
    // stored externalUrl is just the scraper's own cache, not a deliberate override, so a confident
    // automatic match should win.
    let result = rawResult;
    const tryPin = offering.urlPinned || rawResult.status === 'unmatched' || rawResult.status === 'ambiguous';
    if (tryPin && offering.externalUrl) {
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
      // somewhere useful (instead of the vendor homepage) while it awaits review — unless the admin
      // pinned a URL, which this must never overwrite (only reachable here when pin-pricing above
      // failed, e.g. a broken pinned URL; the pin itself, right or wrong, stays put either way).
      const cheapest = [...result.candidates].filter((c) => c.price != null).sort((a, b) => a.price! - b.price!)[0];
      if (!offering.urlPinned && cheapest?.url && cheapest.url !== offering.externalUrl) {
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
    const isMergeCodeTiers = !!cfg.matchOptions?.mergeCodeTiers;

    // Store the product URL + member price (secondary info, updated live — not subject to the Change
    // Queue). lastCheckedAt is stamped on EVERY match — an unchanged price is still a verified price,
    // and the site's "checked N ago" freshness reads it (priceUpdatedAt only moves on a change).
    const offeringUpdate: Record<string, unknown> = { lastCheckedAt: new Date() };
    // Never auto-overwrite a pin — reachable here for a pinned offering only when pin-pricing above
    // failed and the automatic tiers found something anyway; the pin (right or wrong) stays put so a
    // broken pinned URL surfaces as a stale/unpriced offering rather than silently being replaced.
    if (!offering.urlPinned && result.sourceUrl && result.sourceUrl !== offering.externalUrl) offeringUpdate.externalUrl = result.sourceUrl;
    if (result.memberPrice != null) offeringUpdate.memberPrice = new Decimal(result.memberPrice);

    if (isMergeCodeTiers) {
      // Dirt Cheap Labs-style vendors: result.provider/price is the cheaper lab this scrape,
      // result.altProvider/altPrice the pricier lab (if it also carries the test). Guard against an
      // unrecognized provider string first (matcher's MatchResult.provider is a free-form `string |
      // null` derived from vendor API data, not a guaranteed 'quest'|'labcorp' literal) — otherwise a
      // vendor API change could silently fall through both branches below and clear BOTH lab prices
      // with no error signal (caught in review 2026-07-25).
      const isKnownProvider = (p: string | null | undefined): boolean => p == null || p === 'quest' || p === 'labcorp';
      if (!isKnownProvider(result.provider) || !isKnownProvider(result.altProvider)) {
        await prisma.scrapeError.create({
          data: {
            runId: run.id, errorType: 'OTHER',
            message: `Unrecognized lab provider "${result.provider}"/"${result.altProvider}" for mergeCodeTiers match on ${test.name}`,
          },
        });
        await prisma.scrapeResult.create({
          data: { runId: run.id, testId: test.id, status: 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: null },
        });
        await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
        continue;
      }

      // Derive each lab's own price from those, and stage/compare per lab — currentPrice/altLabPrice
      // are a DERIVED ranking normally only recomputed on publish (see publishStagedChange's dual-lab
      // branch), EXCEPT when a lab drops out entirely (below): that's applied immediately, not gated
      // behind review, so the ranking can't go stale waiting on an unrelated future publish.
      const questPrice = result.provider === 'quest' ? result.price : result.altProvider === 'quest' ? result.altPrice : null;
      const labcorpPrice = result.provider === 'labcorp' ? result.price : result.altProvider === 'labcorp' ? result.altPrice : null;

      // Running view of each lab's price, used only to recompute the ranking below when a removal
      // happens this iteration — starts from the offering's stored values, updated as labs are cleared.
      let questPriceForRanking = offering.questPrice != null ? offering.questPrice.toNumber() : null;
      let labcorpPriceForRanking = offering.labcorpPrice != null ? offering.labcorpPrice.toNumber() : null;
      let rankingNeedsUpdate = false;
      let anyLabPriceStaged = false;

      for (const [lab, newRaw, priceField] of [
        ['quest', questPrice, 'questPrice'],
        ['labcorp', labcorpPrice, 'labcorpPrice'],
      ] as const) {
        const existingPrice = offering[priceField];
        if (newRaw == null) {
          // This lab no longer carries the test — clear it directly, no review (same as the old
          // unconditional altLabPrice-clearing behavior, just per-field now).
          if (existingPrice != null) {
            offeringUpdate[priceField] = null;
            if (lab === 'quest') questPriceForRanking = null; else labcorpPriceForRanking = null;
            rankingNeedsUpdate = true;
          }
          continue;
        }
        const newPrice = new Decimal(newRaw);
        if (existingPrice != null && newPrice.equals(existingPrice)) continue; // unchanged, nothing to stage
        pricesChanged++;
        anyLabPriceStaged = true;
        const autoApprove = shouldAutoApprove(existingPrice, newPrice, trust, test.confidence, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
        const staged = await prisma.stagedPriceChange.create({
          data: {
            offeringId: offering.id, oldPrice: existingPrice, newPrice, scrapedAt: new Date(),
            scrapeRunId: run.id, status: autoApprove ? 'AUTO_APPROVED' : 'PENDING', labProvider: lab,
            reviewNote: `Matched by ${result.matchedBy} → ${lab} @ ${result.sourceUrl}`,
          },
        });
        summary.staged++;
        if (autoApprove) summary.autoApprovedStagedIds.push(staged.id);
      }

      // A removal needs the derived ranking recomputed NOW — it creates no staged change, so nothing
      // else would ever trigger the recompute, and currentPrice/labProvider would otherwise stay stuck
      // pointing at a price that no longer exists (caught in review 2026-07-25).
      // rankingPriceChanged tracks whether this recompute actually moves the publicly-displayed price
      // (vs. e.g. the alt lab being the one that dropped, leaving currentPrice untouched) — only a real
      // move needs the priceUpdatedAt stamp / PriceHistory / audit-log writes below (final review fix
      // 2026-07-25: this write used to change currentPrice with zero traceability).
      let rankingPriceChanged = false;
      let rankedCurrentPrice: Prisma.Decimal | null = null;
      if (rankingNeedsUpdate) {
        const ranked = rankDualLabPrices(questPriceForRanking, labcorpPriceForRanking);
        rankedCurrentPrice = ranked.currentPrice != null ? new Decimal(ranked.currentPrice) : null;
        offeringUpdate.currentPrice = rankedCurrentPrice;
        offeringUpdate.labProvider = ranked.labProvider;
        offeringUpdate.altLabPrice = ranked.altLabPrice != null ? new Decimal(ranked.altLabPrice) : null;
        offeringUpdate.altLabProvider = ranked.altLabProvider;
        rankingPriceChanged = offering.currentPrice == null
          ? rankedCurrentPrice != null
          : rankedCurrentPrice == null || !rankedCurrentPrice.equals(offering.currentPrice);
        if (rankingPriceChanged) offeringUpdate.priceUpdatedAt = new Date();
      }

      // scrapedPrice records whichever lab is cheaper this scrape (for consistency with the ranking),
      // falling back to whichever lab is present when only one is.
      const cheaperOfLabs = questPrice != null && labcorpPrice != null ? Math.min(questPrice, labcorpPrice) : questPrice ?? labcorpPrice ?? null;
      await prisma.scrapeResult.create({
        data: {
          runId: run.id, testId: test.id, status: anyLabPriceStaged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id,
          scrapedPrice: cheaperOfLabs != null ? new Decimal(cheaperOfLabs) : null,
        },
      });
      await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
      if (rankingPriceChanged) {
        // A lab dropping out just changed the publicly-displayed price outside the normal
        // stage/review/publish path — give it the same PriceHistory + audit trail a reviewed publish
        // gets (see publishStagedChange below), so the price-history chart and audit log don't have a
        // silent gap. labProvider is null here: this is a ranking recompute, not one lab's own staged
        // price move. PriceHistory.newPrice is a required (non-nullable) column, so the rare case where
        // BOTH labs drop out in the same crawl (rankedCurrentPrice itself goes to null) can't get a
        // PriceHistory row — the audit log still captures it either way.
        if (rankedCurrentPrice != null) {
          await prisma.priceHistory.create({
            data: {
              offeringId: offering.id, oldPrice: offering.currentPrice, newPrice: rankedCurrentPrice,
              observedAt: new Date(), source: 'SCRAPE', scrapeRunId: run.id, labProvider: null,
            },
          });
        }
        await prisma.auditLog.create({
          data: {
            action: 'price_published',
            entityType: 'offering',
            entityId: offering.id,
            oldValues: { price: offering.currentPrice?.toString() ?? null },
            newValues: { price: rankedCurrentPrice?.toString() ?? null },
          },
        });
      }
      continue;
    }

    // Non-mergeCodeTiers: unchanged single-price flow.
    offeringUpdate.labProvider = result.provider ?? null;
    offeringUpdate.altLabPrice = result.altPrice != null ? new Decimal(result.altPrice) : null;
    offeringUpdate.altLabProvider = result.altProvider ?? null;
    await prisma.offering.update({ where: { id: offering.id }, data: offeringUpdate });
    const price = new Decimal(result.price!);
    const priceChanged = !offering.currentPrice || !price.equals(offering.currentPrice);
    await prisma.scrapeResult.create({
      data: { runId: run.id, testId: test.id, status: priceChanged ? 'PRICE_CHANGED' : 'PRICE_SAME', matchedOfferingId: offering.id, scrapedPrice: price },
    });
    if (priceChanged) {
      pricesChanged++;
      const autoApprove = shouldAutoApprove(offering.currentPrice, price, trust, test.confidence, settings.autoApproveDecreasePercent, settings.autoApproveIncreasePercent);
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
    select: { id: true, name: true, questCode: true, labcorpCode: true, confidence: true, aliases: { select: { alias: true } } },
  });
  const keys: TestKey[] = allTests.map((t) => ({
    id: t.id, name: t.name, questCode: t.questCode, labcorpCode: t.labcorpCode, aliases: t.aliases.map((a) => a.alias),
    confidence: t.confidence,
  }));
  // Keys AND lookups both go through normalizeLabCode — mirrors matcher.ts's pricing-match path, so a
  // vendor's consumer-SKU-suffixed code ("34604M") auto-matches here the same way it already does for
  // pricing (found in review: this ingest path compared raw codes and missed the suffix strip).
  const byQuest = new Map<string, TestKey[]>();
  const byLabcorp = new Map<string, TestKey[]>();
  const byNorm = new Map<string, { id: string; via: 'exact-name' | 'alias' }>();
  for (const t of keys) {
    if (t.questCode) { const k = normalizeLabCode(t.questCode); byQuest.set(k, [...(byQuest.get(k) ?? []), t]); }
    if (t.labcorpCode) { const k = normalizeLabCode(t.labcorpCode); byLabcorp.set(k, [...(byLabcorp.get(k) ?? []), t]); }
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
      const hits = (map.get(normalizeLabCode(code)) ?? []).filter((t) => testNames(t).some((n) => sharesStrongToken(n, d.name)));
      if (hits.length === 1) return { testId: hits[0]!.id, matchedBy: label };
    }
    // 1b. codeMatchAnyProvider vendors: the label can't be trusted, so check every code this product
    //     carries against BOTH our Quest and LabCorp codes (mirrors matcher.ts's array-membership
    //     check rather than a label lookup). Ambiguous (2+ plausible tests) → no auto-link.
    if (d.anyProviderCodes.length > 0) {
      const hits = new Map<string, TestKey>();
      for (const code of d.anyProviderCodes) {
        const nc = normalizeLabCode(code);
        for (const t of [...(byQuest.get(nc) ?? []), ...(byLabcorp.get(nc) ?? [])]) {
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
      // Panels are excluded from matching/clustering entirely (product decision 2026-07-20) — auto-
      // ignore rather than leaving them UNMATCHED, so they never surface in the review queue.
      if (d.isPanel) return { status: 'IGNORED' as const, testId: null, matchedBy: null, suggestedTestId: null };
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
  // code → the Quest variant), not just the cheapest. Fall back to the cheapest provider when nothing
  // matches (the admin pinned this URL, so trust it).
  //
  // includePanels:true here, unlike every automatic path. The panel exclusion exists to stop a single
  // test being priced from a bundle it merely appears inside — a guess the crawler must not make on
  // its own. A pinned URL is not a guess: it is an admin pointing at one exact product and saying
  // "this is the thing". Several of our own catalog tests are panels by nature (CBC, CMP), and vendors
  // name them accordingly, so the exclusion silently swallowed exactly the pins most worth having —
  // found live on AlgoRx, where "CBC (includes Differential and Platelets)" ($6) and "Comprehensive
  // Metabolic Panel (CMP)" ($11) both resolved to the right product and were then discarded, leaving
  // the offering priceless with no error anywhere.
  const m = matchTestToProducts(test, [product], { ...cfg.matchOptions, includePanels: true });
  if (m.status === 'matched' && m.price != null) {
    return { price: m.price, memberPrice: m.memberPrice ?? null, sourceUrl: m.sourceUrl ?? product.url, provider: m.provider ?? '' };
  }
  const best = product.providers
    .filter((p) => p.price != null)
    .sort((a, b) => a.price! - b.price!)[0];
  if (!best) return null;
  return { price: best.price!, memberPrice: best.memberPrice ?? null, sourceUrl: product.url || url, provider: best.labProvider };
}

/** Same trust-modulated auto-approve rules as scrape-execute (BR-6..BR-9). */
function shouldAutoApprove(
  oldPrice: Prisma.Decimal | null,
  newPrice: Prisma.Decimal,
  trust: TrustLevel,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | undefined,
  baseDecrease: number,
  baseIncrease: number,
): boolean {
  if (trust === 'LOW') return false;
  // Low-confidence tests (Task 1: sparsely-verified imports) never auto-approve regardless of vendor
  // trust — a cheap/high-trust vendor scrape can still be a wrong-test match on shaky data.
  if (confidence === 'LOW') return false;
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

/** Publish one approved/auto-approved staged change to the live offering. The single choke point for
 * every publish path (worker queue, inline "Scrape now", the local CF-blocked-vendor script, AND the
 * admin Change Queue approve routes — `apps/web/lib/publish-change.ts` re-exports this function
 * directly rather than keeping its own copy, consolidated 2026-07-25 after a review caught the two
 * had drifted apart: the web copy had no `labProvider` awareness, no `price_published` audit log, and
 * no atomic claim, so approving a dual-lab (mergeCodeTiers) change from the admin UI would have
 * corrupted the derived ranking). Keep publish logic here, not duplicated per-caller, so this can't
 * drift out of sync again. */
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const staged = await tx.stagedPriceChange.findUnique({
      where: { id: stagedChangeId },
      include: { offering: { select: { externalUrl: true, currentPrice: true, questPrice: true, labcorpPrice: true } } },
    });
    if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;

    // Claim the row atomically (status filter in the WHERE, not just the read above) so two
    // concurrent publish calls for the same staged change can't both pass the check and double-write
    // price history / the audit log.
    const claimed = await tx.stagedPriceChange.updateMany({
      where: { id: stagedChangeId, status: staged.status },
      data: { reviewedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    // A discovered source URL is passed through the reviewNote (`… @ <url>`); if present and the
    // offering has no URL yet, adopt it so the affiliate/verify link resolves to the exact page.
    // Ported from the old `apps/web/lib/publish-change.ts` duplicate — applies to every publish path,
    // dual-lab or not.
    const urlMatch = staged.reviewNote?.match(/@ (https?:\/\/\S+)/);
    const discoveredUrl = urlMatch?.[1];
    const urlUpdate = discoveredUrl && !staged.offering.externalUrl ? { externalUrl: discoveredUrl } : {};

    if (staged.labProvider === 'quest' || staged.labProvider === 'labcorp') {
      // Dual-lab (mergeCodeTiers) change: write the specific lab's field, then recompute the
      // derived cheaper/pricier ranking from BOTH labs' current prices — so currentPrice/labProvider/
      // altLabPrice/altLabProvider (read everywhere else in the app) reflect the latest APPROVED
      // price for each lab, not whichever lab happened to be cheaper mid-review.
      const newPriceNum = staged.newPrice.toNumber();
      const questPrice = staged.labProvider === 'quest' ? newPriceNum : staged.offering.questPrice?.toNumber() ?? null;
      const labcorpPrice = staged.labProvider === 'labcorp' ? newPriceNum : staged.offering.labcorpPrice?.toNumber() ?? null;
      const ranked = rankDualLabPrices(questPrice, labcorpPrice);

      await tx.offering.update({
        where: { id: staged.offeringId },
        data: {
          ...(staged.labProvider === 'quest'
            ? { questPrice: staged.newPrice, questPreviousPrice: staged.oldPrice }
            : { labcorpPrice: staged.newPrice, labcorpPreviousPrice: staged.oldPrice }),
          // previousPrice/currentPrice are the DERIVED ranking pair other pages still read
          // (admin offerings list, offering-service) — must move in lockstep with the ranking, not
          // just the per-lab fields, or they'd freeze at a stale value while currentPrice kept moving.
          previousPrice: staged.offering.currentPrice,
          currentPrice: ranked.currentPrice != null ? new Decimal(ranked.currentPrice) : null,
          labProvider: ranked.labProvider,
          altLabPrice: ranked.altLabPrice != null ? new Decimal(ranked.altLabPrice) : null,
          altLabProvider: ranked.altLabProvider,
          priceUpdatedAt: new Date(),
          lastCheckedAt: new Date(),
          ...urlUpdate,
        },
      });
    } else {
      await tx.offering.update({
        where: { id: staged.offeringId },
        data: { previousPrice: staged.oldPrice, currentPrice: staged.newPrice, priceUpdatedAt: new Date(), lastCheckedAt: new Date(), ...urlUpdate },
      });
    }

    await tx.priceHistory.create({
      data: {
        offeringId: staged.offeringId, oldPrice: staged.oldPrice, newPrice: staged.newPrice,
        observedAt: staged.scrapedAt, source: 'SCRAPE', scrapeRunId: staged.scrapeRunId,
        labProvider: staged.labProvider,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'price_published',
        entityType: 'offering',
        entityId: staged.offeringId,
        oldValues: { price: staged.oldPrice?.toString() ?? null, labProvider: staged.labProvider },
        newValues: { price: staged.newPrice.toString(), labProvider: staged.labProvider },
      },
    });
    return true;
  });
}
