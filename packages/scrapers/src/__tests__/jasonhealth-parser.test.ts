import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeJasonHealthCatalog } from '../catalog/jasonhealth-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Jason Health Algolia API responses captured 2026-07 (see fixtures/jasonhealth-*).
const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')).hits;
const products = mergeJasonHealthCatalog([fx('jasonhealth-page0.json'), fx('jasonhealth-page49-nullnames.json')]);
const OPTS = { matchPriority: ['quest', 'labcorp', 'name'] as const };

describe('mergeJasonHealthCatalog', () => {
  it('merges paginated Algolia hits into products keyed by url_code (the Quest code)', () => {
    expect(products.length).toBeGreaterThan(5);
    const cbc = products.find((p) => p.slug === '6399')!;
    expect(cbc).toBeDefined();
    expect(cbc.name).toBe('CBC (includes Differential and Platelets)');
    expect(cbc.url).toBe('https://www.jasonhealth.com/test/6399');
    expect(cbc.providers).toHaveLength(1);
    expect(cbc.providers[0]!.labProvider).toBe('quest');
    expect(cbc.providers[0]!.labTestIDs).toEqual(['6399']);
    expect(cbc.providers[0]!.price).toBe(5);
    expect(cbc.providers[0]!.isPanel).toBe(false);
  });

  it('flags a bundle panel when ntc_codes_of_single_test_panel is empty', () => {
    const stdPanel = products.find((p) => p.name === 'Full 5 Test STD Panel')!;
    expect(stdPanel).toBeDefined();
    expect(stdPanel.providers[0]!.isPanel).toBe(true);
    expect(stdPanel.providers[0]!.labTestIDs).toEqual([]);
  });

  it('skips deep-page hits with a null panel_name (nothing to match on)', () => {
    // The page-49 fixture is real live data where every one of its 20 hits has panel_name:null — none
    // of them should contribute a product; the merged count should equal page 0's hit count alone.
    const page0Hits = fx('jasonhealth-page0.json');
    const page49Hits = fx('jasonhealth-page49-nullnames.json');
    expect(page49Hits.every((h: { panel_name: string | null }) => h.panel_name === null)).toBe(true);
    expect(mergeJasonHealthCatalog([page0Hits])).toHaveLength(products.length);
  });

  it('de-dupes a url_code appearing across pages', () => {
    const codes = products.map((p) => p.slug);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('Jason Health matching (Quest code + name)', () => {
  it('matches CBC by Quest code', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(5);
  });

  it('matches TSH by Quest code', () => {
    const test: TestKey = { id: 't', name: 'TSH (Thyroid Stimulating Hormone)', questCode: '899', labcorpCode: '004259' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(10);
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('unmatched');
  });
});
