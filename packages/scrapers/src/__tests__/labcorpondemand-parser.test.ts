import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLabCorpOnDemandCatalog, parseLabCorpOnDemandProduct } from '../catalog/labcorpondemand-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real LabCorp OnDemand HTTP responses captured 2026-07 (see fixtures/labcorpondemand-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string, slug: string) => parseLabCorpOnDemandProduct(fx(name), 'https://www.ondemand.labcorp.com', slug)!;

describe('parseLabCorpOnDemandCatalog', () => {
  const entries = parseLabCorpOnDemandCatalog(fx('labcorpondemand-sitemap.xml'));

  it('parses every /lab-tests/<slug> URL from sitemap.xml', () => {
    expect(entries.length).toBeGreaterThan(100);
    const ferritin = entries.find((e) => e.slug === 'ferritin-test');
    expect(ferritin).toBeDefined();
    expect(ferritin!.url).toBe('https://www.ondemand.labcorp.com/lab-tests/ferritin-test');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseLabCorpOnDemandProduct', () => {
  it('parses Ferritin: name, real LabCorp code, price, not a bundle', () => {
    const p = product('labcorpondemand-ferritin.html', 'ferritin-test');
    expect(p.name).toBe('Ferritin Test');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('labcorp');
    expect(p.providers[0]!.labTestIDs).toEqual(['004598']);
    expect(p.providers[0]!.price).toBe(59);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses CMP: code + price, not flagged a bundle despite being a clinical panel', () => {
    const p = product('labcorpondemand-cmp.html', 'comprehensive-metabolic-panel');
    expect(p.providers[0]!.labTestIDs).toEqual(['322000']);
    expect(p.providers[0]!.price).toBe(49);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('flags an actual build-your-own bundle via the vendor\'s own data-isbundleproduct flag', () => {
    const p = product('labcorpondemand-custom-mens-bundle.html', 'custom-mens-health-test');
    expect(p.name).toMatch(/custom men.s health test/i);
    expect(p.providers[0]!.isPanel).toBe(true);
    // Bundle SKUs are non-numeric internal ids ("LAB022"), never trusted as a real lab order code.
    expect(p.providers[0]!.labTestIDs).toEqual([]);
    expect(p.providers[0]!.price).toBe(29);
  });

  it('returns null for HTML with no product (no h1)', () => {
    expect(parseLabCorpOnDemandProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('LabCorp OnDemand matching (strict LabCorp-only tiers, real isPanel signal)', () => {
  const ferritin = product('labcorpondemand-ferritin.html', 'ferritin-test');
  const cmp = product('labcorpondemand-cmp.html', 'comprehensive-metabolic-panel');
  const bundle = product('labcorpondemand-custom-mens-bundle.html', 'custom-mens-health-test');

  it('matches Ferritin by LabCorp code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('labcorp');
    expect(r.price).toBe(59);
  });

  it('never matches the bundle for a name-adjacent single test (isPanel excludes it)', () => {
    const test: TestKey = { id: 't', name: "Men's Health Test", questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [bundle, cmp]);
    // Bundle is excluded by isPanel; CMP shares no distinctive token with "Men's Health Test", so unmatched.
    expect(r.status).toBe('unmatched');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [ferritin, cmp]);
    expect(r.status).toBe('unmatched');
  });
});
