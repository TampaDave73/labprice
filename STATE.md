# LabTestCompare — Working State

> Point-in-time snapshot for resuming work. Living source-of-truth docs remain
> `.claude/CLAUDE.md` (conventions/gotchas), `SKILLS.md` (features/workflows), `CHANGELOG.md` (history).
> Last updated: 2026-07-02. Branch: `claude/github-write-access-3v9dld` @ `e85a6fa` (pushed, in sync).

---

## ✅ Done

### First live scraper — GoodLabs (catalog discovery)
- New **catalog-scrape strategy** for vendors that publish a whole catalog instead of per-test URLs.
  All plain HTTP (no browser, no CSS selectors): catalog page JSON-LD `ItemList` → each `/tests/<slug>`
  page's Next.js flight data → one entry per fulfilling lab (quest/labcorp/bioreference) with
  `labTestIDs` (code), `price`, and an explicit `isPanel` flag.
- **Matching** (`packages/scrapers/src/catalog/matcher.ts`): Quest code → LabCorp code → name (first
  tier wins). Panels (`isPanel`) excluded. >1 surviving price ⇒ **ambiguous → Change Queue** (never
  guessed). Verified live: Ferritin/CMP/CBC/HbA1c/Vitamin D by Quest code, Lipid by LabCorp code,
  Testosterone flagged ambiguous, TSH/PSA unmatched (panel-only).
- **Persistence** now lives in `@labprice/scrapers` (`catalog/persist.ts` → `runVendorDiscovery` +
  `publishStagedChange`) so BOTH the web app (inline) and the worker use one code path.
- 39 unit tests over real HTML fixtures (`packages/scrapers/src/__tests__/`). Standalone runners:
  `apps/worker/scripts/{run-goodlabs-live,discover-goodlabs,fix-goodlabs-vendor}.ts`.

### Infra / admin / public fixes
- **Worker Redis reconnect storm fixed** — each BullMQ Worker gets a dedicated connection
  (`redisConnection` options, localhost→127.0.0.1). `pnpm dev:worker` runs clean (0 ECONNABORTED).
- **Admin catalog-mode toggle** in Scraper Configuration (persists `selectors.mode='catalog'`).
- **Scrape now / Add test run discovery INLINE in the web app** (no Redis/worker), name-narrowed
  (~2s). Scrape now returns a summary; add-test prices the new offering immediately.
- **Change Queue**: Approve/Reject publish inline in a DB transaction (worker-independent); vendor
  name links to the exact product page to verify the price.
- **Order link** (`/api/v1/go/[offeringId]`): lands on the product page (`externalUrl`) with affiliate
  tracking layered on (`apps/web/lib/affiliate-url.ts` — `{url}` placeholder / query-string / redirector).
- **Discovery stores the matched product URL** on the offering (`externalUrl`).
- Public **breadcrumb category is a link**; admin **catalog price shows `$` + 2 decimals**.
- **Vendors trimmed to Good Labs only** — all other seed vendors + their offerings soft-deleted.

### Second scraper — Own Your Labs (DONE)
- `ownyourlabs.com` (Phoenix/LiveView). Adapter `ownyourlabs`: `/shop` cards → `/test/<UUID>` pages;
  each product page has a single lab **Order Code** (Quest or LabCorp) matched against both our codes
  (`codeMatchAnyProvider`). Catalog scraper refactored to **adapter-based** so this reused the matcher
  + persistence; only the parser is new. 11 new unit tests (50 total). Verified live: 9/9 seed tests
  matched (~12s) with exact product URLs.

### Third scraper — Dirt Cheap Labs (DONE)
- `dirtcheaplabs.com`, an **API vendor**: catalog from `api.dirtcheaplabs.com/api/catalog/alacarte?lab=`.
  Added API-adapter support (`CatalogAdapter.fetchAll`) + `mergeCodeTiers` (cheaper of the two labs).
  Also hardened the matcher: a code hit must share a *distinctive* name token (`sharesStrongToken`),
  fixing wrong/stale-code hits (seed TSH quest 867 → "T4 Total") and generic-word collisions.
  Verified live: 7 matched (CBC $2.88, CMP $3.78, Ferritin $5.99, TSH $6.50, VitD $10.35, …), 4
  legit-ambiguous (Cortisol/Testosterone/Lipid/B12 variants), 1 unmatched (PSA). 57 unit tests total.

### MitoHealth — NOT VIABLE for per-test comparison (see Next)

### Current live DB state
- **3 vendors**: **Good Labs** (`good-labs`, goodlabs) — 3 offerings; **Own Your Labs**
  (`own-your-labs`, ownyourlabs) — 9 offerings; **Dirt Cheap Labs** (`dirt-cheap-labs`, dirtcheaplabs)
  — 12 offerings (7 priced, 4 pending review, 1 unmatched).

---

## ⏭️ Next

### 1. MitoHealth (`mitohealth.com/shop`) — DECISION NEEDED
- **Not viable as-is**: MitoHealth is a $9/mo membership longevity vendor that sells only **3 bundled
  panels** (Mito Essential/Core/Ultra) — no individual à-la-carte tests and no per-test Quest/LabCorp
  codes exposed. Nothing to match our individual tests against. Product pages show member vs regular
  price (e.g. $89.61 member / $125.51 regular).
- **Member-pricing recommendation** (for whenever a membership vendor IS added): store BOTH prices;
  rank/compare by the **non-member** price (apples-to-apples with non-membership vendors); show the
  member price as a small **inline** secondary line ("$125.51 · $89.61 w/ $9/mo membership"), NOT a
  hover tooltip (tooltips don't work on mobile). Needs a nullable `memberPrice` + membership note on
  Offering (schema change) and a public-UI tweak.
- **Options**: (a) skip MitoHealth; (b) add a separate "panel comparison" feature later; (c) revisit
  if they expose an à-la-carte catalog/API.

### 2. Save / Price Alert (public test page) — **ON HOLD**
- These require a **full customer auth flow (sign up / sign in)** — none exists today (only DB-backed
  admin sessions). The buttons are already gated behind `session?.user`, so logged-out visitors don't
  see them; they're effectively dormant for real users.
- **Deferred by decision.** Build public auth (sign up/sign in + account) as its own milestone before
  these features are usable. Until then, leave gated (or hide entirely — TBD). Tackle the Our Own Labs
  scraper first.

### 3. Smaller follow-ups
- Clean up benign `@prisma/client` "can't be external" Turbopack warnings before a prod build.

---

## 🚧 Active blockers / gotchas
- **`git push` hangs over HTTP/2** on this Windows box — always push with
  `git -c http.version=HTTP/1.1 push`. (Also in auto-memory.)
- **Worker has pre-existing type errors** (ioredis dual-version in `queues.ts`; `publisher.ts` uses
  stale snake_case models). Runs fine via `tsx`; not regressions — don't "fix" unless touching them.
- **Prisma client regen locks on Windows** — stop dev servers before `prisma generate` (EPERM).
- Save/Price Alert are blocked on the missing customer-auth flow (see Next #2).

## ▶️ How to run / verify
```bash
pnpm docker:dev                                  # Postgres + Redis (currently up)
pnpm --filter @labprice/database db:push         # sync schema if needed
pnpm dev                                          # web on :3000
# Scrape a catalog vendor: Admin → Vendors → Good Labs → "Scrape now" (inline, no worker needed)
pnpm --filter @labprice/scrapers test            # 39 scraper unit tests
cd apps/web && npx tsc --noEmit                  # web typecheck (must stay clean)
```
