// True Health Labs (truehealthlabs.com) is a WooCommerce store, fully described by its own PUBLIC
// Store API (`/wp-json/wc/store/v1/products`) — unauthenticated, paginated, no browser needed. Pure
// parsing + fetchAll orchestration in one file, same shape as DirectLabs/MitoHealth's API-vendor
// adapters (see `adapters.ts`).
//
// Root-caused live 2026-09-09: the old approach (crawl `product-sitemap.xml`, ~196 URLs, then fetch
// each product page individually for its GTM dataLayer + WooCommerce SKU) was missing the vast
// majority of the real catalog — the Store API's own `X-WP-Total` says 1,881 real products, nearly 10x
// the sitemap's count (DHEA-Sulfate among the missing, despite a real, live, correctly-priced page).
// The Store API listing ALSO already carries name + price + order code for every product on the same
// page, so there's no second per-product fetch to make at all.
//
// The `sku` field literally encodes the lab + code when the vendor bothered to set one, e.g. "Quest_402"
// or "LC_500161" (a trailing segment on some SKUs looks like an internal variant id and is ignored, same
// as before). Bundle/panel SKUs (e.g. "KB_Panel-0004", "DT_STTM_4Cort-DHEA_FlexM") don't match that
// shape and fall back to name-only matching — the matcher's own name-token safeguards are the backstop,
// same tolerance the old per-page parser had (no reliable bundle/isPanel signal in the API either).
import type { CatalogProduct, ProviderOffering } from './types';

const SKU_RE = /^(Quest|Labcorp|LC)_(\d+)/i;
const STORE_API_PAGE_SIZE = 100;

interface WcStoreProduct {
  slug?: string;
  name?: string;
  sku?: string;
  permalink?: string;
  prices?: { price?: string; currency_minor_unit?: number };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

/** Parse one Store API response body into its raw rows (unfiltered — used both to build products and
 * to tell the pager whether this was a full page). Malformed/non-JSON (e.g. an HTML error page) reads
 * as zero rows rather than throwing, matching how the rest of this codebase treats a bad catalog page. */
function parseStoreRows(json: string): WcStoreProduct[] {
  try {
    const rows: unknown = JSON.parse(json);
    return Array.isArray(rows) ? (rows as WcStoreProduct[]) : [];
  } catch {
    return [];
  }
}

/** One Store API page's rows → CatalogProducts. A real self-pay lab test is never actually free — a $0
 * price showed up live (2026-07-04) on an out-of-stock/discontinued bundle and would otherwise look
 * like a legitimate match, so those are dropped entirely rather than passed downstream with a bogus
 * price (the matcher/persist layer isn't built to expect `price: null` on a 'matched' result). */
export function parseTrueHealthLabsStorePage(json: string, baseUrl = 'https://truehealthlabs.com'): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const row of parseStoreRows(json)) {
    if (!row.slug || !row.name) continue;
    const minorUnit = row.prices?.currency_minor_unit ?? 2;
    const rawPrice = row.prices?.price;
    const price = rawPrice != null ? Number(rawPrice) / 10 ** minorUnit : null;
    if (!(price! > 0)) continue;

    const skuMatch = row.sku ? SKU_RE.exec(row.sku) : null;
    const labProvider = skuMatch ? skuMatch[1]!.toLowerCase().replace('lc', 'labcorp') : 'unknown';
    const code = skuMatch?.[2];
    const name = decodeEntities(row.name);

    const provider: ProviderOffering = {
      labProvider,
      labTestIDs: code ? [code] : [],
      price,
      isPanel: false,
      name,
    };
    out.push({ slug: row.slug, name, url: row.permalink || `${baseUrl}/product/${row.slug}/`, providers: [provider] });
  }
  return out;
}

/**
 * Pages the Store API to completion, merging by slug. WordPress returns 200 + `[]` past the last page
 * here (unlike the `wp/v2/pages` endpoint DrSays uses, which 400s past the end) — so this can safely
 * stop on the first page shorter than a full page, no separate "confirm the end" fetch needed.
 */
export async function fetchTrueHealthLabsCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string },
): Promise<CatalogProduct[]> {
  const byId = new Map<string, CatalogProduct>();
  for (let page = 1; page <= 50; page++) {
    const url = `${cfg.baseUrl}/wp-json/wc/store/v1/products?per_page=${STORE_API_PAGE_SIZE}&page=${page}`;
    const json = await deps.fetchHtml(url);
    const rawRows = parseStoreRows(json);
    for (const p of parseTrueHealthLabsStorePage(json, cfg.baseUrl)) if (!byId.has(p.slug)) byId.set(p.slug, p);
    deps.onLog?.(`  store API page ${page}: ${byId.size} product(s) so far`);
    if (rawRows.length < STORE_API_PAGE_SIZE) break;
  }
  return [...byId.values()];
}
