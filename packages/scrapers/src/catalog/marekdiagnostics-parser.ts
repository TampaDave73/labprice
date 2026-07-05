// Marek Diagnostics (marekdiagnostics.com — the direct-to-consumer lab-ordering arm of Marek Health)
// HTML/XML → structured-data parsers. Pure functions (no network) so they're unit-testable against
// saved fixtures.
//
// Plain Shopify store. The sitemap is a sitemap-INDEX (`/sitemap.xml` → `sitemap_products_1.xml?
// from=<id>&to=<id>`), not a flat file — the products sub-sitemap URL is hardcoded as `catalogPath`
// since the from/to id range only shifts as the catalog grows (same reasoning as DirectLabs' hardcoded
// category ids). ~134 products, single flat fetch, no further pagination — a compact, curated catalog
// (not the ~1,000+ scale of most other vendors this project).
//
// Best code exposure of any vendor so far, even better than True Health Labs: a real single test's own
// JSON-LD is `@type: "Product"` with an `mpn` field that IS the Quest order code directly (verified
// live: Cystatin C with eGFR's mpn "94588" matches our stored code exactly) — no parsing a SKU string,
// no guessing. **Panel detection**: Shopify represents a product WITH VARIANTS (a bundle offering e.g.
// a Male/Female size option) as `@type: "ProductGroup"` instead, wrapping each variant as its own
// nested `Product` — a real, structural signal distinguishing a single test from a bundle, not a
// heuristic. (Its own `mpn`, when present at the group level, is pipe-delimited — one code per
// constituent test — a second confirming signal, but the `@type` alone is enough.)
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const LOC_RE = /<loc>\s*(https:\/\/marekdiagnostics\.com\/products\/([a-z0-9-]+))\s*<\/loc>/g;

/** Parse the products sitemap into a candidate entry per `/products/<slug>` URL. */
export function parseMarekDiagnosticsCatalog(xml: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    const url = m[1]!;
    const slug = m[2]!;
    if (seen.has(slug)) continue;
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    seen.set(slug, { name, slug, url });
  }
  return [...seen.values()];
}

/** Parse a product page: name/price/mpn straight out of the page's own JSON-LD block. */
export function parseMarekDiagnosticsProduct(html: string, baseUrl = 'https://marekdiagnostics.com', slug?: string): CatalogProduct | null {
  // The page carries several `application/ld+json` blocks (GTM/Heatmap/brand pixels) — the real
  // product one is the only one with `@type` of `Product` or `ProductGroup` and a `name`.
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? [];
  let data: { '@type'?: string; name?: string; mpn?: string; offers?: { price?: string } } | null = null;
  for (const block of blocks) {
    const json = block.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '');
    try {
      const parsed = JSON.parse(json);
      if ((parsed['@type'] === 'Product' || parsed['@type'] === 'ProductGroup') && parsed.name) { data = parsed; break; }
    } catch {
      // not this block
    }
  }
  if (!data?.name) return null;
  const name = data.name;

  const id = slug ?? '';
  const url = `${baseUrl}/products/${id}`;
  const isBundle = data['@type'] === 'ProductGroup';
  const mpn = data.mpn ?? '';
  const codes = mpn.split('|').map((c) => c.trim()).filter(Boolean);
  const price = data.offers?.price ? Number(data.offers.price) : null;

  const provider: ProviderOffering = {
    labProvider: 'quest', // Quest-only inventory (every SKU carries a "QST-" prefix, no LabCorp seen).
    labTestIDs: !isBundle && codes.length === 1 ? codes : [], // a bundle has no single order code of its own.
    price,
    isPanel: isBundle,
    name,
  };

  return { slug: id, name, url, providers: [provider] };
}
