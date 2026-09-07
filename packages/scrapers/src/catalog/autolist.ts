// Which ingest matches are trustworthy enough to publish a price without a human looking at it.
//
// Only an exact lab-order-code hit qualifies. The ingest matcher (persist.ts → ingestVendorProducts)
// additionally guards every code hit with a shared distinctive name token, because vendor code fields
// do go stale — so a code match here means "the code agrees AND the name is not contradictory".
//
// exact-name/alias are deliberately excluded even though they are strict string equality, not the
// loose token-subset matcher. They are trustworthy enough to surface in /admin/discovered's Matched
// tab for one-click listing, but four of our vendors (algorx, directlabs, mito-health,
// private-md-labs) publish no lab codes at all, so name matching is their ONLY path to an offering —
// which makes it exactly the place where a silent wrong match would be least likely to be noticed.
export const CODE_MATCHED_BY = ['quest-code', 'labcorp-code', 'any-code'] as const;

/** True when a VendorProduct.matchedBy value represents an exact lab-code match. */
export function isCodeMatch(matchedBy: string | null | undefined): boolean {
  return !!matchedBy && (CODE_MATCHED_BY as readonly string[]).includes(matchedBy);
}
