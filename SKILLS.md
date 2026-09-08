# LabTestCompare — Skills & Workflows

What the system does (feature catalog) and how to work on it (workflows/recipes).
**Keep this current** — update it whenever a feature or workflow changes (see the discipline note in
`.claude/CLAUDE.md`). Pairs with `CHANGELOG.md` (history) and `.claude/CLAUDE.md` (conventions/gotchas).

---

## Part 1 — Feature catalog (what LabTestCompare does)

### Public site (`apps/web/app`)
- **Homepage** (`page.tsx`)
  - Hero **search** with live **autocomplete** (`components/SearchBar.tsx` → `/api/v1/search/autocomplete`);
    suggestions show test name, Quest/LabCorp codes, and "from $X". Clicking a suggestion deep-links to
    the test; the **Compare** button / plain **Enter** go to the **`/search` results page** (FTS).
  - **Live, data-driven stats**: "Live prices from N ordering services" + stats bar (N Ordering
    Services = active vendors, N Common Tests). `revalidate = 60`.
  - **Popular Tests** cards and an **All Tests** list with A–Z / price sort and a **category filter**
    that respects a test's *full* category set (`components/HomeTestList.tsx`).
- **Test detail** (`test/[slug]`) — price-comparison table across vendors, **best-price** banner
  (green), savings, sortable; accordion (About / How It's Performed / How To Prepare / Normal Ranges);
  a "**Prices last checked N ago**" freshness line (from the freshest offering `lastCheckedAt`,
  falling back to `priceUpdatedAt` — `lastCheckedAt` is stamped on every scrape verification even
  when the price is unchanged; `priceUpdatedAt` only moves on a change);
  JSON-LD `MedicalTest`. Fully public + ISR-cacheable (no `auth()` — Save/Price-Alert were removed).
  **Master-import data states** (2026-07-27, `TestDetailClient.tsx`): a `thirdPartyOnly` test with zero
  offerings shows "Not offered by Quest or LabCorp — this is a specialty/third-party test" instead of an
  empty price table; `cardioIq` shows a "Cardio IQ® branded variant" badge (plus `labVariant` text when
  set); non-`HIGH` `confidence` shows a "Partially verified"/"Unverified" warning badge (`MEDIUM`/`LOW`);
  a non-empty `notes` field renders as a callout — this is also how a region-variable code ("verify
  locally") gets surfaced, via the generic notes field rather than a dedicated schema flag.
- **Category pages** (`category/[slug]`) — lists tests via the many-to-many, so a test appears under
  every category it belongs to.
- **Search results** (`/search?q=…`) — SSR page over the FTS `search()` service (reuses `TestCard`,
  `noindex`); backed by **Search API** (`/api/v1/search`, Postgres full-text with trigram fallback).
- **Navbar auth** — signed-out shows "Sign in" (→ `/auth/signin`, NextAuth Google + Resend);
  signed-in shows name/email + a "Sign out" server action; ADMIN/SUPER_ADMIN also get an "Admin"
  link. Split on purpose: `Navbar.tsx` is a **static** server component and the auth state lives in
  `NavAuth.tsx`, a **client** island that reads `/api/auth/session` after hydration — calling
  `auth()` on the server would read cookies and force every page rendering the Navbar to be dynamic,
  defeating the home page's `revalidate` and the ISR-cacheable test pages. (The navbar no longer has
  an "Order Services" link — reach the provider list from the footer.)
- **List of Lab Providers** (`/order-services`) — every active vendor as an expandable card
  (`VendorAccordionList.tsx`) showing test count, from-price, and a full test→price table on expand,
  ordered via `/api/v1/go/[offeringId]`. Linked from the footer as "List of Lab Providers".
- **About / Terms / Privacy / Disclaimer** (`/about`, `/terms`, `/privacy`, `/disclaimer`) — **editable
  from `/admin/pages`**. Content lives in `system_settings` (`page_<slug>`, `lib/static-pages.ts`),
  falls back to the default copy when unset, and renders via `StaticPageBody` (blank line = paragraph,
  `## ` = heading, `- ` = bullet). Share `components/StaticPageLayout.tsx`.
- **Sign in** (`/auth/signin`) — Resend magic-link + Google. In **dev**, a dashed "Dev sign-in" box
  (and `POST /api/dev-login`) logs you into an existing account by minting a DB session directly —
  gated to `NODE_ENV !== 'production'`. It exists because Resend/Google have no credentials in dev.
- **Footer** (`components/Footer.tsx`, every page) — "Suggest a Vendor" / "Suggest a Test" buttons that
  open a modal form (`components/SuggestionForms.tsx` → shared `components/SuggestionModal.tsx` →
  `/api/v1/suggestions/vendor|test`); submitting emails all admins (`lib/services/notify-service.ts`)
  and the row is reviewed at `/admin/suggestions`. Also links to the pages above.
- **Report an error** (test detail page, under the left accordions) — button opens the shared
  `SuggestionModal` with an optional "which listing?" vendor select →
  `POST /api/v1/reports/result-error` → `ResultErrorReport` row (test/offering ids validated; the
  offering must belong to the test), admin email alert, triaged in the "Result error reports" panel
  at `/admin/suggestions` (`kind: 'report'` on the PATCH).
- **Public read API (v1)** — `/api/v1/tests` (paginated, `category`/`sort`/`cursor`/`limit`),
  `/api/v1/tests/popular`, `/api/v1/tests/[slug]`, `/api/v1/categories`, `/api/v1/trends/[testId]`,
  `/api/v1/search`. Read-only, zod-validated, no UI callers by design — kept as a deliberate API
  surface (e.g. a future mobile client), not dead code.
- **Abuse protection on public writes** (`lib/rate-limit.ts`) — the suggestion/report forms carry a
  hidden `company` **honeypot** (a non-empty value → silent fake-success, no DB write) and a per-IP
  **rate limit** (5–8 / 10 min); `analytics/event` has a 120/min floodgate. `notify-service` caps
  admin alert emails at 100/day (the DB row is still saved). In-memory + per-instance — swap for Redis
  if we scale horizontally. `middleware.ts` also sets a **Content-Security-Policy** (framing/base-uri/
  object/form-action locked down; inline styles+scripts allowed because public pages need them).

### Admin panel (`apps/web/app/admin`, gated to ADMIN/SUPER_ADMIN)
- **Dashboard** — a "Needs attention" row (pending price changes, low-trust vendors, scrape failures
  last 7 days, pending suggestions — each card counts waiting work and deep-links to the filtered
  view: `/admin/changes?status=PENDING`, `/admin/vendors?sort=trust&dir=asc`,
  `/admin/suggestions?status=PENDING`; the Change Queue/Suggestions/Vendors pages read those params
  as initial filter state), then KPI counts + recent audit activity (linking to the full Audit Log).
  Zero counts render green so "all clear" is explicit.
- **Discovered** (`/admin/discovered`) — the review queue over the **VendorProduct ingest layer**
  (see "Ingest layer" under the scrape pipeline). Unmatched, non-panel products clustered across
  vendors (shared Quest/LabCorp code, else distinctive name tokens). Actions per cluster: **Promote
  to test** (creates Test + TestCategory + offerings with observed prices), **Attach to existing**
  (creates offerings), **Ignore** (reversible; Ignored tab restores). Attach/promote/list all
  **learn aliases**: a confirmed product name that differs from the test's known names becomes a
  `TestAlias` (source = vendor slug). "Matched, not listed" tab = auto-matched products with no
  offering yet — `List`/`List all` creates them (matching NEVER auto-publishes an offering). **Panels
  auto-ignore on ingest** (no separate Panels tab — removed 2026-07-25): a product flagged `isPanel`
  lands straight in the Ignored tab instead of Clusters (panels excluded from matching by decision
  2026-07-20 — no two vendors sell the same panel). Ignored rows show whether they're a panel; the
  Restore button is disabled for one (with an explanatory tooltip) since restoring just sets it back
  to UNMATCHED, which the `clusters` query still filters out by `isPanel: false` — the next crawl's
  auto-ignore would silently re-ignore it anyway, so Restore can't actually recover a mis-flagged
  panel today (a real fix needs a product decision on how panels should be reviewable, deferred).
  Cluster cards have a **per-row checkbox** (default all checked) — uncheck a row that doesn't belong
  before Promote/Attach and it's marked Ignored instead of included; opening Promote/Attach prunes any
  stale exclusions from other clusters but keeps the current cluster's in-progress unchecking. Top of
  the page: **demand chips** — zero-result `SearchLog` queries that overlap an unmatched product name.
  `GET/POST /api/v1/admin/discovered` (actions: attach/promote/ignore/restore/list).
- **Discovered Excel round-trip** — `Export Excel` / `Import Excel` on `/admin/discovered`, for the
  quarterly catch-up pass across thousands of rows the one-by-one UI doesn't scale to
  (`GET/POST /api/v1/admin/discovered/export|import`; a real `.xlsx` workbook via `exceljs`, not CSV
  — switched 2026-07-22, see below). Unlike the Tests round-trip, one row is one **vendor product**
  (not a cluster) — a `cluster_id` column groups rows for reading, but decisions are per-row, so a
  reviewer can attach 8 of a cluster's 9 vendors and leave a price-outlier 9th for later, which the
  cluster-level UI buttons can't do. Each row carries a computed `confidence` (high/medium/low — high
  = shares a Quest/LabCorp code with another vendor in the cluster; low = a >2x/<0.5x price outlier
  vs. the cluster median) and `suggested_test_name`/`suggested_test_slug` — the auto-matcher's fuzzy
  (never auto-applied) candidate, the actual signal for attach-vs-promote (filled in → usually attach
  with that slug; blank → usually promote) — so a reviewer can sort/filter instead of eyeballing every
  row. Fill in `decision` (ignore/attach/promote, dropdown-enabled) + the matching columns
  (`attach_test_slug`, or `new_test_name`+`new_test_category`+optional `new_test_slug` — rows
  sharing a `new_test_slug` become one new test with one offering per vendor). `new_test_category`
  accepts a comma-separated list (`"Hormones, Metabolic"`) — same many-to-many categories any test
  can have; `Test.categoryId` ends up the derived display pointer (lowest `displayOrder` among the
  given ones), same rule as the regular admin Test editor. Each name is resolved independently
  (existing matched case-insensitively, unrecognized ones auto-created), so mixing a real category
  with a new one in the same cell is fine. Re-upload; same
  dry-run-diff-then-apply contract as Tests import, transactional + audit-logged
  (`discovered.csv_import`). A row whose product was already matched/ignored elsewhere since export
  is reported under `skipped`, not treated as an error. The mutation logic (attach/promote) is
  shared with the one-by-one UI via `apps/web/lib/discovered-actions.ts`, so both paths do exactly
  the same thing to the database.
  **Why a workbook, not CSV**: three columns/sheets CSV can't do. (1) `quest_code`/`labcorp_code` are
  TEXT-number-formatted (`numFmt: '@'`) so Excel can't mangle a leading-zero code into a number — a
  real correctness bug CSV can't prevent, since Excel auto-detects "numeric-looking" cells on open
  regardless of the source format. (2) `new_test_category` gets a dropdown (Excel data validation)
  sourced from a **Categories** reference sheet — `showErrorMessage: false` so typing a name NOT on
  the list still works (that's the "create a new category" case), just without the click-to-pick
  convenience. (3) A **How it works** sheet replaces what used to be inert instruction ROWS wedged
  into the CSV data — plus every header cell on the Discovered sheet has a real Excel cell note
  (hover tooltip). The import route reads the `Discovered` sheet specifically (ignores the other two)
  via `cellText()` (`apps/web/app/api/v1/admin/discovered/import/route.ts`), which normalizes every
  ExcelJS cell-value shape (string/number/Date/formula-result/rich-text) back to the same
  `Record<string,string>` shape the old CSV parser produced — so everything downstream of parsing
  (validation, grouping, apply) is unchanged by the format switch. Upload is `multipart/form-data`
  (`file` + `apply` fields), not JSON — a real binary file, not text.
- **Coverage** (`/admin/coverage`) — tests × vendors matrix: green price = live offering, amber dot
  = vendor sells it per the ingest layer but no offering exists, blank = not carried.
  `GET /api/v1/admin/coverage`.
- **Tests Excel round-trip** — `Export Excel` / `Import Excel` buttons on /admin/tests
  (`GET /api/v1/admin/tests/export`, `POST /api/v1/admin/tests/import`). Identity fields only
  (id-anchored; name, short_name, slug, codes, categories|pipes, aliases|pipes, is_popular,
  **methodology, lab_variant, cardio_iq, confidence, third_party_only, notes** — added 2026-07-27
  alongside the master import) — **no prices by design** (sheet owns identity, scrapers own prices).
  `code_verified_at` is intentionally NOT a column — it's system-stamped (by the import script, or
  when confidence is later promoted to HIGH) and stays read-only everywhere, including this sheet.
  Import is always previewed
  (dry-run diff → confirm), errors block the whole file, applies are transactional + audit-logged.
  Blank id = create new; categories/aliases are full-set replace; unknown categories get created.
  **Was plain CSV until 2026-07-24** — Excel auto-detects a "numeric-looking" cell on open and
  silently strips a leading zero off a LabCorp code like `004650`; moved to a real `.xlsx` workbook
  (`exceljs`, already a dependency for the Discovered round-trip) with `quest_code`/`labcorp_code`
  TEXT-formatted (`numFmt: '@'`) so that can't happen, plus a `Categories` reference sheet. Import
  switched from a JSON `{csv}` body to `multipart/form-data` (`file` + `apply`). The cell-value
  normalization and header/row parsing (`cellText`/`parseWorkbookSheet`) now live in
  `apps/web/lib/xlsx.ts`, shared with the Discovered importer instead of duplicated — `lib/csv.ts` is
  gone, nothing imports it anymore.
- **Data snapshots** (`packages/database/data/<date>-<name>/`) — the convention for a bulk import's
  source data: commit the actual JSON the import script reads (e.g. `2026-07-27-master-tests/`'s
  `tests.json` [246 rows], `categories.json`, `fixes.json`, `pass3-queue.json`, and
  `orphaned-pre-existing-tests.json`), not just the script that consumes it. Introduced by the
  2026-07-27 master biomarker list import. Why: a script alone can't be re-diffed against later — the
  data it ran against needs to be reviewable/re-runnable from git history too, and any list of
  "flagged for manual review" items a script produces (like the master import's orphaned-slug report,
  otherwise only readable from an `audit_logs` row) gets its own committed JSON file so it survives as
  a durable work list. Follow this pattern (`<date>-<short-name>/` dir, one JSON file per input/output
  the import cares about) for the next data-expansion effort instead of inventing a new one.
- **Audit Log** (`/admin/audit`) — the searchable audit trail: filter by action / entity type /
  actor (incl. "System" for scraper writes) / date range, 50-row pages, via
  `GET /api/v1/admin/audit`. Rows are humanized by the shared `lib/audit-describe.ts` (also used by
  the dashboard feed); the API batch-resolves offering/test/vendor entity ids into names and returns
  the filter vocabularies (distinct actions/types/actors) for the dropdowns.
- **Tests** — list (sortable, search) + editor: name/codes/copy fields, **Categories multi-select
  (≥1 required, no "primary")**, popular flag, display order. Delete = soft delete. **Methodology,
  lab variant, Cardio IQ, confidence (High/Medium/Low), third-party-only, and notes** (added
  2026-07-27, same fields as the Excel round-trip above) are also editable here; `codeVerifiedAt`
  is shown read-only (system-stamped, never admin-editable) if present.
  - **✨ Auto-fill** (next to the name): `POST /api/v1/admin/tests/lookup` fills short name, slug,
    categories, the five content fields, and Quest/LabCorp codes from the test name. Codes: vendor
    catalogs first (DCL API → `code-lookup.ts`, same-name matches only — this hits DCL's **live** API
    directly, independent of whatever we've ingested/promoted into our own DB, so a code match here
    doesn't imply the vendor is already linked in our system), then **Claude** (`claude-opus-4-8`) for
    gaps; Claude also writes short name/content and picks best-fitting existing categories; slug is
    derived. Fills blanks only, for review. Needs `ANTHROPIC_API_KEY`; without it, returns catalog
    codes + slug only. **Provenance is shown per field** (added 2026-07-24, after a report that a
    correct DCL catalog match looked suspicious with no explanation of where it came from): a ✓/⚠
    note under each code field says whether it was a live catalog match or an AI guess, and a fixed
    label above the five content fields states they're always Claude-written from the test name, never
    copied from a vendor page — true from day one, just not visible before.
  - **Vendors** checklist (existing tests only): attach/detach offerings from the test side via
    `/api/v1/admin/tests/[id]/vendors`; attaching a catalog vendor auto-scrapes the price inline.
    **Select all / Deselect all** links above the list (added 2026-07-24) bulk-toggle every vendor at
    once instead of clicking each checkbox.
- **Categories** — dedicated CRUD (add / rename / reorder / delete). **Delete is blocked if it would
  orphan a test**; otherwise the display pointer of affected tests is auto-reassigned.
- **Vendors** — list (sortable incl. by trust) + **Add Vendor** + **Scrape all catalog vendors**
  (one click queues a `scrape-discover` job for every active catalog-mode vendor via
  `POST /api/v1/admin/vendors/scrape-all` — all via the worker, nothing inline: 15 sequential
  catalog crawls in one request would time out; per-URL vendors are excluded on purpose); editor has: details, **Trust
  Override + Scraper Health panel**, **Recent Runs** (last 15 `ScrapeRun`s with status/trigger/
  duration/found-updated counts + any `ScrapeError` messages inline — `GET
  /api/v1/admin/vendors/[id]/runs` — the live insight into scraping failures, so an admin doesn't need
  a DB query to see e.g. `"HTTP 403 for https://..."`), **Scraper Configuration** (engine/base URL/
  selectors/schedule + a **Catalog mode** toggle, **Catalog source (adapter)** dropdown, and catalog
  path for catalog-scraper vendors), **Catalog** (link/unlink tests + product URL + price), and
  **Scrape now** (runs inline for most catalog vendors; queues to the `scrape-discover` worker and
  shows a "queued" message for `needsBrowser` vendors like Request A Test).
  - **Catalog Excel round-trip** (added 2026-07-24) — `Export Excel`/`Import Excel` above the Catalog
    table (`GET`/`POST /api/v1/admin/vendors/[id]/offerings/export`|`import`). Unlike the one-by-one
    table (which only lists tests already linked), the export lists **every test in the system** —
    blank `external_url`/`current_price` for a test this vendor might carry but that never got
    auto-matched. Fill in the blanks (or fix a wrong URL/price) and re-import: `test_id` anchors every
    row, `offering_id` anchors an *existing* link when present. Same dry-run-diff-then-apply contract
    as every other admin workbook here; quest_code/labcorp_code are reference-only, TEXT-formatted.
    **Only creates and updates, never unlinks** — same reasoning as the Tests importer not supporting
    delete-by-sheet; use the ✕ button in the one-by-one table to unlink. A blank `offering_id` row
    with both URL and price still blank is just an untouched reference row (`skippedBlank` in the
    response), not an error.
- **Offerings** — filterable overview of every test↔vendor price link; vendor names link to the
  vendor editor. Links are *created* per-vendor in the Catalog (or by the scraper); this page bulk-
  *audits and fixes* them across every vendor at once via **Export/Import Excel**
  (`GET`/`POST /api/v1/admin/offerings/export|import`) — one row per live offering, sorted by test
  then vendor so every vendor's link for the same test sits together, with the vendor's OWN product
  name (from the last catalog crawl that matched it, via `VendorProduct`) sitting next to our test
  name — a wrong match (e.g. a vendor's "Iron" link actually pointing at a Testosterone page) is
  visible without opening the URL. `external_url` is editable (fix a wrong link); an `action` column
  (blank / `deactivate`) bulk-unlinks a wrong offering — soft (`isActive:false`), never deletes data
  or price history, same as the ✕ button in the per-vendor Catalog table. `vendor_product_name` and
  `current_price` are reference-only (not imported back — prices come from the scraper, names come
  from the vendor). Same dry-run-diff-then-apply contract as every other admin workbook here;
  transactional + audit-logged (`offerings.audit_import`).
- **Change Queue** (cursor-paginated, 25/page) — review staged price changes (Approve/Reject); has an
  in-UI workflow explainer. **Reject is a pure no-op** — nothing on `Offering` is touched until
  Approve; the live price just stays whatever it already was. **New Price is editable** before
  approving (reviewer override) — Approve then publishes the edited value, not the scraped one, and
  the original scraped price is preserved in `StagedPriceChange.reviewNote` for audit (appended, not
  replacing any discovered-URL note already there — see `publishStagedChange`'s `@ <url>` passthrough,
  the single canonical implementation in `packages/scrapers/src/catalog/persist.ts`; `apps/web/lib/
  publish-change.ts` is now just a re-export — consolidated 2026-07-25 after review found the web
  copy had drifted from the worker/inline-scrape copy, missing the audit log and a race-safety fix).
  Dual-lab (Dirt Cheap Labs) offerings stage Quest and LabCorp price moves **independently** — each
  lab that changes price gets its own Change Queue row (`labProvider` on the staged change), not just
  the cheaper lab; approving one publishes that lab's field and recomputes the derived cheaper/pricier
  ranking (`currentPrice`/`labProvider`/`altLabPrice`/`altLabProvider`) from both labs' latest prices.
  The vendor product URL (`Offering.externalUrl`) has its own inline
  edit (pencil icon next to the vendor link) — it's completely independent of the approve/reject
  decision on the price change; fixing a wrong URL doesn't require deciding anything about the
  pending price. Both the price-override POST body (`overridePrice`, single-id only) and the URL edit
  (reuses the Vendors Catalog's `PATCH /api/v1/admin/vendors/[id]/offerings`) were added 2026-07-23.
- **Tests** (`/admin/tests`, cursor-paginated, 25/page) — the list API always supported
  `limit`/`cursor`; the page just didn't use it until 2026-07-23.
- **Pages** (`/admin/pages`) — edit the public About / Terms / Privacy / Medical Disclaimer copy
  (title, "last updated" label, body). Saved to `system_settings` (`page_<slug>`) via
  `GET`/`PATCH /api/v1/admin/pages`; the live page is revalidated on save.
- **Settings** — grouped controls: scraping master switch/timeout, **auto-approval thresholds**, and
  a **Danger zone** (reset all analytics: wipes search logs, vendor clicks, page views via
  `POST /api/v1/admin/analytics/reset`; audit-logged, never touches prices/scrape history). The
  worker reads thresholds from here. (Feature flags removed 2026-07-08 — they were decorative.)
- **Users** — list + role management + **add/remove** (`POST`/`DELETE /api/v1/admin/users`): invite by
  email (restores a soft-deleted user instead of duplicating), remove revokes sessions immediately;
  guarded against self-delete and removing the last SUPER_ADMIN.
- **Analytics** (`/admin/analytics`) — KPI tiles (searches, vendor clicks, page views, unique
  visitors) each with a sparkline; a "Traffic over time" chart (page views + unique visitors, daily);
  top searches, **zero-result searches** (what to add next), vendor click-through, most-viewed tests,
  **top pages** (every page, not just tests), and **top referrers**. `GET /api/v1/admin/analytics?days=7|30|90`.
  "Unique visitors" comes from an anonymous `sid` cookie (`middleware.ts`, httpOnly) read server-side
  by the event/click routes — not a client-supplied id, so it also covers the `/api/v1/go/[id]`
  affiliate redirect (a plain navigation, no client JS in the loop). `PageViewTracker` is mounted on
  the homepage, category pages, and test pages; add it to more pages the same way for more coverage.
  Separately, **GA4** (`GoogleAnalytics.tsx`) fires once `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set (never
  on `/admin/*`) — set live 2026-07-21. **Important Docker gotcha**: `NEXT_PUBLIC_*` vars get inlined
  into the client bundle by `next build`, which runs *inside* `docker build` — Railway's dashboard
  Variables only reach the *running container*, not the build step. Any client-side `NEXT_PUBLIC_*`
  var needs a matching `ARG`+`ENV` pair in `Dockerfile`'s builder stage (already done for the GA4 id)
  or it silently bakes in `undefined` while still looking fine server-side (SSR has live `process.env`
  access regardless of the prefix, so the symptom is "the script tag loads, nothing ever tracks").
  GA4 is a *supplement* to the tables above, not a replacement — `trackEvent()` (`lib/gtag.ts`, no-ops
  if GA is unconfigured) fires custom events for things those tables don't capture: `search` (with
  real result count, from `SearchResultsTracker` on `/search`), `search_suggestion_click` (autocomplete
  pick vs. typed query, from `SearchBar`), `vendor_click` (the "Order" link, mirrors `AffiliateClick`
  but with GA4's session/device/geo attached, from `TestDetailClient`), and
  `suggestion_modal_opened`/`suggestion_submitted` (funnel drop-off on the 3 `SuggestionModal` forms —
  our DB only ever sees successful submits, so "opened but abandoned" was previously invisible).
  `/admin/analytics` also pulls GA4's own reports back in (2026-07-25): top countries, device-category
  breakdown, and counts for those 5 funnel events, via `lib/ga4-data.ts` (`@google-analytics/data`) and
  a GCP service account (`GA4_PROPERTY_ID`/`GA4_CLIENT_EMAIL`/`GA4_PRIVATE_KEY` env vars — separate
  credential from the `NEXT_PUBLIC_GA_MEASUREMENT_ID` tracking tag). Falls back to the old "Open Google
  Analytics" link-out card if those env vars are unset or the pull fails, so this is never fatal to the
  rest of the page.
- **Suggestions** (`/admin/suggestions`) — public "Suggest a Vendor"/"Suggest a Test" footer submissions
  plus test-page **result error reports**, unified into one sortable table (not per-type cards) with
  status tabs (Pending/Reviewed/Dismissed/All — Dismissed is filtered OUT of the default Pending view,
  acting as a real archive) and a type filter. Mark reviewed/dismissed via
  `PATCH /api/v1/admin/suggestions/[id]` (`kind: 'vendor' | 'test' | 'report'`); permanently remove via
  `DELETE /api/v1/admin/suggestions/[id]?kind=...` — hard delete, no soft-delete/undo, since these are
  low-stakes public-form leads rather than audited business data.

### Scrape pipeline (`apps/worker`, `@labprice/scrapers`)
- Queues (BullMQ, hyphenated names): `scrape-schedule` → `scrape-execute` → `scrape-publish`, plus
  `scrape-discover` for catalog-mode vendors.
- **Ingest layer (`VendorProduct`, 2026-07-20)**: every catalog crawl now ALSO upserts everything it
  saw into `vendor_products` (`ingestVendorProducts` in `persist.ts`, called at the end of
  `runVendorDiscovery`; non-fatal + idempotent on `[vendorId, slug]`). `discover()` returns
  `entries` (the full listing) alongside `products` — page vendors' narrow crawls record name+URL
  rows for unfetched pages (detail fields are never nulled by a detail-less crawl). Auto-match is
  STRICT: exact code hit guarded by `sharesStrongToken`, or exact `normalizeName` equality against
  test names + aliases → `status=MATCHED` (no offering created!); token-subset fuzzy →
  `suggestedTestId` only. Rows already MATCHED/IGNORED are admin-owned — the ingest only refreshes
  their detail/lastSeenAt. Aliases (`TestAlias`) feed pricing too: `TestKey.aliases` is consulted by
  the name tier and by catalog narrowing, so confirming a vendor's odd naming once makes that test
  price automatically on later crawls (verified: CSV-imported test auto-matched by exact name on the
  next fixture run).
- Two scrape strategies:
  - **Per-URL** (`scrape-execute.ts`): each offering stores a product `externalUrl`; the engine fetches
    it and reads the price via the vendor's CSS selectors. Original path; for vendors with stable
    per-test URLs.
  - **Catalog discovery** (`scrape-discover.ts` → `apps/worker/src/discovery.ts` →
    `@labprice/scrapers` `catalog/*`): for vendors that publish a whole catalog instead of per-test
    URLs (**GoodLabs**). See the dedicated recipe below.
- **Auto-approval** (shared rules, `shouldAutoApprove()` in `packages/scrapers/src/catalog/persist.ts`):
  first price, or a drop/rise within the Settings thresholds, auto-approves; **LOW-trust vendors always
  route to the Change Queue**; HIGH trust gets 1.5× thresholds. **`Test.confidence === 'LOW'` is a
  second, independent gate** (added 2026-07-27 with the master import) — even a HIGH-trust vendor's
  scrape never auto-publishes against a low-confidence (sparsely-verified) test code; both checks are
  short-circuits in the same function, don't duplicate the confidence check elsewhere. Approve →
  publish writes the live price + price history + a `price_published` audit-log
  row (admin dashboard "Recent Activity" reads that log). All publish paths — the `scrape-publish`
  queue, inline admin "Scrape now", the local CF-blocked-vendor script, and manually approving in the
  Change Queue — go through the single `publishStagedChange()` in
  `packages/scrapers/src/catalog/persist.ts`; don't duplicate its update/history/audit logic per
  caller (that's exactly how the audit-log write went missing from every path but the queue one,
  fixed 2026-07-19).
- **Vendor trust** (`packages/database/src/vendor-trust.ts`): success rate + freshness + reject rate
  → LOW/MEDIUM/HIGH; `Vendor.trustOverride` pins it manually. (Trust is resolved *before* a run is
  created, so a brand-new vendor's first run doesn't self-drag to LOW.)
- **Automatic scheduling** (`workers/scrape-schedule.ts`): the worker registers a **daily tick**
  (06:00 UTC, BullMQ job scheduler in `index.ts`). Each tick scrapes vendors that are *due* per
  `ScrapeVendorConfig.frequencyDays` (admin vendor page → "Scrape frequency"; default 7 = weekly,
  0 = manual only). ANY prior ScrapeJob resets the clock (manual runs count). Master switch:
  `scrape_enabled` on admin Settings.
- **Status emails** (`apps/worker/src/report.ts`, `workers/scrape-report.ts`): weekly digest to all
  admins (Mondays 12:00 UTC) — per-vendor last-run status, unpriced tests (UNMATCHED results),
  overdue detection, pending change count, weekly error count. Scheduled-run failures also alert
  immediately (throttled 1/vendor/day). Needs `RESEND_API_KEY` on the worker; without it the email
  body is logged to the worker console instead (handy for local dry-runs).
  **Traffic topline** (`apps/worker/src/traffic.ts` `collectTraffic()` + `packages/shared/src/traffic-render.ts`
  `renderTrafficHtml`/`renderTrafficText`, appended after the scraper-health section — health stays
  first): visitors/sessions/top-sources from GA4 (`fetchGa4Traffic`), plus top searches, zero-result
  searches (the demand signal for what to add next), most-viewed tests, and vendor click-throughs from
  our own tables. A GA4 failure/misconfiguration degrades only this section (renders the DB half with
  a "not configured" note) — it never blocks the digest send. The renderer is pure and lives in
  `@labprice/shared` (deep-import, not in the barrel) specifically so it has unit tests, since
  `apps/worker` has no test runner.
- **Price-range chart**: test detail pages chart the last 12 months of `PriceHistory` as a single
  shaded low-high band across all vendors (`apps/web/app/test/[slug]/PriceHistoryChart.tsx`,
  inline-SVG step chart) — not one line per vendor, which stopped being readable past a handful of
  offerings. A vendor with no recorded change is treated as flat at its current price for the whole
  window (PriceHistory records changes only; we don't track "vendor first listed"). Appears
  automatically once a test has ≥1 recorded price change. Each vendor row in the price table also
  gets its own freshness dot (green <7d / amber <30d / gray older) + "checked N ago" next to the
  vendor name, in addition to the aggregate "Prices last checked" line in the page header.

#### GoodLabs catalog scraper (the first live scraper)
- **How it works**: GoodLabs (goodlabs.com) is a Next.js reseller with no price API and no stable
  per-test URL. We fetch its **catalog page** (JSON-LD `ItemList` → every `{name, /tests/<slug>}`),
  then each product page's **flight data** (`self.__next_f` chunks) which embeds one entry *per
  fulfilling lab* (quest/labcorp/bioreference) with that lab's code (`labTestIDs`), `price`, and an
  explicit **`isPanel`** flag. Plain HTTP — no browser, no CSS selectors.
- **Matching** (`catalog/matcher.ts`): resolve each of our tests by **Quest code → LabCorp code →
  name** (first tier with a hit wins; tiers aren't blended). Bundle panels (`isPanel:true`) are
  excluded — we price the test itself, never the panel it's part of.
- **Ambiguity**: if the winning tier yields >1 distinct price (e.g. "Testosterone Total" name-matches
  several products), we **do not guess** — stage the lowest as `PENDING` with a review note listing
  every candidate, so it lands in the Change Queue. Configurable via `MatchOptions`
  (`preferredProvider` can auto-resolve a same-product multi-lab tie).
- **Catalog mode flag**: a vendor is catalog-mode when its `ScrapeVendorConfig.selectors.mode ===
  'catalog'` (optionally `selectors.catalogPath`, `selectors.preferredProvider`). "Scrape now" and
  **requeue-on-add** (linking a test to the vendor) both enqueue a `scrape-discover` job for such
  vendors instead of per-URL execute jobs.
- **Parsers are pure + fixture-tested**: `catalog/goodlabs-parser.ts`, `flight-parser.ts`, `matcher.ts`
  are covered by `packages/scrapers/src/__tests__/{goodlabs-parser,matcher}.test.ts` against real
  saved HTML in `__tests__/fixtures/`.

---

## Part 2 — Workflows & recipes

### Environment
```bash
pnpm docker:dev                                   # Postgres + Redis
pnpm --filter @labprice/database db:push          # apply schema
pnpm --filter @labprice/database db:seed          # (re)seed demo data
pnpm dev                                           # web only, :3000
```
Seed admin: `admin@labprice.com` (SUPER_ADMIN). Local login providers aren't configured; for dev,
create a DB session row and set the `authjs.session-token` cookie (database-backed sessions) — or just
run `cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/dev-admin-session.ts`, which prints
a ready token to paste into `document.cookie` in the preview browser.

### Making a schema change (mind the Windows Prisma lock)
1. Edit `packages/database/prisma/schema.prisma`.
2. **Stop all dev servers** (the query-engine DLL is locked while they run).
3. `db:push` then `db:generate` (i.e. `npx prisma generate`).
4. Restart dev. Batch schema edits to do this once.

### Styling (the #1 gotcha)
- **Public pages → inline `style={{}}`** (Tailwind arbitrary oklch/px values are unreliable here).
- **Admin → `.admin-*` classes** in `apps/web/app/globals.css` (`admin-btn`, `-card`, `-input`,
  `-h1/2`, badges). Don't hand-roll arbitrary-value utilities.
- **Brand palette (2026-07-22 rebrand, pixel-matched to a design handoff):** navy `#0f2647`
  (`oklch(... 258-263)`, brand-900), blue `#1656e8` (`oklch(0.516 0.229 263)`, brand-500), green
  `#1a9e5c` (`oklch(0.617 0.146 155)`, accent/success-500), red `#e0293e` (`--color-brand-red`,
  `oklch(0.589 0.215 22)`). `@theme` tokens `--color-brand-*`/`--color-accent-*` in `globals.css`
  drive admin `bg-brand-500` etc.; public pages hardcode the same hues inline
  (`oklch(L C 258-263)` blue, `oklch(L C 155)` green). If you're adding new inline colors, match one
  of these hues, not the old 228-232/145/165 family (or the even-older 280 before that). A handful of
  *other* hues (155/180/220/260/300) are used deliberately for category-badge/accordion-icon variety
  and are not brand colors — don't "fix" those.
- **Logo**: shared `LogoIcon`/`Logo` component at `apps/web/app/components/Logo.tsx` (test tube +
  magnifying glass + $ mark, `variant: 'light'|'dark'` for on-white vs. on-navy). Used in `Navbar`,
  `Footer`, `AdminSidebar`. Favicon/app-icon (`app/icon.svg`, `app/apple-icon.png`,
  `public/icon-512.png`) and the OG image (`opengraph-image.tsx`) are generated from the same mark —
  regenerate the PNGs via `apps/web/scripts/generate-brand-icons.ts` (needs `sharp`) if the mark ever
  changes. Logo wordmark font is Poppins (`--font-poppins`, wired in `layout.tsx`); body copy is
  intentionally still DM Sans/system-ui — that scope split was deliberate, not an oversight.

### Category model (many-to-many, no per-test "primary")
- Membership lives in `TestCategory`. `Test.categoryId` is a **derived display pointer** (lowest
  `displayOrder` in the set) — never user-selected. Server sets it on every save.
- Tests require ≥1 category (validated client + server). Category delete blocks on would-be orphans.
- Public reads: cards/breadcrumbs use the display pointer; category pages & the homepage filter use
  the full m2m set.
- **`Category.isPrimary`** (added 2026-07-27 with the 21-category taxonomy: 10 original categories
  `isPrimary=true`, 11 new ones `isPrimary=false` — Thyroid, Liver, Kidney, Electrolytes, Autoimmune,
  Allergy, Fertility, Nutrition, Coagulation, Bone Health, Sexual Health / STD) drives the homepage's
  **two-facet filter** (`CategoryFilters.tsx`, replacing the old single-select `CategoryTabs`): primary
  categories render as always-visible multi-select chips (OR-matched within the selection); secondary
  categories live behind a "More filters" disclosure (also OR-matched); the two facets AND together.
  It's a real column read at query time — not a hardcoded category-name list — so a newly added
  category defaults to secondary unless explicitly marked primary.

### Adding data via the admin
- **Test**: Admin → Tests → Add; pick ≥1 category (inline "+ New" creates one).
- **Vendor**: Admin → Vendors → Add & Configure → lands in the editor → set scraper config, trust,
  and build the Catalog (link tests + URLs).
- **Category**: Admin → Categories → add/rename/reorder/delete.

### Running / extending the GoodLabs catalog scraper
```bash
# Unit tests (pure parsers + matcher, real HTML fixtures — no network):
pnpm --filter @labprice/scrapers test
# Live crawl + match against the real site, NO DB (quick smoke test):
cd packages/scrapers && node ../../apps/worker/node_modules/tsx/dist/cli.mjs scripts/run-goodlabs-live.ts
# Full end-to-end: set up GoodLabs vendor + offerings, crawl live, persist + publish (needs docker:dev):
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-goodlabs.ts
```
- **From the admin** (no worker needed): open the vendor → Scraper Configuration → tick **Catalog
  mode** + set the catalog path → Save. "Scrape now" runs discovery **inline** in the web request
  (`@labprice/scrapers` `catalog/persist.ts` → `runVendorDiscovery`) and returns a summary; linking a
  test (Catalog → Add) prices just that offering inline. Both use name-narrowing so only a few catalog
  pages are fetched (~2s). Clean matches auto-publish; ambiguous ones go to the Change Queue. The
  worker's `scrape-discover` queue still exists for scheduled/background runs (Redis storm fixed).
- **Three live adapters** (`catalog/adapters.ts`), pick per vendor via the admin **Catalog source**
  dropdown (`selectors.adapter`):
  - `goodlabs` — JSON-LD + Next.js flight chunks, `/tests/<slug>`.
  - `ownyourlabs` — Phoenix HTML, `/shop` → `/test/<UUID>`; single Order Code vs both codes
    (`codeMatchAnyProvider`).
  - `dirtcheaplabs` — **API vendor** (`CatalogAdapter.fetchAll`): pulls both lab catalogs from
    `api.dirtcheaplabs.com/api/catalog/alacarte?lab=…`. Many tests are sold through BOTH Quest and
    LabCorp at different prices; `mergeCodeTiers` ranks on the cheaper as `currentPrice`/`labProvider`
    and keeps the other lab's price as `Offering.altLabPrice`/`altLabProvider` (null when only one lab
    carries the test) — shown on the test page as a secondary "also available via X" line, same
    treatment as MitoHealth's member price below. Each lab is staged **independently** (its own
    Change Queue entry, `StagedPriceChange.labProvider`) — see "Change Queue" under the admin panel
    for the approve-time ranking recompute.
  - `anabolicinsights` — **API vendor** (`CatalogAdapter.fetchAll`): one public JSON call to
    `api.anabolicinsights.ai/api/lab-biomarkers/multi-lab-pricing` (no auth/headers). **Do not try to
    parse `/labs/panels/biomarkers`** — that page is a client-rendered shell whose server HTML contains
    no prices at all (not even the word "Quest"); the endpoint was found via the page's own Resource
    Timing entries. 110 biomarkers / 260 lab options: each row is the same test priced at up to
    **three** labs (Quest/LabCorp/**Bioreference**) with per-lab order codes, so it uses
    `mergeCodeTiers` exactly like Dirt Cheap Labs above. `isPanel` is **false for everything** — the
    endpoint is the à la carte catalog and rows named like panels ("Comp. Metabolic Panel (14)",
    "Lipid Panel") are real single orderables we also carry, so flagging them would make the matcher
    skip them; the vendor's actual bundles live on a different page this adapter ignores. `basePrice:
    0` is treated as unpriced (not free), codeless options stay name-matchable, and names are trimmed
    (the source data has trailing spaces). The API's **`loincId` doubles as the site's per-biomarker
    URL segment** (`/labs/panels/biomarkers/<loincId>`), so each offering deep-links to its own test
    page rather than the catalog listing — verified live: a real id serves a server-rendered
    "<name> · Anabolic Insights" `<title>` while an unknown id falls back to a generic "Biomarker",
    so the URL is genuinely canonical and not just a client-side route. (Don't trust the HTTP status
    to validate one of these: it's an SPA shell, so even a bogus UUID returns 200.)
    **Known limit:** `Test` has no Bioreference code column, so
    Bioreference can never win the code match — if it's the cheapest lab we still rank on the cheaper
    of Quest/LabCorp. It's still ingested into `VendorProduct` and shows as a candidate.
  - `algorx` — server-rendered Next.js; the whole priced catalog is in the `/biomarkers` page's RSC
    flight payload (`decodeNextFlight`, one fetch, no pagination, no browser). Registered as a
    **`fetchAll`** adapter even though it's HTML, because the per-product pages are client-rendered
    shells with no data — a page-based crawl would fetch 175 pages and parse nothing. 175 records =
    one per (test, lab): Quest 89 + Labcorp 86, each with its own slug/URL/price, deep-linked at
    `/biomarkers/<slug>` (slugs are lab-suffixed: `ferritin-quest` / `ferritin-lc`). Honors the
    vendor's own `type:'panel'` flag as `isPanel` (57 of 175).
    ⚠️ **INGEST-ONLY — do not bulk auto-link its offerings.** This vendor publishes **no lab order
    codes at all** (`marker_id` is an internal Vital id, not an order code — verified against nine
    known codes with zero hits, and it differs per lab for the same test). With nothing to corroborate
    a name, matching produces confidently-wrong prices: measured against the live catalog,
    "Deamidated Gliadin Peptide Ab" → "C-Peptide" ($25), and with ambiguity-flagging off it got worse
    ("Vitamin D, 25-Hydroxy" → "Vitamin B12", "Arsenic Blood Test" → "Phosphate"). Ambiguity-flagging
    is kept ON and `scripts/discover-algorx.ts` creates **zero offerings** — it crawls so all 175
    products land in `VendorProduct`, then genuine matches are promoted by hand in `/admin/discovered`
    (a promoted offering pins a product URL, which prices reliably afterwards via `priceFromPinnedUrl`
    even when the name tier stays ambiguous). Note the contrast worth remembering: the **strict**
    ingest matcher (exact code/alias only) did fine here — 57 auto-matches, all sane — it is the
    **loose** pricing name-tier that is unsafe without codes.
  - `mitohealth` — **API vendor** (tRPC `marketplace.catalog.search`, paginated). $9/mo membership:
    each product variant has member + non-member prices (no codes → name-matched). We rank on the
    non-member price and store the member price (`Offering.memberPrice` + `Vendor.membershipNote`),
    shown as an inline secondary line on the test page (not a tooltip — mobile-friendly).
  - `walkinlab` — custom server-rendered store (not Magento), plain HTTP, **paginated** catalog listing
    (`/categories/view/all-products?page=N`, 40+ pages — see "Paginated catalogs" below). A product
    page exposes **both** lab codes together ("Test Code(s): 001453, 496") rather than one ambiguous
    code, so it uses `codeMatchAnyProvider` like OYL. **Panel detection**: the page's own "CPT
    Code(s)" field reads a real code for a single test but literally **"See Individual Tests"** for a
    multi-test bundle — a reliable vendor-supplied `isPanel` signal (verified live), unlike GoodLabs'
    explicit JSON flag or DCL/OYL's separate-endpoint/URL-shape exclusion.
  - `personalabs` — WooCommerce store, paginated (`/products/all-test/`, 27+ pages). Each
    product is labelled with its ONE fulfilling lab directly in the markup
    (`provider-cart-button labcorp`), so it uses **strict per-lab tiers** (no `codeMatchAnyProvider`) —
    the labProvider is read off the page, not guessed. **Panel detection**: a single test's order code
    lives in exactly one hidden `.hidden_test_code` div; a bundle carries one per constituent test, so
    `isPanel = codes.length > 1`. **`needsBrowser: true` (2026-07-26, unlike the other two `needsBrowser`
    vendors below, NOT a Cloudflare issue)**: the displayed price is computed **client-side** by a
    "Discount Rules for WooCommerce" plugin (AJAX call, nonce-protected — replaying it directly 400s,
    it's bound to a live browser session) and rewrites the DOM after load; plain HTTP, and even the
    page's own server-rendered Product JSON-LD, both report the pre-discount list price. Confirmed live
    on Copper: static/JSON-LD said $122, the page actually showed $79.30. No parser change needed —
    the existing `.amount` regex already targets the right element, which the vendor's own JS mutates
    in place once real JS execution (`browserFetchHtml`) is used instead of plain HTTP.
  - `healthlabs` — **no catalog page at all**; `sitemap.xml` is the catalog (single flat fetch, no
    pagination — the fastest of the recent vendors, ~20s). Clean JSON-LD `Product` blocks
    (`JSON.parse`-able directly), unlabelled per-lab codes (`codeMatchAnyProvider`). **No isPanel
    heuristic at all** — `category`, "Panel" in the name, and a testCode-count cutoff were all tried and
    disproved live (a count cutoff mis-flagged CBC/CMP — genuine single tests with 17 codes each — as
    panels, which silently broke their manually-pinned-URL price; see `STATE.md` "Seventh scraper" for
    the full incident). `isPanel` is always `false` for this vendor; the matcher's ambiguity detection
    (>1 distinct price on a code hit) is the real backstop against a genuine bundle.
  - `privatemdlabs` — huge granular catalog (3,545 products), paginated via same-URL AJAX
    (`/tests?view=all&page=N`) that only returns JSON when the request carries
    `X-Requested-With: XMLHttpRequest` (see "Extra headers" below) — still plain HTTP. No lab codes
    anywhere on the site → name-only matching (`matchPriority: ['name']`, like MitoHealth). No isPanel
    heuristic (same reasoning as HealthLabs).
  - `requestatest` — Cloudflare JS-challenges every path except the homepage; needs
    `catalog/browser-fetch.ts`'s `browserFetchHtml` (stealth headless Chromium) instead of plain HTTP —
    see "Browser-rendered vendors" below. Otherwise GoodLabs-shaped once rendered: per-lab
    (`panel LabLC`/`panel LabQD`) price + labelled `Test Code:`; a lab with no test gets a `noTest` class
    and simply produces no offering. Codes aren't universal even for a carried lab (drug panels have a
    price but no code) — offering keeps the price with an empty code list rather than being dropped.
  - `directlabs` — **API vendor** (`fetchAll`, like DCL/MitoHealth): the marketing site is irrelevant;
    the real store is an Angular SPA needing JS, but its JSON API
    (`store.directlabs.com/api/LabTests/GetTestsByCategoryID`) is plain ungated HTTP. No "list
    everything" mode — fetches all 46 active categories (hardcoded, from `GetCategoriesActiveByLocale`)
    and merges by test ID. No lab codes in the API → name-only, no isPanel heuristic.
  - `discountedlabs` — Magento, plain HTTP, single-page catalog (`/choose-a-test`, ~100 products, no
    pagination). Same "$1 today, pay balance after results" model as Private MD Labs. Lab codes are
    **opportunistic** — only present when a product page happens to link to
    `labcorp.com/tests/<code>/...`; `labProvider` is `'unknown'` (not assumed `'labcorp'`) when that
    link is absent, so the Change Queue never shows a lab attribution we don't actually have.
  - `truehealthlabs` — WooCommerce, plain HTTP, dedicated product-only sitemap (`product-sitemap.xml`,
    ~1,736 products, single fetch, no pagination). **Best code exposure of any vendor**: the WooCommerce
    SKU literally encodes `<Lab>_<code>` (e.g. `Quest_457`), sometimes with a trailing internal variant
    segment to ignore (`Quest_17306_303`). Strict per-lab tiers. **No price-sanity gap**: an
    out-of-stock bundle reported a literal GTM `price: 0` that would have legitimately name-matched
    "Vitamin B12" — the adapter now drops any product whose price isn't `> 0` (a real self-pay lab test
    is never actually free) rather than passing a bogus price downstream.
  - `questhealth` — Quest Diagnostics' own first-party store (Salesforce Commerce Cloud/Demandware).
    `sitemap_0.xml` (single fetch, ~160 products) embeds the Quest order code directly in the URL
    (`/product/hemoglobin-a1c-test/496M.html` → 496), also confirmed via `data-pid` on the page. Every
    product is Quest-fulfilled by definition. **Gotcha found here, fixed in shared code**: its slug is
    two path segments (`name-slug/codeM`), but the pinned-URL retry's generic "slug = last path
    segment" logic only grabs the code segment — reconstructing a URL from that alone doubles the
    `.html` extension. Fixed by having the adapter trust the product page's own
    `<link rel="canonical">` instead of reconstructing a URL from `slug`. Worth remembering for any
    future vendor whose slug isn't a single flat segment.
  - `labcorpondemand` — LabCorp's own first-party store (Adobe Experience Manager). `sitemap.xml`
    (single fetch, ~132 products). **Best isPanel signal of any vendor**: an explicit
    `data-isbundleproduct` true/false flag on every product page, vendor-supplied (verified live: CMP
    stays `false` despite being a clinical panel — consistent with precedent — an actual build-your-own
    bundle is `true`). Bundle SKUs are also non-numeric, unlike a real 6-digit LabCorp code. Last vendor
    in the original 11-vendor research queue — see `STATE.md` for the full list and status.
  - `marekdiagnostics` — Marek Health's direct-to-consumer shop (Shopify). `sitemap.xml` is an INDEX,
    not flat — `catalogPath` points straight at the products sub-sitemap. **Best code exposure of any
    vendor**: a real single test's JSON-LD `Product.mpn` IS the Quest code directly; a bundle is
    `@type: "ProductGroup"` instead of `"Product"` (a structural signal, not a heuristic).
  - `jasonhealth` — API vendor (Algolia search, public referer-restricted key embedded in the page,
    threaded via `extraHeaders`). Every hit's `url_code` IS the Quest code. Best match rate of any
    vendor (33/35 seed tests). Capped at 1,000 results (Algolia's `query`-endpoint limit) out of a
    ~3,842-item index — accepted, not a bug (common tests rank first in an empty-query browse).
  - `drsays` — WordPress, but with **no reliable live catalog discovery**: the sitemap lists a
    different, stale URL scheme than the site's real `/home/test-<slug>/` pages (most sitemap URLs
    404 or redirect to a generic search page). `parseCatalog` deliberately returns a **hardcoded list**
    of hand-verified working slugs instead of crawling — small, honest coverage (5 tests) rather than a
    crawl that would mostly fail. Matches on LabCorp code ONLY, no name fallback — this vendor's own
    codes for "Cortisol" and "Vitamin B12" don't match our stored codes for those same-named tests (a
    real variant discrepancy, found live), so name-only matching is disabled entirely for this vendor
    rather than special-casing those two.
  - **Function Health** was evaluated (it was the 4th vendor from the same research batch) and
    deliberately NOT built: its site exposes zero per-test pricing anywhere unauthenticated ($365/year
    membership required just to see any price) — no data source exists to scrape, unlike MitoHealth's
    public storefront.
  - E2E runners: `apps/worker/scripts/discover-{ownyourlabs,dirtcheaplabs,mitohealth,walkinlab,personalabs,healthlabs,privatemdlabs,requestatest,directlabs,discountedlabs,truehealthlabs,questhealth,labcorpondemand,marekdiagnostics,jasonhealth,drsays}.ts`.
- **Adapter defaults** (`persist.ts` `ADAPTER_DEFAULTS`): baseUrl/catalogPath/matchOptions per adapter
  name, all overridable per-vendor via `selectors`. A lookup map, not an if/else chain — add a vendor by
  adding one entry.
- **Extra headers**: `CatalogScrapeConfig.extraHeaders` (threaded through `httpFetchHtml`) lets a vendor
  need one non-default header (e.g. Private MD Labs' AJAX pagination) without reaching for a full
  browser engine. Set via `ADAPTER_DEFAULTS[name].extraHeaders`.
- **Browser-rendered vendors**: when a vendor Cloudflare/WAF-JS-challenges plain HTTP (check with a
  `curl -A "<browser UA>"` first — don't assume), `catalog/browser-fetch.ts`'s `browserFetchHtml()` is a
  drop-in `fetchHtml` replacement using stealth-patched headless Chromium. It's a SEPARATE module from
  `persist.ts` on purpose (see its top comment) — `persist.ts` must stay Playwright-free to be safe to
  deep-import into Next.js. Mark such a vendor `needsBrowser: true` in `ADAPTER_DEFAULTS` and use
  `adapterNeedsBrowser(selectors.adapter)` (exported from `persist.ts`) to decide whether a caller needs
  it. **Inline "Scrape now" in the web admin queues to the `scrape-discover` worker instead of running
  browser vendors in-process** (`apps/web/.../vendors/[id]/scrape/route.ts`) — a *direct* static import of
  `browser-fetch.ts` into a Next.js route was tried and fails at runtime (`utils.typeOf is not a
  function` from inside the stealth plugin — Turbopack can't bundle it for the server, confirmed live,
  not just a bundle-size worry); `serverExternalPackages` did not fix it either. So: the worker process
  (`apps/worker`, plain tsx, no bundler) is the only place that actually runs `browserFetchHtml()` —
  both the worker's `scrape-discover.ts` processor AND the web route must independently check
  `adapterNeedsBrowser` (found live 2026-07-04: the worker processor never checked this either, so even
  scheduled runs for Request A Test silently used plain HTTP and 403'd). The admin sees "queued — needs
  `pnpm dev:worker` running" instead of an inline result summary for these vendors.
  Not every WAF is passable this way — Ulta Lab Tests escalates to an actual image CAPTCHA even with
  this, which is a different, unsolved problem (see `STATE.md`).
- **Windows Redis gotcha, second location**: `localhost` intermittently resolves to IPv6 (`::1`) on
  Windows, which this Docker Desktop setup's port forwarding doesn't reliably answer on — a fresh
  `ioredis` connection "succeeds" (TCP connects) then resets on the first real read/write, over and over,
  looking exactly like a Redis outage even though `redis-cli PING` and Postgres both work fine at the
  same time. `apps/worker/src/redis.ts` already normalizes `localhost` → `127.0.0.1` for the worker's own
  connections; the web app's ad-hoc producers (single-vendor scrape route, bulk scrape-all route) get
  the same fix from `apps/web/lib/redis-options.ts` (found live 2026-07-04 debugging the queued-scrape
  fix above — in web code, always build connections from that helper; never a raw
  `new IORedis('redis://localhost:6379')`).
- **Paginated catalogs**: `CatalogAdapter.nextCatalogPage(html, currentUrl)` (optional) returns the next
  listing page's URL, or `null` on the last page; `fetchCatalogEntries` loops on it (100-page safety
  cap) before narrowing. Single-page adapters (GoodLabs, OYL) just omit it — no behavior change. Adds
  real latency for large catalogs (Walk-In Lab's ~1,240-product catalog is ~41 listing-page fetches
  before narrowing even starts, versus GoodLabs' ~2s single-page scrape) — a vendor-catalog-size
  tradeoff, not a bug, and still fine for an interactive "Scrape now".
- **Match safety**: a code hit is trusted only if the product name shares a *distinctive* token with
  our test (`sharesStrongToken`) — guards against wrong/stale codes (e.g. a bad Quest code resolving
  to a different test) and generic-word name collisions ("Vitamin B12" ≠ "Vitamin A").
- **Manual pinned-URL override** (`persist.ts`): pasting the correct product URL on an offering makes
  the next scrape fetch that exact page and price it directly, for **both** `unmatched` (narrowing found
  nothing) and `ambiguous` (narrowing found several candidates and refused to guess) results — a pinned
  URL is the admin resolving the ambiguity by hand, so it always wins. This is vendor-agnostic shared
  code (`priceFromPinnedUrl`), so a bug here affects every vendor at once — don't assume a "no price on
  a pinned URL" report is specific to whichever vendor it was noticed on; check `persist.ts` first.
- **To onboard another catalog vendor**: add a `<vendor>-parser.ts` in `packages/scrapers/src/catalog/`
  exposing `parseCatalog(html)` + `parseProduct(html, baseUrl, slug?)`, register it in `adapters.ts`,
  add a config in `configs/`, and set the vendor's `selectors` to `{ mode:'catalog', adapter,
  catalogPath }`. The matcher, crawler (with name-narrowing), and `runVendorDiscovery` persistence are
  all reused — only the site-specific parsing is new. **Then run the verification checklist below —
  required for every new vendor, not optional.**

### Vendor verification checklist (run for every new vendor, and after any shared-code change)

Every bug found in this vendor build-out was a *systemic* one hiding behind an apparently-healthy
vendor: a shared whitelist going stale, a site re-theming and silently zeroing the catalog, a wrong base
domain, a fetcher mismatch nobody wired up. Unit tests against frozen fixtures don't catch any of these —
they need a real, current, end-to-end run. `apps/worker/scripts/verify-vendor.ts` automates the checks
that can be automated; the rest needs a real click-through in the admin UI.

```bash
# From apps/worker — runs the exact code path "Scrape now" uses, no admin UI needed:
DOTENV_CONFIG_PATH=../../.env npx tsx scripts/verify-vendor.ts <vendor-slug>
# Force a specific canary test (default: first not-yet-linked test from a standard candidate list):
DOTENV_CONFIG_PATH=../../.env npx tsx scripts/verify-vendor.ts <vendor-slug> --canary=<test-slug>
```

What it checks, and the real incident behind each one:
1. **Adapter resolves to itself, not a silent GoodLabs fallback** — a hand-kept adapter whitelist going
   stale silently strips `selectors.adapter` on save (Discounted Labs, 2026-07-04: `Save Scraper Config`
   wiped it because the API route validated against `['goodlabs','ownyourlabs','dirtcheaplabs',
   'mitohealth']` instead of the real `ADAPTERS` registry).
2. **Catalog crawl finds a plausible number of products, not zero** — a vendor re-themes their site and
   the catalog-listing regex stops matching anything (Discounted Labs, same date: 100 products → 0
   after a markup change, silent — the crawl itself never throws).
3. **A canary test the vendor doesn't currently carry gets linked fresh and matches** — proves *new*-test
   onboarding works end-to-end, not just that already-cached prices still look fine. If it comes back
   unmatched, check whether it's a genuine wording mismatch (an accepted, documented tradeoff for
   name-only vendors — see the per-vendor entries above) before treating it as a bug.
4. **Every stored product URL actually resolves (no 404s)** — a wrong base domain in URL construction
   (DirectLabs, 2026-07-04: built `https://directlabs.com/testinfo/<id>` — the WordPress marketing site
   — instead of `https://store.directlabs.com/testinfo/<id>`, the real store).
5. **The discovery run completes without throwing** — the wrong-fetcher-for-a-JS-gated-vendor class of
   bug (Request A Test, same date: the web route's inline "Scrape now" and the worker's own scheduled
   `scrape-discover` processor both defaulted to plain HTTP against a Cloudflare-gated site and 403'd
   every time — neither ever checked `adapterNeedsBrowser`).

What it does **not** check — do these by hand in the admin UI before calling a vendor done:
- Click **Save Scraper Config** once, reload the page, and confirm the Catalog source dropdown still
  shows the vendor's real adapter (not silently reverted to GoodLabs) — the round-trip itself, not just
  the stored value.
- Click **Scrape now** for real in the browser and read the message shown — inline summary for a normal
  vendor, or the "queued — needs the worker running" message for a `needsBrowser` one. Confirm **Recent
  Runs** (below Scraper Health on the vendor page) shows a fresh `SUCCESS` row afterward, and that
  **Scraper Health → Last success** updated to today.
- Spot-check one matched price against the vendor's live site by eye (a matcher bug can pick the wrong
  candidate at a real, plausible-looking price — the DB alone won't tell you that).
- If anything came back `FAILED` or with unexpected errors, read the message directly in **Recent Runs**
  (`ScrapeError.message`, e.g. `"HTTP 403 for https://..."`) before guessing — the actual cause is
  usually right there.

### Verifying UI
Use the preview tools (`preview_start`, `preview_eval`, `preview_screenshot`) with the admin
`authjs.session-token` cookie. Note: admin pages redirect unauthenticated requests at the layout, so
`curl` without the cookie won't exercise the page body.

---

## Key file map

| Area | Path |
|------|------|
| Public homepage / data | `apps/web/app/page.tsx`, `components/HomeTestList.tsx`, `SearchBar.tsx` |
| Test / category pages | `apps/web/app/test/[slug]/`, `apps/web/app/category/[slug]/` |
| Admin pages | `apps/web/app/admin/**` |
| Admin APIs | `apps/web/app/api/v1/admin/**` |
| Search service | `apps/web/lib/services/search-service.ts` |
| Auth | `apps/web/lib/auth.ts` |
| Prisma schema | `packages/database/prisma/schema.prisma` |
| Trust / settings helpers | `packages/database/src/vendor-trust.ts`, `settings.ts` |
| Scrape workers | `apps/worker/src/workers/*` |
| Catalog discovery (persist) | `apps/worker/src/discovery.ts`, `scripts/discover-goodlabs.ts` |
| Scraper engines/configs | `packages/scrapers/src/**` |
| Catalog scraper (parse+match) | `packages/scrapers/src/catalog/*`, `configs/goodlabs.ts` |
| Design-system classes | `apps/web/app/globals.css` |
