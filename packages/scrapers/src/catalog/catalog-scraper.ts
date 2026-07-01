// Orchestrates a catalog-based vendor scrape: discover the catalog → fetch product detail pages →
// match OUR tests into it. Network access is injected (`fetchHtml`) so the whole flow is testable
// against fixtures and the engine choice (HTTP vs browser) stays a caller concern.

import { parseGoodLabsCatalog, parseGoodLabsProduct } from './goodlabs-parser';
import { matchTestToProducts } from './matcher';
import type { CatalogEntry, CatalogProduct, MatchOptions, MatchResult, TestKey } from './types';

export interface CatalogScrapeConfig {
  baseUrl: string;
  catalogPath: string;
  /** Milliseconds to wait between product-page fetches (be polite to the vendor). */
  rateLimitMs?: number;
  matchOptions?: MatchOptions;
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

/** Fetch + parse the vendor's catalog listing (every test/panel it sells). */
export async function fetchCatalogEntries(deps: FetchDeps, cfg: CatalogScrapeConfig): Promise<CatalogEntry[]> {
  const html = await deps.fetchHtml(`${cfg.baseUrl}${cfg.catalogPath}`);
  return parseGoodLabsCatalog(html);
}

/** Fetch + parse one product detail page. Returns null if the page has no parseable product. */
export async function fetchProduct(deps: FetchDeps, cfg: CatalogScrapeConfig, slug: string): Promise<CatalogProduct | null> {
  const html = await deps.fetchHtml(`${cfg.baseUrl}/tests/${slug}`);
  return parseGoodLabsProduct(html, cfg.baseUrl);
}

/**
 * Build the full product index for a vendor: catalog + every product page.
 * WHY fetch all pages (not just name-matches): the Quest/LabCorp codes we match on live only on the
 * detail pages, so narrowing by name first would silently drop code-only matches. The catalog is
 * small (~50 items); a full crawl once per run is the honest way to support code search.
 */
export async function buildCatalogIndex(deps: FetchDeps, cfg: CatalogScrapeConfig): Promise<CatalogProduct[]> {
  const entries = await fetchCatalogEntries(deps, cfg);
  deps.onLog?.(`catalog: ${entries.length} products`);
  const products: CatalogProduct[] = [];
  const delay = cfg.rateLimitMs ?? 800;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    try {
      const product = await fetchProduct(deps, cfg, entry.slug);
      if (product) products.push(product);
      else deps.onLog?.(`  ! no product data: ${entry.slug}`);
    } catch (e) {
      deps.onLog?.(`  ! fetch failed: ${entry.slug} (${e instanceof Error ? e.message : String(e)})`);
    }
    if (i < entries.length - 1 && delay > 0) await sleep(delay);
  }
  deps.onLog?.(`indexed ${products.length}/${entries.length} product pages`);
  return products;
}

/** Match each of our tests against an already-built product index. */
export function matchOfferings(tests: TestKey[], products: CatalogProduct[], opts?: MatchOptions): OfferingMatch[] {
  return tests.map((test) => ({ test, result: matchTestToProducts(test, products, opts) }));
}

/** Convenience: crawl the catalog and match a set of tests in one call. */
export async function discover(
  tests: TestKey[],
  deps: FetchDeps,
  cfg: CatalogScrapeConfig,
): Promise<{ products: CatalogProduct[]; matches: OfferingMatch[] }> {
  const products = await buildCatalogIndex(deps, cfg);
  const matches = matchOfferings(tests, products, cfg.matchOptions);
  return { products, matches };
}

/** Default HTTP fetcher: plain GET with a browser-ish UA and a timeout. No JS execution needed. */
export function httpFetchHtml(timeoutMs = 20_000): (url: string) => Promise<string> {
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
