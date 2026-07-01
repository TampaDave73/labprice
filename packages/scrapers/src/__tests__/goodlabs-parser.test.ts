import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGoodLabsCatalog, parseGoodLabsProduct } from '../catalog/goodlabs-parser';

// Fixtures are real GoodLabs HTTP responses captured 2026-07 (see fixtures/*.html).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseGoodLabsCatalog', () => {
  const entries = parseGoodLabsCatalog(fx('goodlabs-catalog.html'));

  it('discovers the full catalog from the JSON-LD ItemList', () => {
    expect(entries.length).toBeGreaterThan(30);
  });

  it('includes name + /tests/<slug> for known products', () => {
    const ferritin = entries.find((e) => e.slug === 'ferritin');
    expect(ferritin).toBeDefined();
    expect(ferritin!.url).toBe('https://goodlabs.com/tests/ferritin');
    expect(entries.some((e) => e.slug === 'comprehensive-metabolic-panel-cmp')).toBe(true);
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseGoodLabsProduct', () => {
  it('parses Ferritin: one provider per lab, with codes/prices/isPanel', () => {
    const p = parseGoodLabsProduct(fx('goodlabs-ferritin.html'))!;
    expect(p.slug).toBe('ferritin');
    expect(p.providers.map((x) => x.labProvider).sort()).toEqual(['bioreference', 'labcorp', 'quest']);

    const quest = p.providers.find((x) => x.labProvider === 'quest')!;
    expect(quest.labTestIDs).toContain('457'); // Quest Ferritin code
    expect(quest.price).toBe(9);
    expect(quest.isPanel).toBe(false);

    const labcorp = p.providers.find((x) => x.labProvider === 'labcorp')!;
    expect(labcorp.labTestIDs).toContain('004598'); // Labcorp Ferritin code
    expect(labcorp.price).toBe(15);
  });

  it('parses CMP (a clinical panel sold individually) as NOT a bundle panel', () => {
    const p = parseGoodLabsProduct(fx('goodlabs-cmp.html'))!;
    const quest = p.providers.find((x) => x.labProvider === 'quest')!;
    expect(quest.labTestIDs).toContain('10231');
    expect(quest.price).toBe(5);
    expect(quest.isPanel).toBe(false); // individually orderable → the test itself
  });

  it('flags a GoodLabs bundle (Comprehensive Men\'s) as isPanel across all labs', () => {
    const p = parseGoodLabsProduct(fx('goodlabs-comprehensive-mens.html'))!;
    expect(p.providers.length).toBeGreaterThan(0);
    expect(p.providers.every((x) => x.isPanel === true)).toBe(true);
    expect(p.providers.find((x) => x.labProvider === 'quest')!.biomarkerCount).toBe(75);
  });

  it('parses a single-provider product (Testosterone, Total, MS — Quest only)', () => {
    const p = parseGoodLabsProduct(fx('goodlabs-testosterone-total-ms.html'))!;
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toContain('15983');
    expect(p.providers[0]!.price).toBe(11);
  });

  it('returns null for HTML without a product', () => {
    expect(parseGoodLabsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});
