// Orchestrates a catalog-based vendor scrape: discover the catalog → fetch product detail pages →
// match OUR tests into it. Network access is injected (`fetchHtml`) so the whole flow is testable
// against fixtures and the engine choice (HTTP vs browser) stays a caller concern.

import { goodlabsAdapter } from './adapters';
import { matchTestToProducts, nameMatches, testNames } from './matcher';
import type { CatalogAdapter, CatalogEntry, CatalogProduct, MatchOptions, MatchResult, TestKey } from './types';

export interface CatalogScrapeConfig {
  baseUrl: string;
  catalogPath: string;
  /** Vendor adapter (parsers + product-URL builder). Defaults to GoodLabs. */
  adapter?: CatalogAdapter;
  /** API base for `fetchAll` (API vendors like Dirt Cheap Labs). */
  apiBase?: string;
  /** Milliseconds to wait between product-page fetches (be polite to the vendor). */
  rateLimitMs?: number;
  matchOptions?: MatchOptions;
  /**
   * Extra headers every fetch for this vendor needs (e.g. Private MD Labs' catalog pagination is an
   * AJAX endpoint that only returns JSON when `X-Requested-With: XMLHttpRequest` is present — plain
   * HTTP still works, just needs this one header, no browser required).
   */
  extraHeaders?: Record<string, string>;
}

export interface FetchDeps {
  fetchHtml: (url: string) => Promise<string>;
  /** Optional sink for progress/telemetry; defaults to no-op. */
  onLog?: (msg: string) => void;
}

export interface OfferingMatch {
  test: TestKey;
  result: MatchResult;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch + parse the vendor's catalog listing (every test/panel it sells). Page-based adapters only.
 * Follows `adapter.nextCatalogPage` across multiple pages when present (Walk-In Lab: 40+ pages); a
 * safety cap guards against an accidental infinite loop if a site's "next" link ever points at itself.
 */
export async function fetchCatalogEntries(deps: FetchDeps, cfg: CatalogScrapeConfig): Promise<CatalogEntry[]> {
  const adapter = cfg.adapter ?? goodlabsAdapter;
  if (!adapter.parseCatalog) throw new Error(`Adapter '${adapter.name}' is not page-based (no parseCatalog)`);
  const MAX_PAGES = 100;

  const seen = new Map<string, CatalogEntry>();
  const pageDelay = Math.min(cfg.rateLimitMs ?? 800, 300);
  let url = `${cfg.baseUrl}${cfg.catalogPath}`;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await deps.fetchHtml(url);
    for (const entry of adapter.parseCatalog(html)) if (!seen.has(entry.slug)) seen.set(entry.slug, entry);
    const next = adapter.nextCatalogPage?.(html, url);
    if (!next) break;
    deps.onLog?.(`  catalog page ${page}: ${seen.size} product(s) so far`);
    url = next;
    if (pageDelay > 0) await sleep(pageDelay);
  }
  return [...seen.values()];
}

/** Fetch + parse one product detail page. Returns null if the page has no parseable product. */
export async function fetchProduct(deps: FetchDeps, cfg: CatalogScrapeConfig, slug: string): Promise<CatalogProduct | null> {
  const adapter = cfg.adapter ?? goodlabsAdapter;
  if (!adapter.productUrl || !adapter.parseProduct) throw new Error(`Adapter '${adapter.name}' is not page-based`);
  const html = await deps.fetchHtml(adapter.productUrl(cfg.baseUrl, slug));
  return adapter.parseProduct(html, cfg.baseUrl, slug);
}

/**
 * Build a product index for a vendor: catalog listing → product detail pages.
 *
 * `candidateTests` narrows which detail pages we fetch to catalog entries whose NAME shares a
 * significant token with one of our tests. This makes an interactive scrape (one vendor, a few tests)
 * fast — a few fetches instead of the whole ~50-page catalog. Omit it for an exhaustive crawl. The
 * tradeoff: a test that only code-matches a catalog entry whose *name* is unrelated would be missed;
 * in practice these vendors use standard lab nomenclature that overlaps our test names.
 */
export async function buildCatalogIndex(
  deps: FetchDeps,
  cfg: CatalogScrapeConfig,
  candidateTests?: TestKey[],
): Promise<CatalogProduct[]> {
  return (await buildCatalogIndexDetailed(deps, cfg, candidateTests)).products;
}

/**
 * What a catalog crawl saw, including what it FAILED to see. `detailsAttempted`/`detailErrors` exist so
 * an empty `products` can be explained rather than guessed at — see `runVendorDiscovery`'s 0-products
 * guard. Both are 0/empty for `fetchAll` (API) adapters, which have no per-product pages at all.
 */
export interface CatalogIndex {
  products: CatalogProduct[];
  entries: CatalogEntry[];
  detailsAttempted: number;
  detailErrors: string[];
}

/**
 * Like `buildCatalogIndex`, but also returns the FULL catalog listing (`entries`) — every product
 * the vendor sells, not just the narrowed/detail-fetched subset. The ingest layer (VendorProduct)
 * persists all of them, so nothing the crawl saw is discarded even on a narrow run. For API vendors
 * the products ARE the full catalog, so entries is derived from them.
 */
export async function buildCatalogIndexDetailed(
  deps: FetchDeps,
  cfg: CatalogScrapeConfig,
  candidateTests?: TestKey[],
): Promise<CatalogIndex> {
  const adapter = cfg.adapter ?? goodlabsAdapter;

  // API vendors (Dirt Cheap Labs): one fetch returns the whole priced catalog — no per-product pages,
  // and no name-narrowing (matching is by code, so we keep every product).
  if (adapter.fetchAll) {
    const products = await adapter.fetchAll(deps, cfg);
    return { products, entries: products.map((p) => ({ name: p.name, slug: p.slug, url: p.url })), detailsAttempted: 0, detailErrors: [] };
  }

  const entries = await fetchCatalogEntries(deps, cfg);
  deps.onLog?.(`catalog: ${entries.length} products`);

  let selected = entries;
  if (candidateTests && candidateTests.length > 0) {
    // Candidate = an entry whose name is a token-subset match of a linked test's name OR a confirmed
    // alias (same logic as the name-match tier). Tighter than "shares any token", so we don't fetch
    // every "…Panel" page.
    selected = entries.filter((e) => candidateTests.some((t) => testNames(t).some((n) => nameMatches(n, e.name))));
    deps.onLog?.(`narrowed to ${selected.length}/${entries.length} candidate product page(s)`);
  }

  const products: CatalogProduct[] = [];
  // Per-page failures are logged and then swallowed so one dead product page can't abort a crawl — but
  // they also have to be COUNTED, or "every detail page 403'd" and "the listing was empty" both arrive
  // at the caller as a bare `products.length === 0` and get the same wrong diagnosis.
  const detailErrors: string[] = [];
  const delay = cfg.rateLimitMs ?? 800;
  for (let i = 0; i < selected.length; i++) {
    const entry = selected[i]!;
    // Logged BEFORE the fetch, not after — a hung run (e.g. a browser-fetch vendor stuck clearing a
    // per-page JS challenge) then shows exactly which page it stalled on instead of going silent for
    // the whole crawl (found live 2026-09-09: a Request A Test run sat with no output for 20+ minutes
    // and had to be killed blind, no way to tell which of 91 pages it was stuck on).
    deps.onLog?.(`  fetching ${i + 1}/${selected.length}: ${entry.slug}`);
    try {
      const product = await fetchProduct(deps, cfg, entry.slug);
      if (product) products.push(product);
      else {
        deps.onLog?.(`  ! no product data: ${entry.slug}`);
        detailErrors.push(`${entry.slug}: parsed no product data`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deps.onLog?.(`  ! fetch failed: ${entry.slug} (${message})`);
      detailErrors.push(`${entry.slug}: ${message}`);
    }
    if (i < selected.length - 1 && delay > 0) await sleep(delay);
  }
  deps.onLog?.(`indexed ${products.length}/${selected.length} product page(s)`);
  return { products, entries, detailsAttempted: selected.length, detailErrors };
}

/** Match each of our tests against an already-built product index. */
export function matchOfferings(tests: TestKey[], products: CatalogProduct[], opts?: MatchOptions): OfferingMatch[] {
  return tests.map((test) => ({ test, result: matchTestToProducts(test, products, opts) }));
}

/**
 * Convenience: crawl the catalog and match a set of tests in one call.
 * `opts.narrow` (default true) only fetches detail pages whose name overlaps a test — much faster for
 * interactive/small runs. Pass `{ narrow: false }` for an exhaustive crawl.
 *
 * `opts.narrowTests` lets the crawl-narrowing list differ from `tests` (the list matched against the
 * fetched products). Why they can differ: a freshly-reseeded catalog has live tests but zero existing
 * offerings yet — `tests` here is normally "tests this vendor already has offerings for" (see
 * `runVendorDiscovery`), which would be empty right after a reset and narrow the crawl to nothing.
 * Passing every live test as `narrowTests` keeps the crawl fast (only fetch pages that plausibly match
 * SOME live test) while `tests` still controls what actually gets matched/staged. Omit it and both
 * roles fall back to `tests`, unchanged from prior behavior.
 */
export async function discover(
  tests: TestKey[],
  deps: FetchDeps,
  cfg: CatalogScrapeConfig,
  opts: { narrow?: boolean; narrowTests?: TestKey[] } = {},
): Promise<CatalogIndex & { matches: OfferingMatch[] }> {
  const narrow = opts.narrow ?? true;
  const index = await buildCatalogIndexDetailed(deps, cfg, narrow ? (opts.narrowTests ?? tests) : undefined);
  return { ...index, matches: matchOfferings(tests, index.products, cfg.matchOptions) };
}

/** Default HTTP fetcher: plain GET with a browser-ish UA and a timeout. No JS execution needed. */
export function httpFetchHtml(timeoutMs = 20_000, extraHeaders?: Record<string, string>): (url: string) => Promise<string> {
  return async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          ...extraHeaders,
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  };
}
