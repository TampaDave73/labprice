// Build the outbound "Order" URL: always land the customer on the exact product page we discovered
// (the offering's externalUrl), with the vendor's affiliate tracking layered on top when present.
//
// affiliateUrlTemplate conventions (most precise first):
//  1. Contains a {url} / {destination} / {target} placeholder → the network redirects to a deep link;
//     we substitute the URL-encoded product URL. e.g. "https://go.impact.com/c/123?u={url}"
//  2. Query-string only (no scheme), e.g. "?subid=labtestcompare" or "aff=abc&utm_source=ltc"
//     → appended to the product URL as tracking params.
//  3. A bare redirector URL with no placeholder → we append the product URL as a `url` param.
// With no template, the customer just goes straight to the product page.

const PLACEHOLDER = /\{\{?\s*(?:url|destination|target|deeplink|deep_link)\s*\}?\}/i;

export function buildOrderUrl(productUrl: string | null, websiteUrl: string | null, affiliateUrlTemplate: string | null): string | null {
  // Prefer the exact product page; fall back to the vendor homepage only if we never discovered one.
  const base = productUrl || websiteUrl;
  if (!base) return null;

  const template = affiliateUrlTemplate?.trim();
  if (!template) return base;

  // 1. Placeholder template → inject the encoded destination.
  if (PLACEHOLDER.test(template)) {
    return template.replace(PLACEHOLDER, encodeURIComponent(base));
  }

  // 2. Query-string-only template → append tracking params to the product URL.
  if (!/^https?:\/\//i.test(template)) {
    const params = template.replace(/^[?&]+/, '');
    if (!params) return base;
    return `${base}${base.includes('?') ? '&' : '?'}${params}`;
  }

  // 3. Bare redirector URL, no placeholder → pass the destination as a `url` param.
  return `${template}${template.includes('?') ? '&' : '?'}url=${encodeURIComponent(base)}`;
}
