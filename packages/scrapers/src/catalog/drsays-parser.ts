// DrSays (drsays.com) HTML/XML → structured-data parsers. Pure functions (no network) so they're
// unit-testable against saved fixtures.
//
// WordPress (Yoast SEO + Kadence blocks) — despite the homepage looking like a Laravel/Vue SPA, the
// individual `/home/test-<slug>/` test pages are plain server-rendered WordPress.
//
// `parseCatalog` reads the sitemap for `/home/test-<slug>/` URLs and unions in a hand-verified slug
// list as a floor. It did NOT used to: as of 2026-07-04 the sitemap only carried `/home/<slug>` pages
// WITHOUT the `test-` prefix, and those mostly 404'd, so the parser returned the hardcoded list alone
// rather than crawl something that would mostly miss. Re-probed live 2026-09-08: the sitemap now lists
// 22 real `test-` URLs, 15 of which parse into a priced product with a LabCorp code — three times the
// hardcoded five, and including CBC, Iron and TIBC, Insulin, Prolactin and Ferritin. Keeping the union
// means a future sitemap regression can only lose the extras, never those five known-good pages.
// Unparseable URLs cost one fetch each and are dropped by `parseDrSaysProduct` returning null, which
// the crawler already tolerates.
//
// Each real product page's own meta description states the price AND the fulfilling lab code in plain
// text: `"Order the TSH online (Labcorp Test No. 004259) for only $8.99."` — LabCorp-only, no Quest
// codes found on any page checked live.
//
// **Deliberately LabCorp-code-only matching, no name fallback** (see `ADAPTER_DEFAULTS.matchPriority`
// in persist.ts): found live that this vendor's own LabCorp code for "Cortisol" (004051) and "Vitamin
// B12" (001503) do NOT match our stored codes for those same-named tests (004341 / 000429) — a real
// discrepancy (likely a different specific test variant, e.g. AM Cortisol vs. a panel), not a scraper
// bug — which is exactly why those two aren't in the hardcoded slug list below either. A name-only
// fallback would otherwise have silently matched the wrong price for a future same-name coincidence.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

// Hand-verified live 2026-07-04 — each of these resolves to a real structured product page with a
// price and LabCorp code. Cortisol and Vitamin B12 are deliberately excluded (see module comment: their
// LabCorp codes don't match our stored codes for those tests, a likely different test variant).
export const DRSAYS_KNOWN_SLUGS = ['test-tsh', 'test-hemoglobin-a1c', 'test-ferritin-serum', 'test-vitamin-d-25-hydroxy', 'test-magnesium'];

const DESCRIPTION_RE = /"description":\s*"Order the ([^"(]+?)\s*online \(Labcorp Test No\. (\d+)\) for only \$([\d.]+)\./;

// Product URLs in the sitemap. Anchored to the `test-` prefix on purpose: the sitemap also carries
// prefix-less `/home/<slug>` pages, and those are the stale ones that 404.
const SITEMAP_TEST_URL_RE = /https?:\/\/www\.drsays\.com\/home\/(test-[a-z0-9-]+)\/?/gi;

/** Catalog entries discovered from the sitemap, unioned with the hand-verified floor. */
export function parseDrSaysCatalog(xml: string): CatalogEntry[] {
  const slugs = new Set<string>(DRSAYS_KNOWN_SLUGS);
  SITEMAP_TEST_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SITEMAP_TEST_URL_RE.exec(xml ?? '')) !== null) slugs.add(m[1]!.toLowerCase());

  return [...slugs].map((slug) => ({
    name: slug.replace(/^test-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    slug,
    url: `https://www.drsays.com/home/${slug}/`,
  }));
}

/** Parse a product page: name/price/LabCorp code straight out of the meta description text. Returns
 * `null` for anything that isn't a real structured product page. */
export function parseDrSaysProduct(html: string, baseUrl = 'https://www.drsays.com', slug?: string): CatalogProduct | null {
  const m = DESCRIPTION_RE.exec(html);
  if (!m) return null;

  const name = m[1]!.trim();
  const labcorpCode = m[2]!;
  const price = Number(m[3]);

  const id = slug ?? '';
  const url = `${baseUrl}/home/${id}/`;

  const provider: ProviderOffering = {
    labProvider: 'labcorp', // every page checked live states a LabCorp code; no Quest codes found.
    labTestIDs: [labcorpCode],
    price,
    isPanel: false, // no reliable bundle signal found; the matcher's ambiguity check is the backstop.
    name,
  };

  return { slug: id, name, url, providers: [provider] };
}
