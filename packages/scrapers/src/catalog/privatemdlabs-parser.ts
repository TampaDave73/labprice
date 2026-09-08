// Private MD Labs (privatemdlabs.com) HTML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// The catalog is large (~3,500 tests per the site's own count) and paginated behind `/tests?view=all`
// via same-URL AJAX (`&page=N`) — but it's still plain HTTP, no browser needed: the endpoint returns a
// full HTML page normally, and JSON (`{data: "<html fragment>", total}`) only when the request carries
// `X-Requested-With: XMLHttpRequest` (wired in `persist.ts`'s `extraHeaders`). `parseCatalog` handles
// BOTH shapes so the crawler doesn't need to know which one it got.
//
// Product pages embed clean JSON-LD (`@graph` → a `Product` entry with `offers.price`), but — unlike
// every other vendor so far — carry NO lab order code anywhere (checked live: no sku/identifier/mpn in
// the JSON-LD, no populated data-labcorp-id/data-quest-id on the listing; the attribute exists in their
// markup but is always an empty/unfilled JS template string). Matching is therefore **name-only**, like
// MitoHealth.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

// `\s+` between attributes, never a literal space: on 2026-09-08 the site began emitting TWO spaces
// there, this regex matched nothing, and the crawl reported "0 products" — which reads identically to
// a WAF block, so the vendor was written off as blocked while it was in fact serving ~900KB of product
// HTML normally. Attribute whitespace is presentational and changes on any redeploy; never pin it.
const CARD_RE = /<a\s+id="product-name-link-\d+"\s+href="(https:\/\/www\.privatemdlabs\.com\/product\/[a-z0-9-]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
const LDJSON_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

/** The AJAX pagination endpoint returns `{data: "<html>", total}`; a plain page load returns full HTML. */
function catalogHtmlFrom(input: string): string {
  const trimmed = input.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.data === 'string') return parsed.data;
    } catch {
      // not actually JSON — fall through and treat it as HTML.
    }
  }
  return input;
}

/** Parse a `/tests?view=all[&page=N]` response (HTML or AJAX JSON) into its product cards. */
export function parsePrivateMDLabsCatalog(html: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  const scanHtml = catalogHtmlFrom(html);
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(scanHtml)) !== null) {
    const url = m[1]!;
    const slug = url.split('/').filter(Boolean).pop()!;
    const name = decodeEntities(m[2]!.trim());
    if (name && !seen.has(slug)) seen.set(slug, { name, slug, url });
  }
  return [...seen.values()];
}

/**
 * Next AJAX page: bump `page` (default 1) on the current URL. Stops once a page comes back with no
 * cards at all — mirrors the site's own JS, which stops on an empty `data` field.
 */
export function parsePrivateMDLabsNextPage(html: string, currentUrl: string): string | null {
  if (parsePrivateMDLabsCatalog(html).length === 0) return null;
  const url = new URL(currentUrl);
  const page = Number(url.searchParams.get('page') ?? '1');
  url.searchParams.set('view', 'all');
  url.searchParams.set('page', String(page + 1));
  return url.toString();
}

/**
 * Parse a product page into a CatalogProduct. The page has several `<script type="application/ld+json">`
 * blocks (sitewide WebSite/Organization ones come first) — we scan all of them for the one whose
 * `@graph` contains a `Product` entry, rather than assuming it's the first block on the page.
 */
export function parsePrivateMDLabsProduct(html: string, baseUrl = 'https://www.privatemdlabs.com', slug?: string): CatalogProduct | null {
  let product: any;
  let m: RegExpExecArray | null;
  LDJSON_RE.lastIndex = 0;
  while ((m = LDJSON_RE.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]!);
      const found = Array.isArray(data?.['@graph']) ? data['@graph'].find((n: any) => n?.['@type'] === 'Product') : data?.['@type'] === 'Product' ? data : undefined;
      if (found) {
        product = found;
        break;
      }
    } catch {
      // not JSON, or not the block we want — keep scanning.
    }
  }
  if (!product?.name) return null;

  const price = product.offers?.price != null ? Number(product.offers.price) : null;
  const url = typeof product.offers?.url === 'string' ? product.offers.url : `${baseUrl}/product/${slug ?? ''}`;
  const id = slug ?? (url.replace(/\/+$/, '').split('/').pop() ?? '');

  const provider: ProviderOffering = {
    labProvider: 'quest', // no lab code on this vendor at all — matching is name-only, provider is unused.
    labTestIDs: [],
    price,
    isPanel: false, // no reliable bundle signal here either; relies on the matcher's name-token safeguards.
    name: product.name,
  };

  return { slug: id, name: product.name, url, providers: [provider] };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
