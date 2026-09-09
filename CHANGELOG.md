# Changelog

All notable changes to LabTestCompare are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are `YYYY-MM-DD`.

See also `SKILLS.md` (features + workflows) and `.claude/CLAUDE.md` (conventions/gotchas).

---

## [Unreleased]

### Changed (2026-09-09, True Health Labs catalog discovery)
- **True Health Labs' catalog discovery was missing the vast majority of the real catalog.**
  `product-sitemap.xml` listed well under 200 products; the site's own public WooCommerce Store API
  (`/wp-json/wc/store/v1/products`) lists ~1,900, DHEA-Sulfate among the ones the sitemap never had —
  same "official listing turned out incomplete" shape as DrSays and GoodLabs, found the same day.
  Switched the adapter from a sitemap+per-product-page crawl to `fetchAll` against the Store API, which
  already returns name + price + order code for every product in one paginated call — no per-product
  fetch needed at all anymore. Verified live: 1,710 real (non-$0) products found, DHEA-Sulfate $119.

### Changed (2026-09-09, matcher: singular/plural name tolerance)
- **The name matcher (`catalog/matcher.ts`, shared by every catalog vendor) didn't know "Antibody" and
  "Antibodies" are the same word.** GoodLabs' real product page for Thyroid Peroxidase Antibodies has
  matching Quest/LabCorp codes and a real price — but is named singular ("Thyroid Peroxidase Antibody
  (TPO)") against our plural test name and every one of its aliases, so the catalog-narrowing pass
  never even fetched the page. `nameTokens` now singularizes ("-ies"→"-y", a bare trailing "-s" dropped
  except after s/u/i to avoid stemming non-plurals like "status"/"virus") before the subset check. This
  is shared code — fixed for GoodLabs live (Thyroid Peroxidase Antibodies now matches, $5), and
  potentially unblocks similar singular/plural near-misses on every other catalog vendor.

### Changed (2026-09-09, GoodLabs catalog discovery)
- **GoodLabs catalog discovery was silently missing most of the real catalog.** The JSON-LD `ItemList`
  we relied on only carries ~50 of ~200+ real tests — DHEA-Sulfate and Prolactin both had real, priced
  product pages that never showed up in the admin because they were never discovered in the first
  place. Unioned in the plain-anchor A-Z "all tests" index rendered further down the same catalog page
  (203 entries live vs. the ItemList's 50), same fetch, no config change. Verified live.

### Changed (2026-09-08, admin + scraper fixes)
- **DrSays catalog discovery moved from `sitemap.xml` to the WordPress REST API.** Sitemap.xml turned
  out to be materially incomplete — a real, live "Apolipoprotein B" product page (200 OK) never
  appeared in it — while `/wp-json/wp/v2/pages` (paged) turned up ~900 `test-*` product pages against
  the sitemap's ~22, all narrowed against our catalog before any detail page gets fetched, same as
  before. Also fixed the product-detail regex, which excluded `(` from the name capture and so silently
  dropped every product whose own name has parens — CMP, Lipid Panel, Basic Metabolic Panel, PT
  (INR)/PTT. Also: the catalog listing now names each entry from the REST row's real title, not a
  title-cased guess off the slug — `test-lipoproteina` title-cases to "Lipoproteina" (one word), which
  shares no token with our "Lipoprotein(a)" test and so never survived narrowing even though the
  product page itself was fine; the real title, "Test-Lipoprotein(a)", has the correct word split. Net:
  DrSays went from 9 to 30 of 30 linked tests priced, verified live.
- **A pinned product URL now overrides the panel exclusion.** `priceFromPinnedUrl` resolved the right
  product and then discarded it whenever that product was `isPanel`, returning null — the offering
  stayed priceless while the scrape reported success, so the admin's URL looked ignored. The exclusion
  still applies to every automatic match (it stops a test being priced from a bundle it merely appears
  inside); a pin is an explicit human choice, and several of our own tests (CBC, CMP, Lipid Panel) are
  panels by nature. NOTE: this means pinning a genuine multi-test bundle now prices the test at the
  bundle's price, and nothing flags it — pin deliberately.
- **Adding a test to a vendor is instant.** The POST used to run catalog discovery inline for the one
  new offering, on the assumption that was "~1-3s". Discovery fetches the vendor's ENTIRE catalog
  listing first (1,200+ products on Walk-In Lab, 3,100+ on Private MD Labs), so every add paid a full
  crawl. Because that listing fetch dominates, pricing N offerings costs the same as pricing one — so
  adds are now instant and one "Price N added tests" runs a single crawl for the batch.
- **"Add all N" on the vendor page** links every test the vendor doesn't already carry, in one
  transactional request.
- **Private MD Labs catalog parser** no longer pins attribute whitespace. The site began emitting two
  spaces between the product anchor's attributes; the regex matched nothing and the crawl reported
  "0 products — likely blocked (WAF/challenge page)", indistinguishable from a real block. It was
  serving ~900KB of product HTML the whole time. Fixtures from 2026-07 kept the suite green.
- **`truehealthlabs` needsBrowser removed.** Added 2026-07-19 because the WAF 403'd Railway's
  datacenter IP; retested from inside the scrape-worker container and plain HTTP returns 200 / 196
  entries. The flag was forcing a Playwright path that failed, which is why the vendor looked blocked.
  `recrawl-all.ts` also gains `--no-browser` for local runs.
- **Auto-fill only badges a lab code as AI-suggested when it actually wrote it.** Provenance was
  applied wholesale, so an existing hand-verified code was labelled "⚠ AI-suggested" even though the
  suggestion had been discarded by the blank-only fill rule. Each code field also gains a per-field
  "Revert to <previous>" control.
- **Tests export/import now round-trips every editable field** — `description`, `purpose`,
  `procedure`, `preparation`, `normal_range` and `display_order` were missing, so offline editing
  couldn't touch the copy that renders on the public test page.

### Changed (2026-09-07, catalog reset to 30 community-demand tests)
- Reset the production catalog to a curated **30-test core list**
  (`packages/database/data/2026-09-07-core-30/`), reseeded via `import-master-tests.ts --file`.
  Every prior `AffiliateClick` row moved to `affiliate_click_archive` (not read by the digest) and
  `PageView.testId` was nulled across the board — expected, one-time side effects of the reset.
- **Abandoned pre-linking every vendor to every test.** `link-all-tests-all-vendors.ts` must not be
  run again — an `Offering` now means the vendor genuinely sells that test. Offerings are (re)built
  going forward from real catalog crawls, not a blanket cross-product.
- **New auto-publish policy: code matches only.** `autolist-code-matches.ts` turns exact Quest/LabCorp
  code matches from `VendorProduct` into live offerings automatically; exact-name/alias matches are
  held in `/admin/discovered`'s **Matched** tab for one-click human review rather than auto-published —
  a codeless match is a plausible-but-unverified pairing, not a confirmed one.
- **Recrawl narrows to the live catalog instead of crawling everything.** `discover()` now takes a
  `narrowTests` list separate from the tests it matches offerings against, and `runVendorDiscovery`
  gains `narrowToAllTests` to fill it from every live test — needed because it otherwise derives
  candidates from *offerings*, which are zero straight after a reset. Measured: 9,114 detail fetches
  → 877 (~4.3 hours → ~25 min), 2,834 Playwright loads → 328, with 166/168 code matches preserved.
  The two lost matches were vendors listing "Complete Blood Count (CBC) Test", recovered by adding a
  bare `CBC` alias. The full catalog listing is still ingested into `VendorProduct` either way, so
  nothing is dropped from `/admin/discovered`.
- **Auto-listing picks the cheapest product when a vendor duplicates a test.** `Offering` is unique on
  (testId, vendorId), so only one of a vendor's duplicate code matches survives; ordering by name
  decided that alphabetically. Found live: HealthLabs lists a "Comprehensive Vitamin Panel" at **$599**
  carrying the same lab code as its $59 Vitamin D test, and name order would have published the $599
  one. The pricier twin is invariably a panel or bundle sharing the code.

### Migration result (2026-09-08, executed against production)
- Archived 5,849 affiliate clicks; deleted 278 tests, 4,359 offerings, 11,667 vendor products,
  39,892 scrape results across 13 tables with no FK violations. Vendors, categories, page views and
  search logs preserved as designed.
- Reseeded 30 tests, then crawled **16 of 18 vendors**. `private-md-labs` is blocked (WAF, retried)
  and `true-health-labs` too — both publish no lab codes, so neither costs a code-matched price.
- **279 live priced offerings across 16 vendors; all 30 tests have at least one price.** 245 from
  code matches, plus 34 net from a human-reviewed pass of the 42 exact-name/alias candidates
  (`--include-name-matches`, off by default).
- **Known data issue:** our `Cortisol, Total` carries Quest `395` / LabCorp `004341` (HIGH
  confidence), but `marek-diagnostics` and `request-a-test` independently list plain cortisol as
  Quest `367` / LabCorp `004051`. No vendor code-matched it; its prices come from name matches only.
  The stored code should be re-verified before it is trusted.

### Added (2026-09-07, weekly traffic topline in the admin digest)
- The Monday scrape-health digest now appends a **site-traffic section**: visitors/sessions/top
  sources from GA4, plus top searches, zero-result searches (demand signal for what to add next),
  most-viewed tests, and click-throughs by vendor from our own tables (`SearchLog`, `PageView`,
  `AffiliateClick`). New `apps/worker/src/traffic.ts` (`collectTraffic`, the I/O half) and
  `packages/shared/src/traffic-render.ts` (`renderTrafficHtml`/`renderTrafficText`, pure — carries the
  unit tests, since `apps/worker` has no test runner). Scraper health stays first in the email;
  traffic is appended after. A GA4 failure (missing creds, expired key, outage) degrades only the
  traffic section — the digest, whose primary job is scraper health, still sends.

### Added (2026-08-20, Anabolic Insights vendor adapter)
- **New catalog adapter `anabolicinsights`** (anabolicinsights.ai) — an **API vendor**: its
  `/labs/panels/biomarkers` page is a client-rendered shell with no prices in the server HTML, and the
  priced catalog comes from one public JSON endpoint,
  `api.anabolicinsights.ai/api/lab-biomarkers/multi-lab-pricing` (no auth, cookies, or headers needed).
  110 biomarkers / 260 lab options, each the same test priced at up to **three** labs
  (Quest/LabCorp/Bioreference) with per-lab order codes in our DB's own formats — so it reuses the
  existing `mergeCodeTiers` path (cheapest code-matching lab ranks, the other becomes the secondary
  "also available via X" price), the same shape as Dirt Cheap Labs. New files:
  `catalog/anabolicinsights-parser.ts` (pure `mergeAnabolicInsightsCatalog` + HTTP wrapper),
  `configs/anabolicinsights.ts`, a 12-case test suite, and a captured real-API fixture. Registered in
  `ADAPTERS`, `ADAPTER_DEFAULTS`, and the admin adapter dropdown.
  Verified live end-to-end through the registered adapter: 110 products, 7/8 sample tests matched with
  correct alt-lab secondaries (Hemoglobin A1c $9, CMP $20, Lipid Panel $10, Ferritin $19, Testosterone
  $14, TSH $7, CRP $6). The 8th (Vitamin D) is a deliberate conservative miss — the vendor lists it as
  plain "Vitamin D" and the generic-token guard rejects it until a `TestAlias` is confirmed, which is
  the normal `/admin/discovered` workflow (verified: with the alias it matches $18 @quest / alt $39).
  **Now live in production** (2026-08-20): vendor row + catalog `ScrapeConfig` created, and the first
  real discovery run completed against the live catalog — 110 products ingested into `VendorProduct`
  (78 auto-matched), **126 offerings linked, 90 matched / 36 ambiguous / 0 unmatched, 133 changes
  published, 82 offerings carrying a live price**. Confirmed on the public site (`/test/alt-sgpt` now
  lists Anabolic Insights at $6.00). The 36 ambiguous are in the Change Queue for manual review; the
  remaining unpriced offerings are held by the normal trust/confidence auto-approval gates.
  Bootstrapped with `apps/worker/scripts/discover-anabolicinsights.ts` — unlike the older per-vendor
  runners it doesn't hardcode seed slugs; it runs the real matcher against the live catalog to find
  which of our tests the vendor actually carries, then links exactly those (matched **and** ambiguous,
  so ambiguous ones surface for review instead of being dropped). Note the web "Scrape now" button
  cannot bootstrap a brand-new vendor: `api/v1/admin/vendors/[id]/scrape` returns 400 `no_offerings`
  and bails before discovery when a vendor has no linked tests, so the runner (or linking a test by
  hand first) is the way in.

### Added (2026-08-20, AlgoRx vendor adapter — ingest-only)
- **New catalog adapter `algorx`** (algorx.com). Server-rendered Next.js: the whole priced catalog
  lives in the `/biomarkers` page's RSC flight payload, decoded with the existing `decodeNextFlight`
  helper — one fetch, no pagination, no browser. 175 records (Quest 89 + Labcorp 86), each a
  lab-specific product with its own slug, price and deep link (`/biomarkers/<slug>`, verified live).
  Registered as a `fetchAll` adapter despite being HTML, because the per-product pages are
  client-rendered shells with no data in them. Honors the vendor's own `type:'panel'` flag as
  `isPanel` (57 of 175).
- **Deliberately ingest-only — it creates no offerings.** AlgoRx publishes **no lab order codes**
  (`marker_id` is an internal Vital id: zero hits against nine known Quest/LabCorp codes, and it
  differs per lab for the same test), so matching is name-only with nothing to corroborate it.
  Measured against the live catalog and our real test list that produces confidently-wrong prices —
  "Deamidated Gliadin Peptide Ab" → "C-Peptide" ($25); with ambiguity-flagging off it also gave
  "Vitamin D, 25-Hydroxy" → "Vitamin B12" and "Arsenic Blood Test" → "Phosphate". So
  `scripts/discover-algorx.ts` crawls to populate `VendorProduct` only, and genuine matches are
  promoted by hand in `/admin/discovered`; a promoted offering pins a product URL and prices reliably
  from then on. The test suite **asserts the known bad match** so the risk stays visible and a future
  fix fails loudly. First production ingest: **175 VendorProduct rows recorded, 57 auto-matched by the
  strict (exact code/alias) ingest matcher — all sane on review — and 0 offerings created.**

### Fixed (2026-08-20, matcher ignored confirmed aliases when corroborating a code hit)
- **`mergeCodeTiers`'s code-corroboration guard compared only `Test.name` and ignored `TestAlias`
  rows**, while the name tier immediately below it already used `testNames()` (name + aliases). A
  vendor that lists a test only under an abbreviation — "HbA1c" for our "Hemoglobin A1c" — shares no
  distinctive token with our name, so its **correct** Quest/LabCorp codes were rejected: `unmatched`
  with no alias, and only `ambiguous` with one, meaning a confirmed alias still could not produce a
  price. Now checked against `testNames(test)`, consistent with the name tier
  (`packages/scrapers/src/catalog/matcher.ts`). Found while building the Anabolic Insights adapter;
  `mergeCodeTiers` is used only by Dirt Cheap Labs (removed, out of business) and that new vendor, so
  the blast radius is minimal. All 216 scraper tests pass, including the DCL and matcher suites.

### Fixed (2026-08-20, removed vendor kept showing on public pages + stale codes from its dead catalog)
- **Offerings from a deactivated/deleted vendor still appeared everywhere** (search, category pages,
  homepage stats, test detail, price trends) — `Offering.isActive`/`deletedAt` are independent columns
  that never auto-followed `Vendor.isActive`/`deletedAt`, so removing a vendor (e.g. Dirt Cheap Labs
  going out of business) left its price rows live. Every public query that reads `offerings` now also
  requires `vendor: { isActive: true, deletedAt: null }` (`test-service.ts`, `search-service.ts`,
  `offering-service.ts`, `test/[slug]/page.tsx`, `category/[slug]/page.tsx`, `page.tsx`,
  `api/v1/trends/[testId]/route.ts`). The admin vendor `PATCH` (isActive→false) and `DELETE` routes
  (`api/v1/admin/vendors/[id]/route.ts`) now cascade — deactivating/soft-deleting the vendor also
  deactivates/soft-deletes its offerings — so the underlying data stays consistent going forward, not
  just query-filtered.
- **`/admin/offerings` Excel export (`api/v1/admin/offerings/export`) had the same gap** as the public
  queries above — its own on-page table (`api/v1/admin/offerings`) already filtered out a soft-deleted
  vendor's offerings, but the Excel export route didn't, so it still listed a removed vendor's rows.
  Added the same `vendor: { deletedAt: null }` filter.
- **Production data cleanup:** Dirt Cheap Labs (`slug: dirt-cheap-labs`) had been soft-deleted
  (`Vendor.deletedAt` set) but its 235 `Offering` rows were still `isActive: true, deletedAt: null` —
  the dangling-offering bug above, from before this fix shipped. Deactivated + soft-deleted all 235
  directly in production, mirroring what the new cascade does going forward. Verified: `/test/alt-sgpt`
  no longer lists Dirt Cheap Labs.
- **Admin Add-Test auto-fill (`/api/v1/admin/tests/lookup`) kept "matching" codes against the Dirt
  Cheap Labs catalog after that vendor was removed** — `lookupCodesFromCatalogs()`
  (`packages/scrapers/src/catalog/code-lookup.ts`) fetched `dirtcheaplabs.com` live regardless of our
  own vendor status, so a since-out-of-business site's stale/parked content could still surface as an
  "authoritative, non-hallucinated" code match (source of the "Matched '...' in the dirtcheaplabs
  catalog" note admins were seeing). Now gated on the `dirt-cheap-labs` `Vendor` row being
  active/undeleted in our DB first; skips straight to the AI-fallback path (still flagged "AI-suggested
  — verify against the lab") when it isn't.

### Added (2026-07-29, cross-vendor Offerings audit Excel round-trip)
- **`/admin/offerings` gets Export/Import Excel** for bulk-auditing every live test↔vendor price link
  across all 17 vendors at once — one row per offering, sorted by test then vendor, with the vendor's
  own product name (from the `VendorProduct` ingest layer) next to our test name, so a wrong match is
  visible without opening the URL. `external_url` is editable; an `action` column (`deactivate`)
  soft-unlinks a wrong offering in bulk. Same dry-run-diff-then-apply contract as the Tests/Discovered/
  Vendor-Catalog round-trips; audit-logged (`offerings.audit_import`). Verified live against
  production: round-tripped an unmodified export (0 changes), then a real URL fix + deactivate (both
  applied and confirmed, then reverted).

### Added (2026-07-27, master test catalog expansion — 66 → 278 tests)
- **Imported a 246-row master biomarker list, growing the production catalog from 66 to 278 tests**
  (212 created, 34 updated by slug match; 32 pre-existing tests not on the master list were kept, not
  deleted, and flagged for manual review). Each test now carries a research-provenance data model:
  `methodology` (free-text, e.g. "LC/MS-MS"), `labVariant`, `cardioIq` (Quest Cardio IQ® branded code),
  `confidence` (`HIGH`/`MEDIUM`/`LOW` — how reliably the Quest/LabCorp codes were verified; new
  `Confidence` enum), `thirdPartyOnly` (not carried by Quest or LabCorp at all), `notes`, and
  `codeVerifiedAt` (system-stamped only, on HIGH promotion). Final confidence split: **145 HIGH / 33
  MEDIUM / 100 LOW**. Schema applied directly to production (`prisma db push --accept-data-loss` +
  `ddl-core.sql` re-run + two new partial indexes on `quest_code`/`labcorp_code`), the 246/11/108-row
  source snapshot committed at `packages/database/data/2026-07-27-master-tests/{tests,fixes,pass3-queue}.json`.
- **21-category taxonomy** (up from 10): the 10 original categories are `isPrimary=true`, 11 new ones
  (Thyroid, Liver, Kidney, Electrolytes, Autoimmune, Allergy, Fertility, Nutrition, Coagulation, Bone
  Health, Sexual Health / STD) are `isPrimary=false`. The homepage category filter is now a **two-facet**
  picker (`CategoryFilters.tsx`, replacing the old single-select `CategoryTabs`): primary categories are
  always-visible multi-select chips (OR-matched), secondary categories sit behind a "More filters"
  disclosure (also OR-matched), and the two facets AND together.
- **Test-level `confidence` now gates scraper auto-approval, independently of vendor trust** — a
  `LOW`-confidence test's price never auto-publishes even from a HIGH-trust vendor scrape
  (`shouldAutoApprove()` in `packages/scrapers/src/catalog/persist.ts`).
- **Consumer-SKU letter suffixes are stripped before code matching** — a new `normalizeLabCode()` in
  `packages/scrapers/src/catalog/matcher.ts` strips trailing letter suffixes (e.g. `"34604M"` →
  `"34604"`) before comparing a vendor's listed code against ours, applied in both per-tier code
  matching and the `mergeCodeTiers` (Dirt Cheap Labs dual-lab) path.
- **Test detail page** shows new states driven by this data: a `thirdPartyOnly` test with no offerings
  reads "Not offered by Quest or LabCorp" instead of an empty price table; a Cardio IQ® badge; a
  "Partially verified"/"Unverified" badge for `MEDIUM`/`LOW` confidence; a `notes` callout when present
  (also how a region-variable code gets surfaced — via the generic notes field, no dedicated flag).
- **Admin**: the test editor (`/admin/tests/[id]`) and the Tests Excel export/import round-trip now
  expose `methodology`/`lab_variant`/`cardio_iq`/`confidence`/`third_party_only`/`notes` for editing;
  `codeVerifiedAt` stays read-only everywhere (system-stamped, not admin-editable).

### Fixed (2026-07-27, reconciled 29 duplicate tests created by the master import — 278 → 249 tests)
- The upsert-by-slug master import (above) created **29 new, empty-offering duplicate rows** for
  tests that already existed in production under a different slug — the master research had
  re-slugged/relabeled them, so the import couldn't match them by slug even though their
  `questCode`/`labcorpCode` matched exactly. Each pair was merged: the **pre-existing row is kept**
  (it holds the real `Offering`/`PriceHistory` data), updated with the master row's researched
  `methodology`/`labVariant`/`cardioIq`/`confidence`/`thirdPartyOnly`/`notes` plus a full
  `TestCategory`/`TestAlias` replace, `isPopular` OR'd (never lost), `codeVerifiedAt` stamped only on
  `HIGH` confidence; the empty duplicate is **soft-deleted** (`deletedAt`, never hard-deleted). One
  `AuditLog` row per merge (`action: 'test.merge_duplicate'`). Script:
  `apps/worker/scripts/merge-duplicate-tests.ts`. Net effect: non-deleted test count **278 → 249**;
  confidence split moves from 145 HIGH / 33 MEDIUM / 100 LOW to **145 HIGH / 33 MEDIUM / 71 LOW** (the
  29 kept rows inherited real research instead of sitting at the default LOW). Three further
  orphaned slugs were deliberately **left alone** pending real research/product decisions —
  `apolipoprotein-b-apob`, `iron-panel`, `testosterone-free-total` — see the `note` field on each in
  `packages/database/data/2026-07-27-master-tests/orphaned-pre-existing-tests.json` (now holding only
  these 3, down from the original 32 flagged tests).

### Fixed (2026-07-27, master-list corrections applied to production)
- Applied 8 of 11 corrections from the master-list research pass to production tests (the other 3
  targeted rows that no longer existed, or were `NO CHANGE`-severity by design) — audit-logged via the
  existing `AuditLog` model (`action: 'test.fix_applied'`,
  `apps/worker/scripts/apply-master-test-fixes.ts`).

### Fixed (2026-07-26, Personalabs showing a stale pre-discount price)
- **Reported live**: `/test/copper` showed Personalabs at $122; the vendor's own page shows $79.30
  with "Reg. $122" struck through. Root cause confirmed with a real browser, not assumed: Personalabs
  runs a "Discount Rules for WooCommerce" plugin that computes the actual price **client-side**, via
  an AJAX call (`admin-ajax.php?action=awdr_get_product_discount`, nonce-protected) that rewrites the
  page's price element after load — the raw HTML (and even the page's own server-rendered Yoast/
  WooCommerce Product JSON-LD, which a scraper might otherwise trust as an authoritative structured-
  data source) both still report the pre-discount $122. Replaying the AJAX call directly (matching
  cookies + a freshly-scraped nonce) got `"Invalid token"` — it's bound to a live browser session, not
  a replayable static token — so there's no plain-HTTP path to the real price at all.
  Fixed by marking `personalabs` `needsBrowser: true` in `packages/scrapers/src/catalog/persist.ts`
  (same mechanism already used for Request A Test/True Health Labs' Cloudflare challenges — a stealth
  headless Chromium actually runs the page's JS, so the existing price-extraction regex, unchanged,
  now reads the correct post-discount `.amount` value once the vendor's own script has rewritten it).
  Verified live end-to-end: a direct `browserFetchHtml()` call against the Copper product page now
  extracts `79.30`, not `122`. Re-ran Personalabs discovery against production after the fix to
  correct all 46 previously-mispriced offerings (a same-session earlier "scrape all vendors" pass had
  already re-published 9 of them using the pre-fix plain-HTTP code before this fix landed).
  **Cost note**: Personalabs' catalog crawl (27 listing pages + ~50 narrowed product pages) now runs
  via headless browser instead of plain HTTP — meaningfully slower per crawl, and "Scrape now" in the
  admin UI will show "queued — needs the worker running" for this vendor going forward, same as the
  other two `needsBrowser` vendors.

### Added (2026-07-26, GA4 Data API pull into /admin/analytics)
- **The last open TODO item — pulling GA4's own reports back into the admin dashboard — is wired up.**
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` (the client-side tracking tag, live since 2026-07-21) is a different
  credential from what this needed: a GCP service account with read access to the GA4 Data API. Walked
  the site owner through creating one (`labtestcompare-ga4-reader@labtestcompare.iam.gserviceaccount.com`,
  granted Viewer on GA4 property `546489198`) — the service-account JSON key never touches the repo;
  its three fields are split into `GA4_PROPERTY_ID`/`GA4_CLIENT_EMAIL`/`GA4_PRIVATE_KEY` env vars
  (root `.env`, gitignored; set on Railway too for prod).
  New `apps/web/lib/ga4-data.ts` (`@google-analytics/data`, new dependency): `fetchGa4Summary()` pulls
  three reports in parallel — top countries, device-category breakdown, and counts for the 5 custom
  funnel events added 2026-07-21 (`search`, `search_suggestion_click`, `vendor_click`,
  `suggestion_modal_opened`, `suggestion_submitted`). `GA4_CONFIGURED` is a clean boolean gate; a
  failed/empty pull returns `null` and `/admin/analytics` falls back to the pre-existing "Open Google
  Analytics" link-out card instead of erroring. Verified end-to-end against the live property.

### Added (2026-07-26, backfilled missing test content — 26 tests)
- **26 of 66 tests had zero patient-facing content** (description/purpose/procedure/preparation/
  normalRange all blank) — audited directly against production. Filled all 26 with authored,
  factual, non-diagnostic copy matching the site's existing style (verified against a live example,
  `Vitamin D 25-Hydroxy`), applied straight to production per an explicit one-time exception to the
  normal auto-fill-then-admin-reviews flow. Each write is audit-logged
  (`tests.ai_content_fill`, actor "System") for traceability.

### Added (2026-07-25, Change Queue bulk-clear, dual-lab price staging, Discovered Products cleanup)
- **Change Queue**: bulk-clear action for pending rows (act on a batch instead of one at a time).
- **Dirt Cheap Labs dual pricing goes through review independently per lab.** Schema: `Offering`
  gained `questPrice`/`questPreviousPrice`/`labcorpPrice`/`labcorpPreviousPrice`; `StagedPriceChange`
  and `PriceHistory` gained `labProvider`. When Quest and LabCorp move to different prices in the same
  crawl, each now stages its own `StagedPriceChange` (`labProvider: 'quest'|'labcorp'`) and its own
  Change Queue row — previously only the cheaper lab's move went through review. Approving one
  publishes that lab's field, then recomputes the derived cheaper/pricier ranking
  (`currentPrice`/`labProvider`/`altLabPrice`/`altLabProvider`) from both labs' latest prices
  (`rankDualLabPrices` in `packages/scrapers/src/catalog/dual-lab-pricing.ts`). A lab dropping out of
  the catalog entirely still clears immediately, no review, same as before.
- **Discovered Products** (`/admin/discovered`): panels now **auto-ignore on ingest** instead of
  living in a separate, display-only Panels tab (removed) — they land in the Ignored tab like any
  other dismissed row. The "Matched, not listed" tab's badge count now matches what the tab actually
  lists (was previously counting differently than the query backing the list). Cluster cards gained a
  **per-row checkbox** — uncheck a row that doesn't belong to the cluster before Promote/Attach and
  it's marked Ignored instead of silently swept in with the rest.
- **Consolidated a drifted `publishStagedChange` duplicate.** Found during this work: the worker/
  inline-scrape paths and the admin Change Queue approve routes each had their own copy of the
  publish logic, and they'd drifted apart — the admin copy (`apps/web/lib/publish-change.ts`) was
  missing the `price_published` audit-log write and a race-safety fix (atomic status-guarded claim
  against a concurrent double-publish) that the canonical copy already had. Consolidated to one
  implementation in `packages/scrapers/src/catalog/persist.ts`; `apps/web/lib/publish-change.ts` is
  now just a re-export, so every publish path (worker queue, inline "Scrape now", admin Change Queue
  approve) shares the same audit trail and race-safety guarantees going forward.

### Fixed (2026-07-25, final whole-branch review of the above)
- **Ignored-tab Restore on an auto-ignored panel was a dead end.** The design intended a mis-flagged
  panel to be "recoverable via the existing Ignored tab's Restore action," but Restore sets
  `status: 'UNMATCHED'` and the Clusters query filters `isPanel: false` — the row vanished from all
  three tabs until the next crawl silently re-ignored it. The UI now disables Restore for a panel row
  with an explanatory tooltip instead of pretending it works; the underlying recoverability gap is
  deferred pending a product decision.
- **Cluster checkbox selection was silently wiped when opening Promote/Attach.** Both call sites reset
  `excludedIds` to an empty `Set` on open, discarding any unchecking the admin had just done on the
  card. Now prunes to the current cluster's ids instead of clearing entirely, so in-progress selection
  survives opening either modal.
- **A lab-dropout ranking recompute in `persist.ts` had no traceability.** When a lab stops carrying a
  test, the derived cheaper/pricier ranking is recomputed and written immediately (correct — otherwise
  it goes stale) but this could change the publicly-displayed `currentPrice` with no `priceUpdatedAt`
  stamp, no `PriceHistory` row, and no audit-log entry. Now stamps `priceUpdatedAt` and writes both a
  `PriceHistory` row (`labProvider: null` — a ranking recompute, not one lab's own staged move) and a
  `price_published` audit-log entry, scoped to iterations where the recomputed price actually changed.

### Fixed (2026-07-25, full-codebase bug sweep)
- **`PATCH /api/v1/admin/tests/[id]`**: category update wrote the raw, unvalidated `categoryIds`
  array to `testCategory.createMany` instead of the id-validated `cats` list — a stale/bogus category
  id could FK-violate *after* `test.update` already committed, leaving `Test.categoryId` pointing
  somewhere `TestCategory` didn't back up. Also wrapped `test.create`/`test.update` + their
  `TestCategory` writes in a single `$transaction` (POST and PATCH) so they can't commit separately.
- **`apps/worker/src/workers/scrape-execute.ts`**: vendor trust was resolved *after* creating the
  `ScrapeRun`, so that in-progress (RUNNING) run counted against its own vendor's success rate —
  could wrongly force a brand-new vendor to LOW trust on its very first scrape (the exact bug the
  catalog-discovery path was already fixed for; the per-URL path hadn't been). Trust is now resolved
  before the run is created.
- **`getTests()` (`/api/v1/tests?category=`)**: filtered on the single `category` FK (the derived
  display pointer) instead of the `TestCategory` many-to-many join, so a test showed under its primary
  category but silently vanished from `?category=` queries for its other categories.
- **`/api/v1/trends/[testId]`**: didn't check the parent Test's `deletedAt`, so a soft-deleted test's
  price history stayed publicly queryable indefinitely (deleting a test only stamps `Test.deletedAt`;
  its offerings are untouched).
- **Catalog matcher (`packages/scrapers/src/catalog/matcher.ts`)**: three code paths could return
  `status: 'matched'` with `price: null` when every candidate for the winning tier lacked a price (a
  stale/broken vendor price selector) — the sole consumer (`persist.ts`) does `new Decimal(result.price!)`
  there, which throws. Now falls through to the next tier / `unmatched` instead.
- **Ingest auto-match (`persist.ts`)**: for `codeMatchAnyProvider` vendors (HealthLabs, Walk-In Lab,
  Own Your Labs) whose `labProvider` label on a code can't be trusted, the ingest layer's `codeOf()`
  used that label anyway — assigning a code to the wrong `questCode`/`labcorpCode` field and silently
  failing strict auto-match even when the pricing matcher matched the same product fine. Now pools all
  codes and checks them against both Quest/LabCorp maps for these vendors, matching the pricing
  matcher's semantics.
- **`publishStagedChange`**: four sequential writes (offering, price history, staged-change status,
  audit log) weren't atomic and had a check-then-act race allowing a concurrent double-publish of the
  same staged change. Wrapped in `$transaction` with an atomic status-guarded claim. Same TOCTOU
  pattern fixed in the staged-changes override-price route.
- **`getScrapeSettings()`**: `Number(v) || default` silently discarded a legitimately-configured `0`
  threshold (e.g. "never auto-approve price increases"); now only falls back when the value doesn't
  parse to a real number.
- **Vendor Catalog Excel import**: a blank `current_price` cell on an *update* row nulled out a
  live price (the sibling create/reactivate path already guarded against this) — now treated as "no
  data for this column" consistently in both the diff preview and the apply step.
- **Several admin pages** (`vendors/[id]`, `changes`, `settings`, `discovered`) had fetches that
  skipped the `res.ok` check documented as a recurring bug class in `.claude/CLAUDE.md` — save actions
  claimed success on a failed PATCH/PUT, and some read paths could throw an unhandled rejection on a
  non-2xx response. All now check `res.ok` and surface a real error message.
- **`SearchBar` autocomplete**: no guard against a slower, now-stale response overwriting a faster,
  newer one when a user types past a pending request. Added an `AbortController`.
- **`/api/v1/me` PATCH**: `data: { name: name ?? null }` unconditionally nulled the user's name on any
  partial PATCH that omitted the field (e.g. `{}`); now only touches `name` when the client sent it.
  Also added the try/catch every other route has (a malformed body previously fell through to Next's
  generic error page instead of the app's JSON error shape).
- **Test detail page JSON-LD**: `JSON.stringify` doesn't escape `<`, so a test name/description
  containing `</script>` could break out of the embedded JSON-LD block; now escaped.

Found via 5 parallel review agents surveying admin API routes, public API/lib, admin+public frontend,
worker/database, and the scraper catalog/matcher subsystem; each finding verified against source
before fixing. `packages/scrapers` (194 tests) and `apps/web`/`packages/scrapers` `tsc --noEmit` all
green after the sweep. Known but NOT fixed: `sort=price-asc/price-desc` on `/api/v1/tests` sorts by
`displayOrder`, not price — currently unreachable from any UI; a correct fix needs a raw-SQL
correlated subquery (Prisma can't filter a relation aggregate by `isActive`/`deletedAt` when ordering
by `_min`) and a redesign of the cursor pagination for a computed sort key, out of scope for a
same-session fix.

### Added (2026-07-25, GA4 Data API pull into /admin/analytics)
- **The last open TODO item — pulling GA4's own reports back into the admin dashboard — is wired up.**
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` (the client-side tracking tag, live since 2026-07-21) is a different
  credential from what this needed: a GCP service account with read access to the GA4 Data API. Walked
  the site owner through creating one (`labtestcompare-ga4-reader@labtestcompare.iam.gserviceaccount.com`,
  granted Viewer on GA4 property `546489198`) — the service-account JSON key never touches the repo;
  its three fields are split into `GA4_PROPERTY_ID`/`GA4_CLIENT_EMAIL`/`GA4_PRIVATE_KEY` env vars
  (root `.env`, gitignored; needs setting on Railway too for prod).
- New `apps/web/lib/ga4-data.ts` (`@google-analytics/data`, new dependency): `fetchGa4Summary()` pulls
  three reports in parallel — top countries, device-category breakdown, and counts for the 5 custom
  funnel events added 2026-07-21 (`search`, `search_suggestion_click`, `vendor_click`,
  `suggestion_modal_opened`, `suggestion_submitted`) — the actual gap this was meant to close, since
  our own `PageView`/`SearchLog`/`AffiliateClick` tables have no country/device dimension and never
  tracked a form opened-but-not-submitted. `GA4_CONFIGURED` is a clean boolean gate; a failed/empty
  pull returns `null` and `/admin/analytics` falls back to the pre-existing "Open Google Analytics"
  link-out card instead of erroring — the GA4 call runs outside the page's main `Promise.all` so a
  quota hiccup or revoked access can't take down the DB-backed stats next to it. Verified end-to-end
  against the live property (real session/device/event counts returned), and `tsc --noEmit` clean.

### Fixed (2026-07-25, Change Queue: AUTO_APPROVED mis-styled red + blank Actions cell)
- Reported as "no Approve/Reject buttons appear, only on the Pending tab" — traced with real DOM
  inspection (not just a visual check) rather than assumed: on the `All` tab, the visible page
  happened to be all `APPROVED`/`AUTO_APPROVED` rows, which correctly have no buttons (nothing
  pending to act on) — that part was working as designed. But found a real bug along the way: the
  Status badge's color logic only special-cased `PENDING` and `APPROVED`, so `AUTO_APPROVED` (a
  *success* state — the scraper's price was small enough to auto-publish) fell through to the same
  red styling as `REJECTED`, reading as if something had gone wrong. Fixed to treat `AUTO_APPROVED`
  as green, same as `APPROVED`. Also replaced the blank Actions cell on non-pending rows with an
  explicit "—" (same convention already used for a null Old Price) so an already-resolved row reads
  as "nothing to do here" instead of looking broken, especially against the sticky column's left
  border.

### Added (2026-07-24, vendor Catalog Excel round-trip)
- **`Export Excel`/`Import Excel` on the vendor Catalog section** (`/admin/vendors/[id]`). The
  one-by-one Catalog table only lists tests already linked to a vendor; the export instead lists
  **every test in the system**, filled in with whatever this vendor already has, blank where a test
  they might carry never got auto-matched — so a gap (e.g. "DirectLabs has no URL for Vitamin C") is
  something you can find and fix in bulk instead of hunting one test at a time. Same
  dry-run-diff-then-apply contract, TEXT-formatted reference code columns, and only-create-or-update
  (never unlink) philosophy as every other admin workbook in this project. Verified end-to-end:
  soft-deleted a real offering to simulate a gap, exported, filled in a URL + price, dry-ran (showed
  exactly one create), applied, and confirmed the offering was correctly reactivated in the database
  with the new values.
- Investigated how DirectLabs product URLs get into the system despite their storefront hiding every
  test behind a JS click-to-modal (no real navigation, no URL to copy, confirmed by hand). Their
  actual store (`store.directlabs.com`) is an Angular SPA that loads its catalog from a clean JSON
  API (`GetTestsByCategoryID`) — `packages/scrapers/src/catalog/directlabs-parser.ts` hits that API
  directly and builds `store.directlabs.com/testinfo/<PK_TestID>` from the numeric id it returns. Not
  a bug — there's no code fix needed, just documenting it since it's not discoverable by browsing.

### Fixed (2026-07-24, Change Queue: Approve/Reject pushed off-screen)
- The inline URL editor added 2026-07-23 could widen a Change Queue row (1133px) past the table
  card's width (935px on a common 1280px-wide window) — `overflow-x-auto` correctly contained it
  in a horizontal scrollbar rather than breaking the page layout, but that scrollbar was easy to
  miss, leaving Approve/Reject effectively invisible. Made the Actions column `sticky right-0` so
  it stays pinned and visible regardless of how wide the rest of the row gets — the same pattern
  used for frozen action columns in data grids. Reproduced and verified the fix with real DOM
  measurements (`scrollWidth` vs `clientWidth`) before and after, not just a visual check.

### Changed (2026-07-24, Tests CSV → Excel)
- **`/admin/tests` Export/Import switched from CSV to `.xlsx`**, same fix already applied to the
  Discovered round-trip: Excel silently strips a leading zero off a LabCorp code like `004650` when
  it opens a CSV, because it auto-detects "numeric-looking" cells regardless of what produced the
  file. `quest_code`/`labcorp_code` are now TEXT-formatted (`numFmt: '@'`) so that can't happen.
  Also added a `Categories` reference sheet. Import moved from a JSON `{csv}` body to
  `multipart/form-data`; the dry-run-diff-then-apply contract and every validation rule are otherwise
  unchanged. Verified end-to-end: exported, edited a leading-zero code and a short_name, re-imported —
  the diff correctly showed only the intended change and the code round-tripped intact in the DB.
  Extracted the cell-parsing helpers (`cellText`/`parseWorkbookSheet`) into `apps/web/lib/xlsx.ts`,
  shared with the Discovered importer instead of duplicated; deleted the now-unused `lib/csv.ts`.

### Fixed (2026-07-24, admin pages: silent-hang bug on load failure)
- **Every admin client page that fetches its own data on mount could hang on "Loading..." forever
  with zero error shown** if that fetch ever returned a non-2xx response (expired session, transient
  403/500) or the JSON body didn't parse. The `.then(r => r.json()).then(j => setX(j.data))` pattern
  never checked `r.ok`, so an error-shaped response (`{error:{...}}` instead of `{data:{...}}`) either
  threw inside the `.then()` (an unhandled rejection that skipped the `setLoading(false)`/`setX(...)`
  call the page's render gate was waiting on) or, where a `?? fallback` masked the throw, just quietly
  left the gating state at its initial `null`/`true` — visually identical to "still loading," forever.
  Confirmed the failure mode directly: a mocked 403 and a mocked malformed-JSON response both now
  resolve to a visible error state instead of an unresolvable one (previously neither did).
  Fixed in every admin page with this pattern: `tests/[id]`, `vendors/[id]` (both were hard page-level
  hangs — no error, no retry, only a manual reload could recover), `coverage` (same class — `data`
  stayed `null` forever), `tests`, `changes`, `categories`, `audit`, `offerings`, `vendors`,
  `discovered` (all had the same unguarded `res.json()` shape, gated by a `loading` boolean that could
  get stuck `true`), plus a lighter pass on `pages`, `settings`, `suggestions`, `users` (already
  `.finally()`-protected from hanging, but silently swallowed the error instead of surfacing it).
  Every fix follows `analytics/page.tsx`'s existing correct pattern (check `res.ok`, throw into a
  `.catch()`, always `.finally()`/`try/finally` the loading flag) and adds a visible red error banner
  with a **Try again**/**Retry** action, reusing each file's existing error-display convention where
  one existed.

### Added (2026-07-24, Test editor: auto-fill provenance + vendor bulk-select)
- **Auto-fill now shows where each field actually came from.** Prompted by a report that a Dirt Cheap
  Labs catalog match for "Adiponectin" looked wrong — investigated and confirmed it was actually
  correct (verified against DCL's live API and their storefront directly: Quest #15060 / LabCorp
  #004650, both listed). The real issue was that the UI gave no way to tell a live catalog match from
  an AI guess, or vendor-sourced content from AI-written content (it's always AI-written — the code
  lookup only ever returns numeric codes, never description text — but nothing on screen said so).
  Added a ✓/⚠ provenance note under each code field and a fixed label above the content fields making
  the always-AI-written guarantee explicit.
- **"Select all" / "Deselect all" for the Vendors checklist** on the Test editor, so listing a test
  across every vendor doesn't require clicking each checkbox individually.
- **Confirmed automatic nightly scraping is working as designed**, in response to "it doesn't appear
  to be happening" — traced through BullMQ's job-scheduler state on production Redis (`iterationCount`
  climbing daily, `next` correctly armed for the following 06:00 UTC) and the `scrape_jobs` history.
  The daily tick has fired every day since it was created; most days enqueue nothing because every
  vendor is on a 7-day schedule and manual "Scrape now" runs (ours during testing, or an admin's) keep
  resetting each vendor's due-clock, which is the documented intended behavior, not a bug.

### Added (2026-07-23, Change Queue usability)
- **Pagination on `/admin/tests` and `/admin/changes`** — both list APIs already supported
  `limit`/`cursor`, just never wired into the page, so `/admin/tests` silently capped at the first 25
  rows with no way to see the rest. Added cursor-based Prev/Next controls to both.
- **Inline vendor-URL fix in the Change Queue** — previously the only way to correct a wrong/stale
  `Offering.externalUrl` was Admin → Vendors → vendor → Catalog. Added an edit-in-place pencil icon
  next to the vendor link on each Change Queue row (reuses the existing offerings PATCH endpoint).
  Confirmed this is fully independent of the pending price change either direction — editing the URL
  doesn't touch the staged row, and Approve/Reject doesn't touch the URL.
- **Editable price before approving** — the scraped "New Price" is now an editable field; Approve
  publishes whatever's in the field, not necessarily what the scraper saw. The original scraped value
  is preserved in `StagedPriceChange.reviewNote` (appended, not overwritten, since that field can
  also carry a discovered-URL marker `publishStagedChange` reads on approve).
- **Reject clarified as a no-op** — added plain-language copy/tooltips: rejecting a staged change
  never touches `Offering.currentPrice`; the live price simply stays what it already was. (Confirmed
  via code read: only Approve → `publishStagedChange` ever writes to `Offering`.)

### Fixed (2026-07-22, Discovered import: multi-category promote)
- **`new_test_category` on the Discovered Excel import now correctly supports a comma-separated
  list** (e.g. `"Hormones, Metabolic"`) — previously the whole cell was treated as one literal
  category name, so a multi-category entry never matched an existing category and would have
  silently created one bogus category named e.g. "Hormones, Metabolic" instead of linking the new
  test to both real categories. Each name in the list is now resolved independently (existing
  matched case-insensitively, unrecognized ones auto-created, same as before for a single name), and
  `createPromotedTest` (`lib/discovered-actions.ts`, shared by both the bulk import and the one-by-one
  admin UI's Promote button) now takes `categoryIds: string[]` and creates a `TestCategory` row per
  id, deriving `Test.categoryId` as the lowest-`displayOrder` one among them — the same
  many-to-many/display-pointer rule every other test in the catalog already follows. Verified
  end-to-end against a seeded local row (existing + auto-created category, correct display pointer).

### Changed (2026-07-22, site-wide rebrand)
- **New brand identity implemented everywhere** (public pages + admin panel), pixel-matched to a
  design handoff: navy `#0f2647`, blue `#1656e8`, green `#1a9e5c`, red `#e0293e`.
  - `globals.css` `@theme` brand/accent ramps re-anchored to the new hex values (both the Tailwind
    utility classes and the hand-written `.admin-*` classes derive from these).
  - Every hardcoded `oklch(...)` color literal across `apps/web/app` (~230 occurrences, 23 files,
    including the Tailwind-bracket `oklch(L_C_H)` form) hue-shifted from the old palette (blue
    228-232, green 145/165) to the new one (blue 258-262, green 155) — lightness/chroma untouched, so
    only the hue moved. The handful of remaining "off-brand" hues (155/180/220/260/300 used for
    category-badge and accordion-icon variety) are intentional and were left alone.
  - New shared `Logo`/`LogoIcon` component (`app/components/Logo.tsx`) — test tube + magnifying glass
    + $ mark — replacing the old inline SVG wordmark in `Navbar`, `Footer`, and `AdminSidebar`.
  - New favicon (`app/icon.svg`), Next.js-convention `apple-icon.png` (180×180) and a 512×512 PWA icon
    (`public/icon-512.png`), generated from the same mark via a new `sharp`-based script
    (`scripts/generate-brand-icons.ts`). `opengraph-image.tsx` rewritten to match (navy background,
    inline SVG mark, new wordmark colors) instead of the old emoji+gradient version.
  - Poppins (`next/font/google`) wired in for the logo wordmark only, via a `--font-poppins` CSS
    variable — body copy is intentionally untouched (still DM Sans/system-ui); this was a scope call
    since the brief only specified logo/colors/favicon, not full typography.
  - `viewport.themeColor` and the body background updated to match.

### Changed (2026-07-22, Discovered round-trip: CSV → Excel)
- **Replaced the Discovered CSV export/import with a real `.xlsx` workbook** (`exceljs`, new
  dependency in `apps/web`). Three things plain CSV genuinely couldn't do:
  1. `quest_code`/`labcorp_code` columns are TEXT-number-formatted so Excel can't silently strip a
     leading zero off a lab code — a real correctness risk with CSV, not just a display nuisance.
  2. `new_test_category` gets a real Excel dropdown, sourced from a new **Categories** reference
     sheet listing every existing category — still allows typing a name that isn't on the list
     (that's exactly the "create a new category" path, unchanged: created automatically on Apply).
  3. A dedicated **How it works** sheet (with a worked example) plus a real Excel cell note (hover
     tooltip) on every column header, replacing the inert instruction-rows-in-the-data-sheet
     workaround from the CSV version.
  `decision` also got a dropdown (ignore/attach/promote). Upload changed from a JSON `{csv: string}`
  body to `multipart/form-data` (`file` + `apply`) — a real binary file now, not text pasted into
  JSON. Everything downstream of parsing (validation, grouping, dry-run/apply) is unchanged; only how
  the file is produced and read changed.

### Added (2026-07-22, self-documenting Discovered CSV)
- **The Discovered CSV export now explains itself**, since the column meanings — especially when to
  `attach` vs. `promote` — weren't obvious from the sheet alone. A block of instruction rows is
  prepended to every export: what each column means, a plain-language attach-vs-promote decision
  rule, how the category auto-create works, and what the confidence/duplicate-vendor flags mean.
  These rows have `decision` left blank, which the importer already treats as "skip, not an error"
  for any row — so they're inert whether the reviewer deletes them or leaves them in.
  Also added two new columns: `suggested_test_name`/`suggested_test_slug`, the auto-matcher's fuzzy
  (never auto-applied) candidate — this is the actual answer to "does this test already exist,"
  i.e. the real signal for attach-vs-promote, not just prose about it.

### Added (2026-07-21, GA4 custom events)
- **GA4 event instrumentation**, now that tracking is confirmed live. `lib/gtag.ts` exposes a
  `trackEvent()` helper (no-ops without GA configured). New events: explicit `page_view` on every
  client-side route change (`GoogleAnalytics.tsx` — gtag's automatic SPA detection doesn't reliably
  follow the App Router's History API usage, so this is fired manually instead of trusted); `search`
  with the real result count (`SearchResultsTracker`, mounted on `/search`); `search_suggestion_click`
  (autocomplete pick vs. a typed query, `SearchBar`); `vendor_click` (the "Order" link — the site's
  actual conversion event — with test/vendor/price, `TestDetailClient`); and
  `suggestion_modal_opened`/`suggestion_submitted` on all three `SuggestionModal` forms (vendor
  suggestion, test suggestion, result-error report), which makes form-abandonment visible in GA4 for
  the first time — our own DB only ever recorded successful submits. None of this duplicates
  PageView/SearchLog/AffiliateClick's job; it gives GA4 the same signals with session/device/geo
  attached, which those tables were never built to capture. `/admin/analytics` now links out to
  Google Analytics for that data rather than embedding it (an honest "not here yet" — pulling GA4's
  own reports back into this page needs the GA4 Data API + a service account, still just a TODO).

### Fixed (2026-07-21, GA4 not actually firing in prod)
- **GA4 loaded but never tracked anything, after `NEXT_PUBLIC_GA_MEASUREMENT_ID` was set in Railway.**
  Root cause: `next build` inlines `NEXT_PUBLIC_*` vars into the CLIENT bundle at build time, and that
  build runs inside the Docker build step (`RUN pnpm build` in `Dockerfile`) — but Railway's dashboard
  Variables are only injected into the running CONTAINER at deploy time, not into `docker build`
  itself. Server-side rendering read the variable fine (Node always has live `process.env` access on
  the server, regardless of the `NEXT_PUBLIC_` prefix), so `GoogleAnalytics.tsx`'s script tag loaded
  correctly and the SSR preload hint showed the right ID — but the CLIENT bundle had baked in
  `undefined`, so on hydration the component's own `!id` check bailed and `window.dataLayer` never
  got created. Fixed with `ARG NEXT_PUBLIC_GA_MEASUREMENT_ID` + `ENV` in the Dockerfile's builder
  stage, which Railway auto-populates from the service Variable of the same name for Dockerfile
  builds. Verified locally (`next build && next start` with the var set reproduces working tracking;
  reproducing the bug requires simulating "var absent at build, present at runtime" the way Railway's
  Dockerfile path actually behaves). Any future client-side `NEXT_PUBLIC_*` var needs the same
  ARG/ENV pair — noted in the Dockerfile comment.

### Fixed (2026-07-21, dev experience)
- **`@prisma/client` "can't be external" Turbopack warning on `pnpm dev`** — a classic pnpm-monorepo
  phantom dependency: `@prisma/client` was only a transitive dependency of `apps/web` (via
  `@labprice/database`), so Next's default `serverExternalPackages` externalization couldn't resolve
  it from `apps/web`'s own `node_modules`. Added `@prisma/client` as a direct dependency of
  `apps/web` instead of touching `next.config.ts` (a `serverExternalPackages` config change was tried
  before and conflicts with `transpilePackages` including `@labprice/database` — see the comment
  there). Verified: warning gone from `next dev --turbopack`; `next build` output unchanged.

### Removed (2026-07-21)
- **Dormant engagement tables + a dead scraper-config column.** `SavedTest`/`PriceAlert`/
  `Notification`/`AlertNotification` backed the Save / Price-Alert / dashboard features removed
  2026-07-06; kept dormant since then per `.claude/CLAUDE.md`'s old gotcha #9. Checked prod first:
  `saved_tests`/`notifications`/`alert_notifications` were completely empty and `price_alerts` had
  exactly one row (a 2026-07-05 test alert on the site owner's own admin account, `targetPrice: $1` —
  clearly leftover test data). Dropped all four tables + the `NotificationChannel` enum they used.
  Also dropped `scrape_vendor_configs.schedule_cron` (dead since `frequencyDays` became the real
  scheduling mechanism — zero code read it). Migration:
  `docs/database/2026-07-21-drop-dormant-engagement-tables.sql` (already applied to prod).

### Fixed (2026-07-21, clustering pass 2 — same-vendor-duplicate audit)
- Auditing the 163 clusters the duplicate-vendor warning flagged (added in the pass below) surfaced a
  more serious version of the same root cause: `nameTokens()`'s `length > 1` filter drops single-
  character tokens entirely, so **"Hepatitis A Antibody" and "Hepatitis C Antibody" reduce to the same
  token set and silently merge two different diseases into one cluster** — same for "Protein C
  Antigen" vs. "Protein S Antigen". Also found the specimen-type fix below didn't cover draw-timing/
  measurement-form qualifiers: "Glucose, Random" (different reference range from fasting/plasma
  glucose) was still merging with "Glucose, Plasma". `clusterKey()` now also appends a suffix for any
  standalone capitalized letter in the name (case-sensitive, so incidental lowercase split artifacts
  like "w" from "w/" don't count) and for total/free/fasting/random/direct/calculated/A.M./P.M.
  qualifiers — same additive-only pattern as the specimen-type fix (a suffix only ever splits a merge,
  never blocks one). Cut same-vendor-duplicate clusters from 163/403 rows to 133/320 rows. The
  remainder is mostly blood/serum/plasma naming variance (e.g. "Arsenic, Blood" vs "Arsenic,
  Serum/Plasma") deliberately left alone — likely the same test named differently more often than not,
  ambiguous enough that a human call beats another heuristic — still safely caught by the duplicate-
  vendor warning below, not silently merged.

### Fixed (2026-07-21, clustering + duplicate-vendor safety)
- **Discovered clustering was merging genuinely different tests that share a core name but differ by
  specimen type** — found live reviewing the "Iodine Blood Test" cluster: header said 9 vendors, table
  showed 13 rows, because 4 vendors each sell a serum AND a urine variant that both collapsed to the
  same cluster key (`strongTokens()` treats "serum"/"urine"/"random" as generic filler, which is
  correct for the broader test-matching pipeline but wrong for clustering raw unknown products).
  `clusterKey()` (`apps/web/lib/discovered-actions.ts`) now splits out alternate-specimen listings
  (urine/saliva/stool/hair/etc.) from the default (blood/serum/unspecified) bucket, so "Iodine, Serum"
  and "Iodine, Urine" land in separate clusters instead of one.
- **Same-vendor duplicates within a cluster silently dropped a product's price with zero trace.**
  Offering is unique on (test, vendor), so promoting/attaching a cluster where one vendor has two rows
  (the Iodine case above, before the clustering fix) only created an offering for whichever row
  processed first — the second was marked MATCHED with no offering and misreported as "listed ✓" in
  the Matched tab. `attachProductsToTest` now leaves a same-vendor duplicate completely untouched
  (stays UNMATCHED, back in the queue) and returns it as `droppedDuplicates` instead. Surfaced end to
  end: an amber warning on cluster cards listing which vendors repeat, a `duplicate_vendor_in_cluster`
  CSV column, and a same-vendor-duplicate count in the CSV import dry-run preview.

### Fixed (2026-07-21, perf)
- **`/admin/discovered` hung indefinitely once real scrape volume hit it.** The "demand report"
  (zero-result searches that overlap an unmatched product) re-tokenized both sides of every name
  comparison from scratch on every call — fine when the table was empty, but O(searches × clusters ×
  products) with ~6,000 real clusters meant well over a million redundant tokenizations per page load.
  Found live right after the first "Scrape all catalog vendors" run populated `VendorProduct` for the
  first time. Fixed by tokenizing each distinct string once and reusing the cached token set
  (`apps/web/app/api/v1/admin/discovered/route.ts`).

### Added (2026-07-21)
- **Discovered CSV round-trip** — `Export CSV` / `Import CSV` on `/admin/discovered`, for working
  the review queue offline instead of clicking through clusters one at a time (built after the first
  live "Scrape all catalog vendors" run landed ~7,200 unmatched products in one pass — a quarterly
  catch-up volume the one-by-one UI wasn't designed for). One row per **vendor product**, not per
  cluster, so a reviewer can split a cluster (attach 8 of 9 vendors, leave a price-outlier one for
  later) — something the cluster-level UI buttons still can't do. Each row gets a computed
  `confidence` (high/medium/low, based on shared Quest/LabCorp codes and price-outlier detection
  against the cluster median) so a big file can be sorted/filtered instead of read row by row.
  `GET/POST /api/v1/admin/discovered/export|import`; same dry-run-diff-then-apply contract as the
  existing Tests CSV import. Refactored the promote/attach/list mutation logic out of the one-by-one
  route into `apps/web/lib/discovered-actions.ts` so the bulk import path and the click-through UI
  share one implementation.

### Fixed (2026-07-20)
- **Admin-triggered scraping was completely broken in production.** `apps/web/lib/redis-options.ts`
  built its ioredis connection options from `REDIS_URL` but only kept `host`/`port`, dropping
  `username`/`password` — worked against local Redis (no auth) but hung indefinitely against
  Railway's password-protected Redis (`NOAUTH Authentication required`, silently swallowed by the
  BullMQ producer's retry loop). Affected both "Scrape Now" (single vendor) and "Scrape all catalog
  vendors" — found live 2026-07-20 while verifying the tests-database redesign, since both routes
  share this helper. Fixed by carrying over `username`/`password` from the URL, same as the
  already-correct `apps/worker/src/redis.ts`.

### Added (2026-07-20, tests-database redesign — all 4 phases)

> ⚠️ **Deploy note:** this ships two new tables (`vendor_products`, `test_aliases`) — run
> `prisma db push` against the prod DB before/with this deploy.

- **Ingest-everything layer (`VendorProduct`).** Every product every catalog crawl sees is now
  upserted into `vendor_products` (name, url, price, Quest/LabCorp codes, panel flag, first/last
  seen) instead of being discarded when it doesn't match a listed test. Page-vendor narrow crawls
  record name+URL-only rows (detail fills in when fetched); API vendors record full detail for the
  whole catalog. Ingest is non-fatal to the pricing run and idempotent (unique on vendor+slug).
  Verified offline against the captured Dirt Cheap Labs fixtures: 305 products recorded, re-run
  produces zero duplicates.
- **Strict auto-matching + learned aliases (`TestAlias`).** Unmatched products auto-link to a
  canonical test ONLY on exact evidence: a Quest/LabCorp code hit (guarded by a shared distinctive
  name token) or an exact normalized name/alias match; anything fuzzier only sets a review
  suggestion (per product decision 2026-07-20). Confirming a match (attach/promote/list) stores the
  vendor's raw name as a `TestAlias`, and aliases feed BOTH future auto-matching and the existing
  pricing pipeline (name tier + catalog narrowing treat aliases as the test's own name) — confirm
  once, matches forever. **Panels are excluded** from matching/clustering entirely (no two vendors
  sell the same panel); they're still ingested and visible under a Panels tab.
- **/admin/discovered — the review queue.** Unmatched products grouped into cross-vendor clusters
  (by shared code, else distinctive name tokens), most-vendors-first. Per cluster: **Promote to
  test** (creates the test + offerings with observed prices, codes prefilled), **Attach to
  existing** (test picker; creates offerings + learns aliases), **Ignore** (reversible). A
  "Matched, not listed" tab holds auto-matched products whose offerings don't exist yet — matching
  never publishes by itself; listing is the deliberate one-click step (`List` / `List all`).
  Includes the **demand report**: zero-result site searches that overlap an unmatched vendor
  product ("people search for it AND vendors sell it"). New APIs:
  `GET/POST /api/v1/admin/discovered`. Dashboard gains a fifth attention card (Discovered products).
- **/admin/coverage — the tests × vendors matrix.** Green = listed with price; amber dot = the
  ingest layer knows the vendor sells it but no offering exists (deep link to Discovered); blank =
  not carried. `GET /api/v1/admin/coverage`.
- **Tests CSV round-trip.** `Export CSV` on /admin/tests downloads the canonical layer (id, name,
  short_name, slug, quest/labcorp codes, pipe-separated categories + aliases, is_popular — no
  prices on purpose: identity is sheet-owned, prices are scraper-owned). `Import CSV` re-uploads it
  through a **dry-run diff preview** (new / field-level changes / unchanged / errors / categories
  to be created) — nothing applies until confirmed, errors block the whole file, applies run in one
  transaction and are audit-logged (`tests.csv_import`). Blank id = create; categories/aliases
  columns are full-set replace; unknown categories are created. `GET /api/v1/admin/tests/export`,
  `POST /api/v1/admin/tests/import`. Verified end-to-end locally (export → edit → dry-run → apply →
  re-scrape auto-matched the newly imported test by name).

### Added (2026-07-20, ops-audit S-tier)
- **Dashboard "Needs attention" row** (`/admin`). Four cards — pending price changes, low-trust
  vendors, scrape failures (7d), pending suggestions — each showing the count of work waiting
  (amber when >0, green at zero) and deep-linking to the filtered view. Low-trust/failure cards
  list the vendor names inline. The Change Queue (`?status=`), Suggestions (`?status=`), and
  Vendors (`?sort=&dir=`) pages now read initial filter state from the URL to make those deep
  links work. Old KPI tiles (tests/vendors/offerings) kept below; "Pending Changes" moved into
  the attention row.
- **"Scrape all catalog vendors" button** on `/admin/vendors`
  (`POST /api/v1/admin/vendors/scrape-all`): queues a `scrape-discover` job for every active
  catalog-mode vendor in one click, replacing per-vendor Scrape Now × 15 (or the hand-written SSH
  script from the Dirt Cheap Labs re-check). Runs entirely via the worker — nothing inline. The
  web app's ad-hoc Redis producer options were factored into `apps/web/lib/redis-options.ts`
  (was duplicated inline in the single-vendor scrape route).
- **Searchable Audit Log** (`/admin/audit`, in the sidebar): action / entity type / actor
  (incl. "System" for scraper writes) / date-range filters + 50-row pagination over `AuditLog`
  via `GET /api/v1/admin/audit`; entity ids are batch-resolved into names ("Vitamin D at
  Walk-In Lab"). The dashboard's row-humanizing logic moved to the shared
  `apps/web/lib/audit-describe.ts`; its Recent Activity feed now links "View all →" here.

### Added (2026-07-20)
- **Admin Analytics overhauled** (`/admin/analytics`). Was 3 KPI totals + 5 tables with no sense of
  trend; now: each KPI tile carries a 12ish-point sparkline, a new "Traffic over time" line chart
  (page views + unique visitors, hover crosshair + tooltip), a "Top pages" table (every page, not just
  test pages), and a "Top referrers" table — `AffiliateClick.referrer` had been logged since day one
  but never surfaced anywhere. Chart hand-rolled in SVG per the dataviz skill (validated blue/green
  categorical pair, 2px lines, hairline gridlines, legend, crosshair).
- **Fixed: "unique visitors" was structurally impossible before this** — `sessionId` was accepted by
  the API/schema but the client never sent one, so every `PageView`/`SearchLog`/`AffiliateClick` row
  had `sessionId = null`. Added an anonymous `sid` cookie (`middleware.ts`, httpOnly, 180-day) read
  server-side by the event/click routes instead of trusting a client-supplied value — this also covers
  the affiliate-click redirect for free (a plain `<a href>` navigation, not a fetch a script could
  attach an id to). `PageViewTracker` was also only mounted on test pages; now also on the homepage
  and category pages, so "Top pages" isn't test-only either. Historical rows stay `null` — only new
  traffic gets a session id.
- **GA4 scaffold added** (`GoogleAnalytics.tsx` + `NEXT_PUBLIC_GA_MEASUREMENT_ID`). Renders nothing
  until that env var is set (currently unset everywhere) — a true no-op, not a live integration.
  Never fires on `/admin/*` (would otherwise pollute reports with staff usage). CSP
  (`middleware.ts`) allows `googletagmanager.com`/`google-analytics.com` unconditionally since the
  script never requests them while unconfigured. **Pulling GA4's own reports (sessions, geo, device,
  funnels) into the admin dashboard is a separate follow-up** — that needs a GA4 property + service
  account credentials only the site owner can provide (see TODO below).

### Changed (2026-07-20, cont'd)
- **Admin Suggestions reworked.** Replaced the three-card-grid layout with one sortable table (matches
  the Offerings/Users admin pattern) with status tabs (Pending/Reviewed/Dismissed/All) and a type
  filter. Dismiss now actually archives — it's filtered out of the default Pending view instead of
  just changing a badge color forever. Added a real permanent-delete action
  (`DELETE /api/v1/admin/suggestions/[id]?kind=...`) — these are public-form leads, not audited data,
  so no soft-delete/undo, matching the `confirm()`-gated delete pattern used elsewhere in admin.

### Changed (2026-07-20)
- **Price history chart removed from test pages** — it never read well once a test had more than a
  few vendors (the redesign to a low/high band in the last release didn't fix that). `PriceHistory`
  rows are still recorded on every price change (untouched — scrapers, `publish-change.ts`); only the
  chart UI (`PriceHistoryChart.tsx`, deleted) and the page's query for it were removed, so the data's
  there if we build a better visualization later.
- **Dirt Cheap Labs: the pricier lab is no longer silently dropped.** DCL sells many tests through
  BOTH Quest and LabCorp at different prices; `mergeCodeTiers` matching always took the cheaper lab
  and threw the other away. Added `Offering.labProvider` (which lab `currentPrice` came from) and
  `altLabPrice`/`altLabProvider` (the other lab's price, when it also carries the test) — ranking is
  unchanged (still the cheaper price), but the test page now shows "$X via LabCorp also available" as
  a secondary line, same treatment as the existing member-price note. Vendors with only one lab per
  test are unaffected (alt fields stay null). **Deploy note:** needs `packages/database/prisma/schema.prisma`
  migrated to prod (`ALTER TABLE offerings ADD COLUMN lab_provider TEXT, ADD COLUMN alt_lab_price
  DECIMAL(10,2), ADD COLUMN alt_lab_provider TEXT`) before this ships — held back from the
  2026-07-20 deploy for exactly that reason; see git log for the follow-up commit.

### Fixed (2026-07-20)
- **Test pages said "checked 2 weeks ago" despite daily scrapes running fine.** The "checked N ago"
  freshness line/dots read `Offering.priceUpdatedAt`, which only moves when a price *changes* — an
  unchanged price re-verified every morning still displayed its last change date (July 2–5), making
  the whole site look abandoned. Added `Offering.lastCheckedAt`, stamped on every successful scrape
  verification (catalog discovery match, per-URL scrape-execute, and both publish paths), and the
  test page now reads `lastCheckedAt ?? priceUpdatedAt`. Also fixed `ScrapeRun.pricesUpdated`, which
  recorded the *matched* count (with `pricesUnchanged` hardcoded 0) — every run looked like a mass
  update, which sent the staleness investigation down the wrong path; it now records actual price
  changes, with the rest in `pricesUnchanged`.

### Fixed (2026-07-19)
- **"Recent Activity" on the admin dashboard was missing most price publishes.** The `price_published`
  audit-log write only lived in the worker's `scrape-publish` BullMQ job — every other publish path
  (inline admin "Scrape now", the local CF-blocked-vendor script, and manually approving a change in
  the Change Queue) called `publishStagedChange()` directly and skipped it entirely. Prices updated
  correctly either way (offering + PriceHistory were always right), but the dashboard feed silently
  went stale — a scrape could run clean today and the feed would still show whatever the last
  *worker-queued* publish was, weeks ago. Moved the audit-log write into `publishStagedChange()`
  itself (`packages/scrapers/src/catalog/persist.ts`) — the one shared function all ~30 call sites
  already went through — and had `scrape-publish.ts` delegate to it instead of duplicating the
  update/history logic, so this can't drift out of sync again.

### Changed (2026-07-19)
- **Test page price chart redesigned.** Replaced the per-vendor line chart (unreadable/capped past
  5 vendors) with a single shaded band showing the low-to-high price spread across all vendors over
  the past year (`PriceHistoryChart.tsx`). Each vendor row in the price table now also shows its own
  "checked N ago" freshness dot (green/amber/gray), not just the one aggregate line in the header.

### Fixed (2026-07-19, after the first overnight scrape)
- **Worker image can now run browsers.** `Dockerfile.worker` moved to Debian (bookworm-slim) with
  Playwright Chromium baked in — Request A Test's stealth fetch crashed with "Executable doesn't
  exist" (alpine can't run Playwright browsers at all). Required pinning Prisma `binaryTargets`
  (bookworm-slim has no `openssl` binary, so "native" detection fell back to openssl-1.1 and
  crashed at startup).
- **Cloudflare-blocked vendors → local scraping.** Request A Test and True Health Labs sit behind
  Cloudflare challenges that never clear for datacenter IPs (verified with the new
  `apps/worker/scripts/debug-fetch.ts`) — stealth or not, the cloud can't scrape them. They're now
  set to **Manual only**, scraped from a residential connection via
  `scrape-blocked-vendors.ps1` (repo root; Desktop shortcut "Scrape Blocked Vendors") →
  `apps/worker/scripts/scrape-vendor-local.ts`, which runs the normal discovery inline against the
  LIVE database (`.env.scrape-prod`, gitignored) and publishes auto-approved prices immediately.
- **Empty catalog = failure.** A crawl returning 0 products (usually an unresolved WAF challenge)
  now records a FAILED run + failure alert instead of a "successful" scrape matching nothing.
  browser-fetch also waits out challenges properly (poll up to 15s, not a fixed 2s) and unwraps
  Chromium's XML-viewer DOM so sitemap catalogs parse.
- **Readable emails + dashboard.** Failure alerts are HTML cards (error in a capped monospace box);
  the admin dashboard's Recent Activity now renders sentences ("Price updated — Vitamin D at
  Walk-In Lab: $64.00 → $59.00") instead of `price_published offering#cmr6sty0`, with times.

### Deployed
- **Worker live on Railway (2026-07-18).** New `scrape-worker` service (same repo, branch
  `claude/github-write-access-3v9dld`) builds `Dockerfile.worker` selected via the
  `RAILWAY_DOCKERFILE_PATH` service variable — the repo-wide `railway.json` no longer pins
  `dockerfilePath` (it overrode the variable for every service). Worker CMD runs
  `pnpm exec tsx` from `apps/worker` (pnpm doesn't hoist workspace bins to the root `.bin`).
  Web service gained `REDIS_URL`; prod DB got `frequency_days` + re-applied `ddl-core.sql`.
  Note: the live Railway environment is named **"Lab Price"** (the "production" env is empty).

### Added
- **Automatic scheduled scraping.** The worker now registers a daily tick (06:00 UTC) that scrapes
  each vendor on its own cadence: new `ScrapeVendorConfig.frequencyDays` (default 7 = weekly; 0 =
  manual only), edited via a **Scrape frequency** dropdown on the admin vendor page (replaces the
  never-read cron field). The tick respects the `scrape_enabled` master switch, counts ANY prior run
  (manual scrapes reset the clock), and enqueues catalog vendors to `scrape-discover` / per-URL
  vendors to `scrape-execute`.
- **Scraper status emails.** New `scrape-report` queue + worker sends a **weekly digest** (Mondays
  12:00 UTC) to all admins: per-vendor status (ok/failed/overdue/never-ran), price changes, linked
  tests that could NOT be priced (UNMATCHED results by name), pending change-queue count, and weekly
  error totals. Scheduled scrape failures also send an **immediate alert** (throttled to one per
  vendor per day). Emails go via Resend from the worker (`apps/worker/src/report.ts`); without
  `RESEND_API_KEY` the body is logged instead.
- **Price-history charts on test pages.** Test detail pages now render an inline-SVG step chart of
  the last 12 months of `PriceHistory` per vendor (top 5 by movement), with the current price
  extended to "today". Hidden until a test has at least one recorded price change.
- **Reset analytics.** New Danger-zone card on admin Settings wipes all traffic analytics (search
  logs, vendor clicks, page views) via `POST /api/v1/admin/analytics/reset` — audit-logged, and
  never touches prices/scrape history.

### Removed
- **Dead feature flags.** The `feature_flags` seed rows and the Settings-page toggles
  (`price_history_charts`, `user_registration`, `scraper_v2`, etc.) are gone — no code ever read
  them, so the toggles were decorative and misleading. (Table stays in the schema. Prod cleanup:
  `DELETE FROM feature_flags;`.) Price-history charts now actually exist (above) instead of being a
  fake toggle.
- **Deployment readiness (Railway + Cloudflare)** — new `DEPLOY.md` (accurate, repo-specific runbook +
  pre-launch security checklist) and `docs/database/ddl-core.sql` (the launch subset of `ddl.sql`:
  extensions + citext + FTS `search_vector`, idempotent, applied after `prisma db push`). Fixed the
  broken `docker-compose.yml` migrate step (there are no Prisma migrations) to use db push + core DDL
  + seed.

### Fixed
- **Homepage served fake demo links after every deploy → 404s.** The homepage was an ISR page
  (`revalidate = 60`) with a `DEMO_TESTS` fallback for DB-less builds; at build time on Railway (no DB)
  it baked the demo snapshot into the cache, so the first post-deploy visitors got hardcoded demo
  slugs (`/test/psa`, `/test/thyroid-panel`, …) that don't exist in the real catalog and 404. Made the
  homepage `export const dynamic = 'force-dynamic'` so it always renders against the live DB; the demo
  fallback now only appears during a genuine DB outage, never in the prerender.
- **Magic-link sign-in bounced back to the login form.** The Auth.js callback returns to
  `/auth/signin` (default `callbackUrl`), which just re-rendered the form for an already-authenticated
  user. The sign-in page now redirects signed-in users onward (admins → `/admin`, else home).
- **Production build was broken.** `next build` failed (`<Html> should not be imported…` on `/404`)
  because `.env` pinned `NODE_ENV=development`, which the dotenv build wrapper injected; removed it
  from `.env`/`.env.example` (Next sets `NODE_ENV` per command). Also the worker's `tsc` build
  (pre-existing ioredis dual-version type errors) was failing the whole `pnpm build`; the worker now
  runs via `tsx` with a no-op build (`start`/Dockerfile CMD updated). `pnpm build` now passes 6/6.

### Added (features)
- **Editable static pages** — About, Terms of Service, Privacy Policy, and Medical Disclaimer are now
  edited from a new **`/admin/pages`** screen instead of being hardcoded. Content is stored in
  `system_settings` under `page_<slug>` (`lib/static-pages.ts`), falls back to the original copy when
  unset, and renders through `StaticPageBody` (a tiny safe convention: blank line = paragraph, `## ` =
  heading, `- ` = bullet — no raw HTML). Saving revalidates the live page immediately. API:
  `GET`/`PATCH /api/v1/admin/pages`.
- **Dev-only sign-in** — a local shortcut on `/auth/signin` (and `POST /api/dev-login`) that signs you
  into an existing account by creating a DB session directly. Hard-gated to `NODE_ENV !== 'production'`
  (404 in prod) and only logs in accounts that already exist. Needed because the email (Resend) and
  Google providers have no credentials configured in dev, so there was no way to log in locally.
- **Sign in / sign out on the site** — signed-out visitors see a "Sign in" link (→ existing
  `/auth/signin`), signed-in users see their name/email + a "Sign out" server action, and admins get
  an "Admin" link. (Auth was already wired via NextAuth Google + Resend; there was just no way in/out
  from the public UI.) Implemented as a static `Navbar` + a client `NavAuth` island that reads
  `/api/auth/session` after hydration — deliberately *not* `auth()` in the server component, which
  would force every page dynamic and defeat ISR (see Changed: test page is ISR-cacheable).
- **`/search` results page** — the "Compare" button and plain Enter in the search bar now go to a
  full results page (server-rendered via the existing FTS `search()` service, reused `TestCard`,
  `noindex`). Arrow-selecting a suggestion still deep-links straight to the test. This makes the
  previously-unused `/api/v1/search` route + `search()` service live.
- **Price-freshness line on test pages** — "Prices last checked N ago" (from the freshest offering
  `priceUpdatedAt`), a trust signal for a price-comparison site.
- **Generated social share card** — `app/opengraph-image.tsx` renders a branded OG/Twitter image
  (the metadata previously pointed at a missing `/og-image.png`). Added `metadataBase`.
- **"Report an error" on test pages** — a card under the info accordions ("Spot a wrong price or a
  dead link?") opens a modal where a visitor can flag a wrong price/dead link/wrong code, optionally
  pinpointing which vendor listing. New `ResultErrorReport` model (schema pushed), public
  `POST /api/v1/reports/result-error` (validates the test id and that the offering belongs to that
  test), admin email alert, and a "Result error reports" triage panel on `/admin/suggestions`
  (`kind: 'report'`).
- **Shared `SuggestionModal` component** — accessible modal form (Esc/backdrop close, body scroll
  lock, labeled fields, textarea/select support) now powering the footer suggestion forms and the new
  error-report form.

### Changed
- **Admin Vendors list — "Tests" column now shows `withUrl/total`** (e.g. `33/35`), amber when some of
  a vendor's linked tests have no product URL, so vendors needing manual URL review stand out at a
  glance. The API (`/api/v1/admin/vendors`) returns `offeringsWithUrl` alongside `_count.offerings`.
- **Navigation labels** (user request): removed the "Order Services" link from the top navbar; the
  footer's "Order Services" link is relabeled **"List of Lab Providers"** (still points to
  `/order-services`).
- **Test detail page is now ISR-cacheable** — removed the per-request `auth()` (it only gated the
  now-removed Save/Alert buttons), so anonymous views no longer pay a session lookup. Also dropped the
  unused biomarkers query/prop that was fetched on every view for nothing.
- **`autocomplete()` is cached** (`unstable_cache`, 60s, keyed on term+limit) so debounced keystrokes
  hit cache instead of re-running the offerings join.
- **Footer "Suggest a Vendor"/"Suggest a Test" are now buttons that open a modal** (were inline
  accordion forms — user request). Fields gained visible labels and a proper textarea for notes.

### Removed
- **Save / Price Alert / "Free Account"** (user request). Removed the dead "Free Account" navbar
  `<div>`, the `SaveTestButton`/`PriceAlertButton`, the `/dashboard`, and the
  `/api/v1/me/{saved-tests,alerts,notifications}` routes. The `SavedTest`/`PriceAlert`/`Notification`/
  `AlertNotification` Prisma models are **kept but dormant** — dropping them is a destructive
  `db:push` against custom `ddl.sql` constraints/partitions, and `lib/publish-change.ts` still
  references them.

### Security
- **Abuse protection on public write endpoints** — new `lib/rate-limit.ts` (in-memory fixed-window
  limiter + honeypot). `suggestions/vendor|test` and `reports/result-error` get a hidden `company`
  honeypot (→ silent fake-success) + 5–8 req / 10 min per IP; `analytics/event` gets a 120 req/min
  floodgate. `notify-service` caps admin alert emails at 100/day (DB row still saved).
- **Content-Security-Policy** added in `middleware.ts` (`frame-ancestors 'none'`, `base-uri 'self'`,
  `object-src 'none'`, `form-action 'self'`; inline styles/scripts allowed since public pages need
  them; dev adds `'unsafe-eval'` + ws for Turbopack).
- **`/api/v1/go/[offeringId]`** now only redirects/logs for live offerings (`isActive`+`deletedAt`
  filter) and records hashed IP/UA for later bot-dedupe.
- **Admin `tests/[id]` PATCH** validates its body with zod (a wrong-typed field was a 500, now 400);
  PATCH/DELETE handle missing rows as 404.
- **`search()`** strips tsquery operator chars from user input so `to_tsquery` can't throw a 500.
- **Footer readability**: text lightness raised from oklch 0.5–0.65 grays to 0.78–0.85 on the dark
  navy (the old values were hard to read — user report), separators lightened to match, and the
  copyright year is now dynamic (was hardcoded © 2025).

### Fixed
- **Hardening pass over the 2026-07-05 feature round** (senior-review sweep, all verified live against
  the running app):
  - **Admin user routes**: a plain ADMIN could change another ADMIN/SUPER_ADMIN's role via PATCH (only
    DELETE had the guard) — PATCH now mirrors it. Unknown roles (`role: "BANANA"`) and malformed JSON
    bodies now return 400 instead of a Prisma 500; PATCH/DELETE on a missing/deleted user returns 404
    instead of 500. The last-SUPER_ADMIN check-then-act now runs inside a `Serializable` transaction so
    two concurrent demotes can't both slip past it (a genuine race conflict returns a retryable 409).
  - **`/order-services` accordion**: the "Visit site" link was rendered *inside* the expand/collapse
    `<button>` — invalid HTML (nested interactive controls) that breaks keyboard/screen-reader use.
    Restructured as siblings; toggle buttons also gained `aria-expanded`.
  - **Analytics API**: `?days=abc` produced NaN → Invalid Date → Prisma 500; now falls back to 30. The
    six independent DB queries were awaited sequentially (7-deep chain incl. the dependent lookups);
    now two parallel batches, so response latency ≈ the slowest query instead of the sum of all.
  - **Suggestion forms**: protocol-less websites ("walkinlab.com") were rejected by strict `.url()`
    validation — now normalized with `https://` server-side (footer input switched from `type=url` to
    text to match). Malformed JSON on the public endpoints returns 400 instead of 500.
  - **Admin suggestion routes**: `?status=BOGUS` no longer 500s (400), and a real DB failure on PATCH
    is no longer misreported as 404 (only Prisma P2025 maps to 404 now).
  - **Admin UI resilience**: analytics page shows an error state instead of "Loading…" forever on a
    failed fetch and drops stale responses when switching the 7/30/90d window quickly; users page no
    longer hangs on a failed load; suggestions page surfaces PATCH failures instead of silently
    ignoring them.
  - `notify-service.ts` deduplicated (shared `sendAdminAlert` path for both suggestion emails).

### Added
- **Order Services directory** (`/order-services`, linked from navbar + footer) — every active vendor
  with an expandable table of the tests it carries and current self-pay prices, sourced from the same
  `Vendor`/`Offering` data as the per-test comparison table.
- **About / Terms of Service / Privacy Policy / Medical Disclaimer pages** (`/about`, `/terms`,
  `/privacy`, `/disclaimer`), linked from the footer, sharing a new `StaticPageLayout` component.
- **Admin email alerts on suggestion submission** (`lib/services/notify-service.ts`, via `resend`) —
  every ADMIN/SUPER_ADMIN active user gets emailed when someone submits "Suggest a Vendor"/"Suggest a
  Test". Fire-and-forget like the analytics logging; a missing `RESEND_API_KEY` or send failure never
  blocks the submitter's request.
- **Lighter, less-purple color scheme sitewide** (user-reported: the old dark blue/purple was hard to
  read). Brand hue moved from 280 (blue-violet) to 230 (clean blue) with softened chroma on all
  saturated (button/link/badge) shades — e.g. the main brand color went from `oklch(0.58 0.22 280)` to
  `oklch(0.56 0.14 230)`. Added a new `accent-*` scale (teal, hue 165) to `globals.css`'s `@theme` block
  for highlights/CTAs distinct from brand blue. Admin `bg-brand-900` sidebar and the `layout.tsx`
  `themeColor` meta (mobile browser chrome tint) updated to match. Applies to both the admin design
  system (`globals.css` tokens) and every public page's inline `oklch()` styles.
- **"Suggest a Vendor" / "Suggest a Test" forms in the site footer** (shown on every page) — capture
  leads into new `VendorSuggestion`/`TestSuggestion` tables (`SuggestionStatus`: PENDING/REVIEWED/
  DISMISSED), reviewed at `/admin/suggestions` (mark reviewed/dismissed). Never auto-creates a Vendor
  or Test row — purely a triage queue for admins.
- **Admin Analytics dashboard** (`/admin/analytics`) — what people search for (including **zero-result
  queries**, the gap-finding signal for "should we add this test?"), vendor click-through (which
  "Order" links get clicked most), and most-viewed test pages. Backed by the pre-existing
  `SearchLog`/`AffiliateClick`/`PageView` tables, which were mostly unlogged in practice — the live
  search bar calls `/api/v1/search/autocomplete`, a different endpoint than the one that already had
  `logSearch` wired up, so autocomplete searches weren't being tracked at all until now.
- **Add/remove users from the admin Users page** (`/admin/users`) — invite by email (restores a
  soft-deleted user instead of duplicating if they were previously removed), remove with guards: can't
  remove yourself, can't remove the last SUPER_ADMIN, and removal revokes all active sessions
  immediately (soft-delete alone wouldn't do this since Auth.js's PrismaAdapter doesn't know about our
  `deletedAt` convention).
- **Three new catalog scrapers, matching the rest of "The Lab Test Transparency Project" spreadsheet's
  vendor list** (Function Health, Marek Health, DrSays, Jason Health were the 4 sheet vendors we didn't
  already have): **Marek Diagnostics** (marekdiagnostics.com — Shopify; a product's own JSON-LD `mpn`
  field IS the Quest code directly; `@type: "ProductGroup"` distinguishes a bundle from a single test),
  **Jason Health** (jasonhealth.com — Algolia search API with a public referer-restricted key embedded
  in the page; best match rate of any vendor, 33/35 seed tests), **DrSays** (drsays.com — WordPress;
  no reliable live catalog discovery exists on this site, so `parseCatalog` deliberately returns a
  hardcoded list of 5 hand-verified product URLs instead of crawling anything that would mostly 404;
  matches on LabCorp code only, no name fallback, after finding this vendor's own codes for "Cortisol"
  and "Vitamin B12" don't match our stored codes for those tests). **Function Health** was evaluated and
  intentionally NOT built — its site exposes zero per-test pricing anywhere unauthenticated (membership
  required just to see any price), unlike MitoHealth's public storefront; there's no data source to
  scrape, so we skipped it rather than hand-enter static, unrefreshable numbers.
- Fixed a real data bug found via the Marek Diagnostics build: a test added from the Transparency
  Project sheet the prior session was named "Progesterone" but its Quest code (17180) is actually
  **17-Hydroxyprogesterone** — confirmed independently via both Marek Diagnostics' and Jason Health's
  own catalogs before renaming the test to its correct identity.
- **21 new tests from "The Lab Test Transparency Project" community spreadsheet** (a Reddit-maintained
  cross-vendor price sheet, v1.0 June 2026): Testosterone Free (calc)+Total, Testosterone Free Direct,
  MTHFR Genetic Test, hs-CRP, Mercury, Lead, Magnesium, Zinc, Lipase, Amylase, PSA Total+Free+%Free,
  IGF-1, Vitamin B12+Folate Panel, Apolipoprotein B, Homocysteine, Lipoprotein(a), Cystatin C with
  eGFR, Progesterone, Iron Panel, GGT, Fasting Insulin — plus 4 new categories (Genetics, Inflammation,
  Heavy Metals, Cardiovascular). The sheet's other 10 tests (CBC, CMP, TSH, Vitamin D, Ferritin, HbA1c,
  Lipid Panel, Cortisol, Vitamin B12, Estradiol) matched existing tests by name and were **not**
  duplicated, even where the sheet's Quest code differs from ours (Quest has had multiple valid codes
  for the same test; ours were verified live against real vendor catalogs and stay authoritative) — all
  31 of the sheet's tests are now represented. Fixed a pre-existing data issue found while auditing
  categories: CBC was tagged with leftover test/dev categories ("Male Enhancement", "Test", "Daves
  Test") instead of the (existing but unused) "Blood Count" category.
- **Bulk vendor coverage expansion**: linked all 35 tests to all 14 vendors (490 possible offerings) and
  ran discovery for every vendor — 324 offerings now have a real price. Cross-checked the spreadsheet's
  10 vendor columns against ours: **Mito Health, GoodLabs, Walk-In Lab (sheet's "Walkinlabs"), Quest
  Health (sheet's "Quest direct"), and LabCorp OnDemand (sheet's "Labcorp direct")** are the same
  vendors we already have (confirmed `walkinlabs.com` doesn't resolve — it's just informal naming for
  `walkinlab.com`); **Ulta Labs** remains blocked by an image CAPTCHA (see `STATE.md`); **Function
  Health, Marek Health, DrSays, and Jason Health** are not yet built — candidates for future scraper
  additions. `apps/worker/scripts/add-transparency-project-tests.ts` and
  `link-all-tests-all-vendors.ts` document how this was done and can be adapted for future bulk
  expansions.
- **Vendor verification harness** (`apps/worker/scripts/verify-vendor.ts`) — a repeatable, automated
  check to run against every vendor (required step for onboarding any new one — see SKILLS.md's "Vendor
  verification checklist"): adapter resolves to itself (not a silent GoodLabs fallback), catalog crawl
  returns a plausible product count, a fresh canary test auto-matches end-to-end, every stored product
  URL actually resolves, and the discovery run completes without throwing. Verified it correctly passes
  a healthy vendor and correctly fails (2/5) when the Discounted Labs adapter-drop bug below is
  deliberately reproduced.
- **"Recent Runs" panel on the vendor editor** (`GET /api/v1/admin/vendors/[id]/runs`) — the "live
  insight into scraping" an admin needs to see *why* a scrape failed without a DB query: last 15
  `ScrapeRun`s with status/trigger/duration/found-updated counts, and inline `ScrapeError` messages
  (e.g. `"HTTP 403 for https://requestatest.com/tests"`) for failed ones.

### Fixed
- **Admin Analytics "Most-viewed tests" double-counted every visit** (user-reported) — React Strict
  Mode double-invokes effects in dev (mount → cleanup → mount again on the same component instance),
  which was firing `PageViewTracker`'s POST twice per real page load. Fixed with a `useRef` guard keyed
  by pathname; the ref survives the double-invoke since it's the same fiber, so the second call is a
  no-op.
- **Leftover dark-purple hero on the homepage** (user-reported: background still didn't read well after
  the site-wide color pass) — the earlier hue-280→230 sweep only matched literal hue-280 strings and
  missed a few variants: the hero gradient's middle/end stops (hue 295/265), a hardcoded purple/magenta
  hex gradient on the "instantly" headline text, and the dark navbar variant (`rgba(15,12,36,0.9)`).
  Converted the homepage hero, stats bar, and navbar to the same light theme as the rest of the site;
  removed the now-unused navbar dark/light variant prop entirely.
- **Test detail page repeated its own description** — the description/purpose text appeared once as a
  standalone paragraph under the test name, then again inside the "About This Test" accordion. Removed
  the standalone paragraph; the accordion is the only copy now.
- **Request A Test's "Scrape now" always failed** (user-reported, alongside "Last success" never
  updating and the Catalog-source dropdown showing "goodlabs" instead of "Request A Test"). Root causes,
  all found live:
  - The admin vendor editor's adapter dropdown only listed the original 4 adapters
    (goodlabs/ownyourlabs/dirtcheaplabs/mitohealth) — Request A Test's real `requestatest` adapter had
    no matching `<option>`, so the UI showed the first option instead.
  - Neither the web app's inline "Scrape now" NOR the worker's own scheduled `scrape-discover`
    processor ever checked whether an adapter needs a real browser (Cloudflare JS challenge) — both
    silently used plain HTTP and got an instant `HTTP 403`, which is why "Last success" stayed stale.
    Added `adapterNeedsBrowser()` (exported from `persist.ts`) and wired it into both places.
  - A **direct** import of `browser-fetch.ts` (stealth Playwright) into the web app's API route was
    tried and fails at runtime — Turbopack can't bundle the stealth plugin for the Next.js server
    (`utils.typeOf is not a function`); `serverExternalPackages` didn't fix it either. Settled on:
    browser-needing adapters get queued to the `scrape-discover` BullMQ worker (a plain tsx process,
    no bundler) instead of running inline; the admin sees a "queued — needs the worker running" message.
  - Discovered and fixed along the way: `localhost` intermittently resolves to IPv6 on this Windows
    Docker Desktop setup, causing a `new IORedis('redis://localhost:6379')` connection to "succeed"
    (TCP connects) then reset on every read/write — an ECONNRESET storm that looks exactly like a Redis
    outage. `apps/worker/src/redis.ts` already normalized this for the worker; the web route's own
    ad-hoc Redis connections needed the identical `127.0.0.1` fix.
  - Verified end-to-end through the real admin UI: Scrape now → queued → worker picks it up → browser
    crawl → 11/11 matched, Last success updates to today, dropdown shows the correct adapter.
- **Discounted Labs' "Save Scraper Config" silently dropped its adapter, breaking ALL of that vendor's
  offerings** (user-reported via a stuck CBC price after pinning its URL). The scrape-config API route
  validated the adapter against a hand-kept 4-item whitelist instead of the scraper package's real
  `ADAPTERS` registry — every vendor added after the original 4 would lose its adapter on save,
  silently falling back to parsing the site with the GoodLabs parser (0 matches). Fixed to source from
  the real registry; also fixed the vendor editor's dropdown, which had the identical stale 4-option
  list. Restored Discounted Labs' config and re-verified.

### Added
- **Fifth catalog scraper — Walk-In Lab** (`walkinlab.com`, adapter `walkinlab`). Custom server-rendered
  store (plain HTTP, no bot wall), but its catalog spans 40+ paginated listing pages — added generic
  pagination support to the catalog crawler (`CatalogAdapter.nextCatalogPage`, optional, single-page
  adapters unaffected). A product page exposes both lab order codes together ("Test Code(s): 001453,
  496") so it matches like Own Your Labs (`codeMatchAnyProvider`); panel/bundle products are detected
  from the page's own "CPT Code(s): See Individual Tests" text (a real code appears for single tests).
  12 new unit tests over real fixtures (86 total). Verified live: 9/11 seed tests matched + auto-
  published, 1 correctly flagged ambiguous (PSA, 3 price tiers), 1 unmatched (a name-tokenization
  narrowing-heuristic gap, not an adapter bug — see `STATE.md`).
- Added `apps/worker/scripts/dev-admin-session.ts` — prints a ready `authjs.session-token` for the seed
  admin, for verifying admin-gated pages in the preview browser without a configured login provider.
- **Sixth catalog scraper — Personalabs** (`personalabs.com`, adapter `personalabs`). WooCommerce store,
  27+ paginated listing pages (reuses the `nextCatalogPage` pagination added for Walk-In Lab). Each
  product is labelled with its one fulfilling lab directly in the markup, so matching uses strict
  per-lab tiers instead of `codeMatchAnyProvider`. Panels are detected by counting hidden order-code
  elements on the page (a bundle carries one per constituent test). Also refactored `persist.ts`'s
  `buildConfig` from a ternary chain into a per-adapter defaults map — cleaner at 6 vendors, no behavior
  change. 14 new unit tests over real fixtures (88 total). Verified live: 6/11 matched + auto-published,
  4 correctly flagged ambiguous, 1 unmatched (same narrowing-heuristic tradeoff as Walk-In Lab).
- **Seventh catalog scraper — HealthLabs.com** (`healthlabs.com`, adapter `healthlabs`). No dedicated
  catalog page at all, so `sitemap.xml` doubles as the product index (single flat fetch, no pagination —
  the fastest of the paginated-catalog vendors so far, ~20s). Each product page has clean JSON-LD with
  unlabelled per-lab test codes (`codeMatchAnyProvider`, like Walk-In Lab). **No isPanel heuristic** —
  every signal tried (`category` field, "Panel" in the name, a testCode-count cutoff) was disproved live,
  most notably a count cutoff that mis-flagged CBC and the Comprehensive Metabolic Panel as bundles
  (both are single tests, just sourced from far more labs than usual — 17 testCodes each) and silently
  zeroed their manually-pinned-URL price. Removed the heuristic entirely; the matcher's existing
  ambiguity detection is the real backstop against a genuine bundle instead (see `STATE.md` for the full
  story). 11 new unit tests over real fixtures (99 total). Verified live: after the fix, **11/11 seed
  tests price successfully** — 9 matched + auto-published, 2 correctly flagged ambiguous, 0 unmatched.
- **Eighth catalog scraper — Private MD Labs** (`privatemdlabs.com`, adapter `privatemdlabs`). A huge,
  granular catalog (3,545 products) paginated via same-URL AJAX that only returns JSON with an
  `X-Requested-With: XMLHttpRequest` header — added generic extra-header support
  (`CatalogScrapeConfig.extraHeaders`) rather than needing a browser. No lab order codes anywhere on
  this vendor's site at all, so matching is name-only (like MitoHealth); no isPanel heuristic either
  (same reasoning as HealthLabs). 13 new unit tests over real fixtures (112 total). Verified live: full
  crawl ~70 pages/~2min; 11/11 seed tests price successfully (4 clean matches, 7 resolved via the
  pinned-URL fix above — this vendor's granular catalog produces genuine name ambiguity far more than
  any other vendor so far).
- **Ninth catalog scraper — Request A Test** (`requestatest.com`, adapter `requestatest`). Cloudflare
  JS-challenges every path except the homepage — the first vendor needing an actual headless browser to
  clear (stealth Playwright works fine, unlike Ulta's AWS WAF CAPTCHA). Added
  `packages/scrapers/src/catalog/browser-fetch.ts` (`browserFetchHtml`) as an opt-in fetcher, kept out of
  `persist.ts` so the web app stays Playwright-free; the standalone worker script passes it explicitly.
  **Inline "Scrape now" doesn't work for this vendor yet** (defaults to plain HTTP) — tracked as a
  follow-up in `STATE.md`. Otherwise GoodLabs-shaped: per-lab price + labelled Test Code, codes not
  universal (drug panels have a price but no code). 8 new unit tests over real fixtures (120 total).
  Verified live: 10/11 seed tests price successfully (9 matched, 1 resolved via the pinned-URL fix, 1
  unmatched — the usual narrowing tradeoff).
- **Tenth catalog scraper — DirectLabs** (`directlabs.com`, adapter `directlabs`). The marketing site is
  irrelevant; the real store is an Angular SPA (`store.directlabs.com`) that needs JS to render, but its
  JSON API is plain ungated HTTP. No "list everything" endpoint, so it fetches all 46 active categories
  and merges by test ID (API-vendor `fetchAll` adapter, like Dirt Cheap Labs/MitoHealth). No lab codes
  anywhere in the API → name-only matching; no isPanel heuristic. 7 new unit tests over real fixtures
  (127 total). Verified live: fast (~11s, pure API), 8/11 seed tests price successfully (2 clean
  matches, 6 resolved via the pinned-URL fix, 3 unmatched — real wording mismatches with no code
  fallback).
- **Eleventh catalog scraper — Discounted Labs** (`discountedlabs.com`, adapter `discountedlabs`).
  Magento store, single-page catalog (`/choose-a-test`, ~100 products, no pagination). Same "$1 today,
  pay balance after results" model as Private MD Labs. Lab codes are opportunistic — only present when a
  product page happens to link to `labcorp.com/tests/<code>/...`, no Quest equivalent found; the
  provider label is honestly `'unknown'` rather than assumed when no code is found. 8 new unit tests
  over real fixtures (135 total). Verified live: 6/11 seed tests price successfully (3 clean matches, 3
  resolved via the pinned-URL fix, 5 unmatched — lower auto-match rate than most vendors on this more
  compact catalog, same underlying tradeoff).
- **Twelfth catalog scraper — True Health Labs** (`truehealthlabs.com`, adapter `truehealthlabs`).
  WooCommerce store with a dedicated product-only sitemap (~1,736 products, single fetch). Best code
  exposure of any vendor so far: the WooCommerce SKU literally encodes `<Lab>_<code>` (e.g. `Quest_457`),
  verified against known-good codes. The site went unresponsive mid-session (Cloudflare 524 on the
  sitemap, then the homepage itself started timing out — a real, current outage, not a scraper defect;
  bumped the shared `httpFetchHtml` default timeout 20s→45s as a general safety margin) but recovered
  later in the same session, allowing a full live retry. That retry surfaced a real bug: an out-of-stock
  "Kelly Brogan's Super Panel" bundle reported a literal `price: 0`, which would have legitimately
  name-matched "Vitamin B12" (the bundle's name lists it among ~10 other tests) and shown as a bogus $0
  match. Fixed by having the adapter drop any product whose price isn't `> 0` — a real self-pay lab test
  is never actually free. 10 new unit tests over real fixtures (164 total). Verified live: 9/11 seed
  tests price successfully, 9 auto-published, 1 correctly flagged ambiguous, 1 unmatched (the bogus
  bundle now safely excluded).
- **Thirteenth catalog scraper — Quest Health** (`questhealth.com`, adapter `questhealth`). Quest
  Diagnostics' own first-party store. `sitemap_0.xml` lists the ~160-product catalog in one fetch, with
  the Quest order code embedded directly in the URL (`/product/hemoglobin-a1c-test/496M.html` → 496).
  Every product is Quest-fulfilled by definition. 10 new unit tests over real fixtures (154 total).
  Verified live: 8/11 seed tests price successfully (6 clean matches, 2 resolved via the pinned-URL fix,
  3 unmatched — the usual tradeoff).
- **Fourteenth catalog scraper — LabCorp OnDemand** (`ondemand.labcorp.com`, adapter `labcorpondemand`,
  last vendor in the research queue). LabCorp's own first-party store. `sitemap.xml` lists the
  ~132-product catalog in one fetch. Best isPanel signal of any vendor this session: every product page
  carries an explicit `data-isbundleproduct` true/false flag from the vendor itself, plus bundle SKUs
  are non-numeric (never trusted as a real order code) vs a real test's 6-digit LabCorp code. 9 new unit
  tests over real fixtures (163 total). Verified live: 9/11 seed tests price successfully (8 clean
  matches, 1 resolved via the pinned-URL fix, 2 unmatched — the usual tradeoff). **This completes the
  11-vendor research queue.**
- **Add/Edit Test auto-fill + inline vendor multiselect.** On the test editor you can now do it all
  from one page:
  - **✨ Auto-fill** button next to the test name. `POST /api/v1/admin/tests/lookup` populates, for
    review: **short name, slug, categories, the five content fields** (description / purpose / how it's
    performed / how to prepare / normal ranges), and **Quest/LabCorp codes**. Codes come from our vendor
    catalogs first (Dirt Cheap Labs' API — authoritative, non-hallucinated; `code-lookup.ts` trusts only
    a **same-significant-name** match so combos/panels like "Testosterone, Free and Total" can't supply a
    wrong code), then **Claude (`claude-opus-4-8`)** for any code the catalog missed. Claude also writes
    the short name + content and picks the best-fitting **existing** categories (never invents new ones);
    the slug is derived from the name. Fills **blank fields only** (categories only when none are
    selected) so it never clobbers admin edits; shows a note listing sources + a "verify AI-suggested
    codes" warning. Needs `ANTHROPIC_API_KEY` in `.env` — degrades to catalog-codes + slug when absent.
  - **Vendors** checklist on the editor (existing tests only). `GET/POST/DELETE
    /api/v1/admin/tests/[id]/vendors` attaches/detaches offerings from the test side; attaching a
    catalog vendor runs discovery **inline** so the price appears immediately (same as the vendor
    screen). New tests show "Save first, then attach vendors."
  - New dep: `@anthropic-ai/sdk` in `apps/web`.

### Fixed
- **Change Queue "verify" links for ambiguous matches** now point at the cheapest candidate's product
  page instead of the vendor homepage (e.g. MitoHealth Testosterone → `/products/testosterone-total`).
  (Dirt Cheap Labs still links to `/alacarte` — it has no per-test pages.)
- **Manual product-URL override.** For catalog vendors with product pages (GoodLabs, Own Your Labs),
  pasting the correct URL on an *unmatched* offering makes the next scrape fetch that page and price
  it directly — so admins can fix a test the name/code matcher missed. (API vendors DCL/MitoHealth
  have no per-product page, so this doesn't apply.)
- **Pinned-URL override now also applies to `ambiguous` results, not just `unmatched`** (`persist.ts`).
  Found via a real HealthLabs.com case: Cortisol name-matched two products at different prices
  ($109/$129, correctly flagged ambiguous), the admin confirmed the right one, but the pinned URL was
  never consulted because the override only fired on `unmatched`. Shared code, so this was never
  HealthLabs-specific — re-running Walk-In Lab and Personalabs after the fix resolved 5 more
  pre-existing ambiguous offerings across those two vendors for free.
- **Catalog edits save on blur** with a "Catalog saved." confirmation + inline hint, so it's clear the
  URL/price persisted without needing "Save Scraper Config".
- **Quest Health pinned-URL double-extension bug.** The shared pinned-URL retry derives a "slug" from
  the last path segment of a pinned URL — fine for one-segment slugs, but Quest Health's are two
  segments (`name-slug/codeM`), so the generic logic handed the adapter just `496M.html`, and
  reconstructing `${baseUrl}/product/${slug}.html` produced `.../496M.html.html`, corrupting the stored
  `externalUrl` on every pinned-URL resolution. Fixed by trusting the product page's own
  `<link rel="canonical">` instead of reconstructing the URL from `slug`.
- **DirectLabs product URLs all 404'd** (user-reported live). `fetchDirectLabsCatalog` built every
  product URL from `cfg.baseUrl` (the vendor's `websiteUrl`, `directlabs.com` — the WordPress marketing
  site) instead of the store subdomain (`store.directlabs.com`) where `/testinfo/<id>` actually
  resolves. Fixed to always build product URLs on the store subdomain; added a regression test that
  exercises `fetchDirectLabsCatalog` end-to-end (the old tests only called `mergeDirectLabsCatalog`
  directly, which never hit the buggy wiring). Re-ran discovery to correct all stored `externalUrl`
  values, and pinned CBC (previously unmatched by name; vendor's own wording is "CBC (includes
  Differential And Platelets)", PK_TestID 5015, $32) to `https://store.directlabs.com/testinfo/5015`.
- **Discounted Labs catalog scraper returned 0 products** (found proactively during a full admin-panel
  visual re-check of all 14 vendors, not user-reported). The site re-themed: the old
  `dl_search_result_title_clicked` tracking attribute the catalog regex matched on is gone from
  `/choose-a-test`; product cards are now `<li class="choose-test-item">` → `<strong
  class="choose-item-name"><a>`. Rewrote the catalog regex to scope to that wrapper and refreshed the
  stale fixture from a live capture. Re-verified live: 100 products parsed (was 0).
- **"Save Scraper Config" silently dropped the `adapter` field for every catalog vendor added after the
  original 4** (user-reported: pinning a Discounted Labs CBC URL, saving, and scraping produced no
  price — reproduced live: the save wiped `adapter` for *all* 11 of that vendor's offerings, not just
  CBC, so every one silently parsed through the GoodLabs adapter instead). The scrape-config API route
  validated `body.adapter` against its own hand-kept 4-item whitelist instead of the scraper package's
  real adapter registry; the admin vendor editor's adapter dropdown had the same stale 4-option list.
  Both now source from `@labprice/scrapers/src/catalog/adapters.ts`'s `ADAPTERS` registry. Restored the
  one vendor (Discounted Labs) whose config had actually been broken by this and re-verified end-to-end
  through the real admin UI.

### Added
- **Member/non-member pricing + fourth scraper (MitoHealth).** MitoHealth (`mitohealth.com`) is a
  $9/mo membership vendor; its /shop catalog loads from a tRPC API with per-provider variants carrying
  both member and non-member prices (no lab codes → name matching). New `mitohealth` API adapter.
  - **Data model**: added `Offering.memberPrice` and `Vendor.membershipNote`. We **compare/rank on the
    non-member price** (apples-to-apples with non-membership vendors) and show the member price as a
    small **inline** secondary line on the test page — e.g. "$5.85 for members ($9/mo membership)" —
    not a hover tooltip (works on mobile). Threaded `memberPrice` through the matcher + persistence.
  - Verified live: 600 products via the paginated API; 8 seed tests matched with both prices (CBC
    $3.78/$2.70, Ferritin $8.19/$5.85, Vitamin D $13.63/$9.73, …).
- **Third scraper — Dirt Cheap Labs** (`dirtcheaplabs.com`), an **API vendor**. Its catalog loads from
  `api.dirtcheaplabs.com/api/catalog/alacarte?lab=labcorp|quest` — one call per lab, each item with a
  `lab_code` + `retail_cents`. The catalog scraper now supports API adapters (`CatalogAdapter.fetchAll`)
  that return the whole priced catalog in one shot, no per-product crawl. We fetch both labs, merge by
  slug, and take the **cheaper lab** per test (`MatchOptions.mergeCodeTiers`). Verified live: CBC $2.88
  (Quest) vs $6.70 (LabCorp), CMP $3.78, Ferritin $5.99, etc.
- **Matcher hardening (name corroboration).** A code match is now trusted only if the product name
  also shares a *distinctive* token with our test (generic words like "vitamin"/"panel"/"total" don't
  count). This (a) drops wrong-test code hits — e.g. our seed TSH Quest code `867` actually resolves
  to "T4 Total" at Quest, so TSH now correctly prices at LabCorp instead of $2.99 T4 — and (b) stops
  the name tier from matching "Vitamin B12" to "Vitamin A/C/E". New `strongTokens`/`sharesStrongToken`.
- *(Note: seed TSH Quest code 867 is wrong — real Quest TSH is 899; a data fix for whoever curates.)*
- **Second scraper — Own Your Labs** (`ownyourlabs.com`). A Phoenix/LiveView reseller: the `/shop`
  page lists every test as a card linking to `/test/<UUID>`; each product page carries a single lab
  **Order Code** (a Quest or LabCorp code) plus the price. Matching uses that order code against BOTH
  our Quest and LabCorp codes (`MatchOptions.codeMatchAnyProvider`). Verified live end-to-end: 9/9
  seed tests matched (CBC $8.40, CMP $10, Ferritin $15, HbA1c $8.80, Lipid $10, PSA $16.80, TSH
  $13.20, Testosterone $29.80, Vitamin D $44.60) in ~12s, with exact product URLs stored.
- **Catalog scraper is now adapter-based** (`packages/scrapers/src/catalog/adapters.ts`): the crawler,
  matcher, and persistence are vendor-agnostic; each site's parsing lives in its own module
  (`goodlabs-parser.ts`, `ownyourlabs-parser.ts`). A vendor's `ScrapeVendorConfig.selectors.adapter`
  (`goodlabs` | `ownyourlabs`) picks the parser — exposed as a **Catalog source** dropdown in the
  admin Scraper Configuration.
- Name-narrowing now uses token-subset matching (same as the name tier), cutting candidate fetches
  (~46→18 for a 9-test vendor) and runtime (~36s→12s).

### Fixed
- **Catalog discovery now runs inline in the web app** (`@labprice/scrapers` `catalog/persist.ts`),
  fixing two admin actions that hung/stalled by enqueuing to Redis:
  - **Add test to a catalog vendor** now works — it prices the new offering immediately via a
    name-narrowed crawl (~2s) instead of a Redis job that could hang.
  - **"Scrape now"** runs synchronously and returns a real summary (`N matched, N need review, N not
    found, N published`) shown in the admin, instead of getting stuck on "Queuing…". Clean matches
    publish immediately; ambiguous ones go to the Change Queue.
  - Name-narrowing: an interactive scrape only fetches catalog pages whose name overlaps a linked
    test (a few fetches, not the whole ~50-page catalog). Exhaustive crawl still available.
- **Change Queue: vendor name is now a link** to the exact product page (`externalUrl`, falling back
  to the vendor site) so you can open it and verify the scraped price.
- **Admin catalog price shows `$` + 2 decimals.**
- **Test-page breadcrumb category is now a link** to that category's page (was plain text).
- **Removed all seed/demo vendors except Good Labs** (and their offerings) so Vendors/Offerings show
  only the live vendor. Soft-deleted (reversible).
- **Change Queue Approve/Reject now works without the worker.** The approve routes enqueued a publish
  job to Redis (`maxRetriesPerRequest: null`), which could hang the request and only updated the live
  price if the worker was running. Approve/reject now publish **inline** in a DB transaction
  (`apps/web/lib/publish-change.ts`) — instant, worker-independent, and they adopt the discovered
  product URL if the offering lacks one.
- **Vendor links now point to the exact product page.** Catalog discovery stores the matched product
  URL on the offering (`externalUrl`), so the "Order"/verify link resolves to e.g.
  `goodlabs.com/tests/<slug>` instead of the vendor homepage.
- **"Order" now applies affiliate tracking on top of the product page** (`apps/web/lib/affiliate-url.ts`,
  used by `/api/v1/go/[offeringId]`). Previously a vendor's `affiliateUrlTemplate` *replaced* the
  destination, so clicks skipped the exact product page. Now the customer always lands on the product
  page, with tracking layered on: a `{url}` placeholder in the template is substituted with the
  encoded product URL (network deep-links); a query-string template (`?subid=…`) is appended; a bare
  redirector URL gets the destination as a `url=` param. No template → straight to the product page.
- **Removed a duplicate GoodLabs vendor.** The e2e test runner had created a second vendor
  (slug `goodlabs`, 8 tests) separate from the admin-created `Good Labs` (slug `good-labs`); the
  duplicate is retired and the real vendor is configured as a catalog scraper. (Cleanup script:
  `apps/worker/scripts/fix-goodlabs-vendor.ts`.)

- **Worker Redis reconnect storm fixed.** The BullMQ workers crash-looped with a `write ECONNABORTED`
  storm because all 5 workers shared a single ioredis connection; blocking Workers each need their
  own. Each Worker now gets a dedicated connection (pass `redisConnection` options, not the shared
  instance); `localhost` is normalized to `127.0.0.1` to dodge Windows IPv6 flakiness
  (`apps/worker/src/redis.ts`). The `scrape-discover`/`scrape-execute` workers now run continuously,
  so admin **"Scrape now"** and **requeue-on-add** process end-to-end. Verified enqueue → worker
  crawls GoodLabs → stages, with zero ECONNABORTED.

### Added
- **Admin catalog-mode toggle.** The vendor Scraper Configuration now has a **Catalog mode** checkbox
  + catalog-path field. Saving persists `selectors.mode='catalog'` (and catalogPath) instead of the
  previous behavior that silently wiped it, so catalog vendors survive a config save. CSS selectors
  are disabled/greyed while catalog mode is on.
- **First live scraper: GoodLabs (catalog discovery).** A new scrape strategy for vendors that
  publish a whole catalog instead of per-test URLs. Given a vendor's linked tests, it finds each
  test's self-pay price on GoodLabs and stages the change.
  - **Data source**: plain HTTP (no browser, no CSS selectors). Parses the catalog page's JSON-LD
    `ItemList` for every `{name, /tests/<slug>}`, then each product page's Next.js flight data, which
    embeds one entry **per fulfilling lab** (quest/labcorp/bioreference) with that lab's code
    (`labTestIDs`), `price`, and an explicit **`isPanel`** flag.
  - **Matching** (`packages/scrapers/src/catalog/matcher.ts`): Quest code → LabCorp code → name
    (first tier with a hit wins). **Panels excluded** — a single test is never priced off a bundle
    it appears in. When >1 distinct price survives (e.g. "Testosterone Total" matches several
    products), it's **flagged ambiguous** → staged `PENDING` in the Change Queue with every candidate
    listed, never auto-guessed.
  - **Persistence** (`apps/worker/src/discovery.ts`): writes `ScrapeJob`/`Run`/`Result` + staged
    changes, auto-approving clean matches within trust/settings thresholds (ambiguous always manual).
  - **Requeue-on-add**: linking a test to a catalog-mode vendor enqueues a `scrape-discover` job
    scoped to that offering; "Scrape now" enqueues a full catalog crawl. A vendor is catalog-mode when
    `ScrapeVendorConfig.selectors.mode === 'catalog'`.
  - **Tested**: pure parsers + matcher covered by unit tests against real saved HTML
    (`packages/scrapers/src/__tests__/`, 39 tests); live end-to-end validated against goodlabs.com +
    real Postgres via `apps/worker/scripts/discover-goodlabs.ts` (6 matched, 1 ambiguous, 1 unmatched
    on the seed set). New BullMQ `scrape-discover` queue/worker wired in (runs once the worker's Redis
    reconnect storm is fixed; standalone runners work today).
  - Fixed: vendor trust is now resolved *before* the run row is created, so a brand-new vendor's first
    run doesn't self-drag its trust to LOW and block auto-approval.

### Documentation
- **Project docs made current and self-maintaining.** Rewrote `.claude/CLAUDE.md` (project guide:
  conventions, gotchas, run commands, plus a documentation-discipline rule and a code-annotation
  standard). Added `SKILLS.md` (feature catalog + dev workflows/recipes). Added a `SessionStart`
  hook (`.claude/settings.json`) that re-surfaces "keep CHANGELOG / SKILLS / CLAUDE current" each
  session. Annotated the key/complex modules (trust, scrape pipeline, category m2m, settings, APIs).

### Added
- **Live, data-driven counts on the homepage.** The hero badge ("Live prices from N ordering
  services") and the stats bar ("N Ordering Services", "N Common Tests") reflect the actual counts of
  active vendors and non-deleted tests, so they update as you add/remove vendors and tests
  (`apps/web/app/page.tsx`; `revalidate = 60` keeps them fresh in production).
- **Categories are now true many-to-many, with full management.** A test belongs to **one or many**
  categories — there is **no "primary/main" category** to choose. `Test.categoryId` is retained only
  as an internal, auto-derived **display pointer** (selected category with the lowest `displayOrder`),
  so public pages keep working.
  - Dedicated **Categories** admin page (add/rename/reorder/delete) + sidebar nav.
  - Test editor uses a single "Categories" chip multi-select; **≥1 required** (client + server).
  - **Delete contingency**: blocked (409) if it would orphan a test (names returned); otherwise the
    display pointer of affected tests is auto-reassigned.
  - Schema `TestCategory` join model; `tests` POST/PATCH accept `categoryIds[]`; category counts
    exclude soft-deleted tests; category pages + homepage filter use the full m2m set.
- **Offerings → vendor quick-link.** Vendor names in the Offerings overview link to the vendor editor.
- **Add-Vendor workflow clarity.** "Create & Configure" redirects into the full editor where scraper,
  trust, and catalog are set up (they need the vendor to exist first).

### Changed
- **Rebrand "LabPrice" → "LabTestCompare"** across all user-facing surfaces (navbar, footer, sign-in,
  admin sidebar, titles/metadata, Open Graph, email sender, worker log, scraper bot User-Agent, seeded
  admin name). Internal `@labprice/*` package names and the local Postgres DB name are unchanged.
- **Domain → `labtestcompare.com`** for canonical/OG/sitemap/robots/JSON-LD URLs and the email sender
  (`layout.tsx`, `robots.ts`, `sitemap.ts`, `test/[slug]/page.tsx`, `auth.ts`; `.env.example` adds
  `NEXT_PUBLIC_BASE_URL`).
- **Vendors list is much faster.** Per-row trust (N+1) is now batched into **2 queries** via
  `getVendorTrustMap()` (`packages/database/src/vendor-trust.ts`).

### Fixed
- **Homepage "All Tests" category filter ignored extra categories.** It filtered on a single
  `categorySlug`; now it loads each test's full category set and filters by membership
  (`apps/web/app/page.tsx`, `components/HomeTestList.tsx`).
- **Dev server "Jest worker… exceeding retry limit" crash.** `turbo dev` also ran the worker, which
  crash-looped on Redis (tens of thousands of `ECONNRESET`) and starved Next's compiler. `pnpm dev`
  now runs **web-only**; use `pnpm dev:worker` / `pnpm dev:all`. (Open follow-ups: the worker's Redis
  reconnect storm; benign `@prisma/client` "can't be external" Turbopack warnings.)

---

## [2026-06-29] — Admin panel lock-down

A six-phase pass to make the admin usable end-to-end. Plan: `.claude/plans/prancy-gliding-quill.md`.

### Fixed
- **Cramped layout (root cause).** `globals.css` had `* { margin:0; padding:0 }`, which in
  Tailwind v4 overrides every (layered) spacing utility — silently zeroing all admin padding.
  Removed the universal margin/padding reset (kept `box-sizing`) so `p-*`/`px-*` work again, and
  gave the admin shell a padded, max-width container (`apps/web/app/admin/layout.tsx`).
- **BullMQ queue names contained `:`** (`scrape:execute`, …), which BullMQ rejects — this broke
  the new scrape trigger *and* the existing approve→publish flow. Renamed all queues to hyphens
  consistently across producers and consumers (worker + web routes).
- **`Decimal` import** broke after the Prisma 6.19.3 client regen (now `Prisma.Decimal`); aliased
  in `apps/worker/src/workers/scrape-execute.ts`.

### Added
- **Categories management.** New `categories` API (list/create) and an inline "+ New" category
  quick-add in the Test editor; the free-text "Category ID" became a dropdown.
- **Test editor fields & sorting.** Added Quest/LabCorp code, "How it's performed", display order;
  removed the confusing read-only Biomarkers block. Tests list has sortable columns (default A–Z).
- **Vendor management.** "Add Vendor" page; vendor list sorting; soft-delete unchanged.
- **Vendor Trust Level mechanism.** Auto-computed from scraper health (run success rate, freshness,
  reject rate) with an optional **manual override** (`Vendor.trustOverride`). Effective trust =
  override ?? computed. LOW trust forces manual review; HIGH auto-approves a wider band. Wired into
  the worker's auto-approval (`apps/worker/src/workers/scrape-execute.ts`,
  `packages/database/src/vendor-trust.ts`).
- **Per-vendor scraper configuration in the admin** (`ScrapeVendorConfig`): engine, base URL,
  selectors, schedule, timeout, retries. The worker now loads this instead of a hardcoded `.price`.
- **Vendor Catalog** (replaces the confusing flat Offerings list): link/unlink tests to a vendor
  with a product URL + price per test. Offerings became a filterable, read-only overview.
- **Settings** rebuilt from a raw JSON key/value editor into grouped, labeled controls (Scraping,
  Auto-approval thresholds, Feature flags). The worker reads auto-approval thresholds from settings.
- **Change Queue** workflow explainer + a per-vendor **"Scrape now"** trigger that enqueues a price
  check per linked test (requires the worker running).

### Database
- `Vendor.trustOverride` (nullable) added via `prisma db push`.

---

## [2026-06-29] — Admin styling consistency

- Introduced an admin design-system in `globals.css` (`.admin-btn`, `.admin-card`, `.admin-input`,
  `.admin-h1/2`, trust badges) using the main site's exact tokens, so the admin matches the public
  site: indigo-gradient buttons (10px radius, 600 weight), 14px cards, refined inputs, DM Sans.
- Applied across every admin page (dashboard, tests, vendors, offerings, changes, users, settings).

---

## [2026-06-29] — Public site fixes

### Fixed
- **Homepage search showed no autocomplete.** The API returns `{ data }` but `SearchBar` read
  `data.results`; and the autocomplete service returned empty codes/price. Fixed the key and made
  the service return real Quest/LabCorp codes + minimum price
  (`apps/web/app/components/SearchBar.tsx`, `apps/web/lib/services/search-service.ts`).
- **Results (test detail) page didn't match the prototype.** Converted `TestDetailClient.tsx` from
  unreliable Tailwind arbitrary-value classes to inline styles, and fixed the best-price highlight
  from gold to **green** (the prototype default). Also converted the loading skeleton.
- **Test detail accordion** showed only "About" + a stray "Included Biomarkers". Restored the
  prototype's four sections (About / How It's Performed / How To Prepare / Normal Ranges), removed
  the biomarkers section, and seeded the missing `procedure`/`preparation`/`normalRange` content for
  all 12 tests (`packages/database/prisma/seed.ts`).
