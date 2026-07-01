# LabTestCompare — Project Guide

Blood-test **price comparison** site (brand: **LabTestCompare**, domain: `labtestcompare.com`).
Users search a lab test and compare self-pay prices across ordering services ("vendors");
prices are kept current by scrapers and curated through an admin panel.

> This file is loaded into context every session. Keep it short, current, and true.

---

## 📌 Documentation discipline (READ FIRST, every session)

This project maintains three living docs. **Whenever you change behavior, features, schema, or
conventions, update the relevant doc in the same change** — do not defer:

| Doc | What it holds | Update when… |
|-----|---------------|--------------|
| **CLAUDE.md** (this file) | Conventions, gotchas, how-to-run, structure | a convention/gotcha/command changes |
| **SKILLS.md** (repo root) | Feature catalog + dev workflows/recipes | a feature is added/changed, or a workflow changes |
| **CHANGELOG.md** (repo root) | Dated history of notable changes | any user-visible or notable change (add under `[Unreleased]`) |

A `SessionStart` hook (`.claude/settings.json`) re-surfaces this reminder each session.
If you finish a change without touching these, that's a bug in your process.

## ✍️ Code annotation standard

Write code that explains **why**, not what. Concretely:
- Every non-trivial file gets a short **top-of-file comment** stating its role.
- Every exported function/route/component gets a one-line purpose comment; add a `why` note for any
  non-obvious logic (business rules, workarounds, ordering that matters).
- Call out **gotchas inline** where they bite (e.g. "derived display pointer, not a user choice").
- Match the surrounding comment density; don't narrate obvious code.

---

## Stack & structure (pnpm + Turborepo monorepo)

- **Web** `apps/web` — Next.js 15 (App Router, Turbopack), React 19, TypeScript.
- **Worker** `apps/worker` — BullMQ workers for the scrape pipeline (schedule → execute → publish).
- **Packages**: `@labprice/database` (Prisma client + `vendor-trust.ts`, `settings.ts` helpers),
  `@labprice/scrapers` (engines/configs), `@labprice/shared` (DTOs), `@labprice/ui`.
- **Infra**: PostgreSQL 16 + Redis 7 via `docker compose` (`pnpm docker:dev`).
- Original design docs live in `docs/01..10-*.md` (reference; may lag the code).

> Note: internal package names stay `@labprice/*` and the local DB is named `labprice` — these are
> internal only. The **brand** everywhere user-facing is **LabTestCompare**.

## Running it

```bash
pnpm docker:dev          # start Postgres + Redis
pnpm --filter @labprice/database db:push   # sync schema (or db:seed to reseed)
pnpm dev                 # WEB ONLY on :3000  <- default
pnpm dev:worker          # the scrape worker (only when working on scraping)
pnpm dev:all             # web + worker (turbo dev)
```

## ⚠️ Gotchas that have bitten us (do not relearn the hard way)

1. **Tailwind v4 + arbitrary values are unreliable here.** `text-[oklch(...)]`, `bg-[...]`, `p-[..]`
   and a global `* { padding:0 }` reset silently dropped styles. Public pages use **inline styles**;
   the admin uses the **`.admin-*` design-system classes in `globals.css`** (`.admin-btn`,
   `.admin-card`, `.admin-input`, `.admin-h1/2`). Prefer those over arbitrary-value utilities.
2. **`pnpm dev` is web-only on purpose.** `turbo dev` also ran the worker, which crash-looped on
   Redis and starved Next's compiler ("Jest worker exceeding retry limit"). Use `dev:worker`/`dev:all`
   deliberately. The worker's Redis reconnect storm is a known open issue.
3. **Prisma client regen locks on Windows.** `prisma generate` fails with `EPERM` while any dev
   server holds the query-engine DLL. Stop dev servers -> generate -> restart. **Batch schema
   changes** to minimize this dance.
4. **BullMQ queue names cannot contain `:`.** Use hyphens (`scrape-execute`, not `scrape:execute`).
5. **Categories are many-to-many, with no user-facing "primary".** `Test.categoryId` is an
   **auto-derived display pointer** (lowest `displayOrder` of the selected set); real membership is
   `TestCategory`. A test requires >=1 category. Deleting a category is blocked if it would orphan a
   test. See `SKILLS.md` for the full rule.
6. **Vendor Trust** = auto-computed from scraper health (`packages/database/src/vendor-trust.ts`),
   overridable per vendor (`Vendor.trustOverride`). LOW trust forces manual review of price changes.

## Verifying changes

Typecheck the web app before finishing: `cd apps/web && npx tsc --noEmit`. The `apps/worker` package
has pre-existing type errors (ioredis dual-version, `publisher.ts`) and runs via `tsx` — don't treat
those as regressions unless you touched the file. For UI, verify in a browser (preview tools) with the
admin session cookie.

## TODO / deferred

- [ ] **First scraper**: configs/linking/trust/trigger exist in-admin; running a live scrape and
      fixing the worker's Redis reconnect storm is the next milestone.
- [ ] Clean up the benign `@prisma/client` "can't be external" Turbopack warnings before prod build.
- [x] Setup/deployment guide — see `docs/08-deployment.md`.
