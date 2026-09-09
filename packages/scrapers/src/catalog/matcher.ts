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
// Generic lab words that are NOT distinctive on their own — a shared "vitamin" or "panel" doesn't mean
// two tests are the same. Used to require a *distinctive* shared token (so "Vitamin B12" ≠ "Vitamin A").
const COMMON_WORDS = new Set([
  ...STOPWORDS, 'vitamin', 'profile', 'screen', 'level', 'levels', 'total', 'free', 'comprehensive',
  'complete', 'count', 'random', 'urine', 'ratio', 'ratios', 'sensitive', 'immunoassay', 'ultrasensitive',
  'quantitative', 'qualitative', 'reflex', 'includes',
]);

interface Flat {
  product: CatalogProduct;
  provider: ProviderOffering;
}

export function matchTestToProducts(
  test: TestKey,
  products: CatalogProduct[],
  opts: MatchOptions = {},
): MatchResult {
  const includePanels = opts.includePanels ?? false;
  const flagAmbiguous = opts.flagAmbiguous ?? true;
  const anyProvider = opts.codeMatchAnyProvider ?? false;
  // mergeCodeTiers: treat Quest+LabCorp as one "code" match and take the CHEAPEST — for vendors that
  // sell the same test through multiple labs at different prices (Dirt Cheap Labs), where the customer
  // would just pick the cheaper lab. Falls back to the name tier only.
  const priority = opts.mergeCodeTiers ? (['name'] as MatchTier[]) : (opts.matchPriority ?? DEFAULT_PRIORITY);

  // Flatten to (product, provider) pairs, dropping panels unless explicitly included.
  const flat: Flat[] = [];
  for (const product of products) {
    for (const provider of product.providers) {
      if (!includePanels && provider.isPanel) continue;
      flat.push({ product, provider });
    }
  }

  if (opts.mergeCodeTiers) {
    const codeHits = flat.filter(
      (f) =>
        (!!test.questCode && f.provider.labTestIDs.some((id) => normalizeLabCode(id) === test.questCode)) ||
        (!!test.labcorpCode && f.provider.labTestIDs.some((id) => normalizeLabCode(id) === test.labcorpCode)),
    );
    if (codeHits.length > 0) {
      // A code can be stale/wrong and land on the wrong test (seed TSH Quest code 867 is actually
      // "T4 Total" at Quest). Trust a code hit only if the product name also shares a distinctive
      // token with our test — this drops the wrong-test hit while keeping the same test across labs.
      //
      // Checked against `testNames` (name + confirmed aliases), NOT the bare name — same rule the
      // name tier uses below. A vendor that lists a test only under an abbreviation ("HbA1c" for our
      // "Hemoglobin A1c") shares no token with our name, so a bare-name check rejected codes that were
      // exactly right: the test came back `unmatched`, or `ambiguous` once an alias let the name tier
      // see it — defeating the point of the admin having confirmed that alias.
      const trusted = codeHits.filter((h) => testNames(test).some((n) => sharesStrongToken(n, h.product.name)));
      if (trusted.length > 0) {
        const priced = [...trusted].filter((h) => h.provider.price != null).sort((a, b) => a.provider.price! - b.provider.price!);
        // If every trusted code hit lacks a price (a stale/broken price selector), there's nothing
        // to stage — fall through to the name tier rather than reporting 'matched' with price:null.
        if (priced.length > 0) {
          const best = priced[0]!;
          const tier: MatchTier =
            !!test.questCode && best.provider.labTestIDs.some((id) => normalizeLabCode(id) === test.questCode)
              ? 'quest'
              : 'labcorp';
          // The OTHER lab, if it also carries this test at a (necessarily higher, since `priced` is
          // sorted ascending) price — surfaced as a secondary option rather than silently dropped.
          const altBest = priced.find((h) => h.provider.labProvider !== best.provider.labProvider);
          return matched(tier, best, trusted.map(toCandidate), altBest);
        }
      }
      // Every code hit was name-incompatible or unpriced → the codes are suspect; fall through to the name tier.
    }
  }

  for (const tier of priority) {
    const hits = flat.filter((f) => tierMatches(tier, test, f.provider, f.product, anyProvider));
    if (hits.length === 0) continue;

    const candidates = hits.map(toCandidate);
    const distinctPrices = new Set(hits.map((h) => h.provider.price).filter((p) => p != null));

    // Optional tie-break: if several providers of the SAME product matched, prefer a configured lab.
    if (distinctPrices.size > 1 && opts.preferredProvider) {
      const preferred = hits.filter((h) => h.provider.labProvider === opts.preferredProvider && h.provider.price != null);
      const preferredPrices = new Set(preferred.map((h) => h.provider.price));
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
    // Every hit in this tier lacks a price (a stale/broken price selector) — nothing to stage.
    // Try the next tier rather than reporting 'matched' with price:null.
    if (priced.length === 0) continue;
    const best = priced[0]!;
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

function tierMatches(
  tier: MatchTier,
  test: TestKey,
  provider: ProviderOffering,
  product: CatalogProduct,
  anyProvider: boolean,
): boolean {
  if (tier === 'quest') {
    return (
      (anyProvider || provider.labProvider === 'quest') &&
      !!test.questCode &&
      provider.labTestIDs.some((id) => normalizeLabCode(id) === test.questCode)
    );
  }
  if (tier === 'labcorp') {
    return (
      (anyProvider || provider.labProvider === 'labcorp') &&
      !!test.labcorpCode &&
      provider.labTestIDs.some((id) => normalizeLabCode(id) === test.labcorpCode)
    );
  }
  // name: token-subset match AND a shared distinctive token (so "Vitamin B12" ≠ "Vitamin A, Serum").
  // Confirmed aliases count as the test's own name — each candidate name is tried independently.
  for (const candidate of testNames(test)) {
    const subset = nameMatches(candidate, product.name) || nameMatches(candidate, provider.name);
    if (subset && (sharesStrongToken(candidate, product.name) || sharesStrongToken(candidate, provider.name))) return true;
  }
  return false;
}

/**
 * Strip a trailing consumer-SKU letter suffix a vendor's own listing appended to a lab order code
 * (QuestHealth DTC SKUs: "34604M"). `^(\d+)[A-Z]*$` — only strips when the whole remainder after the
 * digits is letters; a code that isn't purely digits+letters (shouldn't happen for a real lab code)
 * is returned unchanged rather than mangled.
 */
export function normalizeLabCode(code: string): string {
  const m = /^(\d+)[A-Z]*$/i.exec(code.trim());
  return m ? m[1]! : code.trim();
}

/** The test's own name plus its confirmed aliases — every name the matcher treats as "this test". */
export function testNames(test: TestKey): string[] {
  return [test.name, ...(test.aliases ?? [])];
}

function matched(tier: MatchTier, best: Flat, candidates: MatchCandidate[], alt?: Flat): MatchResult {
  return {
    status: 'matched',
    matchedBy: tier,
    price: best.provider.price,
    memberPrice: best.provider.memberPrice ?? null,
    provider: best.provider.labProvider,
    altPrice: alt?.provider.price ?? null,
    altProvider: alt ? alt.provider.labProvider : null,
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

/**
 * Order-preserving light normalization for EXACT name/alias equality (TestAlias.normalized,
 * VendorProduct.normalizedName): lowercase, punctuation → space, collapse whitespace. Deliberately
 * NOT token-based — token sets drop 1-char tokens ("Vitamin D" would degenerate to just "vitamin"),
 * which is fine for overlap heuristics but far too lossy for an equality key.
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Naive singularization so "Antibody" and "Antibodies" count as the same token. Regression found live
// 2026-09-09: GoodLabs' own product name is "Thyroid Peroxidase Antibody (TPO)" (singular) against our
// test "Thyroid Peroxidase Antibodies" (plural, and every one of its aliases is plural too) — exact
// Quest/LabCorp code matches on the actual detail page, but the SUBSET-match narrowing pass
// (`nameMatches`, catalog-scraper.ts) never even fetched that page, because plain string tokens don't
// consider "antibody" ⊆ "antibodies". Deliberately narrow rules, not general stemming: "-ies" → "-y" is
// unambiguous (antibodies/antibody, allergies/allergy), and a bare trailing "-s" is dropped EXCEPT after
// "s"/"u"/"i" — guards real non-plural words that happen to end in "s" ("status", "virus", "analysis").
function singularize(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 3 && token.endsWith('s') && !/[sui]s$/.test(token)) return token.slice(0, -1);
  return token;
}

/** Normalize a test name to significant tokens (lowercase, punctuation-stripped, stopwords removed). */
export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(singularize)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Distinctive tokens: name tokens minus generic lab words. "Vitamin B12" → {b12}; "CBC …" → {cbc}. */
export function strongTokens(name: string): Set<string> {
  return new Set([...nameTokens(name)].filter((t) => !COMMON_WORDS.has(t)));
}

/**
 * True when `a` and `b` share a distinctive token — guards against matching on a generic word alone
 * ("Vitamin B12" vs "Vitamin A" share only "vitamin" → false). If `a` has no distinctive tokens at
 * all we can't judge, so we don't block the match (return true).
 */
export function sharesStrongToken(a: string, b: string): boolean {
  const sa = strongTokens(a);
  if (sa.size === 0) return true;
  const tb = nameTokens(b);
  for (const t of sa) if (tb.has(t)) return true;
  return false;
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
