// Resolve one of OUR tests against a vendor's catalog products. Pure + deterministic so the
// business rules (search key priority, panel exclusion, ambiguity handling) are unit-testable.
//
// Rules (see SKILLS.md → "GoodLabs scraper"):
//  1. Search key priority: Quest code → LabCorp code → name. First tier with any hit wins; we do
//     NOT blend tiers (matching a test by BOTH its Quest and LabCorp code would find two different
//     lab listings at two prices and look falsely ambiguous).
//  2. Panels excluded: a bundle (isPanel:true) is never a match for a single test — we want the
//     test itself, not the panel it might be part of.
//  3. Ambiguity: if the winning tier yields more than one DISTINCT price, we refuse to guess and
//     flag it for manual review (the Change Queue). A single distinct price (even across labs) is
//     an unambiguous match.

import type {
  CatalogProduct,
  MatchCandidate,
  MatchOptions,
  MatchResult,
  MatchTier,
  ProviderOffering,
  TestKey,
} from './types';

const DEFAULT_PRIORITY: MatchTier[] = ['quest', 'labcorp', 'name'];
// Filler tokens ignored during name matching so "TSH (Thyroid Stimulating Hormone)" still matches "TSH".
const STOPWORDS = new Set(['test', 'panel', 'with', 'and', 'the', 'a', 'of', 'for', 'serum', 'plasma', 'blood']);

interface Flat {
  product: CatalogProduct;
  provider: ProviderOffering;
}

export function matchTestToProducts(
  test: TestKey,
  products: CatalogProduct[],
  opts: MatchOptions = {},
): MatchResult {
  const priority = opts.matchPriority ?? DEFAULT_PRIORITY;
  const includePanels = opts.includePanels ?? false;
  const flagAmbiguous = opts.flagAmbiguous ?? true;

  // Flatten to (product, provider) pairs, dropping panels unless explicitly included.
  const flat: Flat[] = [];
  for (const product of products) {
    for (const provider of product.providers) {
      if (!includePanels && provider.isPanel) continue;
      flat.push({ product, provider });
    }
  }

  for (const tier of priority) {
    const hits = flat.filter((f) => tierMatches(tier, test, f.provider, f.product));
    if (hits.length === 0) continue;

    const candidates = hits.map(toCandidate);
    const distinctPrices = new Set(hits.map((h) => h.provider.price).filter((p) => p != null));

    // Optional tie-break: if several providers of the SAME product matched, prefer a configured lab.
    if (distinctPrices.size > 1 && opts.preferredProvider) {
      const preferred = hits.filter((h) => h.provider.labProvider === opts.preferredProvider);
      const preferredPrices = new Set(preferred.map((h) => h.provider.price).filter((p) => p != null));
      if (preferred.length > 0 && preferredPrices.size === 1) {
        const best = preferred[0]!;
        return matched(tier, best, candidates);
      }
    }

    if (distinctPrices.size > 1 && flagAmbiguous) {
      return {
        status: 'ambiguous',
        matchedBy: tier,
        price: null,
        provider: null,
        sourceUrl: null,
        candidates,
        reason: `Matched by ${tier} but found ${distinctPrices.size} different prices (${[...distinctPrices]
          .sort((a, b) => (a as number) - (b as number))
          .map((p) => `$${p}`)
          .join(', ')}). Flagged for manual review.`,
      };
    }

    // Single distinct price (or ambiguity-flagging disabled): take the cheapest concrete hit.
    const priced = hits.filter((h) => h.provider.price != null).sort((a, b) => a.provider.price! - b.provider.price!);
    const best = priced[0] ?? hits[0]!;
    return matched(tier, best, candidates);
  }

  return {
    status: 'unmatched',
    matchedBy: null,
    price: null,
    provider: null,
    sourceUrl: null,
    candidates: [],
    reason: 'No catalog product matched this test by Quest code, LabCorp code, or name.',
  };
}

function tierMatches(tier: MatchTier, test: TestKey, provider: ProviderOffering, product: CatalogProduct): boolean {
  if (tier === 'quest') {
    return provider.labProvider === 'quest' && !!test.questCode && provider.labTestIDs.includes(test.questCode);
  }
  if (tier === 'labcorp') {
    return provider.labProvider === 'labcorp' && !!test.labcorpCode && provider.labTestIDs.includes(test.labcorpCode);
  }
  // name: compare our test name against the product/provider name (normalized token-subset).
  return nameMatches(test.name, product.name) || nameMatches(test.name, provider.name);
}

function matched(tier: MatchTier, best: Flat, candidates: MatchCandidate[]): MatchResult {
  return {
    status: 'matched',
    matchedBy: tier,
    price: best.provider.price,
    provider: best.provider.labProvider,
    sourceUrl: best.product.url,
    candidates,
    reason: `Matched by ${tier} → ${best.product.name} (${best.provider.labProvider}) $${best.provider.price}.`,
  };
}

function toCandidate(f: Flat): MatchCandidate {
  return {
    productSlug: f.product.slug,
    productName: f.product.name,
    labProvider: f.provider.labProvider,
    labTestIDs: f.provider.labTestIDs,
    price: f.provider.price,
    isPanel: f.provider.isPanel,
    url: f.product.url,
  };
}

/** Normalize a test name to significant tokens (lowercase, punctuation-stripped, stopwords removed). */
export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * True when one name's significant tokens are a subset of the other's — tolerant to the extra
 * qualifiers vendors add ("Testosterone, Total, MS" ⊇ "Testosterone Total"). Requires ≥1 shared
 * token and no contradicting token on the smaller side.
 */
export function nameMatches(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return true;
}
