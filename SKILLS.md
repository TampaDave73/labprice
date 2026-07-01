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
- **Categories** — dedicated CRUD (add / rename / reorder / delete). **Delete is blocked if it would
  orphan a test**; otherwise the display pointer of affected tests is auto-reassigned.
- **Vendors** — list (sortable incl. by trust) + **Add Vendor**; editor has: details, **Trust
  Override + Scraper Health panel**, **Scraper Configuration** (engine/base URL/selectors/schedule),
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
create a DB session row and set the `authjs.session-token` cookie (database-backed sessions).

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
- **To onboard another catalog vendor**: add a parser in `packages/scrapers/src/catalog/` (the
  matcher, orchestrator, and worker are vendor-agnostic), set the vendor's `ScrapeVendorConfig`
  selectors to `{ mode: 'catalog', catalogPath, preferredProvider? }`, and link its tests.
- **Note**: running the BullMQ `scrape-discover` worker live still depends on fixing the worker's
  Redis reconnect storm (see CLAUDE.md gotcha #2). The standalone runners above bypass BullMQ and are
  the reliable way to run discovery today.

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
