// LabCorp OnDemand (ondemand.labcorp.com) HTML/XML → structured-data parsers. Pure functions (no
// network) so they're unit-testable against saved fixtures.
//
// LabCorp's own first-party direct-to-consumer store (Adobe Experience Manager — "/content/
// labcorp-ondemand/..." paths). `sitemap.xml` lists the whole catalog (~134 `/lab-tests/<slug>` URLs,
// single flat fetch, no pagination).
//
// Every product page repeats one `id="addToCart"` block per add-to-cart button on the page (main
// product + any cross-sell suggestions) — the FIRST one is always the page's own product. It carries
// `data-sku`, `data-price`, `data-name`, and — the best signal of any vendor this session —
// **`data-isbundleproduct`**, an explicit, vendor-supplied true/false flag (verified live: "false" for
// single tests like Ferritin/CMP even though CMP is clinically a panel, "true" for an actual
// build-your-own bundle like "Custom Men's Health Test"). A bundle's SKU is also non-numeric (e.g.
// "LAB022") vs a real test's 6-digit LabCorp code (e.g. "004598") — we only trust numeric SKUs as codes.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const LOC_RE = /<loc>\s*(https:\/\/www\.ondemand\.labcorp\.com\/lab-tests\/([a-z0-9-]+))\s*<\/loc>/g;
const ADD_TO_CART_RE = /id="addToCart"[^>]*data-sku="([^"]+)"[^>]*data-price="\$?([\d,.]+)"[^>]*data-name="([^"]+)"[^>]*data-isbundleproduct="(true|false)"/;

/** Parse `sitemap.xml` into a candidate entry per `/lab-tests/<slug>` URL. */
export function parseLabCorpOnDemandCatalog(xml: string): CatalogEntry[] {
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

/** Parse a product page: name (h1), and the first `addToCart` block's sku/price/name/bundle flag. */
export function parseLabCorpOnDemandProduct(html: string, baseUrl = 'https://www.ondemand.labcorp.com', slug?: string): CatalogProduct | null {
  const name = decodeEntities(firstMatch(html, /<h1[^>]*>\s*([^<]+?)\s*<\/h1>/)?.trim() ?? '') || null;
  if (!name) return null;

  const id = slug ?? '';
  const url = `${baseUrl}/lab-tests/${id}`;

  const cart = ADD_TO_CART_RE.exec(html);
  const sku = cart?.[1];
  const price = cart?.[2];
  const isBundle = cart?.[4] === 'true';
  const isNumericCode = !!sku && /^\d+$/.test(sku);

  const provider: ProviderOffering = {
    labProvider: 'labcorp', // LabCorp's own first-party store — every product is a LabCorp fulfillment.
    labTestIDs: isNumericCode ? [sku!] : [], // bundle SKUs like "LAB022" aren't real order codes.
    price: price ? Number(price.replace(/,/g, '')) : null,
    isPanel: isBundle,
    name,
  };

  return { slug: id, name, url, providers: [provider] };
}

function firstMatch(html: string, re: RegExp): string | undefined {
  return re.exec(html)?.[1];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
