import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMitoHealthCatalog, fetchMitoHealthCatalog } from '../catalog/mitohealth-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Real MitoHealth tRPC catalog response captured 2026-07 (trimmed to a few products).
const catalog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'mito-catalog.json'), 'utf8'));
const products = parseMitoHealthCatalog(catalog);

describe('parseMitoHealthCatalog', () => {
  it('parses individual tests with the cheapest provider + member/non-member prices', () => {
    const ferritin = products.find((p) => p.slug === 'ferritin')!;
    expect(ferritin.providers).toHaveLength(1);
    const prov = ferritin.providers[0]!;
    expect(prov.isPanel).toBe(false);
    expect(prov.labProvider).toBe('quest'); // Quest is cheaper than Labcorp for Ferritin
    expect(prov.price).toBe(8.19); // non-member (the compared price)
    expect(prov.memberPrice).toBe(5.85); // member discount
  });

  it('flags Mito bundle panels as isPanel', () => {
    const panel = products.find((p) => /mito essential/i.test(p.name))!;
    expect(panel.providers[0]!.isPanel).toBe(true);
  });
});

describe('fetchMitoHealthCatalog pagination', () => {
  // Regression 2026-09-09: the page cap was hardcoded to 6 (600 products) — real live catalog is
  // 1,078+ and growing, so pages 7+ (including "Testosterone, Free Blood Test", a real product) were
  // silently dropped every crawl. Found hunting a "pinned URL keeps reading as broken" report.
  const productAt = (n: number) => ({
    handle: `product-${n}`,
    title: `Product ${n}`,
    variants: [{ seller: { name: 'Quest' }, metadata: { 'com.mitohealth.nonMemberPriceCents': 1000, 'com.mitohealth.skuType': 'labTest' } }],
  });
  const trpcPage = (products: ReturnType<typeof productAt>[]) => JSON.stringify([{ result: { data: { products } } }]);

  it('pages past the old 6-page/600-product cutoff', async () => {
    const calls: string[] = [];
    const fetchHtml = async (url: string) => {
      calls.push(url);
      const offset = Number(new URL(url).searchParams.get('input')!.match(/"offset":(\d+)/)![1]);
      const page = offset / 100;
      // 8 full pages (800 products), then a short final page — matches the shape that exposed the bug.
      if (page < 8) return trpcPage(Array.from({ length: 100 }, (_, i) => productAt(offset + i)));
      if (page === 8) return trpcPage(Array.from({ length: 50 }, (_, i) => productAt(offset + i)));
      return trpcPage([]);
    };
    const products = await fetchMitoHealthCatalog({ fetchHtml }, { baseUrl: 'https://mitohealth.com' });
    expect(products).toHaveLength(850);
    expect(calls).toHaveLength(9); // stopped at the first short page, not the old 6-page cap.
  });
});

describe('MitoHealth matching (name-only) carries member price', () => {
  it('matches Ferritin by name and returns both prices', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, products, { matchPriority: ['name'] });
    expect(r.status).toBe('matched');
    expect(r.price).toBe(8.19);
    expect(r.memberPrice).toBe(5.85);
  });

  it('excludes the Mito panel from a single-test name match', () => {
    const test: TestKey = { id: 't', name: 'Mito Essential' };
    const r = matchTestToProducts(test, products, { matchPriority: ['name'] });
    expect(r.status).toBe('unmatched');
  });

  it('matches CMP (individual labTest, not a bundle)', () => {
    const test: TestKey = { id: 't', name: 'Comprehensive Metabolic Panel' };
    const r = matchTestToProducts(test, products, { matchPriority: ['name'] });
    expect(r.status).toBe('matched');
    expect(r.price).toBeGreaterThan(0);
  });
});
