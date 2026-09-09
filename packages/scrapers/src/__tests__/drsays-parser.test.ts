import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDrSaysCatalog, parseDrSaysNextPage, parseDrSaysProduct } from '../catalog/drsays-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real DrSays HTTP responses captured 2026-07 (see fixtures/drsays-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string, slug: string) => parseDrSaysProduct(fx(name), 'https://www.drsays.com', slug);
const OPTS = { matchPriority: ['labcorp'] as const };

describe('parseDrSaysCatalog', () => {
  // The hand-verified slug list is a FLOOR, unioned with whatever the WP REST page listing yields (see
  // module comment). Passing no usable JSON therefore still returns exactly that floor.
  const entries = parseDrSaysCatalog('not json');

  it('returns the hardcoded known-good slugs even when the response is unparseable', () => {
    const tsh = entries.find((e) => e.slug === 'test-tsh');
    expect(tsh).toBeDefined();
    expect(tsh!.url).toBe('https://www.drsays.com/home/test-tsh/');
  });

  it('excludes Cortisol and Vitamin B12 (known LabCorp code mismatches)', () => {
    const slugs = entries.map((e) => e.slug);
    expect(slugs.some((s) => s.includes('cortisol'))).toBe(false);
    expect(slugs.some((s) => s.includes('vitamin-b12'))).toBe(false);
  });

  // Regression 2026-09-08: sitemap.xml turned out to be materially incomplete (found live: a real,
  // live "Apolipoprotein B" product page that never appears in it at all) — replaced with paging the
  // WP REST API, which is WordPress's own source of truth and can't lag itself.
  it('discovers test- slugs from the REST response and unions them with the floor', () => {
    const json = JSON.stringify([
      { slug: 'test-cbc', link: 'https://www.drsays.com/home/test-cbc/', status: 'publish' },
      { slug: 'test-apolipoprotein-b', link: 'https://www.drsays.com/home/test-apolipoprotein-b/', status: 'publish' },
      { slug: 'test-tsh', link: 'https://www.drsays.com/home/test-tsh/', status: 'publish' },
    ]);
    const found = parseDrSaysCatalog(json);
    const slugs = found.map((e) => e.slug);
    expect(slugs).toContain('test-cbc');
    expect(slugs).toContain('test-apolipoprotein-b');
    expect(found.find((e) => e.slug === 'test-cbc')!.url).toBe('https://www.drsays.com/home/test-cbc/');
    // test-tsh appears in BOTH the response and the floor — it must not be duplicated.
    expect(slugs.filter((s) => s === 'test-tsh')).toHaveLength(1);
    // The floor survives even though the response didn't mention it.
    expect(slugs).toContain('test-magnesium');
  });

  it('ignores non-test- page slugs and unpublished rows', () => {
    const json = JSON.stringify([
      { slug: 'condition-weight-management', link: 'https://www.drsays.com/home/condition-weight-management/', status: 'publish' },
      { slug: 'test-draft-thing', link: 'https://www.drsays.com/home/test-draft-thing/', status: 'draft' },
    ]);
    const slugs = parseDrSaysCatalog(json).map((e) => e.slug);
    expect(slugs).not.toContain('condition-weight-management');
    expect(slugs).not.toContain('test-draft-thing');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseDrSaysNextPage', () => {
  const url = 'https://www.drsays.com/home/wp-json/wp/v2/pages?per_page=100&page=1';
  const rowsOf = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ slug: `test-${i}`, status: 'publish' })));

  it('advances the page param when the response is a full page', () => {
    expect(parseDrSaysNextPage(rowsOf(100), url)).toBe('https://www.drsays.com/home/wp-json/wp/v2/pages?per_page=100&page=2');
  });

  // WordPress 400s a page number past the last one rather than returning an empty array, so this must
  // stop as soon as a page comes back short — never fetch "one more" to confirm the end.
  it('stops once a page is short of a full page', () => {
    expect(parseDrSaysNextPage(rowsOf(46), url)).toBeNull();
  });

  it('stops on an unparseable response', () => {
    expect(parseDrSaysNextPage('not json', url)).toBeNull();
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

  // Regression 2026-09-08: the name capture used to exclude "(" to stop before "(Labcorp Test No.
  // ...)", which broke the match entirely for any product whose own name contains parens.
  it('parses Comp. Metabolic Panel (14): a paren in the product name itself', () => {
    const p = product('drsays-cmp-14.html', 'test-cmp-14')!;
    expect(p).not.toBeNull();
    expect(p.name).toBe('Comp. Metabolic Panel (14)');
    expect(p.providers[0]!.labTestIDs).toEqual(['322000']);
    expect(p.providers[0]!.price).toBe(9.99);
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
