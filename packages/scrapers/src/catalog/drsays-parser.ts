// DrSays (drsays.com) catalog + product-detail parsers. Pure functions (no network) so they're
// unit-testable against saved fixtures.
//
// WordPress (Yoast SEO + Kadence blocks) — despite the homepage looking like a Laravel/Vue SPA, the
// individual `/home/test-<slug>/` test pages are plain server-rendered WordPress, and the site exposes
// the standard WP REST API (`/wp-json/wp/v2/pages`, unauthenticated, publish-only by default).
//
// `parseCatalog` pages through that REST endpoint (see `parseDrSaysNextPage`) rather than reading
// sitemap.xml, which is what this used until 2026-09-08. Root-caused live that day: the site's own
// sitemap.xml is materially incomplete — "Apolipoprotein B" has a real, live `test-apolipoprotein-b`
// page (200 OK) that never appears in sitemap.xml at all, and the REST API turned up ~900 `test-*`
// pages against the sitemap's ~22. The REST listing is the source of truth WordPress itself queries to
// build that sitemap, so it can't lag it. Hand-verified floor kept as a last-resort safety net in case
// the REST endpoint is ever disabled. Narrowing (see persist.ts) means the ~900 extra entries cost
// nothing beyond the cheap listing pages themselves — only names that plausibly match one of our own
// tests get their detail page fetched.
//
// Each real product page's own meta description states the price AND the fulfilling lab code in plain
// text: `"Order the TSH online (Labcorp Test No. 004259) for only $8.99."` — LabCorp-only, no Quest
// codes found on any page checked live. The name capture can't exclude "(" (see DESCRIPTION_RE comment
// below) — found live 2026-09-08 that several real product names contain parens themselves.
//
// **Deliberately LabCorp-code-only matching, no name fallback** (see `ADAPTER_DEFAULTS.matchPriority`
// in persist.ts): found live that this vendor's own LabCorp code for "Cortisol" (004051) and "Vitamin
// B12" (001503) do NOT match our stored codes for those same-named tests (004341 / 000429) — a real
// discrepancy (likely a different specific test variant, e.g. AM Cortisol vs. a panel), not a scraper
// bug — which is exactly why those two aren't in the hardcoded slug list below either. A name-only
// fallback would otherwise have silently matched the wrong price for a future same-name coincidence.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

/** WP REST API page size for `parseDrSaysCatalog`/`parseDrSaysNextPage`. */
export const DRSAYS_CATALOG_PAGE_SIZE = 100;

// Hand-verified live 2026-07-04 — each of these resolves to a real structured product page with a
// price and LabCorp code. Cortisol and Vitamin B12 are deliberately excluded (see module comment: their
// LabCorp codes don't match our stored codes for those tests, a likely different test variant).
export const DRSAYS_KNOWN_SLUGS = ['test-tsh', 'test-hemoglobin-a1c', 'test-ferritin-serum', 'test-vitamin-d-25-hydroxy', 'test-magnesium'];

// Name capture is `.+?` (not `[^"(]+?`) on purpose: a real product name can itself contain
// parens — "Comp. Metabolic Panel (14)", "Lipid Panel (Cholesterol, ... (VLDL) ...)" — and excluding
// "(" from the capture broke the match entirely for those (regression found 2026-09-08: CMP, Lipid
// Panel, Basic Metabolic Panel and PT (INR)/PTT all silently dropped as unparseable). Non-greedy still
// stops at the first literal "online (Labcorp Test No." it finds, which only appears once per string.
const DESCRIPTION_RE = /"description":\s*"Order the (.+?)\s*online \(Labcorp Test No\. (\d+)\) for only \$([\d.]+)\./;

/** One row of a `GET /wp-json/wp/v2/pages` response, trimmed to what we read (`_fields=slug,link,status`). */
interface WpPageRow {
  slug?: unknown;
  link?: unknown;
  status?: unknown;
}

function parseWpPagesJson(json: string): WpPageRow[] {
  try {
    const rows: unknown = JSON.parse(json);
    return Array.isArray(rows) ? (rows as WpPageRow[]) : [];
  } catch {
    return []; // malformed/non-JSON response (e.g. an HTML error page) — treat as an empty page
  }
}

/** Catalog entries discovered by paging the WP REST API (see module comment), unioned with the
 * hand-verified floor. Anchored to the `test-` slug prefix on purpose — that's the individual
 * order-a-lab-test page type; the site has hundreds of other page slugs (conditions, panels-as-content,
 * blog posts) that aren't real orderable products. */
export function parseDrSaysCatalog(json: string): CatalogEntry[] {
  const slugs = new Set<string>(DRSAYS_KNOWN_SLUGS);
  const urlBySlug = new Map<string, string>();
  for (const row of parseWpPagesJson(json)) {
    const slug = typeof row.slug === 'string' ? row.slug.toLowerCase() : '';
    if (!slug.startsWith('test-') || row.status !== 'publish') continue;
    slugs.add(slug);
    if (typeof row.link === 'string') urlBySlug.set(slug, row.link);
  }

  return [...slugs].map((slug) => ({
    name: slug.replace(/^test-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    slug,
    url: urlBySlug.get(slug) ?? `https://www.drsays.com/home/${slug}/`,
  }));
}

/** Advances `catalogPath`'s `page` param, stopping once a page comes back short of a full page —
 * WordPress 400s a page number past the last one (`rest_post_invalid_page_number`), so this must never
 * ask for one more once a partial page says there's nothing left. */
export function parseDrSaysNextPage(json: string, currentUrl: string): string | null {
  const rows = parseWpPagesJson(json);
  if (rows.length < DRSAYS_CATALOG_PAGE_SIZE) return null;
  const url = new URL(currentUrl);
  const page = Number(url.searchParams.get('page') ?? '1');
  url.searchParams.set('page', String(page + 1));
  return url.toString();
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
