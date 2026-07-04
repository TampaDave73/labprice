// Discounted Labs (discountedlabs.com) HTML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// Magento under the hood (native `price-box price-final_price` markup, `catalogsearch` URLs). The
// `/choose-a-test` page's product cards are pre-rendered "search result" links (Alpine.js `dlSearch`
// component) — no pagination found live (~100 links, single page). "$1 today, pay balance after
// results" business model, same as Private MD Labs — we compare on the full balance price shown in
// `price-final_price`, not the $1 teaser.
//
// Lab order codes are NOT a structured field — they only show up when a product page happens to link
// out to `labcorp.com/tests/<code>/...` as editorial "verify this test" content (checked live: present
// on some pages, absent on others, no Quest equivalent found). Codes are opportunistic, not universal —
// matching falls back to name when absent, like Request A Test's missing-code drug panels.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const CARD_RE = /<a href="https:\/\/www\.discountedlabs\.com\/([a-z0-9-]+)"[^>]*dl_search_result_title_clicked[^>]*>\s*([^<]+?)\s*<\/a>/g;
const LABCORP_LINK_RE = /labcorp\.com\/tests\/(\d+)\//;

/** Parse the `/choose-a-test` listing page into its product cards (name + link). Single page, no pagination. */
export function parseDiscountedLabsCatalog(html: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(html)) !== null) {
    const slug = m[1]!;
    const name = decodeEntities(m[2]!.trim());
    if (name && !seen.has(slug)) seen.set(slug, { name, slug, url: `https://www.discountedlabs.com/${slug}` });
  }
  return [...seen.values()];
}

/** Parse a product page: name, full balance price, and an opportunistic LabCorp code if the page links to one. */
export function parseDiscountedLabsProduct(html: string, baseUrl = 'https://www.discountedlabs.com', slug?: string): CatalogProduct | null {
  const name = firstMatch(html, /<span class="base">\s*([^<]+?)\s*<\/span>/)?.trim();
  if (!name) return null;

  const id = slug ?? '';
  const url = `${baseUrl}/${id}`;

  // First `price-final_price` block on the page is the main product price (a second, identical-looking
  // block further down repeats it for a sticky/mobile add-to-cart bar — first is enough).
  const price = firstMatch(html, /class="price-box price-final_price" data-role="priceBox">[\s\S]*?<span class="price">\$([\d,]+(?:\.\d{2})?)<\/span>/);
  const labcorpCode = LABCORP_LINK_RE.exec(html)?.[1];

  const provider: ProviderOffering = {
    // Only claim 'labcorp' when we actually found that outbound link — otherwise leave it honestly
    // 'unknown' so a Change Queue reviewer isn't told a specific lab we don't actually know.
    labProvider: labcorpCode ? 'labcorp' : 'unknown',
    labTestIDs: labcorpCode ? [labcorpCode] : [],
    price: price ? Number(price.replace(/,/g, '')) : null,
    isPanel: false, // no reliable bundle signal found; relies on the matcher's name-token safeguards.
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
