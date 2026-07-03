import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePersonalabsCatalog, parsePersonalabsProduct, parsePersonalabsNextPage } from '../catalog/personalabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Personalabs HTTP responses captured 2026-07 (see fixtures/personalabs-*.html).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parsePersonalabsProduct(fx(name), 'https://www.personalabs.com')!;

describe('parsePersonalabsCatalog', () => {
  const entries = parsePersonalabsCatalog(fx('personalabs-catalog-p1.html'));

  it('parses /product/<slug>/ cards from an all-test listing page', () => {
    expect(entries.length).toBeGreaterThan(5);
    const cbc = entries.find((e) => /cbc with differential/i.test(e.name));
    expect(cbc).toBeDefined();
    expect(cbc!.slug).toBe('cbc-with-differential-and-platelet-count-blood-test');
    expect(cbc!.url).toBe('https://www.personalabs.com/product/cbc-with-differential-and-platelet-count-blood-test/');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parsePersonalabsNextPage', () => {
  it('follows the "Next" pagination link on page 1', () => {
    const next = parsePersonalabsNextPage(fx('personalabs-catalog-p1.html'), 'https://www.personalabs.com/products/all-test/');
    expect(next).toBe('https://www.personalabs.com/products/all-test/page/2/');
  });

  it('follows the "Next" pagination link on page 2', () => {
    const next = parsePersonalabsNextPage(fx('personalabs-catalog-p2.html'), 'https://www.personalabs.com/products/all-test/page/2/');
    expect(next).toBe('https://www.personalabs.com/products/all-test/page/3/');
  });

  it('returns null when there is no next-page link', () => {
    expect(parsePersonalabsNextPage('<html><body>no pagination here</body></html>', 'https://www.personalabs.com/x')).toBeNull();
  });
});

describe('parsePersonalabsProduct', () => {
  it('parses CBC: name, LabCorp provider + code, price, not a panel', () => {
    const p = product('personalabs-cbc.html');
    expect(p.name).toMatch(/cbc with differential/i);
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('labcorp');
    expect(p.providers[0]!.labTestIDs).toEqual(['005009']);
    expect(p.providers[0]!.price).toBe(44);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses Hemoglobin A1c: code + price', () => {
    const p = product('personalabs-hba1c.html');
    expect(p.providers[0]!.labTestIDs).toEqual(['102525']);
    expect(p.providers[0]!.price).toBe(50);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('flags a multi-test bundle as a panel (more than one hidden_test_code)', () => {
    const p = product('personalabs-healthy-male-panel.html');
    expect(p.name).toMatch(/healthy male checkup/i);
    expect(p.providers[0]!.labTestIDs).toEqual(['340143', '167015']);
    expect(p.providers[0]!.isPanel).toBe(true);
  });

  it('returns null for HTML with no product (no h1)', () => {
    expect(parsePersonalabsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('Personalabs matching (strict per-lab tiers, provider labelled directly)', () => {
  const cbc = product('personalabs-cbc.html');
  const hba1c = product('personalabs-hba1c.html');
  const panel = product('personalabs-healthy-male-panel.html');
  const OPTS = { includePanels: false };

  it('matches CBC by our LabCorp code', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, [cbc], OPTS);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('labcorp');
    expect(r.price).toBe(44);
  });

  it('does not match a Quest code against a Labcorp-labelled provider (strict tiers)', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '005009', labcorpCode: '999999' };
    const r = matchTestToProducts(test, [cbc], OPTS);
    expect(r.status).toBe('unmatched');
  });

  it('matches Hemoglobin A1c by our LabCorp code', () => {
    const test: TestKey = { id: 't', name: 'Hemoglobin A1c', questCode: '496', labcorpCode: '102525' };
    const r = matchTestToProducts(test, [hba1c], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(50);
  });

  it('never matches a bundle panel for one of its constituent tests (panels excluded by default)', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, [panel, cbc], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(44); // resolved from cbc, not the panel
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [cbc, hba1c, panel], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
