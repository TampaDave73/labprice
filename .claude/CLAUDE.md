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
11. **`Test.confidence` gates scraper auto-approval independently of vendor trust.** There are TWO
    separate `shouldAutoApprove()` implementations — `packages/scrapers/src/catalog/persist.ts` (the
    catalog-discovery path: web-app inline scrape + `scrape-discover` worker) and
    `apps/worker/src/workers/scrape-execute.ts` (the per-URL path) — each with its own
    `confidence === 'LOW'` short-circuit alongside its own trust-`LOW` check. A `LOW`-confidence test
    (sparsely-verified code from the 2026-07-27 master import) never auto-publishes a scraped price even
    from a HIGH-trust vendor, because a cheap/reliable scrape can still be a wrong-test match on shaky
    source data. If you change this gate, change it in **both** files — they are not shared code today
    (flagged as a follow-up: extract one shared function instead of two parallel implementations).
    Relatedly: **`TestCode` (the
    `test_codes` table/model in `schema.prisma`) is confirmed dead code** — zero readers or writers
    anywhere in the app, worker, or scripts. `Test.questCode`/`Test.labcorpCode` are the sole canonical
    code fields; don't resurrect `TestCode` without re-checking this note first. Also: **`Category.isPrimary`**
    (added with the master import, 21-category taxonomy) drives the homepage's primary/secondary filter
    split (`CategoryFilters.tsx`) — it's a real column, not a hardcoded category-name list, so a newly
    added category defaults to secondary (`isPrimary=false`) unless set otherwise.
12. **`Offering.isActive`/`deletedAt` never auto-follow `Vendor.isActive`/`deletedAt`.** They're
    independent columns, so removing a vendor from the admin panel (uncheck Active, or Delete) used to
    leave its offerings live — dead prices kept showing on search/category/homepage/test-detail/trends
    (fixed 2026-08-20: every public offerings query now also filters `vendor: { isActive: true,
    deletedAt: null }`, and the admin vendor `PATCH`/`DELETE` routes cascade the deactivation/soft-delete
    to offerings). If you add a new query that reads `offerings` with a raw `where`, add the vendor
    filter too — it won't come for free. Same lesson bit the Add-Test auto-fill: `code-lookup.ts`
    (catalog code matching) fetched Dirt Cheap Labs' live site regardless of our own vendor status, so a
    since-out-of-business vendor's stale site kept "confidently" matching codes; it's now gated on the
    `dirt-cheap-labs` `Vendor` row being active in our DB first.
13. **A new catalog adapter isn't usable in production until the code deploys.** `getAdapter()` falls
    back to **GoodLabs** for an unknown adapter name (`ADAPTERS[name] || goodlabsAdapter`), so creating
    a `Vendor` + `ScrapeConfig` naming an adapter the deployed build doesn't have yet, then hitting
    "Scrape now", silently crawls **goodlabs.com** and attaches its products to the wrong vendor. Ship
    the code first, confirm the adapter appears in the `/admin/vendors/[id]` dropdown, *then* create the
    vendor row. (The dropdown is no longer hand-written: it renders `CATALOG_ADAPTERS` from
    `@labprice/shared/src/constants/catalog-adapters`, and `packages/scrapers/src/__tests__/adapters.test.ts`
    fails the build if that list and `CANONICAL_ADAPTERS` drift apart. A new adapter still needs adding in
    **both** places — the registry and that list — the test just tells you when you forgot.)
    **"Scrape now" can't bootstrap a brand-new vendor
    either**: `api/v1/admin/vendors/[id]/scrape` returns 400 `no_offerings` and bails *before* running
    discovery when the vendor has no linked tests — so a fresh catalog vendor needs its offerings
    seeded first, via `apps/worker/scripts/discover-<vendor>.ts` (the established pattern) or by
    linking one test by hand. `runVendorDiscovery` itself is fine with zero offerings for `fetchAll`
    adapters (they skip name-narrowing and always return the whole catalog).
14. **A vendor with no lab codes can't be safely bulk-auto-linked.** The pricing **name tier** is a
    loose token-subset match; without a Quest/LabCorp code to corroborate it, it produces confidently
    wrong prices — measured on AlgoRx: "Deamidated Gliadin Peptide Ab" → "C-Peptide", and with
    `flagAmbiguous:false` also "Vitamin D, 25-Hydroxy" → "Vitamin B12" and "Arsenic Blood Test" →
    "Phosphate". Turning ambiguity-flagging off to avoid a big Change Queue is a trap: it converts
    "needs review" into "silently published". For a codeless vendor, run discovery **ingest-only**
    (no offerings — see `scripts/discover-algorx.ts`) and promote real matches in `/admin/discovered`,
    which pins a product URL so later scrapes price it via `priceFromPinnedUrl` regardless of the name
    tier. The **strict ingest matcher** (exact code/alias) is a different, trustworthy thing — don't
    confuse the two. Related process note: when judging a new vendor's match quality, **print the
    actual matches and read them**; grepping for bad patterns you already know about only confirms
    what you went looking for (that mistake is how the AlgoRx wrong matches were nearly shipped).
15. **Catalog is now a curated 30-test core list (2026-09-07 reset), and pre-linking is abandoned.**
    `runVendorDiscovery` **never creates offerings** — it only prices offerings that already exist and
    ingests everything it crawls into `VendorProduct`; `autolist-code-matches.ts` is what turns exact
    Quest/LabCorp code matches into real offerings (name/alias matches wait in `/admin/discovered`'s
    Matched tab for human review — see gotcha 14, same reasoning). **Pre-linking every vendor to every
    test is abandoned — do not run `link-all-tests-all-vendors.ts` again.** An `Offering` now means the
    vendor genuinely sells that test, not "we haven't priced this pair yet." `discovered-actions.ts`
    and `ga4-data.ts` now live in packages (`@labprice/scrapers/src/catalog/discovered-actions`,
    `@labprice/shared/src/ga4`) and are re-exported from `apps/web/lib` — edit them there, not as
    web-only files. **Never run `db:push` against production** — prod carries schema drift (the
    `search_vector` generated column + its indexes, `users.email`) that `db:push --accept-data-loss`
    would destroy; use `prisma migrate diff` and apply only the additive statements via
    `prisma db execute`. And: any inline `npx tsx -e "..."` one-liner needs `-r dotenv/config` (form:
    `npx tsx -r dotenv/config -e "..."`) or `DOTENV_CONFIG_PATH` is ignored and Prisma throws a
    "Validation Error" — the committed scripts don't need this since they `import 'dotenv/config'`
    themselves.

16. **A crawl failure message is only as good as the boundary that produced it.** The 0-products guard in
    `runVendorDiscovery` fires for any empty catalog — a real block, a stale selector, or a
    forced-and-failing browser path. It used to call all of them "likely blocked (WAF/challenge page)",
    a pure guess; since 2026-09-10 it reports what it observed instead (empty *listing* vs. a listing that
    parsed fine while every *detail* page failed, plus the first few underlying errors — `discover()`
    returns `detailsAttempted`/`detailErrors` for this), and `browserFetchHtml` throws a named error with
    the HTTP status and page title when a WAF interstitial never clears rather than returning the
    challenge markup as content. **Don't re-widen either back into a guess.** Three vendors were written off as blocked in
    one day and none of them were: Private MD Labs was a regex pinning single spaces between HTML
    attributes, `truehealthlabs` was a stale `needsBrowser` flag whose WAF block had lifted, and one
    was a missing UI spinner. Diagnose by instrumenting the boundaries separately — raw fetch bytes,
    then `parseCatalog` on that same body — before believing the message. Adapter fixtures freeze the
    markup captured on the day they were written, so **the test suite stays green while production
    silently breaks**; a passing suite is not evidence the parser still matches the live site. To test
    whether a WAF really blocks production (as opposed to your machine), run the fetch from inside the
    container: `railway ssh --service scrape-worker "node -e \"fetch(url).then(...)\""`.
17. **A pinned `Offering.externalUrl` overrides the panel exclusion; automatic matching still doesn't.**
    `priceFromPinnedUrl` passes `includePanels: true` (2026-09-08). Panels are excluded automatically so
    a single test is never priced from a bundle it merely appears inside — but several of our own tests
    (CBC, CMP, Lipid Panel) ARE panels, and vendors name them so. The trade-off: pinning a genuine
    multi-test bundle now prices the test at the bundle's price with no warning. Also note **linking a
    test no longer prices it inline** — discovery fetches the whole catalog listing regardless of how
    many offerings it prices, so pricing is batched behind "Scrape now" instead of run per-add.

18. **Conditional rendering deletes content from the HTML — that's an SEO/AEO bug, not just a UI
    choice.** `{isOpen && <div>…</div>}` in a collapsed disclosure means the text never reaches the
    document; Next SSRs client components, so whatever is mounted at initial state IS in the source and
    whatever isn't, isn't. This is exactly how the test page's prep instructions and reference ranges
    stayed invisible to every crawler for months (fixed 2026-09-09: always mount, toggle with
    `[hidden]`). Same page, same sweep: section titles are `<h2>`s phrased as questions built from the
    test name, and the price comparison is a real `<table>` (caption + `scope="col"`/`scope="row"`) —
    don't regress either back to `<span>`s or a `<div>` grid. Public JSON-LD lives in
    **two places**: `app/layout.tsx` (`Organization` + `WebSite`) and `app/test/[slug]/page.tsx`
    (`MedicalTest` + `Product` + `BreadcrumbList` as a `@graph`). Prices belong on the **Product** node
    — schema.org defines `offers` on Product/Service, not on MedicalTest — and every public route sets
    its own `alternates.canonical`. `SKILLS.md` → "SEO / AEO surface" has the full list.

19. **The blog's content pipeline has two rules worth not breaking.** `Post.body` is stored as
    markup and rendered by `BlogBody.tsx` — never HTML, so an admin-authored post can't inject tags,
    and inline links are restricted to same-site paths. **`inline()` recurses**, and must keep doing
    so: the `INLINE` split is alternation, so the outer construct always wins and anything inside it
    never reaches the split. `**[LH](/test/luteinizing-hormone)**` matched the bold alternative whole
    and printed its own markup as text — fourteen literal `[label](/path)` strings in one published
    article. An earlier version patched only price-tokens-inside-bold; the general answer is to
    re-enter `inline()` on bold contents and on link labels, which terminates because each level
    strips its own delimiters. And `Post.faq` is the single source for both
    the visible FAQ section and the `FAQPage` JSON-LD: emitting FAQ structured data for questions
    that aren't rendered is what gets rich results pulled, so don't split them. Articles are seeded
    and edited in bulk by `apps/worker/scripts/seed-blog.ts` (upsert by slug — re-running it is the
    edit path, not a duplicate-maker). One-off scripts live in `apps/worker/scripts` because that is
    the only workspace with both `tsx` and `dotenv`; run them as
    `DOTENV_CONFIG_PATH=<repo>/.env pnpm --filter @labprice/worker exec tsx scripts/<name>.ts`, and
    on production as `railway ssh --service scrape-worker "pnpm --filter @labprice/worker exec tsx
    scripts/<name>.ts"` (the prod `DATABASE_URL` is `postgres.railway.internal`, so it is only
    reachable from inside a Railway service — not from your machine).

20. **Public pages must follow the `seo-aeo` skill** (`.claude/skills/seo-aeo/SKILL.md`). Invoke it
    before adding or changing any public route, template, metadata block, JSON-LD, or article copy —
    it carries the canonical/OG/schema/heading/table/image/linking rules the site has been audited
    against, and the specific traps that have already cost us once each (an `openGraph` override
    silently dropping `og:image`; a single-backslash `'\u003c'` making a JSON-LD escape a no-op;
    `{{isOpen && …}}` deleting content from the served HTML). It also lists the two audit findings
    NOT worth chasing here.

21. **`www.labtestcompare.com` has no DNS record** — the apex is the only hostname that resolves, and
    Railway holds a single custom domain (`CNAME @`). Anyone typing `www.` gets a connection error,
    not a redirect, and a Search Console property on the www hostname can fetch nothing at all
    (that is the likeliest reason a sitemap submission reports "couldn't fetch" — the sitemap itself
    validates clean). Fixing it needs two steps: a `www` CNAME at the registrar plus the domain added
    in Railway. `middleware.ts` already 301s `www.*` to the apex, so the moment DNS exists it
    canonicalises instead of serving a duplicate site.

22. **Two metadata settings in `next.config.ts` are load-bearing SEO, not preferences.**
    `htmlLimitedBots: /.*/` disables Next's streaming metadata for every user agent, so
    `generateMetadata` output lands in `<head>` before the first byte instead of streaming into
    `<body>` to be hoisted client-side. Turning it back on immediately reproduces two audit findings:
    "11 `<meta>` tags inside `<body>`" and "viewport meta tag is missing" (scored HIGH against
    mobile-first indexing). Separately, the OG card is a **route handler** at
    `app/opengraph-image.png/route.tsx`, not Next's `opengraph-image` file convention — the
    convention serves it at the extensionless `/opengraph-image`, which validators reject as not an
    image. Because of that, nothing is auto-injected: every route that declares `openGraph` must
    pass `images: [OG_IMAGE]` from `lib/og.ts` or it ships with no social card at all.
    Related trap: **`unstable_cache` in shared chrome must not cache a failure.** Production builds
    run with no `DATABASE_URL`, so a count read at build time returns its fallback and then sticks
    for the whole revalidate window — `lib/site-stats.ts` re-reads live when the cached value is an
    impossible zero.

23. **A `loading.tsx` anywhere above a route makes that route unable to return 404.** The file wraps
    its segment in a Suspense boundary, so Next flushes the response shell — status line included —
    before the page renders; a later `notFound()` can only swap the UI, not the status. A root
    `app/loading.tsx` did this to **every** dynamic route on the site: `/blog/<anything>`,
    `/test/<anything>` and `/category/<anything>` all answered **HTTP 200** with a 404 body, which is
    the textbook soft 404 (Google indexes or de-ranks the URL rather than dropping it, and the crawl
    budget goes to pages that don't exist). Fixed 2026-09-10 by deleting the root and
    `test/[slug]` loading files. **`app/search/loading.tsx` is the only one left, deliberately** — it
    is `noindex`, `Disallow`ed, never calls `notFound()`, and runs the slowest query on the site. The
    rule for a new one: *if the segment can 404, it cannot have a `loading.tsx`.*
    Known and unfixable today: for a `notFound()` miss (as opposed to a URL matching no route at
    all), Next renders `not-found.tsx` through a **client** boundary, so the markup ships in the RSC
    payload and paints on hydration instead of being server-rendered. The status code is right, which
    is what governs indexing, and a browser shows the page — but `curl` sees an empty body. Don't
    "fix" it by reintroducing a loading boundary.

24. **`ScrapeVendorConfig.frequencyDays = 0` ("Manual only") is not a preference — it means the cloud
    physically can't scrape this vendor.** It's set for vendors whose WAF blocks Railway's datacenter IP,
    which are scraped from a residential connection instead (`scripts/scrape-vendor-local.ts`, or the
    `scrape-blocked-vendors.ps1` wrapper; that script's default vendor set IS `frequencyDays: 0`). So
    **every cloud-side path that enumerates vendors to scrape must filter `frequencyDays > 0`** — the daily
    scheduler and the weekly digest always did, but `vendors/scrape-all` didn't until 2026-09-10, and each
    click therefore bought a guaranteed FAILED `ScrapeRun` for those vendors. That's not just noise: a
    failed run counts against computed vendor trust (gotcha 6), so the bulk button was walking the
    blocked vendors toward LOW trust and forcing manual review of their genuinely-fine prices.
    Currently `frequencyDays: 0`: **request-a-test** (verified still blocked 2026-09-10 from inside the
    container — 403 on plain HTTP, unclearable `cf_chl` interstitial in stealth Chromium) and
    **true-health-labs** (which *did* succeed from Railway in that same run, so its flag looks stale —
    worth re-testing before leaving it off the schedule).

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
