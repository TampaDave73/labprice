// Quest Health (questhealth.com) HTML/XML → structured-data parsers. Pure functions (no network) so
// they're unit-testable against saved fixtures.
//
// Quest's own first-party direct-to-consumer store (Salesforce Commerce Cloud/Demandware under the
// hood — the ".html" URLs and "dwvar_"/"data-pid" attributes are SFCC tells, not Magento despite the
// similar URL shape to other vendors). `sitemap_0.xml` lists the whole catalog (~163 products, single
// flat fetch, no pagination) with the Quest order code embedded directly in the URL itself:
// `/product/hemoglobin-a1c-test/496M.html` → code 496. We fold the `<name-slug>/<code>M` path segment
// into our `slug` field (`productUrl` just appends `.html`) so the crawler can reconstruct the URL from
// the slug alone; the product page ALSO exposes the same code via `data-pid="496"`, so we don't
// strictly depend on parsing it back out of the slug.
//
// WHY the URL comes from the page's own <link rel="canonical">, not slug reconstruction: the shared
// pinned-URL retry (persist.ts's priceFromPinnedUrl) derives a "slug" by taking the LAST path segment
// of whatever URL an admin pinned — for most vendors that's the whole slug, but ours is two segments
// (name-slug/codeM), so that generic logic hands us just "496M.html" and naively rebuilding
// `${baseUrl}/product/${slug}.html` would double the extension. Trusting the canonical tag sidesteps
// this regardless of what the crawler passes in as `slug`.
//
// Every product here is fulfilled by Quest itself (it's Quest's own store) — labProvider is always
// 'quest', strict tiers, no codeMatchAnyProvider needed.
import type { CatalogEntry, CatalogProduct, ProviderOffering } from './types';

const LOC_RE = /<loc>\s*https:\/\/www\.questhealth\.com\/product\/([a-z0-9-]+\/[0-9A-Za-z]+)\.html\s*<\/loc>/g;

/** Parse `sitemap_0.xml` into a candidate entry per product URL (the `<slug>/<code>M` path segment). */
export function parseQuestHealthCatalog(xml: string): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    const slug = m[1]!; // e.g. "hemoglobin-a1c-test/496M"
    if (seen.has(slug)) continue;
    const namePart = slug.split('/')[0]!;
    const name = namePart.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    seen.set(slug, { name, slug, url: `https://www.questhealth.com/product/${slug}.html` });
  }
  return [...seen.values()];
}

/** Parse a product page: name, price, and the Quest order code (from `data-pid`, confirmed against the URL). */
export function parseQuestHealthProduct(html: string, baseUrl = 'https://www.questhealth.com', slug?: string): CatalogProduct | null {
  const name = firstMatch(html, /<h1[^>]*>\s*([^<]+?)\s*<\/h1>/)?.trim();
  if (!name) return null;

  const price = firstMatch(html, /class="price-formatted">\s*\$([\d,]+(?:\.\d{2})?)/);
  const code = firstMatch(html, /data-pid="(\d+)"/);

  // Prefer the page's own canonical URL (always correct) over reconstructing from `slug`, which may be
  // truncated to one path segment when this is called from the generic pinned-URL retry (see above).
  const canonical = firstMatch(html, /rel="canonical" href="(https:\/\/www\.questhealth\.com\/product\/[^"]+)"/);
  const id = slug ?? (canonical ? canonical.replace(/^.*\/product\//, '').replace(/\.html$/, '') : '');
  const url = canonical ?? `${baseUrl}/product/${id}.html`;

  const provider: ProviderOffering = {
    labProvider: 'quest', // Quest's own first-party store — every product is a Quest fulfillment.
    labTestIDs: code ? [code] : [],
    price: price ? Number(price.replace(/,/g, '')) : null,
    isPanel: false, // no reliable bundle signal found; relies on the matcher's name-token safeguards.
    name,
  };

  return { slug: id, name, url, providers: [provider] };
}

function firstMatch(html: string, re: RegExp): string | undefined {
  return re.exec(html)?.[1];
}
