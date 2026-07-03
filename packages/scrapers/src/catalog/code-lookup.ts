// Name → lab-code lookup against our live vendor catalogs.
//
// WHY: when an admin adds a test, we want to auto-fill its Quest/LabCorp order codes. Our vendor
// catalogs already carry those codes keyed by product name (Dirt Cheap Labs' API is the richest
// source — it lists every à la carte test with both a Quest and a LabCorp order code). So we match
// the test name into the DCL catalog and read the codes off the matched product. This is the
// authoritative, non-hallucinated source; the AI fallback only fills gaps the catalog can't.
import { fetchDirtCheapLabsCatalog } from './dirtcheaplabs-parser';
import { nameTokens } from './matcher';
import type { CatalogProduct } from './types';

export interface CodeLookupResult {
  questCode: string | null;
  labcorpCode: string | null;
  source: string; // which catalog produced the codes, e.g. 'dirtcheaplabs'
  matchedName: string; // the product name we matched on (so admins can sanity-check)
}

export interface CodeLookupDeps {
  fetchHtml: (url: string) => Promise<string>;
  onLog?: (m: string) => void;
}

/** True when two names reduce to the SAME set of significant tokens (differ only by stopwords). */
function sameSignificantName(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size || a.size === 0) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/**
 * Pick the single best catalog product for `name`, or null when the match isn't confident enough to
 * trust the codes (the caller then falls back to AI / manual, which is flagged for verification).
 *
 * WHY so strict: order codes are safety-critical, so we only trust the catalog when the product is the
 * SAME test — its significant tokens (name minus pure qualifiers like "serum"/"panel"/"blood", which
 * `nameTokens` strips) exactly equal the query's. That rejects broader combos/panels whose codes
 * belong to a *different* test — e.g. "Testosterone, Free and Total" for "Testosterone, Total" (adds
 * `free`), "Vitamin B12 and Folate" for "Vitamin B12" (adds `folate`), "Iron, TIBC and Ferritin Panel"
 * for "Ferritin" (adds `iron`, `tibc`). Anything that isn't a same-name match falls through to AI.
 * If two same-name products carry different codes we bail (genuinely ambiguous).
 */
function bestProduct(name: string, products: CatalogProduct[]): CatalogProduct | null {
  const qTokens = nameTokens(name);
  if (qTokens.size === 0) return null;

  const matches = products.filter((p) => sameSignificantName(qTokens, nameTokens(p.name)));
  if (matches.length === 0) return null;

  const key = (p: CatalogProduct) => `${codeFor(p, 'quest') ?? ''}|${codeFor(p, 'labcorp') ?? ''}`;
  if (new Set(matches.map(key)).size > 1) return null; // same name, conflicting codes → ambiguous
  return matches[0]!;
}

/** Read the first order code for a given lab off a product's providers. */
function codeFor(product: CatalogProduct, lab: 'quest' | 'labcorp'): string | null {
  const provider = product.providers.find((pr) => pr.labProvider.toLowerCase() === lab && pr.labTestIDs.length > 0);
  return provider ? String(provider.labTestIDs[0]) : null;
}

/**
 * Look up Quest + LabCorp codes for a test name from our vendor catalogs (currently Dirt Cheap Labs,
 * which exposes both codes per test). Returns null when no confident match is found — the caller then
 * falls back to AI or leaves the fields blank for manual entry.
 */
export async function lookupCodesFromCatalogs(
  name: string,
  deps: CodeLookupDeps,
): Promise<CodeLookupResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  let products: CatalogProduct[];
  try {
    products = await fetchDirtCheapLabsCatalog(
      { fetchHtml: deps.fetchHtml, onLog: deps.onLog },
      { baseUrl: 'https://dirtcheaplabs.com' },
    );
  } catch (e) {
    deps.onLog?.(`code-lookup: DCL catalog fetch failed: ${(e as Error).message}`);
    return null;
  }

  const product = bestProduct(trimmed, products);
  if (!product) return null;

  const questCode = codeFor(product, 'quest');
  const labcorpCode = codeFor(product, 'labcorp');
  if (!questCode && !labcorpCode) return null;

  return { questCode, labcorpCode, source: 'dirtcheaplabs', matchedName: product.name };
}
