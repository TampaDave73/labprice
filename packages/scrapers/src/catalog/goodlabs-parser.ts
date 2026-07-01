// GoodLabs-specific HTML → structured-data parsers. Pure functions (no network) so they can be
// unit-tested against saved fixtures. Two inputs: the catalog listing page and a product page.

import { decodeNextFlight, extractJsonObject } from './flight-parser';
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const TESTS_URL_RE = /"name":"((?:[^"\\]|\\.)*)","(?:url|item)":"(https:\/\/goodlabs\.com\/tests\/[a-z0-9-]+)"/g;

/**
 * Parse the catalog listing page into every test/panel the vendor sells.
 * Source: the JSON-LD ItemList (name + /tests/<slug> url per ListItem). We read it from both the
 * decoded flight blob and the raw HTML so we're robust to where Next injects the JSON-LD.
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
  return [...seen.values()];
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
