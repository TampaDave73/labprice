// Orchestrates a catalog-based vendor scrape: discover the catalog → fetch product detail pages →
// match OUR tests into it. Network access is injected (`fetchHtml`) so the whole flow is testable
// against fixtures and the engine choice (HTTP vs browser) stays a caller concern.

import { goodlabsAdapter } from './adapters';
import { matchTestToProducts, nameMatches } from './matcher';
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
  const adapter = cfg.adapter ?? goodlabsAdapter;

  // API vendors (Dirt Cheap Labs): one fetch returns the whole priced catalog — no per-product pages,
  // and no name-narrowing (matching is by code, so we keep every product).
  if (adapter.fetchAll) {
    return adapter.fetchAll(deps, cfg);
  }

  const entries = await fetchCatalogEntries(deps, cfg);
  deps.onLog?.(`catalog: ${entries.length} products`);

  let selected = entries;
  if (candidateTests && candidateTests.length > 0) {
    // Candidate = an entry whose name is a token-subset match of a linked test (same logic as the
    // name-match tier). Tighter than "shares any token", so we don't fetch every "…Panel" page.
    selected = entries.filter((e) => candidateTests.some((t) => nameMatches(t.name, e.name)));
    deps.onLog?.(`narrowed to ${selected.length}/${entries.length} candidate product page(s)`);
  }

  const products: CatalogProduct[] = [];
  const delay = cfg.rateLimitMs ?? 800;
  for (let i = 0; i < selected.length; i++) {
    const entry = selected[i]!;
    try {
      const product = await fetchProduct(deps, cfg, entry.slug);
      if (product) products.push(product);
      else deps.onLog?.(`  ! no product data: ${entry.slug}`);
    } catch (e) {
      deps.onLog?.(`  ! fetch failed: ${entry.slug} (${e instanceof Error ? e.message : String(e)})`);
    }
    if (i < selected.length - 1 && delay > 0) await sleep(delay);
  }
  deps.onLog?.(`indexed ${products.length}/${selected.length} product page(s)`);
  return products;
}

/** Match each of our tests against an already-built product index. */
export function matchOfferings(tests: TestKey[], products: CatalogProduct[], opts?: MatchOptions): OfferingMatch[] {
  return tests.map((test) => ({ test, result: matchTestToProducts(test, products, opts) }));
}

/**
 * Convenience: crawl the catalog and match a set of tests in one call.
 * `opts.narrow` (default true) only fetches detail pages whose name overlaps a test — much faster for
 * interactive/small runs. Pass `{ narrow: false }` for an exhaustive crawl.
 */
export async function discover(
  tests: TestKey[],
  deps: FetchDeps,
  cfg: CatalogScrapeConfig,
  opts: { narrow?: boolean } = {},
): Promise<{ products: CatalogProduct[]; matches: OfferingMatch[] }> {
  const narrow = opts.narrow ?? true;
  const products = await buildCatalogIndex(deps, cfg, narrow ? tests : undefined);
  const matches = matchOfferings(tests, products, cfg.matchOptions);
  return { products, matches };
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
