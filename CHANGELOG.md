# Changelog

All notable changes to LabTestCompare are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are `YYYY-MM-DD`.

See also `SKILLS.md` (features + workflows) and `.claude/CLAUDE.md` (conventions/gotchas).

---

## [Unreleased]

### Fixed
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
