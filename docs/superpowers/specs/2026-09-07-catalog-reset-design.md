# Catalog Reset — 30 Core Community Tests

**Date:** 2026-09-07
**Status:** Approved (design)

## Problem

The catalog grew to 278 tests across 19 vendors and stopped being manageable. Concretely, in
production today:

| Thing | Count | Why it hurts |
|---|---|---|
| Tests | 278 | Far more than the site's audience actually shops for |
| Active offerings | 4,110 | Only 2,148 carry a price — the rest are noise |
| `VendorProduct` rows | 11,659 | Every crawled product, most irrelevant |
| Pending staged price changes | 1,206 | A review queue no human will ever clear |

The 4,110 offerings exist because a past script (`link-all-tests-all-vendors.ts`) linked every
vendor to every test regardless of whether the vendor sells it. That makes "which vendors carry
this test?" unanswerable, which in turn blocks the Phase 2 panel builder entirely.

## Goal

Reset to a curated 30-test catalog drawn from the community-demand research in
`top25_community_lab_tests.xlsx` (Top 25 + 5 honorable mentions), re-crawl the same vendors, and go
live with real prices. Add a weekly traffic topline to the existing Monday digest so site
performance arrives by email instead of requiring a GA4 visit.

## Non-goals

- Phase 2 (custom panel builder) — deferred to its own spec, after this ships.
- Changing vendors, adapters, or the scraping engine.
- Widening the catalog again. The 30-slug list is a data file precisely so growth is a data edit,
  not a code change.

---

## Decisions made during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Wipe scope | Catalog only | Vendors, scrape configs, the 21-category taxonomy, admin users, and analytics all survive. Analytics survival is what makes the Monday report useful on day one instead of week three. |
| Code source | The 246-row master list, not the xlsx | The xlsx's own Notes tab says so: its codes came from general web search; the master list's are verified. 29 of 30 target rows are HIGH confidence with both Quest and LabCorp codes. |
| Testosterone variant | `testosterone-total` (873/004226) + `testosterone-free-calculation` (18944/070195) | Widest vendor coverage. The LC/MS-MS total (15983) that the xlsx cited is a MEDIUM row that few budget vendors list; a sparse column is worse than a slightly less precise one. |
| Go-live gate | Exact code match auto-publishes; everything else queues | The loose name tier is what produced "Deamidated Gliadin Peptide Ab" → "C-Peptide" on AlgoRx. See CLAUDE.md gotcha 14. |
| Pre-linking | None | An offering exists only where a vendor genuinely sells the test. Phase 2 depends on this being true. |
| Old test URLs | 410 Gone + sitemap refresh | Honest signal, prompt de-indexing, no misleading redirects. |
| Traffic report | GA4 + DB, GA4 optional | GA4 alone lacks search queries and affiliate clicks; the DB alone lacks geography and referrers. GA4 failure must not break the digest. |
| Sequencing | Straight through, no backup gate | User explicitly does not want the prod data preserved. |

---

## Section 1 — Reset and reseed the catalog

### 1.1 The 30 tests

All slugs verified present in `packages/database/data/2026-07-27-master-tests/tests.json`.
Only `testosterone-free-calculation` is MEDIUM confidence; the other 29 are HIGH with both codes.

| # | Slug | Quest | LabCorp | Conf |
|---|---|---|---|---|
| 1 | `testosterone-total` | 873 | 004226 | High |
| 2 | `testosterone-free-calculation` | 18944 | 070195 | Medium |
| 3 | `estradiol-ultrasensitive-lc-ms-ms` | 30289 | 140244 | High |
| 4 | `sex-hormone-binding-globulin` | 30740 | 082016 | High |
| 5 | `luteinizing-hormone` | 615 | 004283 | High |
| 6 | `follicle-stimulating-hormone` | 470 | 004309 | High |
| 7 | `prolactin` | 746 | 004465 | High |
| 8 | `cortisol-total` | 395 | 004341 | High |
| 9 | `dhea-sulfate` | 402 | 004020 | High |
| 10 | `igf-1-lc-ms` | 16293 | 010363 | High |
| 11 | `tsh-thyroid-stimulating-hormone` | 899 | 004259 | High |
| 12 | `t3-free` | 34429 | 010389 | High |
| 13 | `t4-free` | 866 | 001974 | High |
| 14 | `complete-blood-count-w-differential-platelets` | 6399 | 005009 | High |
| 15 | `comprehensive-metabolic-panel-14` | 10231 | 322000 | High |
| 16 | `lipid-panel` | 7600 | 303756 | High |
| 17 | `apolipoprotein-b` | 5224 | 167015 | High |
| 18 | `lipoprotein-a` | 34604 | 120188 | High |
| 19 | `homocysteine` | 31789 | 706994 | High |
| 20 | `c-reactive-protein-high-sensitivity` | 10124 | 120766 | High |
| 21 | `insulin-fasting` | 561 | 004333 | High |
| 22 | `hemoglobin-a1c` | 496 | 001453 | High |
| 23 | `vitamin-d-25-hydroxy` | 17306 | 081950 | High |
| 24 | `ferritin` | 457 | 004598 | High |
| 25 | `iron-tibc` | — | 001321 | High |
| 26 | `magnesium-rbc` | 623 | 080283 | High |
| 27 | `psa-total` | 5363 | 010322 | High |
| 28 | `vitamin-b12` | 927 | 001503 | High |
| 29 | `uric-acid` | 905 | 001057 | High |
| 30 | `thyroid-peroxidase-antibodies` | 5081 | 006676 | High |

Three interpretations of the spreadsheet, recorded so they are not re-litigated later:

- Row 12 "Free T3 / Free T4" is one spreadsheet row but two orderable tests (#12, #13).
- Row 22 "Ferritin / Iron Panel" became `ferritin` + `iron-tibc`; `iron-tibc` also absorbs the
  "Transferrin Saturation / TIBC / UIBC" honorable mention.
- The "Cholesterol/HDL Ratio & Non-HDL Cholesterol" honorable mention is **dropped**. Those are
  calculated fields reported inside a lipid panel; no master row exists and no vendor sells them
  standalone.

These 30 span 16 of the 21 categories. Five categories (including Coagulation) end up with zero
tests.

### 1.2 `apps/worker/scripts/reset-catalog.ts` (new)

Dry-run by default, printing the row counts it would delete; `--apply` performs the wipe.

**Archive first.** `AffiliateClick.offeringId` is `onDelete: Restrict`, so 5,848 click rows
physically block deleting offerings. Copy them into a new `affiliate_click_archive` table
(flattened: vendor slug, test name, test slug, clicked_at, referrer, session id) before deleting
the originals. This is the only new table in the migration.

**Delete in FK-safe order:** staged price changes → scrape results → scrape errors → scrape runs →
scrape jobs → price history → affiliate clicks → offerings → vendor products → test aliases → test
categories → test biomarkers → tests.

`PageView.testId` is `SetNull`, so page views survive with their test link cleared. `SearchLog` has
no test FK and is untouched.

**Preserved:** `Vendor`, `ScrapeVendorConfig`, `Category`, `User`/`Session`/`Account`,
`SystemSetting`, `FeatureFlag`, `SeoPage`, both suggestion tables, `AuditLog`, `PageView`,
`SearchLog`, and the new `affiliate_click_archive`.

Deliberately **not** touched: `TestCode` (`test_codes`), which CLAUDE.md gotcha 11 confirms is dead
code with zero readers or writers. Leave it alone rather than give it a reason to look alive.

### 1.3 Reseed

New data file `packages/database/data/2026-09-07-core-30/tests.json`, generated from the master file
by a slug list so provenance is traceable and widening the catalog later is a data edit.

`import-master-tests.ts` gains a `--file` flag rather than its current hardcoded import, so one
script serves both datasets. Its existing guarantees are kept as-is: unknown category or confidence
value aborts the whole import before any write.

All 30 rows get `isPopular = true` — with a 30-test catalog they are, by construction, the popular
set.

### 1.4 Empty categories

`CategoryFilters.tsx` renders from the `Category` table, so the five now-empty categories would
appear as filters that return nothing. Filter to categories having at least one non-deleted test.
This is a display concern only — do not delete the category rows, since re-widening the catalog
should not require re-seeding the taxonomy.

---

## Section 2 — Crawl to live

### 2.1 Precondition that makes this easy

All 19 vendors are `selectors.mode === 'catalog'`. There are no per-URL vendors, so nothing needs a
product URL seeded before it can be scraped, and CLAUDE.md gotcha 13's "Scrape now can't bootstrap a
vendor with no offerings" problem is sidestepped by running discovery directly rather than through
the admin endpoint.

`dirt-cheap-labs` is soft-deleted (out of business, per CLAUDE.md gotcha 12) — 18 vendors are live.
`algorx` stays ingest-only: it publishes no lab codes, so under a code-only matching policy it
correctly produces zero auto-published offerings.

### 2.2 `apps/worker/scripts/recrawl-all.ts` (new)

Loops the 18 active vendors calling the existing `runVendorDiscovery`, with matching restricted to
**exact Quest/LabCorp code hits only** — the name tier is off. A code hit creates and publishes an
offering; everything else is ingested to `VendorProduct` and surfaces in `/admin/discovered`.

The existing distinctive-name-token guard on code hits stays on: a code match that shares no
distinctive name token with the test is still rejected, because stale vendor code fields do occur.

Runs vendors sequentially with the existing per-vendor error handling, so one adapter failing does
not abort the run. Prints a per-vendor summary (products seen / code-matched / offerings published /
queued) so match quality is readable at the end, per CLAUDE.md gotcha 14's process note: print the
actual matches and read them.

**Open risk to resolve during planning:** crawl-based adapters currently use existing offerings to
narrow which catalog pages they fetch. With zero offerings after the wipe, they may need an explicit
"crawl everything" path. The `fetchAll` API adapters already return whole catalogs and are
unaffected. This must be confirmed against `catalog/persist.ts` before the wipe, not after.

### 2.3 Retiring old URLs

Removed test slugs return **410 Gone** rather than 404, and the sitemap regenerates from the live 30.

---

## Section 3 — Monday traffic topline

### 3.1 Shared GA4 client

Move `apps/web/lib/ga4-data.ts` into `@labprice/shared` and have both the web app and the worker
import it. The worker cannot import from `apps/web`, and copying the file would create a second
instance of exactly the problem CLAUDE.md gotcha 11 already flags with the two parallel
`shouldAutoApprove()` implementations. One implementation, two consumers.

The three `GA4_*` env vars must be added to the worker service on Railway. They are already set on
the web service.

### 3.2 `apps/worker/src/traffic.ts` (new)

Builds a 7-day topline.

From GA4 (service account, property 546489198): visitors, sessions, top countries, device split,
top traffic sources.

From our own database: top search queries with zero-result queries flagged (the demand signal for
what to add to the catalog next), top test pages by views, and affiliate click-throughs grouped by
vendor.

### 3.3 Digest integration

Appended as a "Site traffic — last 7 days" section to the existing weekly digest, which already runs
Mondays at 12:00 UTC (`scrapeReportQueue.upsertJobScheduler('weekly-digest', '0 12 * * 1')`).
Scraper health stays first; traffic follows.

**Degradation is mandatory.** If the GA4 credentials are absent or the API call fails, the DB half
still renders and the GA4 section states that it is unavailable. The digest must never fail to send
because Google did. This mirrors the existing fallback in `/admin/analytics`.

---

## Testing

- `reset-catalog.ts` dry-run output is checked against the known production counts (278 tests,
  4,110 active offerings, 11,659 vendor products, 1,206 staged changes) before `--apply` is run.
- After reseed: exactly 30 tests, each with ≥1 category, and `Test.categoryId` correctly derived as
  the lowest-`displayOrder` category of its set.
- After the crawl: the per-vendor summary is read by a human, and a sample of published offerings is
  spot-checked that the test name and the vendor's product name describe the same test. Grepping for
  known-bad patterns is explicitly not sufficient.
- `traffic.ts` is exercised twice: once with GA4 credentials present, once with them removed, to
  confirm the digest sends in both cases.
- `cd apps/web && npx tsc --noEmit` passes. Pre-existing `apps/worker` type errors (ioredis dual
  version, `publisher.ts`) are not regressions.

## Documentation

CLAUDE.md, SKILLS.md, and CHANGELOG.md are updated in the same change, per the project's
documentation discipline. CLAUDE.md gotcha 13's note about `link-all-tests-all-vendors.ts` and the
pre-linking model needs revising, since that model is now explicitly abandoned.

## Phase 2 (deferred)

A custom panel builder: the user selects N tests, and the system returns vendors ranked by total
price, including vendors carrying only a subset with an explicit "missing 1 of 10" caveat. It gets
its own spec after this ships. It is listed here only to record the dependency: the ranking is
meaningful only because Section 1.2 and 2.2 make an offering's existence mean the vendor genuinely
sells the test.
