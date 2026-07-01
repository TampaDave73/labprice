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
- Queues (BullMQ, hyphenated names): `scrape-schedule` → `scrape-execute` → `scrape-publish`.
- **Execute** loads the vendor's `ScrapeVendorConfig`, scrapes the price, records a `ScrapeRun`, and
  stages a `StagedPriceChange`.
- **Auto-approval** (`scrape-execute.ts`): first price, or a drop/rise within the Settings thresholds,
  auto-approves; **LOW-trust vendors always route to the Change Queue**; HIGH trust gets 1.5×
  thresholds. Approve → publish writes the live price + price history.
- **Vendor trust** (`packages/database/src/vendor-trust.ts`): success rate + freshness + reject rate
  → LOW/MEDIUM/HIGH; `Vendor.trustOverride` pins it manually.

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
| Scraper engines/configs | `packages/scrapers/src/**` |
| Design-system classes | `apps/web/app/globals.css` |
