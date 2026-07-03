# Changelog

All notable changes to LabTestCompare are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are `YYYY-MM-DD`.

See also `SKILLS.md` (features + workflows) and `.claude/CLAUDE.md` (conventions/gotchas).

---

## [Unreleased]

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
- **Catalog edits save on blur** with a "Catalog saved." confirmation + inline hint, so it's clear the
  URL/price persisted without needing "Save Scraper Config".

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
