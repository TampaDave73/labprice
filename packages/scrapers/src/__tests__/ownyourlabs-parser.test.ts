import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOwnYourLabsCatalog, parseOwnYourLabsProduct } from '../catalog/ownyourlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { CatalogProduct, TestKey } from '../catalog/types';

// Fixtures are real Own Your Labs HTTP responses captured 2026-07 (see fixtures/oyl-*.html).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
// The crawler passes the UUID (product pages don't repeat it); tests do the same.
const SLUG = '48d5a0d1-4810-4ae4-b1b9-c5cc93526692';
const product = (name: string) => parseOwnYourLabsProduct(fx(name), 'https://ownyourlabs.com', SLUG)!;

describe('parseOwnYourLabsCatalog', () => {
  const entries = parseOwnYourLabsCatalog(fx('oyl-shop.html'));

  it('parses the /test/<uuid> cards from the shop page', () => {
    expect(entries.length).toBeGreaterThan(100);
    const cbc = entries.find((e) => /complete blood count/i.test(e.name));
    expect(cbc).toBeDefined();
    expect(cbc!.slug).toMatch(/^[0-9a-f-]{36}$/);
    expect(cbc!.url).toBe(`https://ownyourlabs.com/test/${cbc!.slug}`);
  });

  it('excludes bundle links (only /test/ items)', () => {
    expect(entries.every((e) => /^[0-9a-f-]{36}$/.test(e.slug))).toBe(true);
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseOwnYourLabsProduct', () => {
  it('parses CBC: name, LabCorp order code, price', () => {
    const p = parseOwnYourLabsProduct(fx('oyl-cbc.html'), 'https://ownyourlabs.com', SLUG)!;
    expect(p.name).toMatch(/complete blood count/i);
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labTestIDs).toContain('005009'); // LabCorp CBC order code
    expect(p.providers[0]!.price).toBe(8.4);
    expect(p.providers[0]!.isPanel).toBe(false);
    expect(p.url).toBe(`https://ownyourlabs.com/test/${SLUG}`);
  });

  it('parses Ferritin order code + price', () => {
    const p = product('oyl-ferritin.html');
    expect(p.providers[0]!.labTestIDs).toContain('004598');
    expect(p.providers[0]!.price).toBe(15);
  });

  it('parses CMP (a clinical panel sold as a test)', () => {
    const p = product('oyl-cmp.html');
    expect(p.providers[0]!.labTestIDs).toContain('322000');
    expect(p.providers[0]!.price).toBe(10);
  });

  it('returns null for HTML with no product (no h1)', () => {
    expect(parseOwnYourLabsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('OYL matching (codeMatchAnyProvider)', () => {
  const cbc = product('oyl-cbc.html');
  const ferritin = product('oyl-ferritin.html');
  const cmp = product('oyl-cmp.html');
  const OPTS = { codeMatchAnyProvider: true };

  it('matches CBC by our LabCorp code even though the provider is labelled generically', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, [cbc], OPTS);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('labcorp');
    expect(r.price).toBe(8.4);
  });

  it('matches Ferritin by LabCorp code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(15);
  });

  it('matches an order code that happens to equal our Quest code (any-provider)', () => {
    // Simulate an OYL product whose order code is a Quest code — codeMatchAnyProvider still matches.
    const questish: CatalogProduct = {
      slug: 'x', name: 'Some Test', url: 'https://ownyourlabs.com/test/x',
      providers: [{ labProvider: 'labcorp', labTestIDs: ['6399'], price: 5, isPanel: false, name: 'Some Test' }],
    };
    const test: TestKey = { id: 't', name: 'CBC', questCode: '6399', labcorpCode: '999999' };
    const r = matchTestToProducts(test, [questish], OPTS);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [cbc, ferritin, cmp], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
