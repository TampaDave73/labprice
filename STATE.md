# LabTestCompare — Working State

> Point-in-time snapshot for resuming work. Living source-of-truth docs remain
> `.claude/CLAUDE.md` (conventions/gotchas), `SKILLS.md` (features/workflows), `CHANGELOG.md` (history).
> Last updated: 2026-07-05. Branch: `claude/github-write-access-3v9dld` — clean, all work committed
> AND pushed (latest `0b65f35`, before it `a802687`).
>
> **New chat? Start here:** read this file, then `.claude/CLAUDE.md` + `SKILLS.md`. Most recent work
> (2026-07-05, two commits) is a **site/admin feature round**: admin user management, an admin
> Analytics dashboard, footer suggestion forms with admin email alerts, the full color-scheme
> lightening (dark blue/purple → light blue), an `/order-services` vendor directory, and
> About/Terms/Privacy/Disclaimer compliance pages. See the "Feature round" section at the end of
> ✅ Done, and especially **"✅ Verified / ⏳ not yet"** at the bottom — a few UI interactions still
> need a human click-through because the preview browser tab stayed backgrounded all session.
>
> Prior milestone (2026-07-03/04): the 11-vendor new-scraper research queue completed (#1 Ulta
> deferred on an AWS WAF CAPTCHA; #2–#11 built, unit-tested, live-verified), then Marek
> Diagnostics/Jason Health/DrSays added and Function Health intentionally skipped — 17 vendors live.

---

## ✅ Done

### First live scraper — GoodLabs (catalog discovery)
- New **catalog-scrape strategy** for vendors that publish a whole catalog instead of per-test URLs.
  All plain HTTP (no browser, no CSS selectors): catalog page JSON-LD `ItemList` → each `/tests/<slug>`
  page's Next.js flight data → one entry per fulfilling lab (quest/labcorp/bioreference) with
  `labTestIDs` (code), `price`, and an explicit `isPanel` flag.
- **Matching** (`packages/scrapers/src/catalog/matcher.ts`): Quest code → LabCorp code → name (first
  tier wins). Panels (`isPanel`) excluded. >1 surviving price ⇒ **ambiguous → Change Queue** (never
  guessed). Verified live: Ferritin/CMP/CBC/HbA1c/Vitamin D by Quest code, Lipid by LabCorp code,
  Testosterone flagged ambiguous, TSH/PSA unmatched (panel-only).
- **Persistence** now lives in `@labprice/scrapers` (`catalog/persist.ts` → `runVendorDiscovery` +
  `publishStagedChange`) so BOTH the web app (inline) and the worker use one code path.
- 39 unit tests over real HTML fixtures (`packages/scrapers/src/__tests__/`). Standalone runners:
  `apps/worker/scripts/{run-goodlabs-live,discover-goodlabs,fix-goodlabs-vendor}.ts`.

### Infra / admin / public fixes
- **Worker Redis reconnect storm fixed** — each BullMQ Worker gets a dedicated connection
  (`redisConnection` options, localhost→127.0.0.1). `pnpm dev:worker` runs clean (0 ECONNABORTED).
- **Admin catalog-mode toggle** in Scraper Configuration (persists `selectors.mode='catalog'`).
- **Scrape now / Add test run discovery INLINE in the web app** (no Redis/worker), name-narrowed
  (~2s). Scrape now returns a summary; add-test prices the new offering immediately.
- **Change Queue**: Approve/Reject publish inline in a DB transaction (worker-independent); vendor
  name links to the exact product page to verify the price.
- **Order link** (`/api/v1/go/[offeringId]`): lands on the product page (`externalUrl`) with affiliate
  tracking layered on (`apps/web/lib/affiliate-url.ts` — `{url}` placeholder / query-string / redirector).
- **Discovery stores the matched product URL** on the offering (`externalUrl`).
- Public **breadcrumb category is a link**; admin **catalog price shows `$` + 2 decimals**.
- **Vendors trimmed to Good Labs only** — all other seed vendors + their offerings soft-deleted.

### Second scraper — Own Your Labs (DONE)
- `ownyourlabs.com` (Phoenix/LiveView). Adapter `ownyourlabs`: `/shop` cards → `/test/<UUID>` pages;
  each product page has a single lab **Order Code** (Quest or LabCorp) matched against both our codes
  (`codeMatchAnyProvider`). Catalog scraper refactored to **adapter-based** so this reused the matcher
  + persistence; only the parser is new. 11 new unit tests (50 total). Verified live: 9/9 seed tests
  matched (~12s) with exact product URLs.

### Third scraper — Dirt Cheap Labs (DONE)
- `dirtcheaplabs.com`, an **API vendor**: catalog from `api.dirtcheaplabs.com/api/catalog/alacarte?lab=`.
  Added API-adapter support (`CatalogAdapter.fetchAll`) + `mergeCodeTiers` (cheaper of the two labs).
  Also hardened the matcher: a code hit must share a *distinctive* name token (`sharesStrongToken`),
  fixing wrong/stale-code hits (seed TSH quest 867 → "T4 Total") and generic-word collisions.
  Verified live: 7 matched (CBC $2.88, CMP $3.78, Ferritin $5.99, TSH $6.50, VitD $10.35, …), 4
  legit-ambiguous (Cortisol/Testosterone/Lipid/B12 variants), 1 unmatched (PSA). 57 unit tests total.

### Fourth scraper — MitoHealth + member pricing (DONE)
- `mitohealth.com` ($9/mo membership). Its /shop catalog is an à-la-carte set loaded from a tRPC API
  (`marketplace.catalog.search`, paginated) with per-provider member + non-member prices; no lab codes
  → name-matched. New `mitohealth` API adapter. **Member-price model built**: `Offering.memberPrice` +
  `Vendor.membershipNote` (schema change, pushed); we rank on the non-member price and show the member
  price inline on the test page ("$5.85 for members ($9/mo membership)"), not a tooltip. Verified live:
  600 products, 8 seed tests matched with both prices. 62 unit tests total.

### Add Test auto-fill + inline vendor multiselect (DONE — this session, commits `1f425ab`/`82c208e`/`f9614e3`)
Everything is done from the test editor (`apps/web/app/admin/tests/[id]/page.tsx`):
- **✨ Auto-fill** button next to the name → `POST /api/v1/admin/tests/lookup`
  (`apps/web/app/api/v1/admin/tests/lookup/route.ts`). Populates, for review, **short name, slug,
  categories, description/purpose/procedure/preparation/normalRange, Quest/LabCorp codes**. Fills
  **blank fields only** (categories only when none selected) — never clobbers admin edits.
  - **Codes = catalogs first, AI fallback.** `packages/scrapers/src/catalog/code-lookup.ts` matches
    the name against the **Dirt Cheap Labs** catalog and trusts codes ONLY on a **same-significant-name**
    match (`nameTokens` equal; qualifiers like serum/panel are stopwords so "Ferritin, Serum" still
    matches "Ferritin"). This deliberately rejects combos/panels ("Testosterone, Free and Total",
    "Vitamin B12 and Folate", "Iron, TIBC and Ferritin Panel") whose codes belong to a *different* test.
  - **Content + gaps = Claude** (`apps/web/lib/ai/test-lookup.ts`, `claude-opus-4-8`, adaptive thinking,
    structured outputs). Writes short name + the 5 content fields, picks best-fitting **existing**
    categories (never invents), and supplies the standard order code when it knows it. AI-supplied codes
    are flagged **"verify against the lab before saving"** in the returned `notes`.
  - **Slug** derived deterministically from the name (in the route).
  - Degrades gracefully with no key: returns catalog codes + slug only, with a note.
  - Live-verified with a real key: Ferritin Q457/LC004598, HbA1c Q496/LC001453, Folate Q466/LC002014,
    Testosterone Total Q873/LC004226 (AI — catalog correctly rejected the combo), CBC Q6399/LC005009.
- **Vendors checklist** on the editor (existing tests only) → `GET/POST/DELETE
  /api/v1/admin/tests/[id]/vendors`. Attach/detach offerings from the test side; attaching a
  catalog-mode vendor runs discovery **inline** so the price appears immediately (mirrors the
  vendor-side offerings route). New tests show "Save first, then attach vendors."
- New dep: **`@anthropic-ai/sdk`** in `apps/web`. Requires **`ANTHROPIC_API_KEY` in root `.env`**
  (see gotchas — dev loads env via `dotenv -e ../../.env`, so **restart `pnpm dev` after adding it**).

### Fifth scraper — Walk-In Lab (DONE)
- `walkinlab.com`, a custom server-rendered store (plain HTTP, no bot wall) with a **paginated**
  catalog: `/categories/view/all-products?page=N` across 40+ pages (~1,238 products). Added generic
  pagination to the shared crawler (`CatalogAdapter.nextCatalogPage`, optional — single-page adapters
  unaffected); `fetchCatalogEntries` now follows it with a 100-page safety cap.
- New `walkinlab` adapter (`catalog/walkinlab-parser.ts`). A product page exposes **both** lab order
  codes together ("Test Code(s): 001453, 496" — LabCorp + Quest), so it matches like Own Your Labs
  (`codeMatchAnyProvider`) rather than needing to know which code is which.
- **Panel detection**: no explicit bundle flag like GoodLabs, but the page's own "CPT Code(s)" field
  reads a real code for a single test (e.g. "83036") and literally **"See Individual Tests"** for a
  multi-test bundle (verified live on the CBC+CMP-14 combo) — a reliable vendor-supplied `isPanel`
  signal. Bundles also get their own distinct test code(s), never reusing a constituent's own code, so
  they're doubly unlikely to false-positive match a single test even without the CPT-text check.
- 12 new unit tests over real fixtures (86 total). Verified live end-to-end (real DB): 9/11 seed tests
  matched + auto-published, 1 correctly flagged **ambiguous** (PSA — 3 distinct price tiers), 1
  **unmatched** (HbA1c — our test name "HbA1c (Hemoglobin A1c)" tokenizes to `hba1c` as one token while
  the vendor writes "Hemoglobin (Hb) A1c" as three separate tokens, so the narrowing pre-filter never
  selected its product page for a code-check; confirmed via unit test that the adapter parses it
  correctly once fetched — a known, documented narrowing tradeoff, not an adapter bug). Confirmed
  visible in the admin Vendors list (screenshot taken).
- Added `apps/worker/scripts/dev-admin-session.ts`: prints a ready `authjs.session-token` for the seed
  admin — no login provider is configured locally, so this is now the fast path for verifying any
  admin-gated page in the preview browser (used to confirm this vendor showed up in the UI).
- Ulta Lab Tests (originally #1 in the queue below) was attempted first and **deferred**: it sits
  behind AWS WAF Bot Control, which escalates a plain fetch AND a stealth-patched headless Playwright
  browser to an actual image CAPTCHA (`captcha.awswaf.com`) — needs a paid solving service + proxies to
  pursue, a real cost/ToS-risk decision, not a quick adapter fix. User chose to skip and revisit later.

### Sixth scraper — Personalabs (DONE)
- `personalabs.com`, a WooCommerce store: `/products/all-test/` (27+ paginated pages via the same
  `nextCatalogPage` mechanism as Walk-In Lab) → `/product/<slug>/` detail pages.
- New `personalabs` adapter (`catalog/personalabs-parser.ts`). Unlike Walk-In Lab, each product is
  labelled with its ONE fulfilling lab directly in the markup (`provider-cart-button labcorp`), so this
  uses **strict per-lab tiers** (no `codeMatchAnyProvider`) — the labProvider is read straight off the
  page instead of guessed.
- **Panel detection**: a single test's order code lives in exactly one hidden `.hidden_test_code` div;
  a bundle (e.g. "Healthy Male Checkup") carries one such div **per constituent test** (verified live:
  2 divs → 2 codes). `isPanel = codes.length > 1` — a code-count heuristic rather than GoodLabs'
  explicit flag or Walk-In Lab's "See Individual Tests" text, but the same underlying idea: let the
  vendor's own markup tell us, don't guess from the name.
- Refactored `persist.ts`'s `buildConfig` from a growing if/else-per-vendor ternary chain into an
  `ADAPTER_DEFAULTS` lookup map (baseUrl/catalogPath/matchOptions per adapter name) — the ternary chain
  was becoming unreadable at 6 vendors; every existing vendor's behavior is unchanged.
- 14 new unit tests over real fixtures (88 total). Verified live end-to-end (real DB): 6/11 seed tests
  matched + auto-published, 4 correctly flagged **ambiguous** (Testosterone/TSH/PSA/B12 — each has
  multiple real Personalabs product variants at different prices), 1 **unmatched** (CBC — same
  narrowing-tokenization tradeoff as Walk-In Lab's HbA1c: our test name "CBC (Complete Blood Count)"
  vs. the vendor's "CBC with Differential and Platelet Count Blood Test" don't token-subset-match, so
  the candidate page was never fetched; confirmed via unit test the parser reads it correctly once
  fetched). Confirmed visible in the admin Vendors list.

### Seventh scraper — HealthLabs.com (DONE)
- `healthlabs.com` has **no dedicated catalog page at all** — tests live at flat root-level slugs
  (`/almond-allergy-testing`) mixed in with blog/account/content pages, with no nav link to an "all
  tests" listing. Used the site's own **`sitemap.xml`** as the catalog instead: one flat fetch (no
  pagination needed — simpler than Walk-In Lab/Personalabs), ~730 URLs. Non-test URLs become harmless
  catalog-entry noise; `parseProduct` returns `null` for anything without a valid JSON-LD `Product`
  block, so they're silently skipped (verified live: the crawler hit one such noise page mid-narrowing
  and logged "no product data" instead of erroring).
- New `healthlabs` adapter (`catalog/healthlabs-parser.ts`). Each product page embeds a clean,
  directly-`JSON.parse`-able JSON-LD `Product` block with `testCode` values (unlabelled per-lab, like
  Walk-In Lab → `codeMatchAnyProvider`).
- **Panel detection: NO isPanel heuristic — `isPanel` is always `false` for this vendor.** Originally
  shipped as `codes.length > 12` (headroom over Almond=3, Ferritin=6), but the user hit a real bug: they
  manually pinned product URLs for CBC/CMP/Estradiol/HbA1c (the 4 originally-unmatched seed tests) and
  re-scraped, and CBC + CMP still came back with no price. Root cause: CBC and the Comprehensive
  Metabolic Panel are genuine **single tests** that HealthLabs sources from far more than 3 labs, so
  each carries **17 testCodes** — comfortably over the "safe" 12 cutoff, so they got mis-flagged as
  panels, and `priceFromPinnedUrl`'s `!isPanel` filter zeroed their price. `category` field and "Panel"
  in the name were already ruled out earlier (Ferritin lacks `category` too; CMP/Lipid Panel are
  legitimately single tests despite the name). With every tried signal disproved, removed isPanel
  detection entirely rather than keep guessing at a threshold — a false "is a panel" silently breaks
  pricing (worse), while `isPanel:false` always just means a genuine bundle can survive as a code-tier
  candidate, caught by the matcher's existing ambiguity guard (>1 distinct price) instead of silently
  mismatching. Added a regression fixture/test using the real CBC page (17 codes, must stay unpanelled).
- 11 new unit tests over real fixtures (99 total, one added for the regression). Verified live
  end-to-end (real DB), **fast** (~20s, no pagination): after the fix, **11/11 seed tests price
  successfully** — 9 matched + published, 2 correctly flagged **ambiguous** (PSA, B12 — multiple real
  product variants), **0 unmatched** (the pinned-URL retry now resolves all 4 that narrowing missed).
  Confirmed visible in the admin Vendors list.

### Pinned-URL fix — was shared code, not a HealthLabs-only bug (affected ALL catalog vendors)
- User reported a second HealthLabs.com issue: Cortisol had matched the **correct** URL but still
  showed no price. Root cause was NOT vendor-specific this time — `packages/scrapers/src/catalog/
  persist.ts`'s manual-URL-override only retried a pinned `externalUrl` when the automatic match status
  was `'unmatched'`. Cortisol was `'ambiguous'` (two HealthLabs products both name-match "Cortisol" at
  $109 vs $129) — ambiguous already auto-pins the *cheapest* candidate's URL for the admin to verify,
  but the pinned-URL retry never even looked at it, so it stayed stuck in the Change Queue forever even
  after the admin confirmed the page was right.
- **Fix**: `persist.ts` now retries the pinned URL for `'unmatched'` **or** `'ambiguous'` results — a
  pinned URL is the admin resolving an ambiguity by hand, so it should always win. One-line condition
  change in shared code, no adapter changes needed.
- **This was never HealthLabs-specific** — verified it also silently fixed pre-existing ambiguous+pinned
  cases on **Walk-In Lab** (PSA: was ambiguous → now $49) and **Personalabs** (Testosterone $92, TSH $78,
  PSA $87, Vitamin B12 $81: all four were ambiguous → now resolved). Re-ran all 3 already-built vendors'
  E2E discovery scripts after the fix to confirm no regressions and pick up these improvements.

### Eighth scraper — Private MD Labs (DONE)
- `privatemdlabs.com`: single catalog entry point `/tests?view=all`, but it's a **huge** catalog (site's
  own JSON-LD says "over 100 blood tests"; actual count is **3,545** very granular products) paginated
  via same-URL AJAX (`&page=N`) that only returns JSON instead of a full HTML page when the request
  carries `X-Requested-With: XMLHttpRequest` — still plain HTTP, no browser, just one header. Added
  generic header support (`CatalogScrapeConfig.extraHeaders`, threaded through `httpFetchHtml`) since
  this is the first vendor needing anything beyond a default UA.
- **No lab order codes anywhere on this vendor's site** (checked live: no sku/identifier/mpn in the
  product JSON-LD, no populated data-labcorp-id/data-quest-id on the listing — the attribute exists in
  their markup but is always an unfilled JS template string). Matching is **name-only**, like MitoHealth.
- **No isPanel heuristic** either (same reasoning as HealthLabs — no reliable signal found).
- 13 new unit tests over real fixtures (112 total). Verified live end-to-end (real DB): full catalog
  crawl is ~70 pages/~125-150s (large-catalog tradeoff, same category as Walk-In Lab's 41 pages — slower
  "Scrape now" but still fine for interactive use). 11/11 seed tests price successfully after two runs
  (4 matched clean, 7 ambiguous → all 7 resolved via the pinned-URL fix above, since this vendor's huge
  granular catalog produces genuinely ambiguous name variants far more often than any other vendor so
  far — e.g. 13 distinct "Lipid Panel"-ish products at different prices).

### Ninth scraper — Request A Test (DONE)
- `requestatest.com` Cloudflare-JS-challenges **every path except the homepage** ("Just a moment..."
  interstitial). A stealth-patched headless Chromium clears it fine (unlike Ulta's AWS WAF, which
  escalates to an actual CAPTCHA) — so this vendor needed a real browser fetch, the first one to.
- Added `packages/scrapers/src/catalog/browser-fetch.ts` (`browserFetchHtml`) — deliberately its OWN
  module, never imported by `persist.ts` (which must stay Playwright-free to be safe to deep-import into
  Next.js). Callers opt in per-vendor by passing it as `runVendorDiscovery({..., fetchHtml:
  browserFetchHtml()})` — the standalone worker script does this explicitly.
  **Known gap**: inline "Scrape now" in the web admin defaults to plain HTTP and will fail for this
  vendor until that route is taught to pick the engine per vendor — not done this session, flagged as a
  follow-up (see Next).
- Otherwise a GoodLabs-shaped vendor once rendered: each product page has up to two lab panels
  (`panel LabLC` / `panel LabQD`), each with its own price + labelled `Test Code:`; a lab with no test
  gets a `noTest` class and no price (e.g. drug panels are LabCorp-only) — simply produces no offering
  for that lab, no special-casing needed. Codes aren't universal even within LabCorp/Quest (drug panels
  have a price but no code at all) — offerings degrade to no-codes rather than being dropped.
- 8 new unit tests over real fixtures (120 total). Verified live end-to-end (real DB): single-page
  catalog (~829 products, no pagination), ~100s per run (dominated by browser rendering, not narrowing).
  10/11 seed tests price successfully across two runs (9 matched, 1 ambiguous → resolved via the
  pinned-URL fix, 1 unmatched — CBC, the same narrowing-tokenization tradeoff seen on every vendor).

### Tenth scraper — DirectLabs (DONE)
- `directlabs.com` marketing site is WordPress and irrelevant; the real store is an Angular SPA on
  `store.directlabs.com` (`<app-root>`) — needs JS to render, BUT its underlying JSON API is plain,
  ungated HTTP (checked live: `GET store.directlabs.com/api/LabTests/GetTestsByCategoryID?categoryID=…`
  works with a bare `curl`, no browser needed despite the SPA shell).
- **No "list everything" endpoint** — `categoryID=0` alone returns only ~6 "test of the month" specials,
  not the full catalog. Fetches all 46 active categories (from `GetCategoriesActiveByLocale`, hardcoded
  in `directlabs-parser.ts` since they change rarely) and merges by `PK_TestID` — an API-vendor
  (`fetchAll`) adapter like Dirt Cheap Labs/MitoHealth, not page-based.
- **No lab order code anywhere in the API** (checked live across 5 categories) — name-only matching,
  like MitoHealth/Private MD Labs. No isPanel heuristic either (same reasoning).
- 7 new unit tests over real fixtures (127 total). Verified live end-to-end (real DB), **fast** (~11s,
  pure API calls, no pagination/browser): 8/11 seed tests price successfully across two runs (2 clean
  matches, 6 resolved via the pinned-URL fix — this vendor's catalog is as granular as Private MD Labs',
  producing genuine ambiguity — 3 unmatched: CBC/Estradiol/HbA1c, real wording mismatches with no code
  fallback to rescue them, same accepted tradeoff class as every other vendor).
- **Bug found + fixed (user-reported 2026-07-04)**: every stored DirectLabs `externalUrl` 404'd. Cause:
  `fetchDirectLabsCatalog` built product URLs with `cfg.baseUrl` (the vendor's `websiteUrl`,
  `directlabs.com` — the WordPress marketing site) instead of `apiBase`/`store.directlabs.com` (the
  Angular SPA store where `/testinfo/<id>` actually resolves). Fixed to always build product URLs on
  the store subdomain regardless of what `baseUrl` is configured to; added a regression test
  (`fetchDirectLabsCatalog` end-to-end, not just `mergeDirectLabsCatalog` directly, since the old test
  never exercised the buggy wiring). Re-ran discovery: all URLs corrected, and CBC — previously
  unmatched by name (vendor calls it "CBC (includes Differential And Platelets)", PK_TestID 5015, $32)
  — is now pinned to `https://store.directlabs.com/testinfo/5015` and prices correctly via the
  pinned-URL fallback. Estradiol and HbA1c remain genuinely unmatched (same wording-mismatch class, no
  code fallback for this vendor) — an admin can pin those the same way if the real product page is
  found manually.

### Eleventh scraper — Discounted Labs (DONE)
- `discountedlabs.com` is Magento (native `price-box price-final_price` markup, `catalogsearch` URLs).
  `/choose-a-test` is a single-page catalog (~100 product cards rendered server-side as Alpine.js
  "search result" cards — no pagination found live). Same "$1 today, pay balance after results" model as
  Private MD Labs — compares on the full balance price, not the $1 teaser.
- **Lab codes are opportunistic, not a structured field**: some product pages happen to link out to
  `labcorp.com/tests/<code>/...` as "verify this test" editorial content (a real, trustworthy code when
  present), most don't — no Quest equivalent found at all. `labProvider` is only claimed as `'labcorp'`
  when that link is actually found; otherwise it's honestly `'unknown'` rather than assuming a lab we
  don't know (a Change Queue reviewer would otherwise see a wrong lab attribution on a codeless match).
- 8 new unit tests over real fixtures (135 total). Verified live end-to-end (real DB), fast (~7-11s, no
  pagination): 6/11 seed tests price successfully across two runs (3 clean matches — one via the
  opportunistic LabCorp code, two by name — 3 resolved via the pinned-URL fix, 5 unmatched — real
  wording/token mismatches on this vendor's more compact ~100-item catalog, lower auto-match rate than
  most other vendors but the same underlying tradeoff, not a new bug).
- **Bug found + fixed (proactive, during a full admin-panel visual sweep 2026-07-04)**: live discovery
  suddenly returned "catalog: 0 products" — the site re-themed since this adapter was built. The old
  `dl_search_result_title_clicked` tracking attribute the catalog regex keyed off of is gone from
  `/choose-a-test`; cards are now plain `<li class="choose-test-item">` → `<strong
  class="choose-item-name"><a>` list items. Rewrote `CARD_RE` to scope to that wrapper (also filters out
  ~50 non-product collection links like "Diabetes Tests" now sharing the page), refreshed the stale
  `discountedlabs-catalog.html` fixture from a live capture, re-verified live: 100 products parsed (was
  0), 7/11 seed tests price successfully. A reminder that catalog-mode adapters have no compile-time
  guard against a vendor's markup drifting — periodic live re-verification (not just unit tests against
  frozen fixtures) is what actually catches this class of regression.
- **Bug found + fixed (user-reported 2026-07-04): "Save Scraper Config" silently wiped the `adapter`
  field for every catalog vendor added after the original 4.** Reported as "added the URL for CBC, hit
  Save Scraper Config, then Scrape now — no prices came in," reproduced exactly via the admin UI (not
  just the DB): after clicking Save Scraper Config, **all 11** Discounted Labs offerings went
  unmatched, not just CBC — `POST /scrape` logged `catalog: 0 products` in ~2.6s (too fast for a real
  ~100-product crawl). Root cause: `apps/web/app/api/v1/admin/vendors/[id]/scrape-config/route.ts` had
  its own hand-kept `const ADAPTERS = ['goodlabs', 'ownyourlabs', 'dirtcheaplabs', 'mitohealth']`
  whitelist (from when those were the only 4 vendors) and dropped `body.adapter` from the saved
  `selectors` JSON if it wasn't in that list — silently true for all 10 vendors added this session.
  With no `adapter` in `selectors`, `catalog-scraper.ts`'s `cfg.adapter ?? goodlabsAdapter` fallback
  quietly parsed the vendor's HTML with the **GoodLabs** parser instead, which of course matches
  nothing. The admin vendor-editor's "Catalog source (adapter)" `<select>` (`admin/vendors/[id]/page.tsx`)
  had the same stale 4-option list, so there was no way to even see/reselect the real adapter once lost.
  Fixed both: the route now validates against `ADAPTERS` imported from
  `@labprice/scrapers/src/catalog/adapters.ts` (the actual registry `getAdapter()` uses) instead of a
  hand-kept copy, so a future new adapter can't have this happen again; the dropdown lists all 14.
  Checked every vendor's stored `selectors` — only Discounted Labs had actually been clicked-and-broken
  live; restored its `adapter` field and re-verified end-to-end through the real UI (Save Scraper Config
  → Scrape now): CBC now resolves to $35 via the pinned-URL fallback, matching the DirectLabs fix
  earlier in this session.

### Twelfth scraper — True Health Labs (DONE — site recovered, retried successfully same session)
- `truehealthlabs.com` is WooCommerce with a **dedicated product-only sitemap**
  (`product-sitemap.xml`, ~1,736 products, single flat fetch, no pagination — cleaner than HealthLabs'
  mixed sitemap since this one has zero non-product noise).
- **Best code exposure of any vendor so far**: the WooCommerce SKU literally encodes `<Lab>_<code>`
  (e.g. `Quest_457` for Ferritin, `Quest_6399` for CBC — both verified against our own known-good
  codes), sometimes with a trailing internal variant segment we ignore (`Quest_17306_303`). Name + price
  come from the page's GTM/analytics `dataLayer` JSON (more reliable than scraping the WooCommerce
  sale/regular price markup). Strict per-lab tiers, no isPanel heuristic (same reasoning as others).
- The site went unresponsive partway through this session (`product-sitemap.xml` → Cloudflare 524 after
  125s, then the homepage itself started timing out — a real, current vendor-side outage, not a scraper
  bug). Bumped the shared `httpFetchHtml` default timeout 20s→45s while investigating (harmless
  elsewhere, doesn't fix a 125s+ origin stall but is a reasonable general safety margin). **The site
  recovered later in the same session** — re-ran discovery successfully.
- **Bug found + fixed on that live re-run**: an out-of-stock "Kelly Brogan's Super Panel" bundle product
  reported a literal `price: 0` in its GTM dataLayer, which then legitimately NAME-matched our "Vitamin
  B12" test (the bundle's giant concatenated name lists "Vitamin B12" among ~10 other tests) and would
  have shown as a $0 "match" — `persist.ts`'s matched-branch isn't built to expect a null/zero price on
  a 'matched' result. Fixed at the adapter level: `parseTrueHealthLabsProduct` now returns `null`
  (excludes the product entirely) when the dataLayer price isn't `> 0`, since a real self-pay lab test
  is never actually free. Added a regression test.
- 10 new unit tests over real fixtures (164 total). Verified live end-to-end (real DB) after the site
  recovered: **9/11 seed tests price successfully, 9 auto-published**, 1 correctly flagged ambiguous
  (Lipid Panel, 5 real candidates), 1 unmatched (Vitamin B12 — the bogus bundle is now correctly
  excluded and nothing else name-matches, a safe "nothing to show" rather than a wrong price).

### Current live DB state
- **14 vendors, all price-verified live**: **Good Labs** (goodlabs), **Own Your Labs** (ownyourlabs),
  **Dirt Cheap Labs** (dirtcheaplabs), **Mito Health** (mitohealth, member pricing), **Walk-In Lab**
  (walkinlab, paginated catalog), **Personalabs** (personalabs, paginated catalog, provider labelled
  per-product), **HealthLabs.com** (healthlabs, sitemap-as-catalog, no isPanel heuristic), **Private MD
  Labs** (privatemdlabs, huge paginated catalog via AJAX header, name-only matching, no isPanel
  heuristic), **Request A Test** (requestatest, needs browserFetchHtml — Cloudflare-gated; inline
  "Scrape now" now queues to the `scrape-discover` worker rather than being script-only, see the "Save
  Scraper Config"/Request A Test fix entry below), **DirectLabs** (directlabs, API vendor across 46
  hardcoded categories, name-only matching, no isPanel heuristic), **Discounted Labs** (discountedlabs,
  Magento, opportunistic LabCorp codes, honest 'unknown' provider label when absent), **True Health
  Labs** (truehealthlabs, sitemap-as-catalog, best code exposure of any vendor, $0-price bundle guard),
  **Quest Health** (questhealth, Quest's own first-party store, code embedded in the URL), **LabCorp
  OnDemand** (labcorpondemand, LabCorp's own first-party store, explicit `data-isbundleproduct` flag —
  best isPanel signal of any vendor). Each independently scrapeable.
- **17 vendors, 35 tests, 595 possible offerings (35×17), 449 priced** after the 2026-07-04/05 "Lab Test
  Transparency Project" expansion (see `CHANGELOG.md`): 21 new tests added from that community
  spreadsheet, all 35 linked to all vendors and discovery re-run for each; then 3 new vendors added from
  the same sheet's vendor list (Marek Diagnostics, Jason Health, DrSays — see the Fifteenth/Sixteenth/
  Seventeenth scraper entries above; Function Health evaluated and skipped, no public pricing data). The
  gap between 449 and 595 is mostly the same accepted name-only-matching tradeoff documented throughout
  this file (an unmatched/ambiguous result isn't automatically a bug — see the per-vendor entries above
  and the pinned-URL override), plus a small number of pending Change Queue entries from the new, more
  granular tests (ApoB, Lp(a), Iron Panel, etc.) that need a human pick between real candidates.

### Thirteenth scraper — Quest Health (DONE)
- `questhealth.com` is Quest Diagnostics' own first-party store (Salesforce Commerce Cloud/Demandware —
  the "dwvar_"/"data-pid" attributes and `.html` URLs are SFCC tells). `sitemap_0.xml` lists the whole
  catalog (~160 products, single flat fetch, no pagination), with the **Quest order code embedded
  directly in the URL**: `/product/hemoglobin-a1c-test/496M.html` → code 496 (also confirmed on the page
  itself via `data-pid="496"`). Every product is Quest-fulfilled by definition (it's Quest's own site) —
  strict tiers, `labProvider` always `'quest'`.
- **Bug found + fixed during build**: the shared pinned-URL retry (`priceFromPinnedUrl` in `persist.ts`)
  derives a "slug" from the LAST path segment of a pinned URL — fine for every other vendor's one-
  segment slugs, but Quest Health's slug is two segments (`name-slug/codeM`), so that generic logic
  handed the adapter just `496M.html`, and naively rebuilding `${baseUrl}/product/${slug}.html` produced
  a double extension (`.../product/496M.html.html`), corrupting `externalUrl` on every pinned-URL
  resolution. Fixed by trusting the product page's own `<link rel="canonical">` URL instead of
  reconstructing one from `slug` — added a regression test simulating the truncated-slug case.
- 10 new unit tests over real fixtures (154 total). Verified live end-to-end (real DB), fast (~16-20s):
  8/11 seed tests price successfully across two runs (6 clean matches, 2 resolved via the pinned-URL
  fix, 3 unmatched — Estradiol/PSA/TSH, the usual narrowing tradeoff). Confirmed the canonical-URL fix
  by re-running a third time and checking `externalUrl` values are clean single-extension URLs.

### Fourteenth scraper — LabCorp OnDemand (DONE — last vendor in the queue)
- `ondemand.labcorp.com` is LabCorp's own first-party store (Adobe Experience Manager —
  `/content/labcorp-ondemand/...` paths). `sitemap.xml` lists the whole catalog (~132 `/lab-tests/<slug>`
  URLs, single flat fetch, no pagination).
- **Best isPanel signal of any vendor this session**: every product page's add-to-cart button carries
  an explicit `data-isbundleproduct` true/false flag (verified live: `false` for Ferritin/CMP — CMP
  stays unflagged despite being a clinical panel, consistent with precedent — `true` for an actual
  build-your-own bundle, "Custom Men's Health Test"). A bundle's SKU is also non-numeric (`LAB022`) vs a
  real test's 6-digit LabCorp code (`004598`) — only numeric SKUs are trusted as order codes. Strict
  LabCorp-only tiers (it's LabCorp's own site).
- 9 new unit tests over real fixtures (163 total). Verified live end-to-end (real DB), fast (~9-25s):
  9/11 seed tests price successfully across two runs (8 clean matches, 1 resolved via the pinned-URL
  fix, 2 unmatched — HbA1c/PSA, the usual narrowing tradeoff).
- **This completes the 11-vendor research queue** (#1 Ulta deferred/CAPTCHA-gated, #2–#11 all built and
  live-verified — including True Health Labs, whose outage recovered before session end).

### Fifteenth scraper — Marek Diagnostics (DONE)
- `marekdiagnostics.com` (the direct-to-consumer lab-ordering arm of Marek Health — `marekhealth.com`
  itself is the telehealth/guided-optimization brand, not the shop) is a plain Shopify store. Its
  `sitemap.xml` is a sitemap-INDEX, not flat — `catalogPath` points straight at the products
  sub-sitemap (`sitemap_products_1.xml?from=<id>&to=<id>`, hardcoded since the id range only shifts as
  the catalog grows). Compact catalog (~126 products) — smaller than most vendors this project.
- **Best code exposure of any vendor**: a real single test's own JSON-LD `Product.mpn` field IS the
  Quest order code directly (verified live: Cystatin C with eGFR's mpn "94588" matches our stored code
  exactly, no parsing needed). **Panel detection**: Shopify represents a product WITH VARIANTS (e.g. a
  Male/Female bundle) as `@type: "ProductGroup"` instead of `"Product"` — a real structural signal, not
  a heuristic; its own `mpn`, when present, is pipe-delimited (one code per constituent test) as a
  second confirming signal.
- **Data bug found and fixed via this vendor, unrelated to the scraper itself**: Marek's own product
  page for Quest code 17180 is clearly "17-OH Progesterone (17-OHP) [LC/MS]" — but our own test record
  for that code (added from the Transparency Project sheet the prior session) was named plain
  "Progesterone", a different clinical test. Cross-confirmed independently via Jason Health's catalog
  (same code → same name) before fixing: renamed our test to "17-Hydroxyprogesterone (17-OHP)"
  (slug `17-hydroxyprogesterone`) rather than leaving a wrong name attached to a real code.
- 9 new unit tests over real fixtures (174 total). Verified live end-to-end (real DB, all 35 tests
  linked): 27/35 matched, 2 ambiguous (Testosterone Total, Iron Panel — genuine multi-candidate
  ambiguity), 6 unmatched.

### Sixteenth scraper — Jason Health (DONE)
- `jasonhealth.com` (Phoenix/Elixir — `?vsn=d` asset fingerprints match Own Your Labs' stack) is an API
  vendor: its search is powered by Algolia, and the public search-only API key + application id are
  embedded directly in the homepage (`window.algolia_settings`) — safe to use client-side by Algolia's
  own design (a rate-limited, referer-restricted "search" key, not an admin key). Queried via the GET
  variant of Algolia's REST API (`extraHeaders` carries the required `Referer: jasonhealth.com` header
  the key 403s without) so it fits the shared `httpFetchHtml`, which only does GET.
- The regular `query` endpoint caps out at 1,000 total results (an Algolia platform limit; `/browse`
  needs a browse-capable key we don't have) even though the full index is ~3,842 items — accepted as a
  coverage gap, not a bug: an empty-query browse in relevance order surfaces the common individual
  tests first (verified live: CBC/CMP/Lipid/TSH/Vitamin D/Estradiol all on page 1). Deep pages return
  `panel_name: null` for a meaningful fraction of hits — skipped, nothing to match on.
- **Best match rate of any vendor this project**: every hit's `url_code` (or
  `ntc_codes_of_single_test_panel`) IS the Quest order code directly. **Panel detection**:
  `ntc_codes_of_single_test_panel` is empty for a bundle (codes live in `ntc_codes_of_multi_test_panel`
  instead) — real, vendor-supplied.
- 7 new unit tests over real fixtures (181 total). Verified live end-to-end (real DB, all 35 tests
  linked): **33/35 matched, 0 ambiguous, 2 unmatched** — every matched code confirmed exact against our
  own stored codes.

### Seventeenth scraper — DrSays (DONE — deliberately small, honest coverage)
- `drsays.com` looked like a Laravel/Vue SPA on the homepage, but individual `/home/test-<slug>/` test
  pages are plain server-rendered WordPress (Yoast SEO + Kadence blocks) — plain HTTP works fine. **No
  reliable way to discover the catalog live**: `sitemap.xml` lists `/home/<slug>` pages WITHOUT the
  `test-` prefix, and live-checking those found most 404 or redirect to a generic search page instead
  of a real product — the site's real, working URL scheme is never listed anywhere in bulk. Unlike
  every other vendor this project, `parseCatalog` returns a **hardcoded list of individually
  hand-verified `test-<slug>` URLs** rather than crawling anything — 5 tests today (TSH, HbA1c,
  Ferritin, Vitamin D, Magnesium), a deliberate, small, real set instead of a crawl that would mostly
  404. Confirmed with the user before building this way.
- Each real product page's own meta description states both the price and the fulfilling lab code in
  plain text: `"Order the TSH online (Labcorp Test No. 004259) for only $8.99."`
- **Deliberately LabCorp-code-ONLY matching, no name fallback**: found live that this vendor's own
  LabCorp code for "Cortisol" (004051) and "Vitamin B12" (001503) do NOT match our stored codes for
  those same-named tests (004341 / 000429 — likely a different specific test variant, e.g. AM Cortisol
  vs. a panel). A name-only fallback would have silently matched the wrong price for a same-name
  coincidence — both tests are excluded from the hardcoded slug list, and `matchPriority: ['labcorp']`
  (no `'name'` tier at all) guards against this class of mistake for any future addition to the list,
  not just these two.
- 11 new unit tests over real fixtures (192 total). Verified live end-to-end (real DB, all 35 tests
  linked): 5/5 of the hardcoded slugs matched (Magnesium needed its LabCorp code added — 001537,
  confirmed live from this vendor's own page, no prior conflicting value).

### Function Health — evaluated, not built (no public pricing data)
Researched as part of the same batch (Marek/Jason/DrSays + Function Health were the 4 vendors matched
from the Transparency Project sheet that we didn't already have). Function Health is **membership-only**
($365/year) — unlike MitoHealth's public storefront (which shows real prices with no login), Function
Health's site exposes **zero** per-test add-on pricing anywhere unauthenticated, confirmed live on
`/pricing` and every other public page (only the $365/year membership fee appears; the FAQ explicitly
says itemized fees are "available upon request"). There is no data source to scrape at all — not a
parsing difficulty like DrSays, a hard absence of public data. Discussed with the user: skip rather than
hand-enter static, unverifiable, immediately-stale numbers from the community spreadsheet — every other
vendor in this system is built on real, refreshable scraped data, and this would break that pattern.

### Feature round — 2026-07-05 (commits `a802687` + `0b65f35`, both pushed)

All five items from the user's multi-part request, plus a follow-up feedback round the same day:

- **Admin user management** (`/admin/users`, `POST`/`DELETE /api/v1/admin/users[/id]`): invite by
  email (re-inviting a soft-deleted user *restores* them instead of duplicating), remove with guards —
  no self-delete, no removing the last SUPER_ADMIN (also guards the PATCH role-downgrade path), and
  removal deletes all Session rows in the same transaction (Auth.js's PrismaAdapter doesn't know our
  `deletedAt` convention, so a lingering session would otherwise keep working). Only SUPER_ADMIN can
  grant ADMIN/SUPER_ADMIN. All verified via direct API calls.
- **Analytics dashboard** (`/admin/analytics` + `GET /api/v1/admin/analytics?days=7|30|90`): top
  searches, **zero-result searches** (the "what test should we add" signal), vendor click-through,
  most-viewed tests, top test→vendor pairs. Two real bugs found + fixed while building it:
  1. The live search bar calls `/api/v1/search/autocomplete`, which had NO `logSearch` call — the
     parallel `/api/v1/search` endpoint had logging but nothing uses it. Searches were never tracked
     until this fix.
  2. **Page views double-counted**: React Strict Mode double-invokes effects in dev, firing
     `PageViewTracker`'s POST twice per view. Fixed with a `useRef` guard keyed by pathname
     (`apps/web/app/components/PageViewTracker.tsx`) — the ref survives the double-invoke.
  `PageViewTracker` is mounted **only on the test detail page** (deliberate — the dashboard's view
  panel is "most-viewed tests"); drop it on other pages with `testId` omitted if broader tracking is
  wanted later.
- **Suggestion forms + email alerts**: new `VendorSuggestion`/`TestSuggestion` models +
  `SuggestionStatus` enum (PENDING/REVIEWED/DISMISSED) — schema already pushed to the local DB.
  Public `POST /api/v1/suggestions/vendor|test` (zod-validated, attaches `userId` if signed in);
  footer UI is **collapsed links that expand into an inline form** (user asked for accordion, not
  always-visible forms); admin review at `/admin/suggestions` (`PATCH .../suggestions/[id]` with a
  `kind` discriminator since the two tables are separate). Submitting also **emails every active
  ADMIN/SUPER_ADMIN** via `lib/services/notify-service.ts` (new `resend` dependency in apps/web) —
  fire-and-forget, no-ops cleanly when `RESEND_API_KEY` is empty (it currently IS empty in `.env`,
  so no email has actually been sent yet). Fixed stale `EMAIL_FROM` in `.env`
  (labprice.com → labtestcompare.com).
- **Color scheme, two passes**: (1) sitewide hue 280 (blue-violet) → 230 (blue) with softened chroma
  — `@theme` tokens in `globals.css` for the admin, plus a scripted rewrite of every public page's
  inline `oklch()` (incl. Tailwind arbitrary `oklch(x_y_280)` underscore forms), new teal `accent-*`
  scale (hue 165), `themeColor` meta `#3b1f8e` → `#0081b6`. (2) After user said it *still* didn't
  read well: the homepage hero was still a dark gradient with purple stops (hue 295/265) the regex
  missed, plus a hardcoded `#a855f7/#d946ef` gradient on "instantly" and the navbar's dark variant.
  Hero/stats-bar/navbar all converted to light theme; **Navbar's `variant` prop is deleted** (all 5
  call sites updated); page canvas lightened to `oklch(0.985 0.005 230)`. Zero hue-280/295/305
  remnants (grep-verified).
- **New public pages**: `/order-services` (every active vendor as an expandable card → full
  test/price table, "Order" via the click-tracked `/api/v1/go/[offeringId]`; server component
  `page.tsx` + client `VendorAccordionList.tsx`), and `/about`, `/terms`, `/privacy`, `/disclaimer`
  sharing new `components/StaticPageLayout.tsx`. Footer got a links row to all of these; navbar got
  an "Order Services" link.
- **Bug fix**: test detail page no longer repeats description/purpose above the "About This Test"
  accordion (`TestDetailClient.tsx`).
- **Hardening pass (same day, follow-up review)**: closed an ADMIN-can-demote-an-ADMIN gap in the users
  PATCH route (DELETE had the guard, PATCH didn't) and made the last-SUPER_ADMIN check transactional
  (Serializable, races → 409); bad input across the new API routes now 400s/404s instead of 500ing
  (unknown roles, malformed JSON, `?days=abc`, `?status=BOGUS`, missing ids); analytics route queries
  parallelized (7-deep sequential chain → 2 batches); `/order-services` no longer nests the "Visit
  site" `<a>` inside the accordion `<button>` (invalid HTML, a11y); suggestion forms accept
  protocol-less URLs (server prepends `https://`); admin analytics/users/suggestions pages got error
  states instead of hanging on failed fetches. All verified live via `preview_eval` fetch with an
  admin session (see CHANGELOG for the full list).

---

## ⏭️ Next

### 0. New scraper vendors — queued, building one at a time (started 2026-07-03)
Web-research pass (order-code marketplaces only — buy online, walk into a Quest/LabCorp/BioReference
draw site, matching our 4 existing vendors' model; at-home kit brands excluded by decision) prioritized
by confirmed public affiliate program. Build order below: each vendor gets an adapter (`@labprice/scrapers`
`catalog/adapters.ts`) + unit tests over real fixtures + a live discovery verification. Originally one
vendor at a time with a confirmation gate between each — **user changed this mid-queue**: proceed
through #3 and #4 without waiting, they'll batch-check the whole queue later. Tracked via
TaskCreate/TaskList this session (task IDs #1–#11, same order as below).

1. ~~**Ulta Lab Tests** (ultalabtests.com)~~ — **DEFERRED**: AWS WAF Bot Control escalates to an image
   CAPTCHA; needs a paid solving service + proxies. Revisit if/when that's worth building.
2. **Walk-In Lab** (walkinlab.com) — Quest+LabCorp, ShareASale affiliate, 45-day cookie. **DONE** (see
   "Fifth scraper" above). Committed `d79ce91`, pushed.
3. **Personalabs** (personalabs.com) — LabCorp-primary, Awin/Commission Junction affiliate 10–15%.
   **DONE** (see "Sixth scraper" above). Committed `85173de`, pushed.
4. **HealthLabs.com** (healthlabs.com) — multi-lab (4,500+ draw sites), CJ/Conversant affiliate 30%.
   **DONE** (see "Seventh scraper" above — isPanel heuristic removed after a real bug the user caught;
   0/11 unmatched now).
5. **Private MD Labs** (privatemdlabs.com) — Quest+LabCorp, in-house "ambassador" affiliate 10%.
   **DONE** (see "Eighth scraper" above). ← **user said to fix the shared bug then run straight through
   #5–#11, terse final report only — no per-vendor confirmation from here on**
6. **Request A Test** (requestatest.com) — Quest+LabCorp, in-house affiliate portal. **DONE** (see
   "Ninth scraper" above — Cloudflare JS challenge, needed `browserFetchHtml`; worker/script-only, not
   wired into inline "Scrape now" yet — see Next).
7. **DirectLabs** (directlabs.com) — Quest+LabCorp+others, in-house affiliate (est. ~2003, oldest DTC
   reseller). **DONE** (see "Tenth scraper" above — API vendor, 46 categories, name-only matching).
8. **Discounted Labs** (discountedlabs.com) — Quest-primary, in-house (Amasty/Magento-family) affiliate.
   **DONE** (see "Eleventh scraper" above — opportunistic LabCorp codes only, name-only fallback).
9. **True Health Labs** (truehealthlabs.com) — Quest+LabCorp+specialty labs, in-house + "LabShop"
   white-label affiliate. **DONE** (see "Twelfth scraper" above — site outage recovered mid-session,
   retried successfully; also found + fixed a $0-priced bundle bug).
10. **Quest Health** (questhealth.com) — Quest only, official first-party store, Impact affiliate
    network. **DONE** (see "Thirteenth scraper" above — found + fixed a shared pinned-URL bug along
    the way, double-`.html` URLs).
11. **LabCorp OnDemand** (ondemand.labcorp.com) — LabCorp only, official first-party store, Impact
    affiliate, 12%. **DONE** (see "Fourteenth scraper" above). **Queue complete.**

Gotcha: the *original research pass* only WebFetch'd Ulta, Request A Test, DirectLabs, and True Health
Labs and got 403s on all four (Ulta's is confirmed AWS WAF CAPTCHA; Request A Test confirmed as a
Cloudflare JS challenge, passable with `browserFetchHtml` — see above; DirectLabs/True Health Labs
weren't re-checked yet). Walk-In Lab was never WebFetch'd in that pass but turned out to load fine with
a plain `curl` + browser UA (no bot wall at all) — so don't assume every remaining vendor needs a
browser; each needs its own quick `curl -A "<browser UA>"` probe first (plain HTTP is cheaper/faster/
more reliable than a browser — only reach for `browserFetchHtml` when a real Cloudflare/WAF challenge is
confirmed, not preemptively).

### 1. Save / Price Alert (public test page) — **ON HOLD**
- These require a **full customer auth flow (sign up / sign in)** — none exists today (only DB-backed
  admin sessions). The buttons are already gated behind `session?.user`, so logged-out visitors don't
  see them; they're effectively dormant for real users.
- **Deferred by decision.** Build public auth (sign up/sign in + account) as its own milestone before
  these features are usable. Until then, leave gated (or hide entirely — TBD). Tackle the Our Own Labs
  scraper first.

### 3. Smaller follow-ups
- **Set `RESEND_API_KEY` in `.env`** to activate the new suggestion-form admin email alerts (they
  silently no-op without it). Also needed for the email magic-link sign-in provider.
- **Seed admin is `admin@labprice.com`** (`packages/database/prisma/seed.ts:208`) — user pointed out
  labprice.com isn't the real domain. Now that user management exists, invite a real admin address
  and retire/replace the seed one (careful: last-SUPER_ADMIN guard requires promoting the new one
  first).
- Footer copyright still says **© 2025** (`components/Footer.tsx`) — bump to 2026 or make dynamic.
- The navbar **"Free Account" button is a non-functional `<div>`** (pre-existing) — wire it to
  `/auth/signin` or hide until the public-auth milestone.
- Clean up benign `@prisma/client` "can't be external" Turbopack warnings before a prod build.
- Wire per-vendor engine selection into the inline "Scrape now" / add-test routes so Request A Test
  (and any future Cloudflare-gated vendor) can use `browserFetchHtml` from the web admin too, not just
  the standalone worker script. Needs care: don't want to import Playwright into every request path,
  only branch to it for vendors flagged `needsBrowser` in `ADAPTER_DEFAULTS`.

---

## 🚧 Active blockers / gotchas
- **`git push` hangs over HTTP/2** on this Windows box — always push with
  `git -c http.version=HTTP/1.1 push`. (Also in auto-memory.) Git Credential Manager can also stall a
  push waiting on an auth popup; pushing in the background and retrying usually clears it.
- **`ANTHROPIC_API_KEY` for auto-fill** lives in root `.env` (gitignored — never commit it). The web
  dev script is `dotenv -e ../../.env -- next dev`, so it reads the key **only at boot** — after adding
  or changing the key you MUST restart `pnpm dev`, or auto-fill reports "No ANTHROPIC_API_KEY
  configured". A key was added this session; **it was pasted in chat, so rotate it** in the Anthropic
  console when convenient.
- **Worker has pre-existing type errors** (ioredis dual-version in `queues.ts`; `publisher.ts` uses
  stale snake_case models). Runs fine via `tsx`; not regressions — don't "fix" unless touching them.
- **Prisma client regen locks on Windows** — stop dev servers before `prisma generate` (EPERM).
  This session it took MORE than stopping the preview servers: several **orphaned `tsx watch` /
  script node processes from prior sessions** still held the query-engine DLL. If EPERM persists,
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and kill the labprice-owned ones
  (user pre-approved that once; ask again).
- **The preview browser tab runs backgrounded (`document.hidden === true`)** in this environment,
  which stalls React effects and click-driven state updates — `preview_screenshot` times out and
  accordion/controlled-form interactions can't be exercised there. Verify APIs with `fetch` via
  `preview_eval` (works fine) and do visual/interaction checks in a real foregrounded browser.
- Save/Price Alert are blocked on the missing customer-auth flow (see Next #2).

## ▶️ How to run / verify
```bash
pnpm docker:dev                                  # Postgres + Redis
pnpm --filter @labprice/database db:push         # sync schema if needed
pnpm dev                                          # web on :3000 (preview tools use .claude/launch.json
                                                  #   instead: "web" → :3100, "worker" → :3001)
# Auto-fill: Admin → Tests → Add Test → type a name → "✨ Auto-fill" (needs ANTHROPIC_API_KEY + restart)
# Vendors on a test: Admin → Tests → open an existing test → Vendors checklist (attach = inline scrape)
# Scrape a catalog vendor: Admin → Vendors → Good Labs → "Scrape now" (inline, no worker needed)
pnpm --filter @labprice/scrapers test            # scraper unit tests
cd apps/web && npx tsc --noEmit                  # web typecheck (must stay clean)
# Walk-In Lab live discovery (needs docker:dev up):
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-walkinlab.ts
# Get an admin session token for the preview browser (no login provider configured locally):
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/dev-admin-session.ts
```

## ✅ Verified / ⏳ not yet (feature round, 2026-07-05)

**Verified** (direct API calls via `preview_eval` fetch + DB queries via temp worker scripts, since
the preview tab was backgrounded — see gotchas):
- User management: create, duplicate-409, invalid-email-400, self-delete-403, delete + session
  revocation, re-invite-restores, last-SUPER_ADMIN guard on both DELETE and PATCH.
- Suggestion endpoints: vendor + test create (200, row lands with `userId` attached), short-name
  validation rejection (400), admin list, admin PATCH → REVIEWED. Test rows were cleaned up after.
- Analytics: pageview POST → `page_views` row with correct `testId` FK; the earlier FK-violation
  failure mode (`P2003` when a bad testId is sent) surfaces only in server logs by design
  (fire-and-forget `.catch`).
- All 4 static pages return 200 with correct `<h1>`; `/order-services` renders 17 vendor cards with
  real counts/prices; footer links + navbar link present in served HTML.
- Web `tsc --noEmit` clean after every change. No server errors in dev logs.

**⏳ Not yet exercised — needs a human click-through in a real (foregrounded) browser:**
- The **footer suggestion accordions** and the **/order-services vendor accordion** expanding on
  click (the click handlers are trivial `useState` toggles, but the backgrounded preview tab
  couldn't run them; the SSR'd HTML is confirmed correct).
- The **double-count fix** observed end-to-end in a real browser (the guard logic is
  straightforward, and the root cause — Strict Mode double-invoke — is well understood; one visit
  to a test page then checking `/admin/analytics` view counts = confirmation). Note: pre-fix
  `page_views` rows (a handful) may still be inflated; harmless at this data volume.
- The **admin email alert** actually sending — blocked on `RESEND_API_KEY` being empty in `.env`
  (code path no-ops cleanly; the DB row + `/admin/suggestions` review flow works regardless).
