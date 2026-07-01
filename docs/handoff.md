# LabTestCompare — Session Handoff

Read this first, then **`.claude/CLAUDE.md`** (conventions + gotchas, auto-loaded),
**`SKILLS.md`** (feature catalog + workflows), and **`CHANGELOG.md`** (full history).
Those three are the living source of truth — keep them current with every change.

## What this is
Blood-test **price comparison** site. Brand **LabTestCompare**, domain **labtestcompare.com**.
Users search a lab test and compare self-pay prices across ordering services ("vendors"); prices are
kept current by scrapers and curated in an admin panel.

- **Stack**: Next.js 15 (App Router, Turbopack) · React 19 · TS · Tailwind v4 · Prisma · Postgres 16 · Redis 7 · BullMQ.
- **Monorepo** (pnpm + Turborepo): `apps/web`, `apps/worker`, `packages/{database,scrapers,shared,ui,config}`.
- **Git**: single trunk `claude/github-write-access-3v9dld`; **always push after committing** (rebase onto origin first if it diverged — the branch also receives automated docs commits).

## Current state (working + verified)
- **Public site**: homepage (search + autocomplete, live vendor/test counts, category filter honoring
  multi-category), test detail (price table, green best-price, 4-section accordion), category pages.
- **Admin** (`/admin`, gated to ADMIN/SUPER_ADMIN): dashboard, Tests (multi-category, ≥1 required),
  Categories (CRUD + orphan-safe delete), Vendors (add, sort, trust override + health, scraper config,
  catalog, "Scrape now"), Offerings overview, Change Queue (+ explainer), Settings, Users.
- **Rebrand + domain** done; **docs** rewritten and self-maintaining (SessionStart hook).
- Typecheck clean for `apps/web`. `apps/worker` has pre-existing type errors (ioredis dual-version,
  `publisher.ts`) and runs via `tsx` — not regressions.

## Next milestone — the first scraper (deferred)
Everything to *configure* a scraper exists in-admin (per-vendor `ScrapeVendorConfig`, test↔vendor
catalog with product URLs, trust, and a "Scrape now" trigger). Remaining:
1. **Fix the worker's Redis reconnect storm** — it crash-loops on `ECONNRESET` (why `pnpm dev` is
   web-only now). Must be stable before running scrapes.
2. Populate a real vendor's selectors + per-test product URLs and run a live scrape end-to-end
   (schedule → execute → stage → Change Queue / publish).
3. Optional: clean up the benign `@prisma/client` "can't be external" Turbopack warnings before prod build.

## How to run
```bash
pnpm docker:dev                                  # Postgres + Redis
pnpm --filter @labprice/database db:push         # sync schema (db:seed to reseed)
pnpm dev                                          # WEB ONLY on :3000 (default)
# pnpm dev:worker / pnpm dev:all when working on scraping
```
**Admin login (dev)**: providers aren't configured locally; sessions are DB-backed. Create a `sessions`
row for `admin@labprice.com` (SUPER_ADMIN) and set the `authjs.session-token` cookie to its value.

## Top gotchas (full list in CLAUDE.md)
1. Tailwind v4 arbitrary values (`text-[oklch(...)]`) silently drop — public pages use **inline styles**,
   admin uses the **`.admin-*`** classes in `globals.css`.
2. `prisma generate` throws `EPERM` on Windows while a dev server holds the engine DLL — stop servers,
   generate, restart. Batch schema changes.
3. BullMQ queue names can't contain `:` (use hyphens).
4. Categories are **many-to-many**; `Test.categoryId` is an auto-derived *display pointer*, not a
   user-chosen "primary". A test needs ≥1 category; deleting a category blocks if it would orphan a test.
