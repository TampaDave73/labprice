// Catalog-scraper domain types.
//
// WHY a separate model from the offering-URL engines: some vendors (GoodLabs) don't expose a
// stable per-test URL we can pre-store. Instead they publish a *catalog* (every test they sell)
// plus per-test pages that embed structured data for every fulfilling lab. We discover the catalog,
// then match OUR tests into it by code/name — rather than fetching one known URL per offering.

/** One entry in a vendor's catalog listing (name + link), before we fetch its detail page. */
export interface CatalogEntry {
  name: string;
  slug: string;
  url: string;
}

/**
 * A single lab's listing for a product (GoodLabs resells Quest/Labcorp/BioReference, each with its
 * own code + price for the same product). `isPanel` is the vendor's own flag marking a bundle
 * (e.g. "Comprehensive Men's") vs. an individually-orderable test — the authoritative panel signal.
 */
export interface ProviderOffering {
  labProvider: string; // 'quest' | 'labcorp' | 'bioreference' | ...
  labTestIDs: string[]; // the fulfilling lab's order code(s)
  price: number | null; // the price we compare on (non-member, where a membership exists)
  /** Discounted member price, when the vendor has a membership program (MitoHealth). */
  memberPrice?: number | null;
  isPanel: boolean;
  name: string;
  biomarkerCount?: number; // parsed from the description ("Measures N biomarkers")
}

/** A fully-parsed product detail page: the vendor product plus every lab that fulfills it. */
export interface CatalogProduct {
  slug: string;
  name: string;
  url: string;
  providers: ProviderOffering[];
}

export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';
export type MatchTier = 'quest' | 'labcorp' | 'name';

/** One candidate price we found for a test (surfaced to admins when a match is ambiguous). */
export interface MatchCandidate {
  productSlug: string;
  productName: string;
  labProvider: string;
  labTestIDs: string[];
  price: number | null;
  isPanel: boolean;
  url: string;
}

/**
 * Result of resolving one of our tests against a vendor's catalog.
 * - matched:   exactly one price after panel-filtering — safe to stage/auto-approve.
 * - ambiguous: >1 distinct price survived — flag for manual review (never auto-pick a price).
 * - unmatched: the vendor doesn't appear to carry this test.
 */
export interface MatchResult {
  status: MatchStatus;
  matchedBy: MatchTier | null;
  price: number | null;
  /** Member price of the matched provider, when applicable (MitoHealth). */
  memberPrice?: number | null;
  provider: string | null;
  /**
   * Set only under `mergeCodeTiers` (Dirt Cheap Labs) when BOTH labs carry this test at different
   * prices: the more expensive lab's price/name, so the site can show it as a secondary option
   * instead of silently discarding it. `price`/`provider` above stay the cheaper lab (the compared,
   * ranked price) — unchanged behavior for every other vendor.
   */
  altPrice?: number | null;
  altProvider?: string | null;
  sourceUrl: string | null;
  candidates: MatchCandidate[];
  reason: string;
}

/** The input shape for a test we're trying to price (from our DB). */
export interface TestKey {
  id: string;
  name: string;
  questCode?: string | null;
  labcorpCode?: string | null;
  /**
   * Confirmed alternate names (TestAlias rows — learned from admin-confirmed vendor matches or the
   * tests CSV). The name tier and catalog narrowing treat each alias like the test's own name, so a
   * vendor that calls "Vitamin D, 25-Hydroxy" something else still narrows/matches once its naming
   * has been confirmed once.
   */
  aliases?: string[];
}

export interface MatchOptions {
  /** Order to try match keys. Default ['quest','labcorp','name']. First tier with a hit wins. */
  matchPriority?: MatchTier[];
  /** Include bundle panels (isPanel:true) as match candidates. Default false — we want the test itself. */
  includePanels?: boolean;
  /** When the winning tier yields >1 distinct price, flag ambiguous instead of guessing. Default true. */
  flagAmbiguous?: boolean;
  /** Optional: prefer this lab when a tier matches several providers of the SAME product (e.g. 'quest'). */
  preferredProvider?: string;
  /**
   * When true, a code tier matches a provider regardless of its labProvider — i.e. the Quest tier
   * matches any provider whose codes include our questCode, and likewise for LabCorp. Use for vendors
   * (Own Your Labs) that expose a single "order code" per test which may be either a Quest OR a
   * LabCorp code, without labelling which. Default false (GoodLabs: strict per-lab matching).
   */
  codeMatchAnyProvider?: boolean;
  /**
   * When true, Quest + LabCorp collapse into one "code" match and the CHEAPEST hit wins (never
   * ambiguous), falling back to name only. Use for vendors that sell the same test through multiple
   * labs at different prices (Dirt Cheap Labs), where the customer picks the cheaper lab.
   */
  mergeCodeTiers?: boolean;
}

/**
 * A per-vendor adapter: how to turn that vendor's catalog + product HTML into our shared shapes, and
 * how to build a product URL from a slug. Lets the catalog scraper stay vendor-agnostic (GoodLabs,
 * Own Your Labs, …) while each site's parsing lives in its own module.
 */
export interface CatalogAdapter {
  name: string;
  // Page-based vendors (GoodLabs, OYL): catalog listing → per-product pages.
  parseCatalog?(html: string): CatalogEntry[];
  /** `slug` is passed by the crawler (some sites, e.g. OYL, don't repeat their id in the page). */
  parseProduct?(html: string, baseUrl: string, slug?: string): CatalogProduct | null;
  productUrl?(baseUrl: string, slug: string): string;
  /**
   * Paginated catalog listings (Walk-In Lab: 40+ pages of `/categories/view/all-products?page=N`).
   * Given the just-fetched listing page's HTML + the URL that produced it, return the next page's
   * URL, or null when there's no more pagination. Omit for single-page catalogs (GoodLabs, OYL).
   */
  nextCatalogPage?(html: string, currentUrl: string): string | null;
  /**
   * API vendors (Dirt Cheap Labs): fetch the whole priced catalog in one shot (no per-product pages).
   * When present, the crawler uses this instead of parseCatalog/parseProduct.
   */
  fetchAll?(
    deps: { fetchHtml: (url: string) => Promise<string>; onLog?: (m: string) => void },
    cfg: { baseUrl: string; apiBase?: string },
  ): Promise<CatalogProduct[]>;
}
