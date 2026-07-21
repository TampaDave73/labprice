// Shared mutation + scoring logic for the /admin/discovered review queue, used by BOTH the
// one-by-one review UI (api/v1/admin/discovered/route.ts) and the bulk CSV round-trip
// (api/v1/admin/discovered/export + import) — one implementation of "what attaching/promoting
// actually does" so the two paths can't drift apart.
import type { Prisma } from '@labprice/database';
import { normalizeName, strongTokens } from '@labprice/scrapers/src/catalog/matcher';

type Tx = Prisma.TransactionClient;

// Alternate-specimen keywords that DO distinguish otherwise-identical test names (e.g. "Iodine,
// Serum" vs "Iodine, Urine" are different tests with different reference ranges and prices — not the
// same test named two ways). `strongTokens()` deliberately strips these as generic filler for the
// broader test-matching pipeline (a canonical Test rarely spells out its specimen type, so stripping
// keeps "Iodine" matching a vendor's "Iodine, Serum" listing) — that's the right call there, but wrong
// for CLUSTERING raw, unknown vendor products, where it silently merged distinct tests (found live
// 2026-07-21: an "Iodine Blood Test" cluster showed 9 vendors but 13 rows because 4 vendors each sell
// both a serum and a urine variant, collapsed into one cluster key). Blood/serum/plasma/unspecified
// stay the (unsuffixed) default bucket — only the less-common alternates get split out, so ambiguous
// listings like "Iodine Test" still merge with the common case instead of fragmenting further.
const ALT_SPECIMEN_RE = /\b(urine|saliva|stool|fecal|hair|sweat|capillary)\b/i;

/** Cross-vendor grouping key: shared lab code beats name; else sorted distinctive tokens, split by
 * alternate specimen type when the name calls one out (see ALT_SPECIMEN_RE above). */
export function clusterKey(p: { questCode: string | null; labcorpCode: string | null; name: string; normalizedName: string }): string {
  if (p.questCode) return `q:${p.questCode}`;
  if (p.labcorpCode) return `l:${p.labcorpCode}`;
  const strong = [...strongTokens(p.name)].sort().join(' ');
  const base = strong ? `n:${strong}` : `n:${p.normalizedName}`;
  const altSpecimen = p.name.match(ALT_SPECIMEN_RE)?.[1]?.toLowerCase();
  return altSpecimen ? `${base}|${altSpecimen}` : base;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type Confidence = 'high' | 'medium' | 'low';

/**
 * How much a single vendor row within its cluster should be trusted as "the same test" — this is
 * what makes a 7,000-row export triageable: sort/filter by this instead of eyeballing every row.
 *   high   — shares a Quest/LabCorp code with at least one other vendor in the cluster (the
 *            strongest possible evidence two vendors sell the same test).
 *   low    — price is a >2x/<0.5x outlier vs. the cluster's median price (the C-Peptide $18-vs-$79
 *            case — a code match overrides this, since a shared code beats a price gap).
 *   medium — everything else: a name-token match with a plausible price, or a lone code nothing
 *            else in the cluster corroborates.
 */
export function computeConfidence(
  product: { id: string; questCode: string | null; labcorpCode: string | null; price: Prisma.Decimal | null },
  clusterProducts: { id: string; questCode: string | null; labcorpCode: string | null; price: Prisma.Decimal | null }[],
): Confidence {
  const others = clusterProducts.filter((p) => p.id !== product.id);
  const sharesCode = others.some(
    (o) => (product.questCode && o.questCode === product.questCode) || (product.labcorpCode && o.labcorpCode === product.labcorpCode),
  );
  if (sharesCode) return 'high';

  const prices = clusterProducts.map((p) => p.price).filter((p): p is Prisma.Decimal => p != null).map(Number);
  const med = median(prices);
  const price = product.price != null ? Number(product.price) : null;
  const isOutlier = price != null && med != null && med > 0 && (price > med * 2 || price < med * 0.5);
  if (isOutlier) return 'low';

  if (product.questCode || product.labcorpCode) return 'medium'; // own code, just nothing to corroborate against
  return others.length > 0 ? 'medium' : 'low'; // name-only: needs at least one other vendor to be worth medium
}

type ProductForAttach = {
  id: string;
  name: string;
  url: string | null;
  price: Prisma.Decimal | null;
  vendorId: string;
  labProvider: string | null;
  /** TestAlias.source: the vendor's slug when known (one-by-one UI), else falls back to 'csv'. */
  vendorSlug?: string;
};

/**
 * Links `products` to `targetTestId`: marks each VendorProduct row MATCHED (unless `markMatched` is
 * false — the 'list' action works on rows that are already matched), learns any new vendor naming
 * as a TestAlias, and creates/revives the Offering (the actual "listing" step — matching alone never
 * makes anything public). Shared by the single-cluster UI action and the bulk CSV import so both
 * paths do EXACTLY the same thing to the database.
 *
 * Offering is unique on (testId, vendorId), so if `products` contains two rows from the SAME vendor
 * (a cluster that still mixes two distinct products despite the specimen-aware clusterKey — see that
 * function's comment), only the first can ever get an offering. Rather than marking the second one
 * MATCHED-but-orphaned (invisible, and misreported as "listed ✓" in the Matched tab, since that check
 * only looks at whether *a* offering exists for the vendor+test pair, not whether it's *this* row's),
 * it's left completely untouched — still UNMATCHED, back in the Discovered queue for the reviewer to
 * route to the right test separately — and reported in `droppedDuplicates` so the caller can say so.
 */
export async function attachProductsToTest(
  tx: Tx,
  targetTestId: string,
  products: ProductForAttach[],
  opts: { markMatched: boolean },
): Promise<{ offeringsCreated: number; aliasesLearned: number; droppedDuplicates: { vendorId: string; name: string }[] }> {
  const test = await tx.test.findUnique({ where: { id: targetTestId }, include: { aliases: true } });
  const known = new Set([normalizeName(test?.name ?? ''), ...(test?.aliases ?? []).map((a) => a.normalized)]);

  let offeringsCreated = 0;
  let aliasesLearned = 0;
  const droppedDuplicates: { vendorId: string; name: string }[] = [];
  const vendorsOfferedThisCall = new Set<string>();

  for (const p of products) {
    if (vendorsOfferedThisCall.has(p.vendorId)) {
      // Another row from this same vendor already claimed the one offering slot for this test in
      // THIS call — leave this row untouched (no status change, no alias) and just report it.
      droppedDuplicates.push({ vendorId: p.vendorId, name: p.name });
      continue;
    }
    vendorsOfferedThisCall.add(p.vendorId);

    if (opts.markMatched) {
      await tx.vendorProduct.update({
        where: { id: p.id },
        data: { status: 'MATCHED', testId: targetTestId, matchedBy: 'manual', suggestedTestId: null },
      });
    }

    const norm = normalizeName(p.name);
    if (norm && !known.has(norm)) {
      await tx.testAlias.create({ data: { testId: targetTestId, alias: p.name, normalized: norm, source: p.vendorSlug ?? 'csv' } });
      known.add(norm);
      aliasesLearned++;
    }

    const existing = await tx.offering.findUnique({ where: { testId_vendorId: { testId: targetTestId, vendorId: p.vendorId } } });
    if (existing) {
      if (existing.deletedAt || !existing.isActive || (!existing.externalUrl && p.url)) {
        await tx.offering.update({
          where: { id: existing.id },
          data: { deletedAt: null, isActive: true, ...(existing.externalUrl ? {} : { externalUrl: p.url }) },
        });
      }
      continue;
    }
    const created = await tx.offering.create({
      data: {
        testId: targetTestId,
        vendorId: p.vendorId,
        currentPrice: p.price,
        priceUpdatedAt: p.price != null ? new Date() : null,
        lastCheckedAt: p.price != null ? new Date() : null,
        externalUrl: p.url,
        labProvider: p.labProvider,
      },
    });
    if (p.price != null) {
      await tx.priceHistory.create({ data: { offeringId: created.id, oldPrice: null, newPrice: p.price, observedAt: new Date(), source: 'SCRAPE' } });
    }
    offeringsCreated++;
  }

  return { offeringsCreated, aliasesLearned, droppedDuplicates };
}

/** Creates a new Test + its category link. Slug uniqueness must already be validated by the caller. */
export async function createPromotedTest(
  tx: Tx,
  fields: { name: string; shortName?: string; slug: string; categoryId: string; questCode?: string | null; labcorpCode?: string | null },
): Promise<{ testId: string }> {
  const created = await tx.test.create({
    data: {
      name: fields.name,
      shortName: fields.shortName?.trim() || fields.name,
      slug: fields.slug,
      categoryId: fields.categoryId,
      questCode: fields.questCode?.trim() || null,
      labcorpCode: fields.labcorpCode?.trim() || null,
    },
  });
  await tx.testCategory.create({ data: { testId: created.id, categoryId: fields.categoryId } });
  return { testId: created.id };
}
