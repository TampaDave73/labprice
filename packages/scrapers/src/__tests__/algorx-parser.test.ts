import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAlgoRxCatalog } from '../catalog/algorx-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Real algorx.com/biomarkers HTML captured 2026-08-20.
const html = readFileSync(join(__dirname, 'fixtures', 'algorx-biomarkers.html'), 'utf8');
const products = parseAlgoRxCatalog(html);
// Production config (configs/algorx.ts): name-only, panels excluded, ambiguity FLAGGED.
const OPTS = { matchPriority: ['name'] as const, includePanels: false, flagAmbiguous: true };

describe('parseAlgoRxCatalog', () => {
  it('extracts every lab-specific record from the flight payload', () => {
    expect(products.length).toBe(175);
    expect(products.filter((p) => p.providers[0]!.labProvider === 'quest').length).toBe(89);
    expect(products.filter((p) => p.providers[0]!.labProvider === 'labcorp').length).toBe(86);
  });

  it('gives each product one provider and no lab codes', () => {
    // marker_id is an internal id, never an order code — feeding it to labTestIDs would produce
    // confident wrong matches.
    expect(products.every((p) => p.providers.length === 1)).toBe(true);
    expect(products.every((p) => p.providers[0]!.labTestIDs.length === 0)).toBe(true);
  });

  it('deep-links each product at its own page', () => {
    const amylase = products.find((p) => p.name === 'Amylase')!;
    expect(amylase.slug).toBe('amylase');
    expect(amylase.url).toBe('https://algorx.com/biomarkers/amylase');
    expect(new Set(products.map((p) => p.url)).size).toBe(products.length);
  });

  it('keeps the same test at both labs as separate products with their own slugs and prices', () => {
    const ferritin = products.filter((p) => p.name === 'Ferritin');
    expect(ferritin.map((p) => p.slug).sort()).toEqual(['ferritin-lc', 'ferritin-quest']);
    const estradiol = products.filter((p) => p.name === 'Estradiol');
    expect(new Set(estradiol.map((p) => p.providers[0]!.price))).toEqual(new Set([15, 35]));
  });

  it("honors the vendor's own panel flag", () => {
    const panels = products.filter((p) => p.providers[0]!.isPanel);
    expect(panels.length).toBe(57);
    expect(panels.some((p) => /Comp\. Metabolic Panel/i.test(p.name))).toBe(true);
  });

  it('parses prices and drops nothing to a zero price', () => {
    expect(products.every((p) => p.providers[0]!.price === null || p.providers[0]!.price! > 0)).toBe(true);
    expect(products.find((p) => p.name === 'Amylase')!.providers[0]!.price).toBe(9.5);
  });
});

describe('AlgoRx matching (name-only, ambiguity flagged)', () => {
  it('flags a test both labs carry at different prices instead of guessing', () => {
    // Estradiol: Quest $15 vs Labcorp $35. With no code to corroborate, picking the cheaper silently
    // is exactly how the wrong-match cases below slip through, so this goes to the Change Queue.
    const r = matchTestToProducts({ id: 't', name: 'Estradiol' }, products, OPTS);
    expect(r.status).toBe('ambiguous');
  });

  it('matches cleanly when only one product+price fits', () => {
    const r = matchTestToProducts({ id: 't', name: 'Ferritin' }, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(15);
    // the winning lab's own product page, not the catalog listing or the other lab's
    expect(r.sourceUrl).toMatch(/^https:\/\/algorx\.com\/biomarkers\/ferritin-(quest|lc)$/);
  });

  it('does not let a panel absorb a single-analyte test', () => {
    // What this vendor's isPanel flag buys us: without it these matched "Albumin, Random Urine with
    // Creatinine" and "Lipid Panel with Chol/HDL Ratio".
    for (const name of ['Creatinine', 'Albumin', 'HDL Cholesterol']) {
      const r = matchTestToProducts({ id: 't', name }, products, OPTS);
      const matchedName = r.candidates.find((c) => c.price === r.price)?.productName ?? '';
      expect(matchedName).not.toMatch(/Random Urine|Chol\/HDL Ratio/i);
    }
  });

  it('DOCUMENTS the known limit: name-only matching still mis-matches some tests', () => {
    // Not aspirational — this asserts today's real (bad) behavior so the risk stays visible in the
    // suite and a future change that fixes it fails loudly here. It is WHY this vendor is ingest-only
    // and its offerings are promoted by hand in /admin/discovered rather than bulk auto-linked.
    //
    // "Deamidated Gliadin Peptide Ab" (a celiac antibody) confidently matches "C-Peptide" (an insulin
    // marker) at $25 — completely unrelated tests that merely share the "peptide" token, and with no
    // order code there is nothing to catch it. Ambiguity-flagging doesn't help: only one product
    // matches, so it looks clean.
    const r = matchTestToProducts({ id: 't', name: 'Deamidated Gliadin Peptide Ab' }, products, OPTS);
    const matchedName = r.candidates.find((c) => c.price === r.price)?.productName ?? '';
    expect(r.status).toBe('matched');
    expect(matchedName).toBe('C-Peptide'); // <- wrong test, confidently priced

    // Milder but same family: analyte-specific variants collapse onto the generic product.
    for (const name of ['Zinc, Plasma', 'Zinc - Red Blood Cell']) {
      const z = matchTestToProducts({ id: 't', name }, products, OPTS);
      expect(z.candidates.find((c) => c.price === z.price)?.productName).toBe('Zinc');
    }
  });

  it('unmatched for a test this vendor does not carry', () => {
    const r = matchTestToProducts({ id: 't', name: 'Zzz Nonexistent Assay' }, products, OPTS);
    expect(r.status).toBe('unmatched');
  });
});
