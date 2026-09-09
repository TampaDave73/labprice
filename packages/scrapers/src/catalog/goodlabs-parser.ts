// GoodLabs-specific HTML → structured-data parsers. Pure functions (no network) so they can be
// unit-tested against saved fixtures. Two inputs: the catalog listing page and a product page.

import { decodeNextFlight, extractJsonObject } from './flight-parser';
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const TESTS_URL_RE = /"name":"((?:[^"\\]|\\.)*)","(?:url|item)":"(https:\/\/goodlabs\.com\/tests\/[a-z0-9-]+)"/g;

// The A-Z "all tests" index rendered further down the same page — plain anchors, relative hrefs.
// Regression found live 2026-09-09: the JSON-LD ItemList above only carries ~50 of the ~200+ real
// tests (DHEA-Sulfate and Prolactin both missing from it, though their product pages are real and
// priced) — some earlier/partial listing, not the full catalog. This index has all of them.
const TESTS_ANCHOR_RE = /<a href="\/tests\/([a-z0-9-]+)"[^>]*>([^<]+)<\/a>/g;

/**
 * Parse the catalog listing page into every test/panel the vendor sells.
 * Two sources, unioned by slug (JSON-LD wins where both have an entry — matches what's tested today):
 * the JSON-LD ItemList, and the plain-anchor A-Z test index further down the page. Read from both the
 * decoded flight blob and the raw HTML so we're robust to where Next injects each.
 */
export function parseGoodLabsCatalog(html: string): CatalogEntry[] {
  const haystack = html + '\n' + decodeNextFlight(html);
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  TESTS_URL_RE.lastIndex = 0;
  while ((m = TESTS_URL_RE.exec(haystack)) !== null) {
    const name = unescapeJsonish(m[1]!);
    const url = m[2]!;
    const slug = url.slice(url.lastIndexOf('/') + 1);
    if (!seen.has(slug)) seen.set(slug, { name, slug, url });
  }
  TESTS_ANCHOR_RE.lastIndex = 0;
  while ((m = TESTS_ANCHOR_RE.exec(haystack)) !== null) {
    const slug = m[1]!;
    if (seen.has(slug)) continue;
    seen.set(slug, { name: decodeEntities(m[2]!.trim()), slug, url: `https://goodlabs.com/tests/${slug}` });
  }
  return [...seen.values()];
}

// The A-Z index's anchor text is HTML, not JSON — decode entities rather than unescapeJsonish.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

interface RawProvider {
  test?: {
    slug?: string;
    name?: string;
    labTestIDs?: string[];
    price?: number | null;
    description?: string;
  };
  labProvider?: string;
  isPanel?: boolean;
}

interface RawTestResult {
  slug?: string;
  name?: string;
  providers?: RawProvider[];
}

/**
 * Parse a product detail page into a CatalogProduct with one ProviderOffering per fulfilling lab.
 * Source: the `testResult` object embedded in the flight data.
 */
export function parseGoodLabsProduct(html: string, baseUrl = 'https://goodlabs.com'): CatalogProduct | null {
  const flight = decodeNextFlight(html);
  const tr = extractJsonObject(flight, 'testResult') as RawTestResult | null;
  if (!tr || !tr.slug || !Array.isArray(tr.providers)) return null;

  // Bundle panels state their size in the JSON-LD description ("Measures 75 biomarkers"), not the
  // per-provider flight description — use it as a page-level fallback so biomarkerCount is populated.
  const pageBm = /Measures\s+(\d+)\s+biomarker/i.exec(html);
  const pageBiomarkerCount = pageBm ? Number(pageBm[1]) : undefined;

  const providers: ProviderOffering[] = tr.providers
    .map((p): ProviderOffering | null => {
      if (!p?.test) return null;
      const desc = p.test.description ?? '';
      const bm = /Measures\s+(\d+)\s+biomarker/i.exec(desc);
      const biomarkerCount = bm ? Number(bm[1]) : pageBiomarkerCount;
      return {
        labProvider: (p.labProvider ?? '').toLowerCase(),
        labTestIDs: Array.isArray(p.test.labTestIDs) ? p.test.labTestIDs.map(String) : [],
        price: typeof p.test.price === 'number' ? p.test.price : null,
        isPanel: p.isPanel === true,
        name: p.test.name ?? tr.name ?? '',
        ...(biomarkerCount != null ? { biomarkerCount } : {}),
      };
    })
    .filter((x): x is ProviderOffering => x !== null);

  return {
    slug: tr.slug,
    name: tr.name ?? tr.slug,
    url: `${baseUrl}/tests/${tr.slug}`,
    providers,
  };
}

/** Undo the one level of JSON string-escaping the ItemList names carry (&, \", etc.). */
function unescapeJsonish(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}
