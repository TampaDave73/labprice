import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRequestATestCatalog, parseRequestATestProduct } from '../catalog/requestatest-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Request A Test HTTP responses captured 2026-07 via a stealth headless browser
// (see fixtures/requestatest-*.html) — the site Cloudflare-JS-challenges every path except the homepage.
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parseRequestATestProduct(fx(name), 'https://requestatest.com')!;

describe('parseRequestATestCatalog', () => {
  const entries = parseRequestATestCatalog(fx('requestatest-catalog.html'));

  it('parses product cards from the single /tests page (no pagination)', () => {
    expect(entries.length).toBeGreaterThan(100);
    const ferritin = entries.find((e) => e.slug === 'ferritin-blood-test');
    expect(ferritin).toBeDefined();
    expect(ferritin!.url).toBe('https://requestatest.com/ferritin-blood-test');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseRequestATestProduct', () => {
  it('parses Ferritin: both LabCorp and Quest offerings with distinct price + code', () => {
    const p = product('requestatest-ferritin.html');
    expect(p.name).toMatch(/ferritin/i);
    expect(p.providers).toHaveLength(2);
    const lc = p.providers.find((pr) => pr.labProvider === 'labcorp')!;
    const qd = p.providers.find((pr) => pr.labProvider === 'quest')!;
    expect(lc.labTestIDs).toEqual(['004598']);
    expect(lc.price).toBe(39);
    expect(qd.labTestIDs).toEqual(['457']);
    expect(qd.price).toBe(29);
  });

  it('parses a LabCorp-only test (Quest panel is `noTest`) as a single offering', () => {
    const p = product('requestatest-drug-test-10panel.html');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('labcorp');
  });

  it('returns null for HTML with no product (no h1)', () => {
    expect(parseRequestATestProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('Request A Test matching (mergeCodeTiers → cheapest lab)', () => {
  const ferritin = product('requestatest-ferritin.html');
  const drugTest = product('requestatest-drug-test-10panel.html');
  const OPTS = { mergeCodeTiers: true };

  it('matches Ferritin and takes the cheaper lab (Quest $29 < LabCorp $39)', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(29);
    expect(r.provider).toBe('quest');
  });

  // Regression 2026-09-09: every product page has BOTH a LabCorp and a Quest price, genuinely
  // different — checked live across 7 real tests, LabCorp was cheaper every time. The default tier
  // priority (quest before labcorp, first hit wins, never blended — what this vendor used before
  // mergeCodeTiers) would report the Quest price regardless of which lab was actually cheaper, the
  // opposite of what a price-comparison site should show. Ferritin's own fixture happens to have Quest
  // cheaper, which wouldn't have caught this — construct the reverse (LabCorp cheaper) explicitly.
  it('takes LabCorp when IT is the cheaper lab, not whichever tier comes first', () => {
    const labCorpCheaper = {
      ...ferritin,
      providers: ferritin.providers.map((p) => (p.labProvider === 'labcorp' ? { ...p, price: 19 } : p)),
    };
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [labCorpCheaper], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(19);
    expect(r.provider).toBe('labcorp');
  });

  it('surfaces the pricier lab as altPrice/altProvider instead of dropping it', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin], OPTS);
    expect(r.altPrice).toBe(39);
    expect(r.altProvider).toBe('labcorp');
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [ferritin, drugTest], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
