# Changelog

All notable changes to LabTestCompare are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are `YYYY-MM-DD`.

See also `SKILLS.md` (features + workflows) and `.claude/CLAUDE.md` (conventions/gotchas).

---

## [Unreleased]

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
