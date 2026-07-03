// Name → lab-code lookup against our live vendor catalogs.
//
// WHY: when an admin adds a test, we want to auto-fill its Quest/LabCorp order codes. Our vendor
// catalogs already carry those codes keyed by product name (Dirt Cheap Labs' API is the richest
// source — it lists every à la carte test with both a Quest and a LabCorp order code). So we match
// the test name into the DCL catalog and read the codes off the matched product. This is the
// authoritative, non-hallucinated source; the AI fallback only fills gaps the catalog can't.
import { fetchDirtCheapLabsCatalog } from './dirtcheaplabs-parser';
import { nameMatches, sharesStrongToken, strongTokens } from './matcher';
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

/** Number of distinctive tokens the query shares with a candidate product name (higher = better). */
function overlapScore(query: string, candidate: string): number {
  const q = strongTokens(query);
  const c = strongTokens(candidate);
  let n = 0;
  for (const t of q) if (c.has(t)) n++;
  return n;
}

/**
 * Pick the single best catalog product for `name`, or null when the match is unconfident.
 * A candidate must both pass `nameMatches` (token-subset) AND `sharesStrongToken` (guards against
 * matching on a generic word alone). Among survivors we take the highest distinctive-token overlap;
 * if the top score is TIED between products with different codes we bail (ambiguous → let the caller
 * fall back to AI / manual entry rather than guess a wrong code).
 */
function bestProduct(name: string, products: CatalogProduct[]): CatalogProduct | null {
  const candidates = products.filter((p) => nameMatches(name, p.name) && sharesStrongToken(name, p.name));
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((p) => ({ p, score: overlapScore(name, p.name) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const tiedAtTop = scored.filter((s) => s.score === top.score);
  if (tiedAtTop.length > 1) {
    // Tie is fine only if every tied product yields the same code pair (same test listed twice).
    const key = (p: CatalogProduct) => `${codeFor(p, 'quest') ?? ''}|${codeFor(p, 'labcorp') ?? ''}`;
    const distinct = new Set(tiedAtTop.map((s) => key(s.p)));
    if (distinct.size > 1) return null;
  }
  return top.p;
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
