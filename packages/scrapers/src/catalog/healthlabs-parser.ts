// HealthLabs.com HTML/XML → structured-data parsers. Pure functions (no network) so they're
// unit-testable against saved fixtures.
//
// No single "all tests" listing page (tests live at flat root-level slugs like /almond-allergy-testing,
// mixed in with blog posts and account pages — no dedicated catalog path at all). Instead we use the
// site's own `sitemap.xml` as the catalog: one flat fetch, no pagination needed. Non-test URLs (blog
// posts, /faq, /account, …) become CatalogEntry noise, but `parseProduct` returns null for anything
// without a valid JSON-LD `Product` block, so they're silently skipped once narrowing selects them (in
// practice narrowing's name-matching rarely selects them at all, since they don't share test-name
// tokens).
//
// Each product page embeds clean, parseable JSON-LD (`@type: Product`) with a `testCode`
// `additionalProperty` per lab — like Walk-In Lab, multiple codes with no per-code lab label, so we
// match with `codeMatchAnyProvider`.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const LOC_RE = /<loc>\s*([^<]+?)\s*<\/loc>/g;
const LDJSON_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

/** Parse `sitemap.xml` into a candidate entry per URL. Non-test pages are filtered out downstream. */
export function parseHealthLabsCatalog(xml: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    const url = m[1]!;
    const slug = url.replace(/\/+$/, '').split('/').pop() ?? '';
    if (!slug || seen.has(slug)) continue;
    // Approximate name from the slug for narrowing purposes only — the real name comes from the
    // fetched page's JSON-LD once a candidate is selected.
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    seen.set(slug, { name, slug, url });
  }
  return [...seen.values()];
}

/**
 * Parse a product page's JSON-LD `Product` block into a CatalogProduct. Returns null for pages with
 * no such block (blog posts, account pages, etc. picked up from the sitemap).
 */
export function parseHealthLabsProduct(html: string, baseUrl = 'https://www.healthlabs.com', slug?: string): CatalogProduct | null {
  const block = LDJSON_RE.exec(html)?.[1];
  if (!block) return null;

  let data: any;
  try {
    data = JSON.parse(block);
  } catch {
    return null;
  }
  if (data?.['@type'] !== 'Product' || !data.name) return null;

  const codes: string[] = (data.additionalProperty ?? [])
    .filter((p: any) => p?.name === 'testCode')
    .map((p: any) => String(p.value));
  const price = data.offers?.price != null ? Number(data.offers.price) : null;
  const url = typeof data.url === 'string' ? data.url : `${baseUrl}/${slug ?? ''}`;
  const id = slug ?? (url.replace(/\/+$/, '').split('/').pop() ?? '');

  const provider: ProviderOffering = {
    labProvider: 'quest', // unlabelled per-code (like Walk-In Lab); matched via codeMatchAnyProvider.
    labTestIDs: codes,
    price,
    // WEAK signal, unlike our other adapters: HealthLabs has no explicit bundle flag, no "See
    // Individual Tests" text, and `category` is absent on plenty of genuine single tests too (checked
    // live) — so it can't be used either. A single test's testCode count varies 3–6 in practice
    // (one code per carrying lab); a real bundle reuses each constituent test's OWN codes verbatim
    // (verified live: the Almond test's codes 1727/2820/602479 appear again inside the Basic Food
    // Allergy Panel's 46), so a small 2–3 test bundle could land in the same 6–12 range as a single
    // test with many labs. We pick 12 for headroom over the largest single test seen (6) and accept
    // that a small bundle might slip through as isPanel:false — the matcher's ambiguity detection
    // (>1 distinct price on a code hit) is the real backstop here, not this count.
    isPanel: codes.length > 12,
    name: data.name,
  };

  return { slug: id, name: data.name, url, providers: [provider] };
}
