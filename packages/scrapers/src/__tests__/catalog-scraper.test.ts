// Regression tests for the crawl-health signals `runVendorDiscovery` keys its FAILED/SUCCESS
// decision on (`persist.ts`). The 2026-07-28 incident was entirely about conflating two of them:
// a narrowed run that selects no detail pages looks identical to a blocked crawl if you only look
// at `products.length`. These lock in the distinction at the source.
import { describe, it, expect } from 'vitest';
import { buildCatalogIndexDetailed, discover } from '../catalog/catalog-scraper';
import type { CatalogAdapter, CatalogProduct, TestKey } from '../catalog/types';

const CATALOG_HTML = 'CATALOG';

/** Minimal page-based adapter: a 2-product catalog whose detail pages always parse. */
const pageAdapter: CatalogAdapter = {
  name: 'test-page-vendor',
  parseCatalog: (html) =>
    html === CATALOG_HTML
      ? [
          { name: 'Ferritin', slug: 'ferritin', url: 'https://v.example/tests/ferritin' },
          { name: 'Vitamin D', slug: 'vitamin-d', url: 'https://v.example/tests/vitamin-d' },
        ]
      : [],
  productUrl: (base, slug) => `${base}/tests/${slug}`,
  parseProduct: (_html, base, slug) => ({
    slug,
    name: slug === 'ferritin' ? 'Ferritin' : 'Vitamin D',
    url: `${base}/tests/${slug}`,
    providers: [{ labProvider: 'quest', labTestIDs: ['457'], price: 25, isPanel: false, name: slug }],
  }),
};

const cfg = { baseUrl: 'https://v.example', catalogPath: '/tests', adapter: pageAdapter, rateLimitMs: 0 };

const test = (name: string, questCode: string | null = null): TestKey => ({
  id: name,
  name,
  questCode,
  labcorpCode: null,
});

describe('buildCatalogIndexDetailed', () => {
  it('reports selectedCount 0 — not a broken crawl — when narrowing matches nothing', async () => {
    // Choline: a real test no page-based vendor in the catalog sells. Narrowing correctly picks zero
    // detail pages, so products is empty WHILE the catalog itself is perfectly healthy. Reading
    // `products.length === 0` as "blocked" here is exactly what failed 11 vendors on 2026-07-28.
    const res = await buildCatalogIndexDetailed(
      { fetchHtml: async () => CATALOG_HTML },
      cfg,
      [test('Choline')],
    );
    expect(res.entries).toHaveLength(2);
    expect(res.selectedCount).toBe(0);
    expect(res.products).toHaveLength(0);
  });

  it('distinguishes a blocked crawl: no entries at all', async () => {
    const res = await buildCatalogIndexDetailed({ fetchHtml: async () => 'Just a moment…' }, cfg, [test('Ferritin')]);
    expect(res.entries).toHaveLength(0);
    expect(res.selectedCount).toBe(0);
  });

  it('distinguishes broken product pages: pages selected, none parsed', async () => {
    const broken = { ...cfg, adapter: { ...pageAdapter, parseProduct: () => null } };
    const res = await buildCatalogIndexDetailed({ fetchHtml: async () => CATALOG_HTML }, broken, [test('Ferritin')]);
    expect(res.entries).toHaveLength(2);
    expect(res.selectedCount).toBe(1);
    expect(res.products).toHaveLength(0);
  });

  it('fetches only the narrowed detail pages', async () => {
    const fetched: string[] = [];
    const res = await buildCatalogIndexDetailed(
      {
        fetchHtml: async (url) => {
          if (!url.endsWith('/tests')) fetched.push(url);
          return CATALOG_HTML;
        },
      },
      cfg,
      [test('Ferritin')],
    );
    expect(fetched).toEqual(['https://v.example/tests/ferritin']);
    expect(res.selectedCount).toBe(1);
    expect(res.products).toHaveLength(1);
  });

  it('treats an API vendor\'s own product list as the selection (no detail-page step)', async () => {
    const products: CatalogProduct[] = [
      { slug: 'a', name: 'Ferritin', url: 'https://v.example/a', providers: [] },
    ];
    const apiCfg = { ...cfg, adapter: { name: 'test-api-vendor', fetchAll: async () => products } as CatalogAdapter };
    const res = await buildCatalogIndexDetailed({ fetchHtml: async () => '' }, apiCfg, [test('Choline')]);
    // API vendors skip narrowing entirely — which is why the 4 API vendors reported Choline as a
    // plain unmatched test while the page-based ones "failed" the same hour.
    expect(res.selectedCount).toBe(1);
    expect(res.products).toHaveLength(1);
  });
});

describe('discover', () => {
  it('passes selectedCount through so callers can tell narrowing from breakage', async () => {
    const res = await discover([test('Choline')], { fetchHtml: async () => CATALOG_HTML }, cfg);
    expect(res.selectedCount).toBe(0);
    expect(res.entries).toHaveLength(2);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]!.result.status).toBe('unmatched');
  });
});
