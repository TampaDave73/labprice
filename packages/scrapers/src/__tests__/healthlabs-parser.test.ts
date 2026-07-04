import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHealthLabsCatalog, parseHealthLabsProduct } from '../catalog/healthlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real HealthLabs.com HTTP responses captured 2026-07 (see fixtures/healthlabs-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parseHealthLabsProduct(fx(name), 'https://www.healthlabs.com')!;

describe('parseHealthLabsCatalog', () => {
  const entries = parseHealthLabsCatalog(fx('healthlabs-sitemap.xml'));

  it('parses every <loc> URL from the sitemap (mix of tests + non-test pages)', () => {
    expect(entries.length).toBeGreaterThan(500);
    const ferritin = entries.find((e) => e.slug === 'ferritin-testing');
    expect(ferritin).toBeDefined();
    expect(ferritin!.url).toBe('https://www.healthlabs.com/ferritin-testing');
    // Non-test pages come along for the ride — filtered later by parseProduct returning null.
    expect(entries.some((e) => e.slug === 'faq')).toBe(true);
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseHealthLabsProduct', () => {
  it('parses Almond Allergy Test: name, 3 codes, price, not a panel', () => {
    const p = product('healthlabs-almond.html');
    expect(p.name).toMatch(/almond allergy test/i);
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labTestIDs).toEqual(['1727', '2820', '602479']);
    expect(p.providers[0]!.price).toBe(49);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses Ferritin: 6 codes across more labs, still not a panel', () => {
    const p = product('healthlabs-ferritin.html');
    expect(p.name).toMatch(/ferritin test/i);
    expect(p.providers[0]!.labTestIDs).toEqual(expect.arrayContaining(['457', '004598']));
    expect(p.providers[0]!.price).toBe(29);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses a bundle panel with many codes — isPanel is always false (see matcher tests for why)', () => {
    const p = product('healthlabs-food-panel.html');
    expect(p.name).toMatch(/basic food allergy panel/i);
    expect(p.providers[0]!.labTestIDs.length).toBeGreaterThan(40);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('regression: a genuine SINGLE test can have as many codes as a bundle — no count cutoff', () => {
    // Live bug (2026-07-03): CBC is one test, but HealthLabs sources it from far more than 3 labs, so
    // it carries 17 testCodes — more than Ferritin's 6, in the same range as small bundles. The
    // original `codes.length > 12` heuristic mis-flagged this as a panel, which meant the manual
    // pinned-URL price lookup (`priceFromPinnedUrl` filters `!isPanel`) silently returned no price.
    const p = product('healthlabs-cbc.html');
    expect(p.name).toMatch(/complete blood count/i);
    expect(p.providers[0]!.labTestIDs.length).toBeGreaterThan(12);
    expect(p.providers[0]!.labTestIDs).toEqual(expect.arrayContaining(['6399', '005009']));
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('returns null for a page with no JSON-LD Product block', () => {
    expect(parseHealthLabsProduct('<html><body>no ld+json here</body></html>')).toBeNull();
  });

  it('returns null for malformed JSON-LD', () => {
    expect(parseHealthLabsProduct('<script type="application/ld+json">{not json</script>')).toBeNull();
  });
});

describe('HealthLabs matching (codeMatchAnyProvider)', () => {
  const almond = product('healthlabs-almond.html');
  const ferritin = product('healthlabs-ferritin.html');
  const panel = product('healthlabs-food-panel.html');
  const OPTS = { codeMatchAnyProvider: true, includePanels: false };

  it('matches Ferritin by our Quest code', () => {
    const test: TestKey = { id: 't', name: 'Ferritin', questCode: '457', labcorpCode: '004598' };
    const r = matchTestToProducts(test, [ferritin], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(29);
  });

  it('flags ambiguous (not silently wrong) when a bundle shares a code with a constituent test', () => {
    // With no isPanel exclusion, Almond's own code (602479) code-matches BOTH the standalone product
    // AND the panel that reuses it, at two different prices ($49 vs $160) — the matcher's existing
    // ambiguity guard is what keeps this safe, not panel detection. Worse UX (manual review) but never
    // a silently wrong price, which is the accepted tradeoff documented in healthlabs-parser.ts.
    const test: TestKey = { id: 't', name: 'Almond Allergy Test', questCode: '602479', labcorpCode: '999999' };
    const r = matchTestToProducts(test, [panel, almond], OPTS);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates.map((c) => c.price).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([49, 160]);
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [almond, ferritin, panel], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
