// Walk-In Lab (walkinlab.com) HTML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// A custom (non-Magento) server-rendered store: `/categories/view/all-products?page=N` lists every
// product across ~40 paginated pages; `/products/view/<slug>` is the product detail page. Unlike
// GoodLabs/OYL, a product page exposes BOTH lab order codes together ("Test Code(s): 001453, 496" —
// LabCorp + Quest), so we match with `codeMatchAnyProvider` rather than guessing which is which.
//
// WHY isPanel from the CPT-code text, not the name: bundle products (e.g. "CBC and CMP-14 Blood Test
// Panel") get their OWN bundle test code(s) — never reusing a constituent test's own code — so a code
// match against a bundle is already naturally rare. But the page also self-labels the distinction: a
// single test's "CPT Code(s)" field has an actual code (e.g. "83036"); a bundle's reads literally
// "See Individual Tests". That's a reliable, vendor-supplied panel signal (verified live).
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const CARD_RE = /<a href="\/products\/view\/([a-z0-9-]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
const NEXT_PAGE_RE = /<a rel="next" href="([^"]+)"/;

/** Parse one `/categories/view/all-products?page=N` listing page into its product cards. */
export function parseWalkInLabCatalog(html: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(html)) !== null) {
    const slug = m[1]!;
    const name = decodeEntities(m[2]!.trim());
    if (name && !seen.has(slug)) seen.set(slug, { name, slug, url: `https://www.walkinlab.com/products/view/${slug}` });
  }
  return [...seen.values()];
}

/** Follow the listing's `rel="next"` link (absent on the last page). */
export function parseWalkInLabNextPage(html: string, currentUrl: string): string | null {
  const href = NEXT_PAGE_RE.exec(html)?.[1];
  if (!href) return null;
  return new URL(href, currentUrl).toString();
}

/** Parse a product detail page into a CatalogProduct with a single provider carrying both codes. */
export function parseWalkInLabProduct(html: string, baseUrl = 'https://www.walkinlab.com', slug?: string): CatalogProduct | null {
  const name = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)
    ?.replace(/<[^>]+>/g, '')
    .trim();
  if (!name) return null;

  const id = slug ?? firstMatch(html, /\/products\/view\/([a-z0-9-]+)/) ?? '';
  const url = `${baseUrl}/products/view/${id}`;

  // The primary add-to-cart button carries the lab (Quest/Labcorp/BioReference) + a numeric product
  // id; its price lives in a sibling span keyed by that same id. Related/upsell products further down
  // the page have their own id/price pairs, so anchoring on the id keeps us on the right one.
  const labMatch = /class='[^']*\b(Quest|Labcorp|BioReference)\b[^']*add_item[^']*'\s+id='(\d+)'/i.exec(html);
  const labProvider = labMatch?.[1]?.toLowerCase() ?? 'quest';
  const productId = labMatch?.[2];
  const price = productId ? firstMatch(html, new RegExp(`finalPrice_${productId}">\\$([0-9,]+\\.\\d{2})`)) : undefined;

  const codesText = firstMatch(html, /Test Code\(s\):<\/strong>\s*<p[^>]*>\s*([^<]+?)\s*<\/p>/);
  const codes = codesText ? codesText.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean) : [];

  const cptText = firstMatch(html, /CPT Code\(s\):<\/strong>\s*([^<]*)/) ?? '';
  const isPanel = /see individual/i.test(cptText);

  const provider: ProviderOffering = {
    labProvider,
    labTestIDs: codes,
    price: price ? Number(price.replace(/,/g, '')) : null,
    isPanel,
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
