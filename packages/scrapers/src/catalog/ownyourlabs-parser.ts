// Own Your Labs (ownyourlabs.com) HTML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// OYL is a Phoenix/LiveView app, server-rendered (the "dead render" HTML has everything we need — no
// JSON-LD, no API). Two inputs:
//   • the shop page (/shop): cards linking to /test/<UUID> with the test name — the catalog.
//   • a product page (/test/<UUID>): the test name (h1), the price, and an "Order Code" — a single
//     lab ORDER CODE (a Quest or LabCorp code) we match against our test's questCode/labcorpCode.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

// Shop cards: <a href="/test/<uuid>?back=%2Fshop" ...>Test Name</a>. Bundles use /bundle/ and are
// intentionally NOT matched here — we only price individual tests.
const CARD_RE = /<a href="\/test\/([0-9a-f-]{36})[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g;

/** Parse the shop listing into every individual test the vendor sells (name + /test/<uuid>). */
export function parseOwnYourLabsCatalog(html: string, baseUrl = 'https://ownyourlabs.com'): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(html)) !== null) {
    const slug = m[1]!; // the UUID
    const name = decodeEntities(m[2]!.trim());
    if (name && !seen.has(slug)) seen.set(slug, { name, slug, url: `${baseUrl}/test/${slug}` });
  }
  return [...seen.values()];
}

/**
 * Parse a product page into a CatalogProduct with a single provider carrying the order code + price.
 * `labProvider` is left as 'labcorp' (OYL's codes are LabCorp order codes in practice) but matching
 * uses `codeMatchAnyProvider`, so the code is checked against BOTH our Quest and LabCorp codes.
 */
export function parseOwnYourLabsProduct(html: string, baseUrl = 'https://ownyourlabs.com', slug?: string): CatalogProduct | null {
  const name = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)?.replace(/<[^>]+>/g, '').trim();
  const orderCode = firstMatch(html, />Order Code<\/div>\s*<div[^>]*>\s*([^<\s][^<]*?)\s*<\/div>/);
  const priceStr = firstMatch(html, /\$(\d[\d,]*\.\d{2})/);
  // OYL product pages don't repeat their own UUID, so the crawler passes it in.
  const id = slug ?? firstMatch(html, /\/test\/([0-9a-f-]{36})/) ?? '';

  if (!name) return null;

  const provider: ProviderOffering = {
    labProvider: 'labcorp',
    labTestIDs: orderCode ? [orderCode] : [],
    price: priceStr ? Number(priceStr.replace(/,/g, '')) : null,
    isPanel: false, // OYL bundles live at /bundle/ and are excluded at the catalog level.
    name,
  };

  return { slug: id, name, url: id ? `${baseUrl}/test/${id}` : `${baseUrl}/test`, providers: [provider] };
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
