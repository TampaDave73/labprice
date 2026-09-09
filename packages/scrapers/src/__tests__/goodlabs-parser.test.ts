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

  // Regression 2026-09-09: DHEA-Sulfate and Prolactin have real, priced product pages but were never
  // discovered — the JSON-LD ItemList only carries a partial catalog (~50 of ~200+ real tests). The
  // A-Z "all tests" index further down the same page has the rest.
  it('finds tests missing from the JSON-LD ItemList via the A-Z test index', () => {
    const dhea = entries.find((e) => e.slug === 'dhea-sulfate');
    expect(dhea).toBeDefined();
    expect(dhea!.name).toBe('DHEA-Sulfate');
    expect(dhea!.url).toBe('https://goodlabs.com/tests/dhea-sulfate');

    const prolactin = entries.find((e) => e.slug === 'prolactin');
    expect(prolactin).toBeDefined();
    expect(prolactin!.name).toBe('Prolactin');
  });

  it('decodes HTML entities in A-Z index names', () => {
    const mens = entries.find((e) => e.slug === 'comprehensive-mens');
    expect(mens!.name).toBe("Comprehensive Men's");
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
