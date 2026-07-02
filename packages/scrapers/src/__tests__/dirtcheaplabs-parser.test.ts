import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeDirtCheapLabsCatalog } from '../catalog/dirtcheaplabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Real Dirt Cheap Labs API responses captured 2026-07 (api.dirtcheaplabs.com/api/catalog/alacarte).
const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
const products = mergeDirtCheapLabsCatalog([
  { lab: 'labcorp', json: fx('dcl-alacarte-labcorp.json') },
  { lab: 'quest', json: fx('dcl-alacarte-quest.json') },
]);
const OPTS = { mergeCodeTiers: true };

describe('mergeDirtCheapLabsCatalog', () => {
  it('merges both labs into products keyed by slug', () => {
    expect(products.length).toBeGreaterThan(150);
    const ferritin = products.find((p) => p.slug === 'ferritin')!;
    expect(ferritin.providers.map((x) => x.labProvider).sort()).toEqual(['labcorp', 'quest']);
    const lc = ferritin.providers.find((x) => x.labProvider === 'labcorp')!;
    expect(lc.labTestIDs).toContain('004598');
    expect(lc.price).toBe(5.99);
    const q = ferritin.providers.find((x) => x.labProvider === 'quest')!;
    expect(q.labTestIDs).toContain('457');
    expect(q.price).toBe(6.22);
  });
});

describe('DCL matching (mergeCodeTiers → cheapest lab)', () => {
  it('matches Ferritin and takes the cheaper lab (LabCorp $5.99 < Quest $6.22)', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(5.99);
    expect(r.provider).toBe('labcorp');
  });

  it('drops a wrong-test code hit via name corroboration (TSH quest 867 = "T4 Total")', () => {
    // Seed TSH quest=867 actually resolves to "T4 (Thyroxine), Total" at Quest; only the LabCorp code
    // (004259 → "TSH") is name-compatible, so we price TSH at LabCorp $6.50 instead of the $2.99 T4.
    const test: TestKey = { id: 't', name: 'TSH', questCode: '867', labcorpCode: '004259' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.provider).toBe('labcorp');
    expect(r.price).toBe(6.5);
  });

  it('CBC takes the cheaper lab across two differently-named CBC products', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(2.88); // Quest $2.88 < LabCorp $6.70
  });

  it('does not match Vitamin B12 to Vitamin A/C/E on the generic "vitamin" token', () => {
    const test: TestKey = { id: 't', name: 'Vitamin B12', questCode: '927', labcorpCode: '000429' };
    const r = matchTestToProducts(test, products, OPTS);
    // No B12 code in DCL → name tier; only real B12 products may match (never Vitamin A/C/E).
    expect(r.candidates.every((c) => /b12|cobalamin/i.test(c.productName))).toBe(true);
  });

  it('does not flag ambiguous for the two-lab price spread (takes cheapest)', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    expect(matchTestToProducts(test, products, OPTS).status).not.toBe('ambiguous');
  });

  it('unmatched when neither code is in the catalog', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent Assay', questCode: '999999', labcorpCode: '888888' };
    expect(matchTestToProducts(test, products, OPTS).status).toBe('unmatched');
  });
});
