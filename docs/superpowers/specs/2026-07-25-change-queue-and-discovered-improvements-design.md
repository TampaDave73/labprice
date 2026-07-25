# Change Queue + Discovered Products improvements — design

Date: 2026-07-25
Status: Approved, ready for implementation plan.

## Context

Five issues reported against `/admin/changes` (the Change Queue) and `/admin/discovered`
(the vendor-product review queue) after real usage:

1. The Change Queue has accumulated pending rows the admin wants to clear and start fresh from.
2. Dirt Cheap Labs sells the same test through both Quest and LabCorp at different prices. Only
   the cheaper lab's price ever goes through the Change Queue for review; the other lab's price is
   written directly to the offering with no review at all. Which lab is "cheaper" (and therefore
   reviewed) can also flip week to week, so a staged change can silently compare prices across two
   different labs without saying so.
3. Panels show up in their own "Panels" tab on Discovered even though the site never prices panels
   — the admin never acts on them and wants them out of the way entirely.
4. The "Matched, not listed" tab's count badge (e.g. "19") doesn't match the length of the table
   shown under it (hundreds of rows) — the table shows every matched product, not just the unlisted
   ones the tab name promises.
5. A cluster on the Discovered page can contain two rows from the same vendor that are really the
   same test (e.g. True Health Labs' "Sodium Serum" and "Sodium Serum 2", one incompletely filled
   out). Promoting/attaching the whole cluster today silently keeps only the first per-vendor row
   and drops the rest back into the pool — the admin wants to explicitly choose which rows to
   include.

## Current architecture (relevant pieces)

- `Offering` (`packages/database/prisma/schema.prisma`): one row per `(testId, vendorId)`.
  `currentPrice`/`previousPrice` is the ranked/cheaper price; `labProvider` says which lab it came
  from. `altLabPrice`/`altLabProvider` hold the *other* lab's price when a `mergeCodeTiers` vendor
  (currently only Dirt Cheap Labs) carries the test through both labs — written directly by the
  scraper with no staging.
- `StagedPriceChange`: one row per reviewable price change, `(offeringId, oldPrice, newPrice,
  status, ...)`. Only ever created for the ranked `currentPrice`.
- `packages/scrapers/src/catalog/persist.ts` `runVendorDiscovery`: for a `mergeCodeTiers` match,
  writes `altLabPrice`/`altLabProvider` unconditionally, and only stages `currentPrice` changes.
- `VendorProduct` (`packages/database/prisma/schema.prisma`): the raw ingest layer, one row per
  vendor product ever crawled. `status`: `UNMATCHED | MATCHED | IGNORED`. `isPanel` flags bundles,
  excluded from clustering/matching by existing product decision.
- `apps/web/app/api/v1/admin/discovered/route.ts` GET: computes `counts.matched` as "MATCHED rows
  whose (test, vendor) pair has no live offering yet" but the `tab === 'matched'` branch queries
  *all* `MATCHED` rows, not just that unlisted subset — the source of issue 4.
- `apps/web/lib/discovered-actions.ts` `attachProductsToTest`: when `products` contains two rows
  from the same vendor, only the first gets matched + an offering; the rest are left completely
  untouched (still `UNMATCHED`) and reported in `droppedDuplicates`.

## Decisions made during brainstorming

- Item 1: clear **PENDING rows only** — approved/rejected/auto-approved history stays as an audit
  trail.
- Item 2: **keep one `Offering` row per (test, vendor)** — do not split into per-lab offering rows.
  Track both labs' prices as stable, independent fields and tag `StagedPriceChange` rows by lab.
  This keeps the public site, comparison tables, sitemap, and CSV export/import completely
  unchanged; only the scrape-write path and the Change Queue admin UI change.
- Item 3: panels get **auto-`IGNORED`** on first ingest; the dedicated "Panels" tab is removed.
  Recoverable via the existing "Ignored" tab's Restore action.
- Item 5: checkboxes apply to **both** Promote and Attach; **default all checked**. Unchecked rows
  are explicitly set to `Ignored` (reusing the existing `ignore` action) rather than silently
  dropped back into `UNMATCHED`.

## Design

### 1. Clear the Change Queue

- Extend `POST /api/v1/admin/staged-changes` (`apps/web/app/api/v1/admin/staged-changes/route.ts`)
  with a new `action: 'clear'` (alongside the existing `approve`/`reject`). No `ids` required — it
  deletes every row with `status: 'PENDING'` via `prisma.stagedPriceChange.deleteMany`. Audit-logged
  (`action: 'staged_changes_cleared'`, `newValues: { count }`).
- `apps/web/app/admin/changes/page.tsx`: a "Clear pending" button (near the tab bar), gated by a
  native `confirm()` dialog naming the count about to be deleted, same UX pattern as Settings'
  "Reset analytics" danger-zone action. Calls `handleAction`-style POST, then `fetchChanges()`.
- Only meaningful when filtering is irrelevant to the action (clears ALL pending regardless of the
  currently-selected tab) — the button should say so in its confirm text.

### 2. Independent Quest/LabCorp approval for Dirt Cheap Labs

**Schema (`packages/database/prisma/schema.prisma`):**

```prisma
model Offering {
  // ...existing fields unchanged...

  // Stable per-lab prices for mergeCodeTiers vendors (currently only Dirt Cheap Labs) — populated
  // independently of which lab is currently cheaper. currentPrice/labProvider/altLabPrice/
  // altLabProvider remain a DERIVED cheaper/pricier ranking recomputed from these two whenever
  // either publishes, so every other reader of Offering (public site, sitemap, CSV, trends) needs
  // no changes. Null for every non-dual-lab vendor.
  questPrice            Decimal? @map("quest_price") @db.Decimal(10, 2)
  questPreviousPrice    Decimal? @map("quest_previous_price") @db.Decimal(10, 2)
  labcorpPrice          Decimal? @map("labcorp_price") @db.Decimal(10, 2)
  labcorpPreviousPrice  Decimal? @map("labcorp_previous_price") @db.Decimal(10, 2)
}

model StagedPriceChange {
  // ...existing fields unchanged...

  // Which lab this staged change is for, when the offering is priced through multiple labs
  // (mergeCodeTiers vendors). Null for every ordinary single-price vendor — unchanged behavior.
  labProvider String? @map("lab_provider")
}
```

One-time data migration: for existing Dirt Cheap Labs offerings, backfill `questPrice`/
`labcorpPrice` from the current `currentPrice`/`labProvider`/`altLabPrice`/`altLabProvider` values
(whichever field held which lab) so no price history is lost on cutover.

**Scraper write path (`packages/scrapers/src/catalog/persist.ts`, `runVendorDiscovery`'s matched
branch, ~line 298-333):**

- Detect a `mergeCodeTiers` vendor from `cfg.matchOptions?.mergeCodeTiers` (already available in
  scope).
- Derive `questPrice`/`labcorpPrice` from the match result's `price`/`provider`/`altPrice`/
  `altProvider` (whichever field belongs to which lab).
- For each lab whose derived price differs from the offering's existing per-lab price field: if the
  new price is non-null, stage a `StagedPriceChange` tagged `labProvider: 'quest' | 'labcorp'`,
  comparing against that lab's *own* previous price (not the derived `currentPrice`) — auto-approve
  decision (`shouldAutoApprove`) evaluated independently per lab, using the same vendor trust level
  (trust stays per-vendor, not per-lab).
- If a lab that previously had a price is no longer found this scrape, clear that lab's raw price
  field directly, no staging — same as today's unconditional-clear behavior for `altLabPrice`.
- Non-`mergeCodeTiers` vendors: entirely unchanged code path.

**Publish (`publishStagedChange` in `persist.ts`):**

- If `staged.labProvider` is set: write the new price to that lab's `questPrice`/`labcorpPrice` (and
  roll `questPreviousPrice`/`labcorpPreviousPrice`), then recompute the derived `currentPrice`/
  `labProvider`/`altLabPrice`/`altLabProvider` as (cheaper, pricier) of the two lab fields — same
  ranking rule `mergeCodeTiers` already uses. If only one lab has ever priced it, `currentPrice` is
  that lab's price and `altLabPrice` stays null, matching today.
- If `staged.labProvider` is null: today's behavior, unchanged.
- `PriceHistory` rows also get a nullable `labProvider` column, mirroring `StagedPriceChange`, so a
  dual-lab offering's price history is traceable per lab, not just as an undifferentiated sequence.

**Admin UI (`apps/web/app/admin/changes/page.tsx` + the GET route):**

- Each row shows a small "Quest" / "LabCorp" badge next to the vendor name when `labProvider` is
  set. No other UI change — Approve/Reject/bulk-select already operate per staged-change id, and
  each lab now produces its own independent id.

### 3. Auto-ignore panels

- `packages/scrapers/src/catalog/persist.ts` `ingestVendorProducts`'s `decideMatch()` (~line 517):
  this already only runs for new rows or rows still `status: 'UNMATCHED'` — `MATCHED`/`IGNORED` rows
  are admin-owned and never re-touched, exactly the rule to piggyback on. Add: if `d.isPanel` is
  true, `decideMatch()` returns `{ status: 'IGNORED', testId: null, matchedBy: null,
  suggestedTestId: null }` instead of running the normal code/name auto-match. This correctly covers
  both a brand-new panel row AND an existing `UNMATCHED` row that only reveals `isPanel: true` once
  its detail page is fetched on a later (narrow → full) crawl — without ever touching a row an admin
  already decided on.
- One-time backfill: existing `VendorProduct` rows with `isPanel: true AND status = 'UNMATCHED'` get
  set to `IGNORED`.
- `apps/web/app/admin/discovered/page.tsx`: remove the "Panels" tab from `TABS` and drop
  `counts.panels`.
- `apps/web/app/api/v1/admin/discovered/route.ts` GET: remove the `tab === 'panels'` branch and its
  count query; the `ignored` tab (unchanged) is where panels now land, restorable via the existing
  Restore button.

### 4. Fix "Matched, not listed"

- `apps/web/app/api/v1/admin/discovered/route.ts` GET, `tab === 'matched'` branch: add
  `id: { in: [...unlistedMatchedIds] }` to the query's `where` (the set is already computed for the
  count badge, just not applied to the table query). Table and badge become consistent — the tab
  only ever shows rows that still need the "List" action.

### 5. Checkbox selection on Promote/Attach

- `apps/web/app/admin/discovered/page.tsx`: `productTable` (used for cluster cards) gains a
  checkbox column when rendering inside a cluster context. Selection state: a `Set<string>` of
  excluded product ids, keyed per open cluster, default empty (i.e. all checked).
- On "Promote to test" / "Attach to existing": split `cluster.products` into checked/unchecked by
  that set. Fire the existing `act()` call for `promote`/`attach` with only the checked product ids;
  if any are unchecked, fire a second `act()`-style call with `action: 'ignore'` for those ids. No
  backend/API changes — both actions already exist.
- Rows already flagged by the existing `duplicateVendors` same-vendor warning get a small visual
  marker near their checkbox (e.g. a tooltip icon) so the admin's eye goes there first, without
  changing the default-checked behavior.

## Out of scope

- Any change to how public pages display Dirt Cheap Labs pricing (unaffected by design).
- Splitting `Offering` into per-lab rows (considered, rejected in favor of the smaller design above).
- Retroactively re-clustering panels that are currently sitting in `MATCHED`/`IGNORED` from before
  this change (only new ingests + the one-time backfill are covered).
