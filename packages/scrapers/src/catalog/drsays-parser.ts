// DrSays (drsays.com) HTML/XML → structured-data parsers. Pure functions (no network) so they're
// unit-testable against saved fixtures.
//
// WordPress (Yoast SEO + Kadence blocks) — despite the homepage looking like a Laravel/Vue SPA, the
// individual `/home/test-<slug>/` test pages are plain server-rendered WordPress. There is NO reliable
// way to discover the catalog live: `sitemap.xml` lists `/home/<slug>` pages WITHOUT the `test-`
// prefix, and those are almost all stale — verified live 2026-07-04 that `thyroid-stimulating-hormone`,
// `hemoglobin-a1c`, `ferritin`, `vitamin-d-25-hydroxy` etc. from the sitemap all 404 or redirect to a
// generic search page, while the real, working pages use a DIFFERENT, undiscoverable-from-the-sitemap
// `test-<slug>` URL scheme the site never lists anywhere in bulk. So — deliberately, and unlike every
// other vendor this project — `parseCatalog` returns a HARDCODED list of individually hand-verified
// `test-<slug>` URLs rather than crawling anything. Small, honest, currently-real coverage instead of a
// crawl that would mostly 404.
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

/** Returns the hardcoded known-good slug list as catalog entries (see module comment for why this
 * isn't a live crawl — the site's sitemap is stale and doesn't list the real URL scheme). */
export function parseDrSaysCatalog(_xml: string): CatalogEntry[] {
  return DRSAYS_KNOWN_SLUGS.map((slug) => ({
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
