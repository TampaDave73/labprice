// Request A Test (requestatest.com) HTML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// Gated behind a Cloudflare JS challenge on every path except the homepage — needs `browser-fetch.ts`'s
// `browserFetchHtml`, not the default `httpFetchHtml` (see that module's comment for why this is opt-in
// per-vendor rather than the default). Once rendered, `/tests` is a single (large, ~850-product) page —
// no pagination.
//
// Each product page has up to two lab panels (`panel LabLC` / `panel LabQD`), each with its own price
// and a labelled `Test Code:` — like GoodLabs, not like Walk-In Lab's "both codes together." A lab
// missing for a product gets a `noTest` modifier class and no price/code (e.g. drug panels are
// LabCorp-only) — we simply don't find a match for that lab and skip it, no special-casing needed.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const CARD_RE = /<h4 class="RATpanel1[^"]*">\s*<a href="(\/[a-z0-9-]+)">\s*([^<]+?)\s*<\/a>/g;

/** Parse the `/tests` listing page into every product card (name + link). Single page, no pagination. */
export function parseRequestATestCatalog(html: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(html)) !== null) {
    const path = m[1]!;
    const slug = path.replace(/^\//, '');
    const name = decodeEntities(m[2]!.trim());
    if (name && !seen.has(slug)) seen.set(slug, { name, slug, url: `https://requestatest.com${path}` });
  }
  return [...seen.values()];
}

/** Scope to one lab panel's content, up to (not including) wherever the next `panel` div starts. */
function labBlock(html: string, labClass: 'LabLC' | 'LabQD'): string | null {
  const start = html.indexOf(`class="panel ${labClass}"`);
  if (start === -1) return null;
  const nextPanel = html.indexOf('<div class="panel ', start + 1);
  return html.slice(start, nextPanel === -1 ? undefined : nextPanel);
}

function parseLabOffering(block: string | null, labProvider: string, name: string): ProviderOffering | null {
  if (!block) return null;
  const price = /<strong>\s*\$([\d,]+(?:\.\d{2})?)\s*<\/strong>/.exec(block)?.[1];
  if (!price) return null; // e.g. a `noTest` panel — this lab doesn't carry the test.
  // Codes aren't universal (drug panels have a price but no "Test Code:" at all, verified live) — fall
  // back to no codes rather than dropping the whole offering; matching degrades to name for these.
  const code = /<b>Test Code:<\/b>\s*([^\s<]+)/.exec(block)?.[1];
  return { labProvider, labTestIDs: code ? [code] : [], price: Number(price.replace(/,/g, '')), isPanel: false, name };
}

/** Parse a product page into a CatalogProduct with up to two lab-specific offerings (LabCorp, Quest). */
export function parseRequestATestProduct(html: string, baseUrl = 'https://requestatest.com', slug?: string): CatalogProduct | null {
  const name = firstMatch(html, /<h1[^>]*>\s*([^<]+?)\s*<\/h1>/)?.trim();
  if (!name) return null;

  const id = slug ?? firstMatch(html, /rel="canonical" href="https:\/\/requestatest\.com\/([a-z0-9-]+)"/) ?? '';
  const url = `${baseUrl}/${id}`;

  const providers = [
    parseLabOffering(labBlock(html, 'LabLC'), 'labcorp', name),
    parseLabOffering(labBlock(html, 'LabQD'), 'quest', name),
  ].filter((p): p is ProviderOffering => p !== null);

  if (providers.length === 0) return null; // page loaded but no priced lab (unexpected — treat as no product).
  return { slug: id, name, url, providers };
}

function firstMatch(html: string, re: RegExp): string | undefined {
  return re.exec(html)?.[1];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
