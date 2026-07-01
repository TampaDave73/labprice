import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGoodLabsProduct } from '../catalog/goodlabs-parser';
import { matchTestToProducts, nameMatches } from '../catalog/matcher';
import type { CatalogProduct, TestKey } from '../catalog/types';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parseGoodLabsProduct(fx(name))!;

// Real GoodLabs products.
const ferritin = product('goodlabs-ferritin.html');
const cmp = product('goodlabs-cmp.html');
const mens = product('goodlabs-comprehensive-mens.html');
const testoTotalMs = product('goodlabs-testosterone-total-ms.html');
const testoFreeTotalMs = product('goodlabs-testosterone-free-total-ms.html');

// Our seed tests (packages/database/prisma/seed.ts).
const T = {
  ferritin: { id: 't1', name: 'Ferritin', questCode: '457', labcorpCode: '004598' },
  cmp: { id: 't2', name: 'Comprehensive Metabolic Panel', questCode: '10231', labcorpCode: '322000' },
  testosterone: { id: 't3', name: 'Testosterone Total', questCode: '873', labcorpCode: '004226' },
  unknown: { id: 't4', name: 'Zzz Nonexistent Assay', questCode: '999999', labcorpCode: '888888' },
} satisfies Record<string, TestKey>;

describe('matchTestToProducts — code match (the clean path)', () => {
  it('matches Ferritin by Quest code → Quest price $9', () => {
    const r = matchTestToProducts(T.ferritin, [ferritin]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(9);
    expect(r.provider).toBe('quest');
    expect(r.sourceUrl).toBe('https://goodlabs.com/tests/ferritin');
  });

  it('matches CMP by Quest code even though it is clinically a "panel"', () => {
    const r = matchTestToProducts(T.cmp, [cmp]);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(5);
  });

  it('falls back to LabCorp code when Quest code is absent', () => {
    const labcorpOnly: TestKey = { id: 't', name: 'Ferritin', labcorpCode: '004598' };
    const r = matchTestToProducts(labcorpOnly, [ferritin]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('labcorp');
    expect(r.price).toBe(15);
  });
});

describe('matchTestToProducts — ambiguity (flag, do not guess)', () => {
  it('flags Testosterone when the name matches several products at different prices', () => {
    // Seed Quest code 873 does NOT match GoodLabs MS-based testosterone (15983…), so it falls to
    // name matching, which hits multiple testosterone products → ambiguous.
    const r = matchTestToProducts(T.testosterone, [testoTotalMs, testoFreeTotalMs]);
    expect(r.status).toBe('ambiguous');
    expect(r.matchedBy).toBe('name');
    expect(r.price).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.reason).toMatch(/different prices/i);
  });

  it('preferredProvider resolves a same-product multi-lab tie instead of flagging', () => {
    // If we matched Ferritin by NAME (hitting all 3 labs), a Quest preference picks $9 cleanly.
    const byName: TestKey = { id: 't', name: 'Ferritin' };
    const r = matchTestToProducts(byName, [ferritin], { preferredProvider: 'quest' });
    expect(r.status).toBe('matched');
    expect(r.price).toBe(9);
    expect(r.provider).toBe('quest');
  });

  it('without a preference, a name-only Ferritin match across 3 labs is ambiguous', () => {
    const byName: TestKey = { id: 't', name: 'Ferritin' };
    const r = matchTestToProducts(byName, [ferritin]);
    expect(r.status).toBe('ambiguous');
  });
});

describe('matchTestToProducts — panel exclusion & no match', () => {
  it('excludes bundle panels: a name matching a bundle does not price off it', () => {
    const bundleTest: TestKey = { id: 't', name: "Comprehensive Men's" };
    const r = matchTestToProducts(bundleTest, [mens]);
    expect(r.status).toBe('unmatched');
  });

  it('includePanels:true lets a bundle be matched (opt-in)', () => {
    const bundleTest: TestKey = { id: 't', name: "Comprehensive Men's" };
    const r = matchTestToProducts(bundleTest, [mens], { includePanels: true, flagAmbiguous: false });
    expect(r.status).toBe('matched');
  });

  it('returns unmatched for a test the vendor does not carry', () => {
    const r = matchTestToProducts(T.unknown, [ferritin, cmp, testoTotalMs]);
    expect(r.status).toBe('unmatched');
  });
});

describe('nameMatches', () => {
  it('is tolerant of qualifiers and punctuation', () => {
    expect(nameMatches('Testosterone Total', 'Testosterone, Total, MS')).toBe(true);
    expect(nameMatches('TSH (Thyroid Stimulating Hormone)', 'TSH')).toBe(true);
    expect(nameMatches('Ferritin', 'Vitamin D, 25-Hydroxy')).toBe(false);
  });
});
