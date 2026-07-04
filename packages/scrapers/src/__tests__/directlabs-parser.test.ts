import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeDirectLabsCatalog, fetchDirectLabsCatalog } from '../catalog/directlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Real DirectLabs (store.directlabs.com) API responses captured 2026-07, one file per category (see
// fixtures/directlabs-category-*.json) — GetTestsByCategoryID has no "list everything" mode.
const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
const products = mergeDirectLabsCatalog([
  fx('directlabs-category-78-anemia.json'),
  fx('directlabs-category-82-cardio.json'),
  fx('directlabs-category-87-hormones.json'),
  fx('directlabs-category-94-thyroid.json'),
  fx('directlabs-category-95-vitamins.json'),
]);
const OPTS = { matchPriority: ['name'] as const };

describe('mergeDirectLabsCatalog', () => {
  it('merges categories into products keyed by PK_TestID, no codes, not panels', () => {
    expect(products.length).toBeGreaterThan(100);
    const ferritin = products.find((p) => p.name === 'Ferritin')!;
    expect(ferritin).toBeDefined();
    expect(ferritin.slug).toBe('5030');
    expect(ferritin.url).toBe('https://store.directlabs.com/testinfo/5030');
    expect(ferritin.providers).toHaveLength(1);
    expect(ferritin.providers[0]!.price).toBe(39);
    expect(ferritin.providers[0]!.labTestIDs).toEqual([]);
    expect(ferritin.providers[0]!.isPanel).toBe(false);
  });

  it('de-dupes a test that would appear in more than one fetched category', () => {
    const ids = products.map((p) => p.slug);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fetchDirectLabsCatalog', () => {
  it('regression: builds product URLs on the store subdomain, never on cfg.baseUrl (the marketing site)', async () => {
    // Live bug (2026-07-04): cfg.baseUrl is the vendor's websiteUrl (directlabs.com, WordPress marketing
    // site) — /testinfo/<id> only resolves on store.directlabs.com. Passing baseUrl straight through to
    // mergeDirectLabsCatalog produced 404s for every stored offering URL until fixed.
    const anemia = fx('directlabs-category-78-anemia.json');
    const result = await fetchDirectLabsCatalog(
      { fetchHtml: async () => JSON.stringify(anemia) },
      { baseUrl: 'https://directlabs.com', apiBase: 'https://store.directlabs.com' },
    );
    for (const p of result) {
      expect(p.url.startsWith('https://store.directlabs.com/')).toBe(true);
      expect(p.url).not.toContain('https://directlabs.com/testinfo');
    }
  });
});

describe('DirectLabs matching (name-only, no lab codes)', () => {
  it('matches Ferritin by name', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(39);
  });

  it('does not match CBC — real vendor wording has no shared distinctive token (name-only limitation)', () => {
    // Our test name "CBC (Complete Blood Count)" needs "complete" to subset-match, but the vendor's
    // real name is "CBC (includes Differential And Platelets)" — no code fallback exists for this
    // vendor, so this specific wording mismatch is a genuine unmatched, not a bug. Same tokenization-
    // mismatch class already documented for Walk-In Lab/Personalabs, just visible here at the final
    // match step instead of a pre-fetch narrowing step, since this API vendor has no narrowing at all.
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('unmatched');
  });

  it('flags TSH ambiguous — the real catalog has multiple name-compatible thyroid products at different prices', () => {
    // "TSH (Thyroid-Stimulating Hormone)" $34 shares its "tsh" token with "TSH Antibody" $79 and the
    // "TSH-Ayumetrix Kit" $69 — a real, expected ambiguity for a name-only vendor with this many
    // granular variants, not a matcher bug (same category of outcome as Private MD Labs' Lipid Panel).
    const test: TestKey = { id: 't', name: 'TSH (Thyroid Stimulating Hormone)', questCode: '867', labcorpCode: '004259' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('ambiguous');
  });

  it('flags Vitamin D 25-Hydroxy ambiguous — multiple real name-compatible variants at different prices', () => {
    const test: TestKey = { id: 't', name: 'Vitamin D 25-Hydroxy', questCode: '17306', labcorpCode: '081950' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('ambiguous');
  });

  it('unmatched when neither name nor a distinctive token matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent Assay', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('unmatched');
  });
});
