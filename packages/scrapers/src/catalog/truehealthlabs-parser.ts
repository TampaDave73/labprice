// True Health Labs (truehealthlabs.com) HTML/XML → structured-data parsers. Pure functions (no
// network) so they're unit-testable against saved fixtures.
//
// WooCommerce store. `product-sitemap.xml` is a dedicated, product-only sitemap (~1,736 products,
// single flat fetch, no pagination needed — same shortcut as HealthLabs.com, but cleaner since this one
// isn't mixed with blog/content pages).
//
// Each product page's WooCommerce SKU literally encodes the lab + code, e.g. `Quest_457` (Ferritin) or
// `Quest_17306_303` (a trailing segment we ignore — looks like an internal variant id, not part of the
// lab's own code). Name + price come from the page's GTM/analytics dataLayer JSON
// (`gtmkit_dataLayer_content`), which is more reliable than scraping the visible WooCommerce price
// markup (sale-price/regular-price `<ins>`/`<del>` pairs) since it's the exact value used for
// conversion tracking.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const LOC_RE = /<loc>\s*(https:\/\/truehealthlabs\.com\/product\/([a-z0-9-]+)\/?)\s*<\/loc>/g;
const GTM_ITEM_RE = /"item_name":"([^"]+)","currency":"USD","price":([\d.]+)/;
const SKU_RE = /"sku">\s*(Quest|Labcorp|LC)_(\d+)/i;

/** Parse `product-sitemap.xml` into a candidate entry per product URL. */
export function parseTrueHealthLabsCatalog(xml: string): CatalogEntry[] {
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

/** Parse a product page: name + price from the GTM dataLayer, code from the WooCommerce SKU. */
export function parseTrueHealthLabsProduct(html: string, baseUrl = 'https://truehealthlabs.com', slug?: string): CatalogProduct | null {
  const gtm = GTM_ITEM_RE.exec(html);
  if (!gtm) return null;
  const name = gtm[1]!;
  const price = Number(gtm[2]);
  // A real self-pay lab test is never actually free — a $0 dataLayer price showed up live on an
  // out-of-stock/discontinued "Super Panel" bundle product and would otherwise look like a legitimate
  // match. Drop the product entirely rather than pass a bogus price downstream (the matcher/persist
  // layer isn't built to expect `price: null` on a 'matched' result).
  if (!(price > 0)) return null;

  const id = slug ?? '';
  const url = `${baseUrl}/product/${id}/`;

  const skuMatch = SKU_RE.exec(html);
  const labProvider = skuMatch ? skuMatch[1]!.toLowerCase().replace('lc', 'labcorp') : 'unknown';
  const code = skuMatch?.[2];

  const provider: ProviderOffering = {
    labProvider,
    labTestIDs: code ? [code] : [],
    price,
    isPanel: false, // no reliable bundle signal found; relies on the matcher's name-token safeguards.
    name,
  };

  return { slug: id, name, url, providers: [provider] };
}
