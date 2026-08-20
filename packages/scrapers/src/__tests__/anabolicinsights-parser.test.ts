import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeAnabolicInsightsCatalog } from '../catalog/anabolicinsights-parser';
import { matchTestToProducts } from '../catalog/matcher';
import type { TestKey } from '../catalog/types';

// Real Anabolic Insights API response captured 2026-08-20
// (api.anabolicinsights.ai/api/lab-biomarkers/multi-lab-pricing).
const fx = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'anabolicinsights-multi-lab-pricing.json'), 'utf8'),
);
const products = mergeAnabolicInsightsCatalog(fx);
const OPTS = { mergeCodeTiers: true };

describe('mergeAnabolicInsightsCatalog', () => {
  it('maps every biomarker to a product with one provider per lab', () => {
    expect(products.length).toBe(110);
    const lipase = products.find((p) => p.name === 'Lipase')!;
    expect(lipase.providers.map((x) => x.labProvider).sort()).toEqual(['bioreference', 'labcorp', 'quest']);
    const q = lipase.providers.find((x) => x.labProvider === 'quest')!;
    expect(q.labTestIDs).toEqual(['606']);
    expect(q.price).toBe(12);
  });

  it('trims the trailing whitespace the source data carries on names', () => {
    // Raw payload has "Lipase " — untrimmed names would poison name matching and VendorProduct rows.
    expect(products.every((p) => p.name === p.name.trim())).toBe(true);
    expect(products.some((p) => p.name === 'Lipase')).toBe(true);
  });

  it('keeps codeless lab options as name-matchable providers (empty labTestIDs, not dropped)', () => {
    const adma = products.find((p) => p.name === 'ADMA/SDMA')!;
    const lc = adma.providers.find((x) => x.labProvider === 'labcorp')!;
    expect(lc.labTestIDs).toEqual([]);
    expect(lc.price).toBe(200);
  });

  it('treats a $0 basePrice as unpriced rather than free', () => {
    const eos = products.find((p) => p.name === 'Eosinophils')!;
    const br = eos.providers.find((x) => x.labProvider === 'bioreference')!;
    expect(br.price).toBeNull();
  });

  it('marks nothing as a panel — the endpoint is the a la carte catalog', () => {
    // "Comp. Metabolic Panel (14)" is a real single orderable we also carry; flagging it as a panel
    // would make the matcher skip it.
    expect(products.every((p) => p.providers.every((v) => v.isPanel === false))).toBe(true);
    expect(products.some((p) => /Comp\. Metabolic Panel/i.test(p.name))).toBe(true);
  });

  it('uses a stable unique slug per biomarker', () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
  });

  it('links each product at its own page, not the catalog listing', () => {
    // The loincId doubles as the site's per-biomarker URL segment
    // (/labs/panels/biomarkers/<loincId>), verified live: that URL serves a server-rendered
    // "<name> · Anabolic Insights" <title>, while an unknown id falls back to a generic "Biomarker".
    // Pointing every offering at the bare catalog page instead sent "Order" to the listing.
    const zinc = products.find((p) => p.name === 'Zinc')!;
    expect(zinc.url).toBe(`https://www.anabolicinsights.ai/labs/panels/biomarkers/${zinc.slug}`);
    expect(new Set(products.map((p) => p.url)).size).toBe(products.length);
  });
});

describe('Anabolic Insights matching (mergeCodeTiers -> cheapest code-matching lab)', () => {
  it('matches HbA1c on either code and takes the cheaper lab', () => {
    // The vendor lists this only as "HbA1c". LabCorp 001453 @ $9 and Quest 496 @ $9.
    const test: TestKey = { id: 't', name: 'HbA1c', questCode: '496', labcorpCode: '001453' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(9);
  });

  it('corroborates a code hit against confirmed aliases, not just the test name', () => {
    // Regression for the code-corroboration guard ignoring TestAlias rows: our catalog calls this
    // "Hemoglobin A1c" and the vendor calls it "HbA1c", which share no distinctive token. Before the
    // fix the (correct) Quest/LabCorp codes were rejected — 'unmatched' with no alias, and merely
    // 'ambiguous' with one, so a confirmed alias still couldn't produce a price.
    const bare: TestKey = { id: 't', name: 'Hemoglobin A1c', questCode: '496', labcorpCode: '001453' };
    expect(matchTestToProducts(bare, products, OPTS).status).toBe('unmatched');

    const aliased: TestKey = { ...bare, aliases: ['HbA1c'] };
    const r = matchTestToProducts(aliased, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(9);
  });

  it('surfaces the pricier lab as altPrice/altProvider instead of dropping it', () => {
    // Vitamin B12: Quest 10194 @ $15 vs LabCorp 000810 @ $45.
    const test: TestKey = { id: 't', name: 'Vitamin B12', questCode: '10194', labcorpCode: '000810' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(15);
    expect(r.provider).toBe('quest');
    expect(r.altPrice).toBe(45);
    expect(r.altProvider).toBe('labcorp');
  });

  it('matches the CMP by its Quest code', () => {
    const test: TestKey = { id: 't', name: 'Comprehensive Metabolic Panel', questCode: '10231', labcorpCode: '322000' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.status).toBe('matched');
    expect(r.price).toBe(20);
  });

  it('never stages a $0 price for a test whose only cheap option is unpriced', () => {
    const test: TestKey = { id: 't', name: 'Eosinophils' };
    const r = matchTestToProducts(test, products, OPTS);
    expect(r.price === null || r.price > 0).toBe(true);
  });

  it('unmatched when neither code nor name is in the catalog', () => {
    const test: TestKey = { id: 't', name: 'Zzz Nonexistent Assay', questCode: '999999', labcorpCode: '888888' };
    expect(matchTestToProducts(test, products, OPTS).status).toBe('unmatched');
  });
});
