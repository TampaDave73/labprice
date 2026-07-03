// Personalabs (personalabs.com) HTML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// A WooCommerce store: `/products/all-test/` (27+ paginated pages) lists every product;
// `/product/<slug>/` is the detail page. Each product is fulfilled by ONE lab, and that lab is
// labelled directly in the page markup (`provider-cart-button labcorp`), so — unlike Walk-In Lab's
// two-codes-together model — we match with strict per-lab tiers, no `codeMatchAnyProvider` needed.
//
// WHY isPanel from a code COUNT, not the name: a single test's order code lives in exactly one hidden
// `.hidden_test_code` div (e.g. CBC → one div, "005009 | "); a bundle (e.g. "Healthy Male Checkup")
// carries one such div PER constituent test it bundles (verified live: 2 divs, codes 340143 +
// 167015). More than one code on the page reliably means "this is a bundle," regardless of wording.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const CARD_RE = /<a href="https:\/\/www\.personalabs\.com\/product\/([a-z0-9-]+)\/">\s*<h3>\s*([^<]+?)\s*<\/h3>/g;
const NEXT_PAGE_RE = /<a[^>]*class="next page-numbers"[^>]*href="([^"]+)"/;
const CODE_RE = /class="hidden_test_code"[^>]*>\s*([^<|]+?)\s*\|/g;

/** Parse one `/products/all-test/` (or `/page/N/`) listing page into its product cards. */
export function parsePersonalabsCatalog(html: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(html)) !== null) {
    const slug = m[1]!;
    const name = decodeEntities(m[2]!.trim());
    if (name && !seen.has(slug)) seen.set(slug, { name, slug, url: `https://www.personalabs.com/product/${slug}/` });
  }
  return [...seen.values()];
}

/** Follow the listing's "Next" pagination link (absent on the last page). */
export function parsePersonalabsNextPage(html: string, currentUrl: string): string | null {
  const href = NEXT_PAGE_RE.exec(html)?.[1];
  if (!href) return null;
  return new URL(href, currentUrl).toString();
}

/** Parse a product detail page into a CatalogProduct with a single (lab-labelled) provider. */
export function parsePersonalabsProduct(html: string, baseUrl = 'https://www.personalabs.com', slug?: string): CatalogProduct | null {
  const name = firstMatch(html, /class="product_title[^"]*"[^>]*>\s*([^<]+?)\s*<\/h1>/)?.trim();
  if (!name) return null;

  const id = slug ?? firstMatch(html, /\/product\/([a-z0-9-]+)\/?"/) ?? '';
  const url = `${baseUrl}/product/${id}/`;

  const labProvider = firstMatch(html, /provider-cart-button\s+(quest|labcorp|bioreference)/i)?.toLowerCase() ?? 'labcorp';
  const priceStr = firstMatch(html, /class="amount">\$([\d,]+(?:\.\d{2})?)</);

  const codes: string[] = [];
  CODE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODE_RE.exec(html)) !== null) codes.push(m[1]!.trim());

  const provider: ProviderOffering = {
    labProvider,
    labTestIDs: codes,
    price: priceStr ? Number(priceStr.replace(/,/g, '')) : null,
    isPanel: codes.length > 1,
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
