// Covers `discover()`'s narrowing behavior — specifically that the list used to NARROW THE CRAWL
// (which detail pages get fetched) can differ from the list used to MATCH OFFERINGS (`tests`). This
// matters post-catalog-reset: a fresh vendor has live tests but zero existing offerings yet, so
// narrowing by `tests` alone would crawl nothing (see `narrowToAllTests` in persist.ts).
//
// Fake page-based adapter: catalog/product "HTML" is just JSON we control, so no real parser is
// needed — this isolates discover()'s own narrowing/matching wiring from any vendor-specific parsing.
import { describe, expect, it } from 'vitest';
import { discover } from '../catalog/catalog-scraper';
import { nameMatches } from '../catalog/matcher';
import type { CatalogAdapter, CatalogEntry, CatalogProduct, TestKey } from '../catalog/types';

const CATALOG_URL = 'https://fake.test/catalog';

function makeFakeVendor(entries: CatalogEntry[], products: Map<string, CatalogProduct>) {
  const fetchedSlugs: string[] = [];

  const adapter: CatalogAdapter = {
    name: 'fake',
    parseCatalog: (html) => JSON.parse(html) as CatalogEntry[],
    parseProduct: (html) => (html ? (JSON.parse(html) as CatalogProduct) : null),
    productUrl: (baseUrl, slug) => `${baseUrl}/p/${slug}`,
  };

  const fetchHtml = async (url: string): Promise<string> => {
    if (url === CATALOG_URL) return JSON.stringify(entries);
    const slug = url.split('/p/')[1]!;
    fetchedSlugs.push(slug);
    const product = products.get(slug);
    if (!product) throw new Error(`no fixture for slug ${slug}`);
    return JSON.stringify(product);
  };

  const cfg = { baseUrl: 'https://fake.test', catalogPath: '/catalog', adapter, rateLimitMs: 0 };
  return { fetchedSlugs, fetchHtml, cfg };
}

const product = (slug: string, name: string, price: number): CatalogProduct => ({
  slug,
  name,
  url: `https://fake.test/p/${slug}`,
  providers: [{ labProvider: 'quest', labTestIDs: [], price, isPanel: false, name }],
});

const entries: CatalogEntry[] = [
  { name: 'Alpha Marker', slug: 'alpha', url: 'https://fake.test/p/alpha' },
  { name: 'Beta Marker', slug: 'beta', url: 'https://fake.test/p/beta' },
  { name: 'Gamma Marker', slug: 'gamma', url: 'https://fake.test/p/gamma' },
];
const products = new Map([
  ['alpha', product('alpha', 'Alpha Marker', 10)],
  ['beta', product('beta', 'Beta Marker', 20)],
  ['gamma', product('gamma', 'Gamma Marker', 30)],
]);

const alphaTest: TestKey = { id: 'alpha-test', name: 'Alpha Marker' };
const betaTest: TestKey = { id: 'beta-test', name: 'Beta Marker' };

describe('discover() — narrowTests vs tests', () => {
  it('narrows the crawl using narrowTests while entries still lists the full catalog', async () => {
    const { fetchedSlugs, fetchHtml, cfg } = makeFakeVendor(entries, products);
    // Matching list includes Alpha + Beta, but narrowing list is Alpha-only — only alpha's detail
    // page should be fetched, even though Beta would also match if it were used to narrow.
    const result = await discover([alphaTest, betaTest], { fetchHtml }, cfg, { narrowTests: [alphaTest] });

    expect(fetchedSlugs).toEqual(['alpha']);
    // The full catalog listing is still returned — nothing the crawl saw is discarded.
    expect(result.entries.map((e) => e.slug).sort()).toEqual(['alpha', 'beta', 'gamma']);

    const alphaMatch = result.matches.find((m) => m.test.id === 'alpha-test')!;
    expect(alphaMatch.result.status).toBe('matched');
    expect(alphaMatch.result.price).toBe(10);
    // Beta was never fetched (narrowing excluded it), so it can't be matched even though it's in
    // the matching list — its detail page simply isn't in the product index to match against.
    const betaMatch = result.matches.find((m) => m.test.id === 'beta-test')!;
    expect(betaMatch.result.status).toBe('unmatched');
  });

  it('omitting narrowTests falls back to narrowing by tests (unchanged default behavior)', async () => {
    const { fetchedSlugs, fetchHtml, cfg } = makeFakeVendor(entries, products);
    const result = await discover([alphaTest, betaTest], { fetchHtml }, cfg);

    expect(fetchedSlugs.sort()).toEqual(['alpha', 'beta']); // gamma excluded — not in `tests`
    expect(result.entries.length).toBe(3);
    expect(result.matches.every((m) => m.result.status === 'matched')).toBe(true);
  });

  it('narrow:false fetches every catalog entry regardless of tests or narrowTests', async () => {
    const { fetchedSlugs, fetchHtml, cfg } = makeFakeVendor(entries, products);
    const result = await discover([alphaTest], { fetchHtml }, cfg, { narrow: false, narrowTests: [alphaTest] });

    expect(fetchedSlugs.sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.products.length).toBe(3);
  });
});

// The crawl has to report what it FAILED to fetch, not just what it got: `runVendorDiscovery`'s
// 0-products guard uses these counts to say whether the listing or the detail pages broke, instead of
// guessing "likely blocked (WAF)" for both (CLAUDE.md gotcha 16).
describe('discover() — detail-fetch failure reporting', () => {
  it('counts and names every detail page that failed, while still returning the others', async () => {
    const { fetchHtml, cfg } = makeFakeVendor(entries, new Map([['alpha', product('alpha', 'Alpha Marker', 10)]]));
    const result = await discover([alphaTest, betaTest], { fetchHtml }, cfg);

    expect(result.products.map((p) => p.slug)).toEqual(['alpha']); // one dead page doesn't abort the crawl
    expect(result.detailsAttempted).toBe(2);
    expect(result.detailErrors).toEqual(['beta: no fixture for slug beta']);
  });

  it('reports an empty listing as 0 entries with no detail pages attempted', async () => {
    const { fetchHtml, cfg } = makeFakeVendor([], products);
    const result = await discover([alphaTest], { fetchHtml }, cfg);

    expect(result.entries).toEqual([]);
    expect(result.detailsAttempted).toBe(0);
    expect(result.detailErrors).toEqual([]);
  });

  it('reports a listing that crawled fine but parsed no products, with no fetch errors', async () => {
    // Every detail fetch succeeds and returns an empty body — parseProduct yields null, which is a
    // product-parser problem, not a blocked request, and must not look like one.
    const adapter: CatalogAdapter = {
      name: 'fake',
      parseCatalog: (html) => JSON.parse(html) as CatalogEntry[],
      parseProduct: () => null,
      productUrl: (baseUrl, slug) => `${baseUrl}/p/${slug}`,
    };
    const fetchHtml = async (url: string) => (url === CATALOG_URL ? JSON.stringify(entries) : '<html></html>');
    const result = await discover([alphaTest], { fetchHtml }, { baseUrl: 'https://fake.test', catalogPath: '/catalog', adapter, rateLimitMs: 0 });

    expect(result.products).toEqual([]);
    expect(result.entries.length).toBe(3);
    expect(result.detailsAttempted).toBe(1);
    expect(result.detailErrors).toEqual(['alpha: parsed no product data']);
  });
});

// Locks in the fix for the 2 code matches narrowing lost: vendors listing "Complete Blood Count
// (CBC) Test" only name-match our test via a bare "CBC" alias (none of the other CBC aliases —
// "CBC with Differential" etc. — tokenize down to just {cbc}, so none were a token-subset match).
describe('nameMatches — bare CBC alias regression', () => {
  it('a bare "CBC" alias is a token-subset match of "Complete Blood Count (CBC) Test"', () => {
    expect(nameMatches('CBC', 'Complete Blood Count (CBC) Test')).toBe(true);
  });
});
