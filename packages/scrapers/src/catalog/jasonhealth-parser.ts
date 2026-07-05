// Jason Health (jasonhealth.com) is an API vendor: its site search is powered by Algolia, and the
// public search-only API key + application id are embedded directly in the page
// (`window.algolia_settings`) — safe to use client-side by Algolia's own design (this is a read-only,
// rate-limited "search" key, not an admin key). We hit the plain GET query variant (Algolia supports
// both POST-with-body and a GET-with-querystring form; GET fits our shared `httpFetchHtml`, which only
// does GET) with `Referer: https://www.jasonhealth.com/` — required, the key is referer-restricted and
// 403s without it.
//
// The regular `query` endpoint caps out at 1,000 total results (Algolia's standard limit; the `/browse`
// endpoint that lifts it needs a browse-capable key we don't have) even though the full index is ~3,842
// items — an accepted coverage gap, not a bug: an empty-query browse in relevance order surfaces the
// common individual tests first (verified live: CBC/CMP/Lipid/TSH/Vitamin D/Estradiol all appear on
// page 1), and deep pages that return `panel_name: null` are simply skipped.
//
// Every hit's `url_code` (or `ntc_codes_of_single_test_panel`) IS the Quest order code directly — no
// parsing needed. **Panel detection**: `ntc_codes_of_single_test_panel` is empty for a bundle (its
// constituent codes live in `ntc_codes_of_multi_test_panel` instead) — a real, vendor-supplied signal.
import type { CatalogProduct, ProviderOffering } from './types';

export const JASONHEALTH_DEFAULT_API_BASE = 'https://76U86Z1DD2-dsn.algolia.net/1/indexes/production_store_panels';
export const JASONHEALTH_ALGOLIA_HEADERS = {
  'X-Algolia-API-Key': '055f2d5e30418a76b9c838e89cb91a81',
  'X-Algolia-Application-Id': '76U86Z1DD2',
  Referer: 'https://www.jasonhealth.com/',
};
const HITS_PER_PAGE = 20; // the index caps hitsPerPage at 20 regardless of what we request.
const MAX_PAGES = 50; // 50 * 20 = 1,000 = Algolia's hard cap on the `query` endpoint for this key.
const ATTRIBUTES = ['panel_code', 'url_code', 'panel_name', 'price', 'ntc_codes_of_single_test_panel', 'ntc_codes_of_multi_test_panel'];

interface JasonHealthHit {
  url_code?: string;
  panel_name?: string | null;
  price?: string;
  ntc_codes_of_single_test_panel?: string[];
  ntc_codes_of_multi_test_panel?: string[];
}

/** Merge paginated Algolia hits into products keyed by url_code. Pure + testable. */
export function mergeJasonHealthCatalog(pages: JasonHealthHit[][], baseUrl = 'https://www.jasonhealth.com'): CatalogProduct[] {
  const byCode = new Map<string, CatalogProduct>();
  for (const hits of pages) {
    for (const h of hits) {
      if (!h?.url_code || !h.panel_name) continue; // deep pages return panel_name:null — nothing to match on.
      if (byCode.has(h.url_code)) continue;
      const singleCodes = h.ntc_codes_of_single_test_panel ?? [];
      const provider: ProviderOffering = {
        labProvider: 'quest', // partnered with Quest Diagnostics; every code here is a Quest order code.
        labTestIDs: singleCodes,
        price: h.price ? Number(h.price) : null,
        isPanel: singleCodes.length === 0, // a bundle's codes live in ntc_codes_of_multi_test_panel instead.
        name: h.panel_name,
      };
      byCode.set(h.url_code, { slug: h.url_code, name: h.panel_name, url: `${baseUrl}/test/${h.url_code}`, providers: [provider] });
    }
  }
  return [...byCode.values()];
}

/** Fetch every page of the empty-query browse (up to Algolia's 1,000-result cap) and merge. */
export async function fetchJasonHealthCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string; apiBase?: string },
): Promise<CatalogProduct[]> {
  const apiBase = cfg.apiBase ?? JASONHEALTH_DEFAULT_API_BASE;
  const attrs = encodeURIComponent(JSON.stringify(ATTRIBUTES));
  const pages: JasonHealthHit[][] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${apiBase}?hitsPerPage=${HITS_PER_PAGE}&page=${page}&attributesToRetrieve=${attrs}`;
    try {
      const txt = await deps.fetchHtml(url);
      const json = JSON.parse(txt) as { hits?: JasonHealthHit[] };
      if (!json.hits?.length) break; // ran out of pages before hitting MAX_PAGES.
      pages.push(json.hits);
    } catch {
      deps.onLog?.(`  ! bad response for page=${page}`);
      break;
    }
  }
  const products = mergeJasonHealthCatalog(pages, cfg.baseUrl);
  deps.onLog?.(`catalog(api): ${products.length} products across ${pages.length} page(s)`);
  return products;
}
