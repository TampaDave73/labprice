import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWalkInLabCatalog, parseWalkInLabProduct, parseWalkInLabNextPage } from '../catalog/walkinlab-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Walk-In Lab HTTP responses captured 2026-07 (see fixtures/walkinlab-*.html).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parseWalkInLabProduct(fx(name), 'https://www.walkinlab.com')!;

describe('parseWalkInLabCatalog', () => {
  const entries = parseWalkInLabCatalog(fx('walkinlab-catalog-p1.html'));

  it('parses /products/view/<slug> cards from an all-products listing page', () => {
    expect(entries.length).toBeGreaterThan(10);
    const ferritin = entries.find((e) => /ferritin/i.test(e.name));
    expect(ferritin).toBeDefined();
    expect(ferritin!.slug).toBe('ferritin-serum-test');
    expect(ferritin!.url).toBe('https://www.walkinlab.com/products/view/ferritin-serum-test');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseWalkInLabNextPage', () => {
  it('follows the rel="next" link on a listing page', () => {
    const next = parseWalkInLabNextPage(fx('walkinlab-catalog-p1.html'), 'https://www.walkinlab.com/categories/view/all-products');
    expect(next).toBe('https://www.walkinlab.com/categories/view/all-products?page=2');
  });

  it('returns null when there is no next-page link', () => {
    expect(parseWalkInLabNextPage('<html><body>no pagination here</body></html>', 'https://www.walkinlab.com/x')).toBeNull();
  });
});

describe('parseWalkInLabProduct', () => {
  it('parses Hemoglobin A1c: name, both lab codes, price, not a panel', () => {
    const p = product('walkinlab-hba1c.html');
    expect(p.name).toMatch(/hemoglobin.*a1c/i);
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labTestIDs).toEqual(expect.arrayContaining(['001453', '496'])); // LabCorp + Quest
    expect(p.providers[0]!.price).toBe(29);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses Ferritin: both codes + price', () => {
    const p = product('walkinlab-ferritin.html');
    expect(p.providers[0]!.labTestIDs).toEqual(expect.arrayContaining(['004598', '457']));
    expect(p.providers[0]!.price).toBe(29);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('flags a multi-test bundle as a panel (CPT Code(s): See Individual Tests)', () => {
    const p = product('walkinlab-cbc-cmp-panel.html');
    expect(p.name).toMatch(/cbc.*cmp|complete blood count.*comprehensive metabolic/i);
    expect(p.providers[0]!.isPanel).toBe(true);
    // The bundle gets its OWN test code(s), never reusing a constituent test's own code.
    expect(p.providers[0]!.labTestIDs).not.toEqual(expect.arrayContaining(['496']));
  });

  it('returns null for HTML with no product (no h1)', () => {
    expect(parseWalkInLabProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('Walk-In Lab matching (codeMatchAnyProvider)', () => {
  const hba1c = product('walkinlab-hba1c.html');
  const ferritin = product('walkinlab-ferritin.html');
  const panel = product('walkinlab-cbc-cmp-panel.html');
  const OPTS = { codeMatchAnyProvider: true, includePanels: false };

  it('matches HbA1c by our Quest code even though both codes are listed together', () => {
    const test: TestKey = { id: 't', name: 'Hemoglobin A1c', questCode: '496', labcorpCode: '001453' };
    const r = matchTestToProducts(test, [hba1c], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(29);
  });

  it('matches Ferritin by our LabCorp code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(29);
  });

  it('never matches a bundle panel for one of its constituent tests (panels excluded by default)', () => {
    const test: TestKey = { id: 't', name: 'Hemoglobin A1c', questCode: '496', labcorpCode: '001453' };
    const r = matchTestToProducts(test, [panel, hba1c], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(29); // resolved from hba1c, not the panel, even though both are in the list
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [hba1c, ferritin, panel], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
