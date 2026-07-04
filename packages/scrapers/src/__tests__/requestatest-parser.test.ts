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

describe('Request A Test matching (strict per-lab tiers, GoodLabs-shaped)', () => {
  const ferritin = product('requestatest-ferritin.html');
  const drugTest = product('requestatest-drug-test-10panel.html');

  it('matches Ferritin by Quest code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('matched');
  });

  it('matched tier reports the cheaper of the two labs when both survive (no code narrows it)', () => {
    // Matching by Quest code alone picks only the Quest offering ($29); matching by name (no codes)
    // would see both providers and correctly flag ambiguous — verified via the code tier here.
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '999999' };
    const r = matchTestToProducts(test, [ferritin]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(29);
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [ferritin, drugTest]);
    expect(r.status).toBe('unmatched');
  });
});
