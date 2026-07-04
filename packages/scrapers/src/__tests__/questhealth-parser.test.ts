import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseQuestHealthCatalog, parseQuestHealthProduct } from '../catalog/questhealth-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Quest Health HTTP responses captured 2026-07 (see fixtures/questhealth-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parseQuestHealthProduct(fx(name), 'https://www.questhealth.com')!;

describe('parseQuestHealthCatalog', () => {
  const entries = parseQuestHealthCatalog(fx('questhealth-sitemap.xml'));

  it('parses every /product/<slug>/<code>M.html URL from sitemap_0.xml', () => {
    expect(entries.length).toBeGreaterThan(100);
    const a1c = entries.find((e) => e.slug === 'hemoglobin-a1c-test/496M');
    expect(a1c).toBeDefined();
    expect(a1c!.url).toBe('https://www.questhealth.com/product/hemoglobin-a1c-test/496M.html');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseQuestHealthProduct', () => {
  it('parses HbA1c: name, price, and the Quest code from data-pid', () => {
    const p = product('questhealth-a1c.html');
    expect(p.name).toBe('Hemoglobin A1c Test');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toEqual(['496']);
    expect(p.providers[0]!.price).toBe(39);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses CBC: code + price', () => {
    const p = product('questhealth-cbc.html');
    expect(p.providers[0]!.labTestIDs).toEqual(['6399']);
    expect(p.providers[0]!.price).toBe(29);
  });

  it('parses Vitamin D: code + price', () => {
    const p = product('questhealth-vitamin-d.html');
    expect(p.providers[0]!.labTestIDs).toEqual(['17306']);
    expect(p.providers[0]!.price).toBe(75);
  });

  it('returns null for HTML with no product (no h1)', () => {
    expect(parseQuestHealthProduct('<html><body>nope</body></html>')).toBeNull();
  });

  it('regression: uses the page\'s canonical URL, not slug + ".html", when slug is truncated', () => {
    // The shared pinned-URL retry (persist.ts) derives "slug" from the LAST path segment of whatever
    // URL an admin pinned. Ours is two segments (name-slug/codeM), so that generic logic hands us just
    // "496M.html" — naively rebuilding `${baseUrl}/product/${slug}.html` would produce
    // ".../product/496M.html.html". Trusting the page's own <link rel="canonical"> avoids that.
    const p = parseQuestHealthProduct(fx('questhealth-a1c.html'), 'https://www.questhealth.com', '496M.html')!;
    expect(p.url).toBe('https://www.questhealth.com/product/hemoglobin-a1c-test/496M.html');
  });
});

describe('Quest Health matching (strict Quest-only tiers)', () => {
  const a1c = product('questhealth-a1c.html');
  const cbc = product('questhealth-cbc.html');

  it('matches HbA1c by Quest code', () => {
    const test: TestKey = { id: 't', name: 'HbA1c (Hemoglobin A1c)', questCode: '496', labcorpCode: '001453' };
    const r = matchTestToProducts(test, [a1c]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(39);
  });

  it('does not match on a LabCorp code alone (this vendor is Quest-only)', () => {
    const test: TestKey = { id: 't', name: 'Zzz Unrelated', questCode: '999999', labcorpCode: '496' };
    const r = matchTestToProducts(test, [a1c]);
    expect(r.status).toBe('unmatched');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [a1c, cbc]);
    expect(r.status).toBe('unmatched');
  });
});
