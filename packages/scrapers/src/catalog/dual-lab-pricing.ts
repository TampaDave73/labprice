// Pure ranking logic for mergeCodeTiers vendors (currently only Dirt Cheap Labs) that sell the same
// test through both Quest and LabCorp at independent prices. Kept separate from persist.ts (which
// touches Prisma/the DB) so this business rule stays unit-testable without a live database — same
// reasoning as catalog/matcher.ts.

export interface DualLabRanking {
  currentPrice: number | null;
  labProvider: 'quest' | 'labcorp' | null;
  altLabPrice: number | null;
  altLabProvider: 'quest' | 'labcorp' | null;
}

/**
 * Cheaper lab becomes primary (currentPrice/labProvider), pricier becomes the secondary "alt"
 * option — mirrors matchTestToProducts' mergeCodeTiers cheapest-wins rule. Ties go to Quest.
 */
export function rankDualLabPrices(questPrice: number | null, labcorpPrice: number | null): DualLabRanking {
  if (questPrice != null && labcorpPrice != null) {
    return questPrice <= labcorpPrice
      ? { currentPrice: questPrice, labProvider: 'quest', altLabPrice: labcorpPrice, altLabProvider: 'labcorp' }
      : { currentPrice: labcorpPrice, labProvider: 'labcorp', altLabPrice: questPrice, altLabProvider: 'quest' };
  }
  if (questPrice != null) return { currentPrice: questPrice, labProvider: 'quest', altLabPrice: null, altLabProvider: null };
  if (labcorpPrice != null) return { currentPrice: labcorpPrice, labProvider: 'labcorp', altLabPrice: null, altLabProvider: null };
  return { currentPrice: null, labProvider: null, altLabPrice: null, altLabProvider: null };
}
