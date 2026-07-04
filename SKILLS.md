# LabTestCompare — Skills & Workflows

What the system does (feature catalog) and how to work on it (workflows/recipes).
**Keep this current** — update it whenever a feature or workflow changes (see the discipline note in
`.claude/CLAUDE.md`). Pairs with `CHANGELOG.md` (history) and `.claude/CLAUDE.md` (conventions/gotchas).

---

## Part 1 — Feature catalog (what LabTestCompare does)

### Public site (`apps/web/app`)
- **Homepage** (`page.tsx`)
  - Hero **search** with live **autocomplete** (`components/SearchBar.tsx` → `/api/v1/search/autocomplete`);
    suggestions show test name, Quest/LabCorp codes, and "from $X".
  - **Live, data-driven stats**: "Live prices from N ordering services" + stats bar (N Ordering
    Services = active vendors, N Common Tests). `revalidate = 60`.
  - **Popular Tests** cards and an **All Tests** list with A–Z / price sort and a **category filter**
    that respects a test's *full* category set (`components/HomeTestList.tsx`).
- **Test detail** (`test/[slug]`) — price-comparison table across vendors, **best-price** banner
  (green), savings, sortable; accordion (About / How It's Performed / How To Prepare / Normal Ranges);
  Save + Price-Alert for signed-in users; JSON-LD `MedicalTest`.
- **Category pages** (`category/[slug]`) — lists tests via the many-to-many, so a test appears under
  every category it belongs to.
- **Search API** (`/api/v1/search`) — Postgres full-text with trigram fallback.

### Admin panel (`apps/web/app/admin`, gated to ADMIN/SUPER_ADMIN)
- **Dashboard** — KPI counts + recent audit activity.
- **Tests** — list (sortable, search) + editor: name/codes/copy fields, **Categories multi-select
  (≥1 required, no "primary")**, popular flag, display order. Delete = soft delete.
  - **✨ Auto-fill** (next to the name): `POST /api/v1/admin/tests/lookup` fills short name, slug,
    categories, the five content fields, and Quest/LabCorp codes from the test name. Codes: vendor
    catalogs first (DCL API → `code-lookup.ts`, same-name matches only), then **Claude**
    (`claude-opus-4-8`) for gaps; Claude also writes short name/content and picks best-fitting existing
    categories; slug is derived. Fills blanks only, for review. Needs `ANTHROPIC_API_KEY`; without it,
    returns catalog codes + slug only.
  - **Vendors** checklist (existing tests only): attach/detach offerings from the test side via
    `/api/v1/admin/tests/[id]/vendors`; attaching a catalog vendor auto-scrapes the price inline.
- **Categories** — dedicated CRUD (add / rename / reorder / delete). **Delete is blocked if it would
  orphan a test**; otherwise the display pointer of affected tests is auto-reassigned.
- **Vendors** — list (sortable incl. by trust) + **Add Vendor**; editor has: details, **Trust
  Override + Scraper Health panel**, **Scraper Configuration** (engine/base URL/selectors/schedule +
  a **Catalog mode** toggle & catalog path for catalog-scraper vendors like GoodLabs),
  **Catalog** (link/unlink tests + product URL + price), and **Scrape now**.
- **Offerings** — read-only, filterable overview of every test↔vendor price link; vendor names link
  to the vendor editor. (Links are *managed* per-vendor in the Catalog.)
- **Change Queue** — review staged price changes (Approve/Reject); has an in-UI workflow explainer.
- **Settings** — grouped controls: scraping schedule/timeout, **auto-approval thresholds**, feature
  flags. The worker reads thresholds from here.
- **Users** — list + role management.

### Scrape pipeline (`apps/worker`, `@labprice/scrapers`)
- Queues (BullMQ, hyphenated names): `scrape-schedule` → `scrape-execute` → `scrape-publish`, plus
  `scrape-discover` for catalog-mode vendors.
- Two scrape strategies:
  - **Per-URL** (`scrape-execute.ts`): each offering stores a product `externalUrl`; the engine fetches
    it and reads the price via the vendor's CSS selectors. Original path; for vendors with stable
    per-test URLs.
  - **Catalog discovery** (`scrape-discover.ts` → `apps/worker/src/discovery.ts` →
    `@labprice/scrapers` `catalog/*`): for vendors that publish a whole catalog instead of per-test
    URLs (**GoodLabs**). See the dedicated recipe below.
- **Auto-approval** (shared rules): first price, or a drop/rise within the Settings thresholds,
  auto-approves; **LOW-trust vendors always route to the Change Queue**; HIGH trust gets 1.5×
  thresholds. Approve → publish writes the live price + price history.
- **Vendor trust** (`packages/database/src/vendor-trust.ts`): success rate + freshness + reject rate
  → LOW/MEDIUM/HIGH; `Vendor.trustOverride` pins it manually. (Trust is resolved *before* a run is
  created, so a brand-new vendor's first run doesn't self-drag to LOW.)

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

### Category model (many-to-many, no "primary")
- Membership lives in `TestCategory`. `Test.categoryId` is a **derived display pointer** (lowest
  `displayOrder` in the set) — never user-selected. Server sets it on every save.
- Tests require ≥1 category (validated client + server). Category delete blocks on would-be orphans.
- Public reads: cards/breadcrumbs use the display pointer; category pages & the homepage filter use
  the full m2m set.

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
    `api.dirtcheaplabs.com/api/catalog/alacarte?lab=…` and takes the cheaper lab (`mergeCodeTiers`).
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
  - `personalabs` — WooCommerce store, plain HTTP, paginated (`/products/all-test/`, 27+ pages). Each
    product is labelled with its ONE fulfilling lab directly in the markup
    (`provider-cart-button labcorp`), so it uses **strict per-lab tiers** (no `codeMatchAnyProvider`) —
    the labProvider is read off the page, not guessed. **Panel detection**: a single test's order code
    lives in exactly one hidden `.hidden_test_code` div; a bundle carries one per constituent test, so
    `isPanel = codes.length > 1`.
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
    in the 11-vendor research queue — see `STATE.md` for the full list and status.
  - E2E runners: `apps/worker/scripts/discover-{ownyourlabs,dirtcheaplabs,mitohealth,walkinlab,personalabs,healthlabs,privatemdlabs,requestatest,directlabs,discountedlabs,truehealthlabs,questhealth,labcorpondemand}.ts`.
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
  deep-import into Next.js, so only worker-side callers pass `browserFetchHtml()` explicitly via
  `runVendorDiscovery({..., fetchHtml: browserFetchHtml()})`. **This means inline "Scrape now" in the web
  admin doesn't work for these vendors yet** — that route always uses the plain-HTTP default. Mark such
  a vendor `needsBrowser: true` in `ADAPTER_DEFAULTS` (documentation-only flag, not auto-consumed).
  Not every WAF is passable this way — Ulta Lab Tests escalates to an actual image CAPTCHA even with
  this, which is a different, unsolved problem (see `STATE.md`).
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
  all reused — only the site-specific parsing is new.

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
