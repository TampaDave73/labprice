import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDrSaysCatalog, parseDrSaysProduct } from '../catalog/drsays-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real DrSays HTTP responses captured 2026-07 (see fixtures/drsays-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string, slug: string) => parseDrSaysProduct(fx(name), 'https://www.drsays.com', slug);
const OPTS = { matchPriority: ['labcorp'] as const };

describe('parseDrSaysCatalog', () => {
  // The hand-verified slug list is a FLOOR, unioned with whatever the sitemap yields (see module
  // comment). Passing no usable XML therefore still returns exactly that floor.
  const entries = parseDrSaysCatalog('<ignored/>');

  it('returns the hardcoded known-good slugs even when the sitemap yields nothing', () => {
    const tsh = entries.find((e) => e.slug === 'test-tsh');
    expect(tsh).toBeDefined();
    expect(tsh!.url).toBe('https://www.drsays.com/home/test-tsh/');
  });

  it('excludes Cortisol and Vitamin B12 (known LabCorp code mismatches)', () => {
    const slugs = entries.map((e) => e.slug);
    expect(slugs.some((s) => s.includes('cortisol'))).toBe(false);
    expect(slugs.some((s) => s.includes('vitamin-b12'))).toBe(false);
  });

  // Regression 2026-09-08: the sitemap started listing real `test-<slug>` product URLs (22 of them,
  // 15 parseable), which the old hardcoded-only parser ignored — DrSays sat at 5 products when it had
  // three times that available, and the only way to add one was to hand-pin its URL.
  it('discovers test- URLs from the sitemap and unions them with the floor', () => {
    const xml = [
      '<urlset>',
      '<url><loc>https://www.drsays.com/home/test-cbc/</loc></url>',
      '<url><loc>https://www.drsays.com/home/test-iron-and-tibc/</loc></url>',
      '<url><loc>https://www.drsays.com/home/test-tsh/</loc></url>',
      '</urlset>',
    ].join('');
    const found = parseDrSaysCatalog(xml);
    const slugs = found.map((e) => e.slug);
    expect(slugs).toContain('test-cbc');
    expect(slugs).toContain('test-iron-and-tibc');
    expect(found.find((e) => e.slug === 'test-cbc')!.url).toBe('https://www.drsays.com/home/test-cbc/');
    // test-tsh appears in BOTH the sitemap and the floor — it must not be duplicated.
    expect(slugs.filter((s) => s === 'test-tsh')).toHaveLength(1);
    // The floor survives even though the sitemap didn't mention it.
    expect(slugs).toContain('test-magnesium');
  });

  it('ignores prefix-less /home/<slug> URLs, which are the stale ones', () => {
    const xml = '<url><loc>https://www.drsays.com/home/hemoglobin-a1c/</loc></url>';
    expect(parseDrSaysCatalog(xml).map((e) => e.slug)).not.toContain('hemoglobin-a1c');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseDrSaysProduct', () => {
  it('parses TSH: name/price/LabCorp code straight from the meta description', () => {
    const p = product('drsays-tsh.html', 'test-tsh')!;
    expect(p.name).toBe('TSH');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('labcorp');
    expect(p.providers[0]!.labTestIDs).toEqual(['004259']);
    expect(p.providers[0]!.price).toBe(8.99);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses Hemoglobin A1c: LabCorp code matches our own stored code exactly', () => {
    const p = product('drsays-hemoglobin-a1c.html', 'test-hemoglobin-a1c')!;
    expect(p.providers[0]!.labTestIDs).toEqual(['001453']);
    expect(p.providers[0]!.price).toBe(7.99);
  });

  it('parses Ferritin, Serum: LabCorp code matches our own stored code exactly', () => {
    const p = product('drsays-ferritin.html', 'test-ferritin-serum')!;
    expect(p.name).toBe('Ferritin, Serum');
    expect(p.providers[0]!.labTestIDs).toEqual(['004598']);
    expect(p.providers[0]!.price).toBe(7.99);
  });

  it('returns null for a stale sitemap entry that redirects to a generic search page, not a real product', () => {
    // Live regression (2026-07-04): cbc-with-differential's sitemap entry no longer resolves to a
    // structured product page — the site restructured and this fixture is what's actually there now.
    expect(parseDrSaysProduct(fx('drsays-broken-generic-page.html'))).toBeNull();
  });

  it('returns null for HTML with no price/code description', () => {
    expect(parseDrSaysProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('DrSays matching (LabCorp code ONLY, no name fallback — see module comment for why)', () => {
  const tsh = product('drsays-tsh.html', 'test-tsh')!;
  const a1c = product('drsays-hemoglobin-a1c.html', 'test-hemoglobin-a1c')!;

  it('matches TSH by LabCorp code', () => {
    const test: TestKey = { id: 't', name: 'TSH (Thyroid Stimulating Hormone)', questCode: '867', labcorpCode: '004259' };
    const r = matchTestToProducts(test, [tsh], OPTS);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('labcorp');
    expect(r.price).toBe(8.99);
  });

  it('does NOT fall back to a name match when the LabCorp code differs (the Cortisol/Vitamin B12 case)', () => {
    // Simulates the real discrepancy found live: a DrSays product genuinely named "Cortisol" whose
    // LabCorp code (004051) doesn't match our stored code (004341) for our own "Cortisol" test — with
    // matchPriority restricted to ['labcorp'] only, this must NOT silently name-match.
    const cortisolProduct = { ...tsh, name: 'Cortisol', providers: [{ ...tsh.providers[0]!, labTestIDs: ['004051'], name: 'Cortisol' }] };
    const test: TestKey = { id: 't', name: 'Cortisol', questCode: '395', labcorpCode: '004341' };
    const r = matchTestToProducts(test, [cortisolProduct], OPTS);
    expect(r.status).toBe('unmatched');
  });

  it('unmatched when the code does not match (name-only tier is not in matchPriority)', () => {
    const test: TestKey = { id: 't', name: 'TSH (Thyroid Stimulating Hormone)', questCode: '867', labcorpCode: '999999' };
    const r = matchTestToProducts(test, [tsh, a1c], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
