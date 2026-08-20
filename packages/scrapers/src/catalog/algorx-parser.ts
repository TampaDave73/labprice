// AlgoRx (algorx.com) — server-rendered Next.js App Router store.
//
// The whole priced catalog ships inside the /biomarkers page's RSC flight payload (no JSON API, no
// pagination, no browser needed): one `decodeNextFlight` pass yields ~175 records, each a
// lab-specific product. Per-product pages exist at `/biomarkers/<slug>` and are real (verified live:
// /biomarkers/amylase renders "Amylase · $9.50 · Add to Cart"), so every offering deep-links to its
// own page rather than the catalog listing.
//
// TWO THINGS THAT SHAPE THIS ADAPTER:
//
// 1. **No lab order codes anywhere.** `marker_id` is AlgoRx's (Vital's) internal marker id, NOT a
//    Quest/LabCorp order code — checked against nine known codes with zero hits, and the same test
//    carries a different marker_id per lab (Ferritin: Quest 3237, Labcorp 262). So this vendor is
//    name-matched only, like MitoHealth. Do not be tempted to feed marker_id into labTestIDs.
//
// 2. **`type: 'panel'` is the vendor's own bundle flag and we honor it.** It marks 57 of the 175
//    records. It is imperfect in both directions (it tags some single analytes like "T4 (Thyroxine),
//    Total", and it tags multi-analyte tests we ourselves carry — CMP, CBC, Lipid Panel — which
//    therefore go unpriced by this vendor). We keep it anyway because with no codes to corroborate a
//    name match, it is the only guard against a panel absorbing a single-analyte test: measured
//    against the live catalog, ignoring it produced wrong matches like "Creatinine" and "Albumin" →
//    "Albumin, Random Urine with Creatinine" and "HDL Cholesterol" → "Lipid Panel with Chol/HDL
//    Ratio". Honoring it: 102 matches, 0 of those wrong. See SKILLS.md for the full trade-off.
import { decodeNextFlight } from './flight-parser';
import type { CatalogProduct } from './types';

export const ALGORX_BASE_URL = 'https://algorx.com';
export const ALGORX_CATALOG_PATH = '/biomarkers';
/** Site path for one product; `slug` is unique per lab (`ferritin-quest` / `ferritin-lc`). */
export const ALGORX_PRODUCT_PATH = '/biomarkers';

interface AlgoRxRecord {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  base_price?: number;
  is_active?: boolean;
  lab?: { name?: string };
}

/** End index of the JSON object starting at `start`, respecting string literals. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/**
 * Start index of the object enclosing `at`. Walks backwards counting braces; string literals are not
 * tracked here because the scan starts from a known key position and only needs the nearest
 * unbalanced `{` — a brace inside a description would have been balanced by its own pair.
 */
function objectStart(text: string, at: number): number {
  let depth = 0;
  for (let k = at; k >= 0; k--) {
    const c = text[k];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) return k;
      depth--;
    }
  }
  return -1;
}

/**
 * Pull every catalog record out of the page's flight payload. One `CatalogProduct` per record — i.e.
 * per (test, lab) pair, each with its own slug/URL/price and a single provider. We deliberately do
 * NOT merge the two labs into one product: without codes there is nothing to merge on, and keeping
 * them separate means the winning price carries the right lab's product URL.
 */
export function parseAlgoRxCatalog(html: string): CatalogProduct[] {
  const flight = decodeNextFlight(html);
  const products: CatalogProduct[] = [];
  const seen = new Set<string>();

  // `marker_id` is present on every catalog record and (unlike `name`) never appears in prose, so
  // it's the cheapest reliable anchor to find each record's object boundaries.
  const re = /"marker_id":/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flight)) !== null) {
    const start = objectStart(flight, m.index);
    if (start < 0) continue;
    const end = objectEnd(flight, start);
    if (end < 0) continue;

    let rec: AlgoRxRecord;
    try {
      rec = JSON.parse(flight.slice(start, end + 1)) as AlgoRxRecord;
    } catch {
      continue; // a nested/partial object — skip rather than abort the crawl
    }

    const name = (rec.name ?? '').trim();
    const slug = (rec.slug ?? '').trim();
    if (!rec.id || !name || !slug) continue;
    if (rec.is_active === false) continue;
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);

    const lab = (rec.lab?.name ?? '').trim().toLowerCase();
    products.push({
      slug,
      name,
      url: `${ALGORX_BASE_URL}${ALGORX_PRODUCT_PATH}/${slug}`,
      providers: [
        {
          // 'labcorp' here matches the spelling the matcher's tiers use; AlgoRx writes "Labcorp".
          labProvider: lab,
          labTestIDs: [], // no order codes published — name-matched only (see header).
          price: typeof rec.base_price === 'number' && rec.base_price > 0 ? rec.base_price : null,
          isPanel: rec.type === 'panel',
          name,
        },
      ],
    });
  }

  return products;
}

/**
 * Fetch the catalog page and parse it — one request for the whole priced catalog.
 *
 * WHY `fetchAll` rather than the page-based parseCatalog/parseProduct pair: every product's data is
 * already on the listing page, and the per-product pages (`/biomarkers/<slug>`) are client-rendered
 * shells whose server HTML contains no name or price at all. Crawling them per product would cost
 * 175 requests and parse nothing.
 */
export async function fetchAlgoRxCatalog(
  deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
  cfg: { baseUrl: string },
): Promise<CatalogProduct[]> {
  const base = (cfg.baseUrl || ALGORX_BASE_URL).replace(/\/+$/, '');
  const html = await deps.fetchHtml(`${base}${ALGORX_CATALOG_PATH}`);
  const products = parseAlgoRxCatalog(html);
  const panels = products.filter((p) => p.providers[0]!.isPanel).length;
  deps.onLog?.(`catalog: ${products.length} products (${panels} vendor-flagged panels, excluded from matching)`);
  return products;
}
