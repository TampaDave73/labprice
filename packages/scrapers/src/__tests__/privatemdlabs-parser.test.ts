import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePrivateMDLabsCatalog, parsePrivateMDLabsProduct, parsePrivateMDLabsNextPage } from '../catalog/privatemdlabs-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Private MD Labs HTTP responses captured 2026-07 (see fixtures/privatemdlabs-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string) => parsePrivateMDLabsProduct(fx(name), 'https://www.privatemdlabs.com')!;

describe('parsePrivateMDLabsCatalog', () => {
  it('parses cards from a plain HTML page load', () => {
    // This fixture is page 1 (alphabetical, starts at digits/A) — Vitamin D lives on a later page,
    // fetched separately as its own product-page fixture for the parseProduct tests below.
    const entries = parsePrivateMDLabsCatalog(fx('privatemdlabs-catalog-html.html'));
    expect(entries.length).toBeGreaterThan(10);
    const deoxycortisol = entries.find((e) => e.slug === '11-deoxycortisol');
    expect(deoxycortisol).toBeDefined();
    expect(deoxycortisol!.name).toBe('11-Deoxycortisol');
    expect(deoxycortisol!.url).toBe('https://www.privatemdlabs.com/product/11-deoxycortisol');
  });

  it('parses cards from the AJAX JSON response ({data, total})', () => {
    const entries = parsePrivateMDLabsCatalog(fx('privatemdlabs-catalog-p1.json'));
    expect(entries.length).toBeGreaterThan(10);
  });

  it('has no duplicate slugs', () => {
    const entries = parsePrivateMDLabsCatalog(fx('privatemdlabs-catalog-html.html'));
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // Regression, 2026-09-08: the live site started emitting TWO spaces between the anchor's
  // attributes. The card regex hardcoded single spaces, so it matched nothing — the crawl returned
  // 0 products and the vendor was written off as WAF-blocked for a day, while the site was happily
  // serving 904KB of product HTML. The 2026-07 fixtures still had single spaces, so the suite stayed
  // green throughout. Attribute whitespace is presentational and can change at any redeploy; the
  // parser must not depend on its exact width.
  it('parses cards regardless of the whitespace between anchor attributes', () => {
    const card = (gap: string, slug: string, name: string) =>
      `<div class="lab-test-info-wrapper">` +
      `<a id="product-name-link-4759"${gap}href="https://www.privatemdlabs.com/product/${slug}"${gap}class="lab-test-name">\n   ${name}\n  </a></div>`;

    for (const [label, gap] of [['one space', ' '], ['two spaces', '  '], ['newline + indent', '\n                        ']] as const) {
      const entries = parsePrivateMDLabsCatalog(card(gap, '11-deoxycortisol', '11-Deoxycortisol'));
      expect(entries, label).toHaveLength(1);
      expect(entries[0]!.slug, label).toBe('11-deoxycortisol');
      expect(entries[0]!.name, label).toBe('11-Deoxycortisol');
      expect(entries[0]!.url, label).toBe('https://www.privatemdlabs.com/product/11-deoxycortisol');
    }
  });
});

describe('parsePrivateMDLabsNextPage', () => {
  it('bumps page=1 (implicit) to page=2 on the first fetch', () => {
    const next = parsePrivateMDLabsNextPage(fx('privatemdlabs-catalog-p1.json'), 'https://www.privatemdlabs.com/tests?view=all');
    expect(next).toBe('https://www.privatemdlabs.com/tests?view=all&page=2');
  });

  it('bumps page=2 to page=3', () => {
    const next = parsePrivateMDLabsNextPage(fx('privatemdlabs-catalog-p2.json'), 'https://www.privatemdlabs.com/tests?view=all&page=2');
    expect(next).toBe('https://www.privatemdlabs.com/tests?view=all&page=3');
  });

  it('returns null once a page has no cards (mirrors the site stopping on empty data)', () => {
    expect(parsePrivateMDLabsNextPage('{"data":"","total":0}', 'https://www.privatemdlabs.com/tests?view=all&page=99')).toBeNull();
  });
});

describe('parsePrivateMDLabsProduct', () => {
  it('parses Vitamin D: name, price, no codes, not a panel', () => {
    const p = product('privatemdlabs-vitamin-d.html');
    expect(p.name).toBe('Vitamin D');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.price).toBe(114);
    expect(p.providers[0]!.labTestIDs).toEqual([]);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses Testosterone, Free and Total: price', () => {
    const p = product('privatemdlabs-testosterone.html');
    expect(p.name).toMatch(/testosterone/i);
    expect(p.providers[0]!.price).toBe(99);
  });

  it('returns null for HTML with no Product JSON-LD block', () => {
    expect(parsePrivateMDLabsProduct('<html><script type="application/ld+json">{"@type":"WebSite"}</script></html>')).toBeNull();
  });

  it('returns null when there is no ld+json at all', () => {
    expect(parsePrivateMDLabsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('Private MD Labs matching (name-only, no lab codes)', () => {
  const vitd = product('privatemdlabs-vitamin-d.html');
  const testo = product('privatemdlabs-testosterone.html');
  const OPTS = { matchPriority: ['name'] as const, includePanels: false };

  it('does NOT match "Vitamin D" against our more specific "Vitamin D 25-Hydroxy" — real limitation', () => {
    // "vitamin" is a COMMON_WORDS stopword for the distinctiveness check (guards "Vitamin B12" ≠
    // "Vitamin A"), and the vendor's product name has no OTHER shared token with our test name ("25",
    // "hydroxy") — so this is a genuine name-only-matching gap for this vendor's terser naming, not a
    // matcher bug. With no lab codes as a fallback, a generically-named product like this can't be
    // safely auto-matched; an admin would need to pin the URL by hand.
    const test: TestKey = { id: 't', name: 'Vitamin D 25-Hydroxy', questCode: '17306', labcorpCode: '081950' };
    const r = matchTestToProducts(test, [vitd], OPTS);
    expect(r.status).toBe('unmatched');
  });

  it('matches Testosterone by name', () => {
    const test: TestKey = { id: 't', name: 'Testosterone, Free and Total', questCode: '873', labcorpCode: '004226' };
    const r = matchTestToProducts(test, [testo], OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(99);
  });

  it('unmatched when the name has no shared distinctive token', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [vitd, testo], OPTS);
    expect(r.status).toBe('unmatched');
  });
});
