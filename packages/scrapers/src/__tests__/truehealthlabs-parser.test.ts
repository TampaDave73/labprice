import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTrueHealthLabsCatalog, parseTrueHealthLabsProduct } from '../catalog/truehealthlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real True Health Labs HTTP responses captured 2026-07 (see fixtures/truehealthlabs-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parseTrueHealthLabsProduct(fx(name), 'https://truehealthlabs.com')!;

describe('parseTrueHealthLabsCatalog', () => {
  const entries = parseTrueHealthLabsCatalog(fx('truehealthlabs-sitemap.xml'));

  it('parses every /product/<slug>/ URL from the dedicated product sitemap', () => {
    expect(entries.length).toBeGreaterThan(1000);
    const ferritin = entries.find((e) => e.slug === 'ferritin');
    expect(ferritin).toBeDefined();
    expect(ferritin!.url).toBe('https://truehealthlabs.com/product/ferritin/');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseTrueHealthLabsProduct', () => {
  it('parses Ferritin: name + price from the GTM dataLayer, Quest code from the SKU', () => {
    const p = product('truehealthlabs-ferritin.html');
    expect(p.name).toBe('Ferritin Test');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toEqual(['457']);
    expect(p.providers[0]!.price).toBe(49);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses CBC: Quest code + price', () => {
    const p = product('truehealthlabs-cbc.html');
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toEqual(['6399']);
    expect(p.providers[0]!.price).toBe(39);
  });

  it('parses Vitamin D: SKU has a trailing variant segment we ignore ("Quest_17306_303" → "17306")', () => {
    const p = product('truehealthlabs-vitamin-d.html');
    expect(p.providers[0]!.labTestIDs).toEqual(['17306']);
    expect(p.providers[0]!.price).toBe(99);
  });

  it('returns null for HTML with no GTM item data', () => {
    expect(parseTrueHealthLabsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('True Health Labs matching (strict per-lab tiers, code explicitly labelled in the SKU)', () => {
  const ferritin = product('truehealthlabs-ferritin.html');
  const cbc = product('truehealthlabs-cbc.html');

  it('matches Ferritin by Quest code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(49);
  });

  it('does not code-match a LabCorp tier against a Quest-labelled provider (strict tiers, no name fallback)', () => {
    // Ferritin's real Quest code (457) mislabelled as OUR labcorpCode should NOT satisfy the labcorp
    // tier against a provider explicitly labelled 'quest' — an unrelated name keeps the name tier from
    // masking the result, isolating the strict per-lab tier check itself.
    const test: TestKey = { id: 't', name: 'Zzz Unrelated Assay', questCode: '999999', labcorpCode: '457' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('unmatched');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [ferritin, cbc]);
    expect(r.status).toBe('unmatched');
  });
});
