import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarekDiagnosticsCatalog, parseMarekDiagnosticsProduct } from '../catalog/marekdiagnostics-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Fixtures are real Marek Diagnostics HTTP responses captured 2026-07 (see fixtures/marekdiagnostics-*).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const product = (name: string, slug: string) => parseMarekDiagnosticsProduct(fx(name), 'https://marekdiagnostics.com', slug)!;

describe('parseMarekDiagnosticsCatalog', () => {
  const entries = parseMarekDiagnosticsCatalog(fx('marekdiagnostics-sitemap.xml'));

  it('parses every /products/<slug> URL from the products sitemap', () => {
    // A compact, curated catalog (~134 products) — much smaller than most other vendors this project.
    expect(entries.length).toBeGreaterThan(100);
    const tsh = entries.find((e) => e.slug === 'thyroid-stimulating-hormone-tsh');
    expect(tsh).toBeDefined();
    expect(tsh!.url).toBe('https://marekdiagnostics.com/products/thyroid-stimulating-hormone-tsh');
  });

  it('has no duplicate slugs', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('parseMarekDiagnosticsProduct', () => {
  it('parses TSH: name/price/mpn straight from JSON-LD, mpn IS the Quest code', () => {
    const p = product('marekdiagnostics-tsh.html', 'thyroid-stimulating-hormone-tsh');
    expect(p.name).toBe('Thyroid-Stimulating Hormone (TSH)');
    expect(p.providers).toHaveLength(1);
    expect(p.providers[0]!.labProvider).toBe('quest');
    expect(p.providers[0]!.labTestIDs).toEqual(['899']);
    expect(p.providers[0]!.price).toBe(9);
    expect(p.providers[0]!.isPanel).toBe(false);
  });

  it('parses Cystatin C with eGFR: mpn matches our own stored Quest code exactly', () => {
    const p = product('marekdiagnostics-cystatin-c.html', 'cystatin-c-with-egfr');
    expect(p.providers[0]!.labTestIDs).toEqual(['94588']);
    expect(p.providers[0]!.price).toBe(40);
  });

  it('flags a bundle panel via its ProductGroup JSON-LD type (Shopify variants = a group, not one Product)', () => {
    const p = product('marekdiagnostics-panel.html', 'basic-male-panel-package');
    expect(p.name).toBe('Base Lab Panel'); // the group's own name; per-variant names ("- Male") are nested inside.
    expect(p.providers[0]!.isPanel).toBe(true);
    expect(p.providers[0]!.labTestIDs).toEqual([]); // a bundle has no single order code of its own.
  });

  it('returns null for HTML with no Product JSON-LD block', () => {
    expect(parseMarekDiagnosticsProduct('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('Marek Diagnostics matching (Quest code + name, strict per-lab tiers)', () => {
  const tsh = product('marekdiagnostics-tsh.html', 'thyroid-stimulating-hormone-tsh');
  const cystatin = product('marekdiagnostics-cystatin-c.html', 'cystatin-c-with-egfr');

  it('matches TSH by Quest code', () => {
    const test: TestKey = { id: 't', name: 'TSH (Thyroid Stimulating Hormone)', questCode: '899', labcorpCode: '004259' };
    const r = matchTestToProducts(test, [tsh]);
    expect(r.status).toBe('matched');
    expect(r.matchedBy).toBe('quest');
    expect(r.price).toBe(9);
  });

  it('matches Cystatin C with eGFR by Quest code', () => {
    const test: TestKey = { id: 't', name: 'Cystatin C with eGFR', questCode: '94588' };
    const r = matchTestToProducts(test, [cystatin]);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(40);
  });

  it('unmatched when neither code nor name matches', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent', questCode: '999999', labcorpCode: '888888' };
    const r = matchTestToProducts(test, [tsh, cystatin]);
    expect(r.status).toBe('unmatched');
  });
});
