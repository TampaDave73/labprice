# LabTestCompare — Working State

> Point-in-time snapshot for resuming work. Living source-of-truth docs remain
> `.claude/CLAUDE.md` (conventions/gotchas), `SKILLS.md` (features/workflows), `CHANGELOG.md` (history).
> Last updated: 2026-07-03. Branch: `claude/github-write-access-3v9dld` @ `f9614e3` + uncommitted
> Walk-In Lab scraper work (not yet committed/pushed — pending user confirmation, see Next #0).
>
> **New chat? Start here:** read this file, then `.claude/CLAUDE.md` + `SKILLS.md`. Most recent work is
> the **new-vendor scraper queue** (Next #0) — Walk-In Lab (5th scraper) just built + verified live,
> waiting on user confirmation before starting Personalabs (#3).

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

### Fourth scraper — MitoHealth + member pricing (DONE)
- `mitohealth.com` ($9/mo membership). Its /shop catalog is an à-la-carte set loaded from a tRPC API
  (`marketplace.catalog.search`, paginated) with per-provider member + non-member prices; no lab codes
  → name-matched. New `mitohealth` API adapter. **Member-price model built**: `Offering.memberPrice` +
  `Vendor.membershipNote` (schema change, pushed); we rank on the non-member price and show the member
  price inline on the test page ("$5.85 for members ($9/mo membership)"), not a tooltip. Verified live:
  600 products, 8 seed tests matched with both prices. 62 unit tests total.

### Add Test auto-fill + inline vendor multiselect (DONE — this session, commits `1f425ab`/`82c208e`/`f9614e3`)
Everything is done from the test editor (`apps/web/app/admin/tests/[id]/page.tsx`):
- **✨ Auto-fill** button next to the name → `POST /api/v1/admin/tests/lookup`
  (`apps/web/app/api/v1/admin/tests/lookup/route.ts`). Populates, for review, **short name, slug,
  categories, description/purpose/procedure/preparation/normalRange, Quest/LabCorp codes**. Fills
  **blank fields only** (categories only when none selected) — never clobbers admin edits.
  - **Codes = catalogs first, AI fallback.** `packages/scrapers/src/catalog/code-lookup.ts` matches
    the name against the **Dirt Cheap Labs** catalog and trusts codes ONLY on a **same-significant-name**
    match (`nameTokens` equal; qualifiers like serum/panel are stopwords so "Ferritin, Serum" still
    matches "Ferritin"). This deliberately rejects combos/panels ("Testosterone, Free and Total",
    "Vitamin B12 and Folate", "Iron, TIBC and Ferritin Panel") whose codes belong to a *different* test.
  - **Content + gaps = Claude** (`apps/web/lib/ai/test-lookup.ts`, `claude-opus-4-8`, adaptive thinking,
    structured outputs). Writes short name + the 5 content fields, picks best-fitting **existing**
    categories (never invents), and supplies the standard order code when it knows it. AI-supplied codes
    are flagged **"verify against the lab before saving"** in the returned `notes`.
  - **Slug** derived deterministically from the name (in the route).
  - Degrades gracefully with no key: returns catalog codes + slug only, with a note.
  - Live-verified with a real key: Ferritin Q457/LC004598, HbA1c Q496/LC001453, Folate Q466/LC002014,
    Testosterone Total Q873/LC004226 (AI — catalog correctly rejected the combo), CBC Q6399/LC005009.
- **Vendors checklist** on the editor (existing tests only) → `GET/POST/DELETE
  /api/v1/admin/tests/[id]/vendors`. Attach/detach offerings from the test side; attaching a
  catalog-mode vendor runs discovery **inline** so the price appears immediately (mirrors the
  vendor-side offerings route). New tests show "Save first, then attach vendors."
- New dep: **`@anthropic-ai/sdk`** in `apps/web`. Requires **`ANTHROPIC_API_KEY` in root `.env`**
  (see gotchas — dev loads env via `dotenv -e ../../.env`, so **restart `pnpm dev` after adding it**).

### Fifth scraper — Walk-In Lab (DONE)
- `walkinlab.com`, a custom server-rendered store (plain HTTP, no bot wall) with a **paginated**
  catalog: `/categories/view/all-products?page=N` across 40+ pages (~1,238 products). Added generic
  pagination to the shared crawler (`CatalogAdapter.nextCatalogPage`, optional — single-page adapters
  unaffected); `fetchCatalogEntries` now follows it with a 100-page safety cap.
- New `walkinlab` adapter (`catalog/walkinlab-parser.ts`). A product page exposes **both** lab order
  codes together ("Test Code(s): 001453, 496" — LabCorp + Quest), so it matches like Own Your Labs
  (`codeMatchAnyProvider`) rather than needing to know which code is which.
- **Panel detection**: no explicit bundle flag like GoodLabs, but the page's own "CPT Code(s)" field
  reads a real code for a single test (e.g. "83036") and literally **"See Individual Tests"** for a
  multi-test bundle (verified live on the CBC+CMP-14 combo) — a reliable vendor-supplied `isPanel`
  signal. Bundles also get their own distinct test code(s), never reusing a constituent's own code, so
  they're doubly unlikely to false-positive match a single test even without the CPT-text check.
- 12 new unit tests over real fixtures (86 total). Verified live end-to-end (real DB): 9/11 seed tests
  matched + auto-published, 1 correctly flagged **ambiguous** (PSA — 3 distinct price tiers), 1
  **unmatched** (HbA1c — our test name "HbA1c (Hemoglobin A1c)" tokenizes to `hba1c` as one token while
  the vendor writes "Hemoglobin (Hb) A1c" as three separate tokens, so the narrowing pre-filter never
  selected its product page for a code-check; confirmed via unit test that the adapter parses it
  correctly once fetched — a known, documented narrowing tradeoff, not an adapter bug). Confirmed
  visible in the admin Vendors list (screenshot taken).
- Added `apps/worker/scripts/dev-admin-session.ts`: prints a ready `authjs.session-token` for the seed
  admin — no login provider is configured locally, so this is now the fast path for verifying any
  admin-gated page in the preview browser (used to confirm this vendor showed up in the UI).
- Ulta Lab Tests (originally #1 in the queue below) was attempted first and **deferred**: it sits
  behind AWS WAF Bot Control, which escalates a plain fetch AND a stealth-patched headless Playwright
  browser to an actual image CAPTCHA (`captcha.awswaf.com`) — needs a paid solving service + proxies to
  pursue, a real cost/ToS-risk decision, not a quick adapter fix. User chose to skip and revisit later.

### Current live DB state
- **5 vendors**: **Good Labs** (goodlabs), **Own Your Labs** (ownyourlabs), **Dirt Cheap Labs**
  (dirtcheaplabs), **Mito Health** (mitohealth, member pricing), **Walk-In Lab** (walkinlab, paginated
  catalog). Each independently scrapeable.

---

## ⏭️ Next

### 0. New scraper vendors — queued, building one at a time (started 2026-07-03)
Web-research pass (order-code marketplaces only — buy online, walk into a Quest/LabCorp/BioReference
draw site, matching our 4 existing vendors' model; at-home kit brands excluded by decision) prioritized
by confirmed public affiliate program. Build order below: each vendor gets an adapter (`@labprice/scrapers`
`catalog/adapters.ts`) + unit tests over real fixtures + a live discovery verification, then **wait for
user confirmation** before starting the next one. Tracked via TaskCreate/TaskList this session (task IDs
#1–#11, same order as below).

1. ~~**Ulta Lab Tests** (ultalabtests.com)~~ — **DEFERRED**: AWS WAF Bot Control escalates to an image
   CAPTCHA; needs a paid solving service + proxies. Revisit if/when that's worth building.
2. **Walk-In Lab** (walkinlab.com) — Quest+LabCorp, ShareASale affiliate, 45-day cookie. **DONE** (see
   "Fifth scraper" above). ← **waiting on user confirmation before starting #3**
3. **Personalabs** (personalabs.com) — LabCorp-primary, Awin/Commission Junction affiliate 10–15%.
4. **HealthLabs.com** (healthlabs.com) — multi-lab (4,500+ draw sites), CJ/Conversant affiliate 30%.
5. **Private MD Labs** (privatemdlabs.com) — Quest+LabCorp, in-house "ambassador" affiliate 10%.
6. **Request A Test** (requestatest.com) — Quest+LabCorp, in-house affiliate portal.
7. **DirectLabs** (directlabs.com) — Quest+LabCorp+others, in-house affiliate (est. ~2003, oldest DTC reseller).
8. **Discounted Labs** (discountedlabs.com) — Quest-primary, in-house (Amasty/Magento-family) affiliate.
9. **True Health Labs** (truehealthlabs.com) — Quest+LabCorp+specialty labs, in-house + "LabShop" white-label affiliate.
10. **Quest Health** (questhealth.com) — Quest only, official first-party store, Impact affiliate network.
11. **LabCorp OnDemand** (ondemand.labcorp.com) — LabCorp only, official first-party store, Impact affiliate, 12%.

Gotcha: the *original research pass* only WebFetch'd Ulta, Request A Test, DirectLabs, and True Health
Labs and got 403s on all four (Ulta's is confirmed AWS WAF CAPTCHA — see above; the other three weren't
re-checked). Walk-In Lab was never WebFetch'd in that pass but turned out to load fine with a plain
`curl` + browser UA (no bot wall at all) — so don't assume the other three are CAPTCHA-gated like Ulta;
each needs its own quick `curl -A "<browser UA>"` probe before investing adapter-building effort.

### 1. Save / Price Alert (public test page) — **ON HOLD**
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
  `git -c http.version=HTTP/1.1 push`. (Also in auto-memory.) Git Credential Manager can also stall a
  push waiting on an auth popup; pushing in the background and retrying usually clears it.
- **`ANTHROPIC_API_KEY` for auto-fill** lives in root `.env` (gitignored — never commit it). The web
  dev script is `dotenv -e ../../.env -- next dev`, so it reads the key **only at boot** — after adding
  or changing the key you MUST restart `pnpm dev`, or auto-fill reports "No ANTHROPIC_API_KEY
  configured". A key was added this session; **it was pasted in chat, so rotate it** in the Anthropic
  console when convenient.
- **Worker has pre-existing type errors** (ioredis dual-version in `queues.ts`; `publisher.ts` uses
  stale snake_case models). Runs fine via `tsx`; not regressions — don't "fix" unless touching them.
- **Prisma client regen locks on Windows** — stop dev servers before `prisma generate` (EPERM).
- Save/Price Alert are blocked on the missing customer-auth flow (see Next #2).

## ▶️ How to run / verify
```bash
pnpm docker:dev                                  # Postgres + Redis
pnpm --filter @labprice/database db:push         # sync schema if needed
pnpm dev                                          # web on :3000 (currently running in background)
# Auto-fill: Admin → Tests → Add Test → type a name → "✨ Auto-fill" (needs ANTHROPIC_API_KEY + restart)
# Vendors on a test: Admin → Tests → open an existing test → Vendors checklist (attach = inline scrape)
# Scrape a catalog vendor: Admin → Vendors → Good Labs → "Scrape now" (inline, no worker needed)
pnpm --filter @labprice/scrapers test            # scraper unit tests
cd apps/web && npx tsc --noEmit                  # web typecheck (must stay clean)
# Walk-In Lab live discovery (needs docker:dev up):
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/discover-walkinlab.ts
# Get an admin session token for the preview browser (no login provider configured locally):
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/dev-admin-session.ts
```

## ✅ Verified this session / ⏳ not yet
- **Verified live** (real key, live catalog): catalog code-lookup accuracy across 17 names, AI content +
  short name + category picks + relaxed codes for Folate/Testosterone/CBC. Endpoints compile + enforce
  admin auth (403 unauth'd). Web `tsc --noEmit` clean.
- **Not yet exercised end-to-end**: the browser Auto-fill round-trip through the admin UI (needs a logged-in
  admin session), and the vendor attach/auto-scrape from the test page (needs DB up + admin login). Logic
  mirrors the proven vendor-side offerings route; worth a manual click-through to confirm.
- **Walk-In Lab (this session)**: 86 unit tests pass, web `tsc --noEmit` clean, live end-to-end discovery
  against real Postgres (9 matched + published, 1 ambiguous, 1 unmatched — see "Fifth scraper" above),
  and confirmed showing up in the admin Vendors list via a real browser session (screenshot taken).
  **Not yet committed/pushed** — holding for user confirmation per their "confirm it works, then move to
  #2" instruction.
