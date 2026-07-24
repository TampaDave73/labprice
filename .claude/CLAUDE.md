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

**Env:** the admin **Add Test → ✨ Auto-fill** feature calls Claude for content generation, so it needs
`ANTHROPIC_API_KEY` in `.env`. It's optional — without the key, auto-fill still returns order codes
from the vendor catalogs (Dirt Cheap Labs) and just skips the generated copy. Similarly, `RESEND_API_KEY`
is optional — without it, admin email alerts on suggestion-form submissions
(`lib/services/notify-service.ts`) just no-op; the DB row (reviewable at `/admin/suggestions`) is
unaffected either way. The **worker** also uses `RESEND_API_KEY`/`EMAIL_FROM` for the weekly scrape
digest + failure alerts (`apps/worker/src/report.ts`) — without the key it logs the email body to the
console instead of sending (expected local behavior).

**Local login:** `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` are empty in dev, so the
magic-link and Google buttons on `/auth/signin` do nothing. To log in locally, use the **Dev sign-in**
box on that page (or `POST /api/dev-login` with an `email`) — it mints a DB session for an existing
user and is hard-gated to `NODE_ENV !== 'production'`. Production login needs those provider creds set.

`GA4_PROPERTY_ID`/`GA4_CLIENT_EMAIL`/`GA4_PRIVATE_KEY` (optional) — a GCP service account with Viewer
access on the GA4 property, powers the GA4 Data API pull into `/admin/analytics` (`lib/ga4-data.ts`).
Separate from `NEXT_PUBLIC_GA_MEASUREMENT_ID` (the client-side tracking tag); without these three, that
section of the page just falls back to a "Open Google Analytics" link-out instead of failing.

## ⚠️ Gotchas that have bitten us (do not relearn the hard way)

1. **Tailwind v4 + arbitrary values are unreliable here.** `text-[oklch(...)]`, `bg-[...]`, `p-[..]`
   and a global `* { padding:0 }` reset silently dropped styles. Public pages use **inline styles**;
   the admin uses the **`.admin-*` design-system classes in `globals.css`** (`.admin-btn`,
   `.admin-card`, `.admin-input`, `.admin-h1/2`). Prefer those over arbitrary-value utilities.
2. **`pnpm dev` is web-only on purpose** — run the worker with `dev:worker`/`dev:all` when you need
   scraping. The old "worker crash-loops on Redis" storm is **fixed**: each BullMQ Worker now gets a
   dedicated connection (pass `redisConnection` *options*, not the shared `connection` instance —
   sharing one ioredis socket across blocking Workers caused a `write ECONNABORTED` storm). See
   `apps/worker/src/redis.ts`. Keeping `pnpm dev` web-only is now just a default, not a workaround.
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
   Resolve trust *before* creating a `ScrapeRun` — the in-progress RUNNING run counts against success
   rate and would force a brand-new vendor to LOW (see `apps/worker/src/discovery.ts`).
7. **Two scrape strategies.** Per-URL (`scrape-execute`; offering stores a product URL) *and* catalog
   discovery for vendors that publish a catalog instead of per-test URLs. Catalog discovery is
   **adapter-based** (`@labprice/scrapers` `catalog/adapters.ts`): the crawler/matcher/persistence
   (`catalog/persist.ts` → `runVendorDiscovery`) are vendor-agnostic; each site's parsing is its own
   module. Live adapters: **GoodLabs** (JSON-LD + flight chunks; `/tests/<slug>`), **Own Your Labs**
   (Phoenix HTML; `/shop` → `/test/<UUID>`, single Order Code vs both codes via `codeMatchAnyProvider`),
   **Dirt Cheap Labs** (API vendor: `CatalogAdapter.fetchAll` pulls both lab catalogs from
   `api.dirtcheaplabs.com`; `mergeCodeTiers` ranks on the cheaper lab as `currentPrice`/`labProvider`,
   and when BOTH labs carry the test, the pricier one is kept as `Offering.altLabPrice`/
   `altLabProvider` — shown as a secondary "also available via X" line, not discarded), and
   **MitoHealth** (API vendor,
   tRPC catalog; $9/mo membership → `Offering.memberPrice`/`Vendor.membershipNote`, ranked on the
   non-member price, no lab codes so name-matched). A vendor is catalog-mode when
   `selectors.mode === 'catalog'`, `selectors.adapter` picks the parser. Runs **inline in the web app**
   ("Scrape now"/add-test) and via the `scrape-discover` worker. Match priority Quest→LabCorp→name;
   panels excluded; a code hit must also share a **distinctive** name token (guards wrong/stale codes);
   >1 surviving price ⇒ ambiguous. Details in `SKILLS.md`.
   **Ingest layer (2026-07-20):** every crawl also upserts EVERYTHING it saw into `VendorProduct`
   (nothing discarded); strict auto-match (exact code/alias only) sets `testId` but **never creates
   offerings** — listing happens in `/admin/discovered` (promote/attach/list), which also **learns
   `TestAlias` rows** that feed both auto-matching and the pricing name tier/narrowing. **Panels stay
   excluded from matching/clustering** (user decision 2026-07-20: no two vendors sell the same panel).
   Tests are editable in bulk via CSV export→edit→import on `/admin/tests` (identity only, no prices;
   dry-run diff before apply).
8. **`git push` hangs over HTTP/2 on this Windows box.** Always push with
   `git -c http.version=HTTP/1.1 push`. Git Credential Manager can also stall a push waiting on an
   auth popup; retrying (or backgrounding the push) usually clears it. Push after every commit unless
   told otherwise.
9. **Public writes go through `lib/rate-limit.ts`.** Any new *unauthenticated* POST (suggestion/report/
   analytics style) must add the honeypot + per-IP `rateLimit()` like the existing ones, and the
   public form should render the hidden `company` honeypot field (see `SuggestionModal`). CSP lives in
   `middleware.ts` — it allows inline styles/scripts (public pages need them); tighten the other
   directives, not those, or the site breaks. It also pre-allows `googletagmanager.com`/
   `google-analytics.com` for the (currently inert) GA4 scaffold — harmless while unconfigured.
10. **Admin client-fetch pages must check `res.ok` before touching `j.data`.** A bare
    `fetch(url).then(r => r.json()).then(j => setX(j.data))` treats an error response
    (`{error:{...}}`) as if it were `{data:{...}}` — either it throws inside the `.then()` (unhandled
    rejection, so whatever `setLoading(false)`/gating `setState` call was supposed to run next never
    does) or a `?? fallback` silently masks it and the gating state just stays at its initial
    `null`/`true`. Either way the page hangs on "Loading..." forever with no error and no retry short
    of a manual reload — happened for real on `tests/[id]` and `vendors/[id]` (2026-07-24 fix swept
    every admin page with this pattern). Follow `analytics/page.tsx`'s pattern: check `res.ok`, throw
    into a `.catch()`, always resolve the loading flag in `.finally()`/`try...finally`, and show a
    retry action on failure — don't add a new bare fetch-then-chain to any admin page.

## Verifying changes

Typecheck the web app before finishing: `cd apps/web && npx tsc --noEmit`. The `apps/worker` package
has pre-existing type errors (ioredis dual-version, `publisher.ts`) and runs via `tsx` — don't treat
those as regressions unless you touched the file. For UI, verify in a browser (preview tools) with the
admin session cookie.

## TODO / deferred

- [x] **First scraper (GoodLabs)** — catalog discovery built + tested end-to-end against the live
      site and real DB (`scripts/discover-goodlabs.ts`): matched by Quest/LabCorp code + name, panels
      excluded, ambiguous flagged, requeue-on-add wired. Runs today via the standalone runners.
- [x] **Fixed the worker's Redis reconnect storm** (dedicated per-Worker connections). The BullMQ
      `scrape-discover`/`scrape-execute` workers now run continuously; admin "Scrape now" + requeue-on-add
      process end-to-end when the worker is running (`pnpm dev:worker`). Verified: enqueue → worker
      crawls GoodLabs → stages, 0 ECONNABORTED.
- [x] **Fixed the `@prisma/client` "can't be external" Turbopack warning** (`pnpm dev`). Root cause:
      classic pnpm-monorepo phantom dependency — `@prisma/client` was only transitive (via
      `@labprice/database`), so Next's default `serverExternalPackages` externalization couldn't
      resolve it from `apps/web`'s own `node_modules`. Fixed by adding `@prisma/client` as a direct
      dependency of `apps/web` (not a `next.config.ts` change — that was tried before and conflicts
      with `transpilePackages` including `@labprice/database`, per the comment there). Verified: warning
      gone from `next dev --turbopack`, `next build` output unchanged.
- [x] Setup/deployment guide — see `docs/08-deployment.md`.
- [x] **Pull GA4's own reports into `/admin/analytics`** (top countries, device breakdown, and the
      custom funnel events wired up 2026-07-21). `lib/ga4-data.ts` calls the GA4 Data API via a GCP
      service account (`labtestcompare-ga4-reader@labtestcompare.iam.gserviceaccount.com`, Viewer on
      property `546489198`); falls back to the old "Open Google Analytics" link-out if the three
      `GA4_*` env vars aren't set or the pull fails. Verified end-to-end against the live property.
