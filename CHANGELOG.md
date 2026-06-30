# Changelog

All notable changes to LabPrice are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are `YYYY-MM-DD`.

---

## [Unreleased]

### Fixed
- **Dev server "Jest worker… exceeding retry limit" crash.** `pnpm dev` ran `turbo dev`, which
  also started the `@labprice/worker` app — and that app was in a Redis crash-loop spewing tens of
  thousands of `ECONNRESET` errors. The resource churn starved Next's compilation workers, which
  then died while generating paths for dynamic admin routes (e.g. `/admin/tests/[id]`). `pnpm dev`
  now runs **web-only** (`turbo dev --filter=@labprice/web`); use `pnpm dev:worker` for the worker
  and `pnpm dev:all` for both. (Known follow-ups, tracked for the scraper work: the worker's Redis
  reconnect storm, and the benign `@prisma/client` "can't be external" Turbopack warnings.)

### Added
- **Categories are now true many-to-many, with full management.** A test belongs to **one or
  many** categories — there is **no "primary/main" category** to choose. The `Test.categoryId`
  column is retained only as an internal, auto-derived **display pointer** (the selected category
  with the lowest `displayOrder`); it's never user-selected, so public pages (breadcrumb, card
  badge, category pages) keep working.
  - **Dedicated Categories admin page** (`apps/web/app/admin/categories/page.tsx`, sidebar nav):
    add, rename, reorder, and delete categories.
  - **Test editor** (`apps/web/app/admin/tests/[id]/page.tsx`): a single "Categories" chip
    multi-select; **at least one category is required** to save (validated client + server).
  - **Delete contingency** (`apps/web/app/api/v1/admin/categories/[id]/route.ts`): deleting a
    category is **blocked (409) if it would orphan any test** (the offending test names are
    returned); otherwise tests whose display pointer was that category are auto-reassigned to
    their next remaining category.
  - Schema: `TestCategory` join model + `Test.categories` / `Category.testCategories` relations.
  - APIs: `tests` POST/PATCH accept `categoryIds[]`, validate ≥1, derive the display pointer, and
    replace the join rows; category counts exclude soft-deleted tests; public category pages list
    tests via the m2m so a test appears under every category it's in.
- **Offerings → vendor quick-link.** Vendor names in the Offerings overview link straight to
  that vendor's edit page (`apps/web/app/admin/offerings/page.tsx` + `vendorId` added to
  `apps/web/app/api/v1/admin/offerings/route.ts`).
- **Add-Vendor workflow clarity.** The Add Vendor page now explains that scraper, trust, and
  catalog are configured after creation, and the button reads "Create & Configure"; on save it
  redirects into the full vendor editor (`apps/web/app/admin/vendors/new/page.tsx`).

### Changed
- **Vendors list is much faster.** Trust was computed per-row (N+1 = ~2 queries × vendor count).
  Now batched into **2 queries total** via `getVendorTrustMap()`
  (`packages/database/src/vendor-trust.ts`, used by `apps/web/app/api/v1/admin/vendors/route.ts`).

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
