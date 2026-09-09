import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTrueHealthLabsStorePage, fetchTrueHealthLabsCatalog } from '../catalog/truehealthlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Real True Health Labs Store API rows (`/wp-json/wc/store/v1/products?slug=<slug>`), captured
// 2026-09-09 — see truehealthlabs-parser.ts's module comment for why this replaced product-sitemap.xml.
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const rows = fx('truehealthlabs-store-sample.json');
const products = parseTrueHealthLabsStorePage(rows);
const product = (slug: string) => products.find((p) => p.slug === slug)!;

describe('parseTrueHealthLabsStorePage', () => {
  it('parses Ferritin: name + price + Quest code straight from the Store API row', () => {
    const p = product('ferritin');
    expect(p.name).toBe('Ferritin Test');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toEqual(['457']);
    expect(p.providers[0]!.price).toBe(49);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses CBC: Quest code + price', () => {
    const p = product('complete-blood-count-cbc-differential-platelets');
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toEqual(['6399']);
    expect(p.providers[0]!.price).toBe(39);
  });

  // Regression 2026-09-09: real, live, correctly-priced product that product-sitemap.xml never listed
  // at all (the old catalog source) — the whole reason this vendor moved to the Store API.
  it('parses DHEA-Sulfate: a real product the old sitemap-based catalog never discovered', () => {
    const p = product('dhea-sulfate');
    expect(p.name).toBe('DHEA Sulfate Test');
    expect(p.providers[0]!.labTestIDs).toEqual(['402']);
    expect(p.providers[0]!.price).toBe(119);
  });

  it('converts the Store API price from minor units (cents) to dollars', () => {
    // "11900" @ currency_minor_unit 2 -> $119.00, not $11,900.
    expect(product('dhea-sulfate').providers[0]!.price).toBe(119);
  });

  it('regression: drops a product priced $0 rather than treat it as a real price', () => {
    // Live (2026-09-09): Galectin-3 is priced $0 in the Store API (out of stock/discontinued) — same
    // failure mode the old GTM-dataLayer parser guarded against, now guarded at the Store API layer.
    expect(products.find((p) => p.slug === 'galectin-3-2')).toBeUndefined();
  });

  it('falls back to name-only matching for a bundle SKU that is not "<Lab>_<code>"', () => {
    const p = product('menopause-check-plus-with-dhea');
    expect(p.providers[0]!.labProvider).toBe('unknown');
    expect(p.providers[0]!.labTestIDs).toEqual([]);
    expect(p.providers[0]!.price).toBe(329);
  });

  it('decodes HTML entities in the row name', () => {
    // The raw fixture row name is "Galectin &#8211; 3" (en dash) — dropped by the $0 price above, so
    // assert the decoding directly against the raw JSON instead of via `products`.
    const raw = JSON.parse(rows).find((r: { slug: string }) => r.slug === 'galectin-3-2');
    const parsed = parseTrueHealthLabsStorePage(JSON.stringify([{ ...raw, prices: { ...raw.prices, price: '100' } }]));
    expect(parsed[0]!.name).toBe('Galectin – 3');
  });

  it('returns an empty list for a malformed/non-JSON response', () => {
    expect(parseTrueHealthLabsStorePage('not json')).toEqual([]);
  });
});

describe('fetchTrueHealthLabsCatalog', () => {
  it('pages until a short page, merging by slug', async () => {
    const page1 = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({
      slug: `t${i}`, name: `Test ${i}`, sku: `Quest_${i}`, permalink: `https://truehealthlabs.com/product/t${i}/`,
      prices: { price: '1000', currency_minor_unit: 2 },
    })));
    const page2 = JSON.stringify([
      { slug: 't100', name: 'Test 100', sku: 'Quest_100', permalink: 'https://truehealthlabs.com/product/t100/', prices: { price: '1000', currency_minor_unit: 2 } },
    ]);
    const calls: string[] = [];
    const products = await fetchTrueHealthLabsCatalog(
      { fetchHtml: async (url) => { calls.push(url); return url.includes('page=2') ? page2 : page1; } },
      { baseUrl: 'https://truehealthlabs.com' },
    );
    expect(products).toHaveLength(101);
    expect(calls).toHaveLength(2); // page 3 never fetched — page 2 was short, so the pager stopped.
  });
});

describe('True Health Labs matching (strict per-lab tiers, code explicitly labelled in the SKU)', () => {
  const ferritin = product('ferritin');
  const cbc = product('complete-blood-count-cbc-differential-platelets');

  it('matches Ferritin by Quest code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(49);
  });

  it('does not code-match a LabCorp tier against a Quest-labelled provider (strict tiers, no name fallback)', () => {
    // Ferritin's real Quest code (457) mislabelled as OUR labcorpCode should NOT satisfy the labcorp
    // tier against a provider explicitly labelled 'quest' — an unrelated name keeps the name tier from
    // masking the result, isolating the strict per-lab tier check itself.
    const test: TestKey = { id: 't', name: 'Zzz Unrelated Assay', questCode: '999999', labcorpCode: '457' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('unmatched');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [ferritin, cbc]);
    expect(r.status).toBe('unmatched');
  });
});
