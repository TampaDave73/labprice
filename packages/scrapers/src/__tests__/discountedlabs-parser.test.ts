import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiscountedLabsCatalog, parseDiscountedLabsProduct } from '../catalog/discountedlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Discounted Labs HTTP responses captured 2026-07 (see fixtures/discountedlabs-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string, slug: string) => parseDiscountedLabsProduct(fx(name), 'https://www.discountedlabs.com', slug)!;

describe('parseDiscountedLabsCatalog', () => {
  const entries = parseDiscountedLabsCatalog(fx('discountedlabs-catalog.html'));

  it('parses product cards from the /choose-a-test page (no pagination)', () => {
    expect(entries.length).toBeGreaterThan(50);
    const cbc = entries.find((e) => e.slug === 'cbc-blood-test-with-differential');
    expect(cbc).toBeDefined();
    expect(cbc!.name).toBe('CBC with Differential');
    expect(cbc!.url).toBe('https://www.discountedlabs.com/cbc-blood-test-with-differential');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseDiscountedLabsProduct', () => {
  it('parses CBC: name, full balance price (not the $1 teaser), and the opportunistic LabCorp code', () => {
    const p = product('discountedlabs-cbc.html', 'cbc-blood-test-with-differential');
    expect(p.name).toBe('CBC with Differential');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.price).toBe(35);
    expect(p.providers[0]!.labTestIDs).toEqual(['005009']); // from the labcorp.com/tests/005009/... outbound link
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses A1c: name + price, no code (this page has no labcorp.com outbound link)', () => {
    const p = product('discountedlabs-a1c.html', 'a1c-hemoglobin-hgb');
    expect(p.name).toMatch(/a1c/i);
    expect(p.providers[0]!.price).toBe(45);
    expect(p.providers[0]!.labTestIDs).toEqual([]);
  });

  it('returns null for HTML with no product (no title span)', () => {
    expect(parseDiscountedLabsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('Discounted Labs matching', () => {
  const cbc = product('discountedlabs-cbc.html', 'cbc-blood-test-with-differential');
  const a1c = product('discountedlabs-a1c.html', 'a1c-hemoglobin-hgb');

  it('matches CBC by LabCorp code when present', () => {
    const test: TestKey = { id: 't', name: 'CBC (Complete Blood Count)', questCode: '6399', labcorpCode: '005009' };
    const r = matchTestToProducts(test, [cbc]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('labcorp');
    expect(r.price).toBe(35);
  });

  it('A1c has no code to fall back on, and the name tokenizes differently ("hba1c" vs "a1c")', () => {
    // Our test name "HbA1c (Hemoglobin A1c)" tokenizes to the single word "hba1c"; the vendor's real
    // name "A1c- Hemoglobin (Hgb)" only has "a1c" as a separate token — no code on this page to
    // rescue it, so this is a genuine unmatched (same tokenization-mismatch class documented for
    // Walk-In Lab/Personalabs/DirectLabs), not a parser bug — confirmed the parser reads the real
    // price/name correctly above.
    const test: TestKey = { id: 't', name: 'HbA1c (Hemoglobin A1c)', questCode: '496', labcorpCode: '001453' };
    const r = matchTestToProducts(test, [a1c]);
    expect(r.status).toBe('unmatched');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [cbc, a1c]);
    expect(r.status).toBe('unmatched');
  });
});
