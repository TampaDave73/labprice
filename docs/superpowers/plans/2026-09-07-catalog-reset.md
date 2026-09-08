# Catalog Reset — 30 Core Community Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unmanageable 278-test catalog with a curated 30-test catalog, re-crawl all 18 live vendors, auto-publish only code-verified prices, and add a weekly traffic topline to the Monday digest.

**Architecture:** Three sequential stages, each a standalone script run against production. (1) A guarded reset script archives affiliate clicks and deletes the catalog tables, then a parameterized master-import reseeds 30 tests. (2) An exhaustive crawl populates `VendorProduct` via the existing strict ingest matcher; a new auto-list script promotes only code-matched products into live offerings, leaving exact-name/alias matches for review in the already-built `/admin/discovered` "Matched" tab. (3) A shared GA4 client plus DB analytics queries render a traffic section into the existing weekly digest email.

**Tech Stack:** TypeScript, Prisma 6 / PostgreSQL 16, BullMQ, Next.js 15, vitest (`packages/*` only — `apps/web` and `apps/worker` have no test runner), `tsx` for scripts, Resend, `@google-analytics/data`.

**Spec:** `docs/superpowers/specs/2026-09-07-catalog-reset-design.md`

## Global Constraints

- **Brand is LabTestCompare.** Internal package names stay `@labprice/*`; the local DB stays `labprice`.
- **Prod DB access:** scripts run from `apps/worker` with `DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/<name>.ts`. Local runs use `../../.env`.
- **Every destructive script is dry-run by default.** `--apply` performs writes. Never invert this.
- **Tailwind v4 arbitrary values are unreliable.** Public pages use inline styles; admin uses `.admin-*` classes from `globals.css`.
- **`git push` must use `git -c http.version=HTTP/1.1 push`.** Push after every commit.
- **Prisma generate locks on Windows** — stop dev servers before `prisma generate`, restart after. Batch schema changes.
- **Typecheck before finishing:** `cd apps/web && npx tsc --noEmit`. Pre-existing `apps/worker` errors (ioredis dual-version, `publisher.ts`) are not regressions.
- **`apps/worker` cannot import from `apps/web`.** Shared logic moves into a `packages/*` package — never copy it.
- **Deep imports are the established convention** (`@labprice/scrapers/src/catalog/matcher`). Do not add server-only dependencies to a package's index barrel.
- **Docs discipline:** CLAUDE.md, SKILLS.md, CHANGELOG.md are updated in the same change as the behavior they describe.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU
  ```

## Key facts discovered while planning (do not re-derive)

- **`runVendorDiscovery` never creates offerings.** It prices *existing* active offerings and separately ingests every crawled product into `VendorProduct`. With zero offerings it still crawls and still ingests. Creating offerings is Task 6's job.
- **`discover()` line 156 is `narrow ? tests : undefined`** — so `exhaustive: true` crawls the whole catalog regardless of how many tests exist. Zero offerings is fine.
- **`/admin/discovered`'s "Matched" tab already means "MATCHED rows with no offering yet"** and its bulk `list` action calls `attachProductsToTest`. The review queue for name matches needs no new code.
- **The strict ingest matcher's `matchedBy` values are:** `quest-code`, `labcorp-code`, `any-code` (all code-based), `exact-name`, `alias` (strict string equality after `normalizeName`), `offering`, `manual`. The loose token-subset matcher only ever writes `suggestedTestId` and can never auto-link.
- **`AffiliateClick.offeringId` is `onDelete: Restrict`** — 5,848 rows block deleting offerings.
- **All 19 vendors are `selectors.mode === 'catalog'`.** `dirt-cheap-labs` is soft-deleted (out of business). 18 are live.
- **`needsBrowser` adapters** (must be passed `browserFetchHtml()`): `personalabs`, `requestatest`, `truehealthlabs`.
- **Measured coverage for the 30 tests:** ~167 offerings from code matches, ~217 including exact-name/alias. Vendors with no lab codes at all: `algorx`, `directlabs`, `mito-health`, `private-md-labs`.

---

## Task 1: Affiliate click archive table

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `AffiliateClickArchive` mapped to `affiliate_click_archive`, accessible as `prisma.affiliateClickArchive`.

Affiliate clicks are the only record of what visitors clicked through to buy. They are `onDelete: Restrict` against `Offering`, so they must be flattened and copied before offerings can be deleted.

- [ ] **Step 1: Add the model**

In `packages/database/prisma/schema.prisma`, immediately after the `AffiliateClick` model, add:

```prisma
/// Flattened snapshot of AffiliateClick rows taken before the 2026-09-07 catalog reset. The
/// originals are FK-bound to Offering (onDelete: Restrict), so they cannot survive a catalog wipe —
/// this keeps the click history as denormalized text (vendor/test names, not ids) with nothing to
/// cascade. Append-only; nothing reads it except ad-hoc analysis.
model AffiliateClickArchive {
  id         BigInt   @id @default(autoincrement())
  vendorSlug String   @map("vendor_slug")
  vendorName String   @map("vendor_name")
  testSlug   String?  @map("test_slug")
  testName   String?  @map("test_name")
  price      Decimal? @db.Decimal(10, 2)
  referrer   String?
  sessionId  String?  @map("session_id")
  clickedAt  DateTime @map("clicked_at")
  archivedAt DateTime @default(now()) @map("archived_at")

  @@index([clickedAt])
  @@index([vendorSlug])
  @@map("affiliate_click_archive")
}
```

- [ ] **Step 2: Stop dev servers, then generate and push the schema**

Prisma's query-engine DLL is locked on Windows while any dev server runs.

```bash
# Stop `pnpm dev` / `pnpm dev:worker` first.
pnpm --filter @labprice/database db:push
```

Expected: "Your database is now in sync with your Prisma schema." and a regenerated client.

- [ ] **Step 3: Verify the model is reachable**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx -e "import('@labprice/database').then(async ({prisma}) => { console.log(await prisma.affiliateClickArchive.count()); await prisma.\$disconnect(); })"
```

Expected: `0`

- [ ] **Step 4: Apply the same schema to production**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx -e "import('@labprice/database').then(async ({prisma}) => { console.log(await prisma.affiliateClickArchive.count()); await prisma.\$disconnect(); })"
```

If this errors with "table does not exist", run the push against production:
```bash
DATABASE_URL="$(grep -o 'postgresql://[^\"]*' .env.scrape-prod)" pnpm --filter @labprice/database db:push
```
Expected after the push: `0`

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "Add affiliate_click_archive table for the catalog reset

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 2: The core-30 catalog data file

**Files:**
- Create: `packages/database/data/2026-09-07-core-30/slugs.json`
- Create: `packages/database/data/2026-09-07-core-30/tests.json` (generated)
- Create: `apps/worker/scripts/build-core-catalog.ts`

**Interfaces:**
- Consumes: `packages/database/data/2026-07-27-master-tests/tests.json` (246 rows, fields: `name, short_name, slug, quest_code, labcorp_code, methodology, lab_variant, cardio_iq, categories, aliases, confidence, third_party_only, is_popular, notes`).
- Produces: `tests.json` — the same row shape, 30 rows, every `is_popular` forced to `"TRUE"`. Consumed by Task 3.

Generating rather than hand-writing keeps provenance traceable and makes widening the catalog a one-line data edit.

- [ ] **Step 1: Write the slug list**

Create `packages/database/data/2026-09-07-core-30/slugs.json`:

```json
[
  "testosterone-total",
  "testosterone-free-calculation",
  "estradiol-ultrasensitive-lc-ms-ms",
  "sex-hormone-binding-globulin",
  "luteinizing-hormone",
  "follicle-stimulating-hormone",
  "prolactin",
  "cortisol-total",
  "dhea-sulfate",
  "igf-1-lc-ms",
  "tsh-thyroid-stimulating-hormone",
  "t3-free",
  "t4-free",
  "complete-blood-count-w-differential-platelets",
  "comprehensive-metabolic-panel-14",
  "lipid-panel",
  "apolipoprotein-b",
  "lipoprotein-a",
  "homocysteine",
  "c-reactive-protein-high-sensitivity",
  "insulin-fasting",
  "hemoglobin-a1c",
  "vitamin-d-25-hydroxy",
  "ferritin",
  "iron-tibc",
  "magnesium-rbc",
  "psa-total",
  "vitamin-b12",
  "uric-acid",
  "thyroid-peroxidase-antibodies"
]
```

- [ ] **Step 2: Write the generator**

Create `apps/worker/scripts/build-core-catalog.ts`:

```ts
// Generates the 30-row core catalog (2026-09-07 reset) by subsetting the 246-row master biomarker
// list to the slugs in slugs.json. Regenerate rather than hand-editing tests.json, so the codes stay
// traceable to the master list — the spreadsheet that drove this catalog explicitly says its own
// codes came from general web search and should not feed live pricing.
//
// Run (from apps/worker):  npx tsx scripts/build-core-catalog.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../../../packages/database/data/2026-09-07-core-30');
const MASTER = join(__dirname, '../../../packages/database/data/2026-07-27-master-tests/tests.json');

type Row = Record<string, string>;

const master = JSON.parse(readFileSync(MASTER, 'utf8')) as Row[];
const slugs = JSON.parse(readFileSync(join(DIR, 'slugs.json'), 'utf8')) as string[];

const bySlug = new Map(master.map((r) => [r.slug!, r]));
const missing = slugs.filter((s) => !bySlug.has(s));
if (missing.length > 0) {
  console.error(`ABORT — ${missing.length} slug(s) not in the master list:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// is_popular is forced on: with a 30-test catalog these ARE the popular set, and the homepage reads
// this flag to decide what to feature.
const rows = slugs.map((s) => ({ ...bySlug.get(s)!, is_popular: 'TRUE' }));

writeFileSync(join(DIR, 'tests.json'), `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote ${rows.length} tests.`);
for (const r of rows) console.log(`  ${r.slug!.padEnd(46)} Q=${r.quest_code || '—'} L=${r.labcorp_code || '—'} ${r.confidence}`);
```

- [ ] **Step 3: Run it**

```bash
cd apps/worker && npx tsx scripts/build-core-catalog.ts
```

Expected: `Wrote 30 tests.` followed by 30 lines. Every line except `testosterone-free-calculation` should read `High`.

- [ ] **Step 4: Commit**

```bash
git add packages/database/data/2026-09-07-core-30 apps/worker/scripts/build-core-catalog.ts
git commit -m "Add the 30-test core catalog, generated from the master list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 3: Parameterize the master importer

**Files:**
- Modify: `apps/worker/scripts/import-master-tests.ts`

**Interfaces:**
- Produces: `import-master-tests.ts --file <path>` reads any master-shaped JSON. Default (no flag) stays the 2026-07-27 master file, so existing documented usage does not change.

A second copy of the importer would drift. One script, two datasets.

- [ ] **Step 1: Replace the static import with a runtime read**

In `apps/worker/scripts/import-master-tests.ts`, delete this line:

```ts
import tests from '../../../packages/database/data/2026-07-27-master-tests/tests.json';
```

and add, after the other imports:

```ts
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// --file lets one importer serve both the 246-row master list and the 30-row core catalog
// (2026-09-07 reset). Defaults to the master list so previously-documented invocations are unchanged.
const fileArg = process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file') + 1] : undefined;
const DEFAULT_FILE = join(__dirname, '../../../packages/database/data/2026-07-27-master-tests/tests.json');
const filePath = fileArg ? (isAbsolute(fileArg) ? fileArg : join(process.cwd(), fileArg)) : DEFAULT_FILE;
const tests = JSON.parse(readFileSync(filePath, 'utf8')) as Row[];
```

The `Row` type is already declared below the imports. Move the `type Row = {...}` declaration **above** these lines so it is defined before use.

- [ ] **Step 2: Log which file is being imported**

Inside `main()`, as the first statement after `const apply = process.argv.includes('--apply');`, add:

```ts
console.log(`Importing ${(tests as Row[]).length} test(s) from ${filePath}${apply ? '' : ' (DRY RUN — pass --apply to write)'}`);
```

- [ ] **Step 3: Dry-run against the core catalog on the LOCAL database**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/import-master-tests.ts --file ../../packages/database/data/2026-09-07-core-30/tests.json
```

Expected: `Importing 30 test(s) from …/2026-09-07-core-30/tests.json (DRY RUN — pass --apply to write)` and **no** category/confidence abort. If it aborts with unknown categories, the 21-category taxonomy is not seeded in that database — run `npx tsx scripts/seed-category-taxonomy.ts --apply` first.

- [ ] **Step 4: Confirm the default path still works**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/import-master-tests.ts
```

Expected: `Importing 246 test(s) from …/2026-07-27-master-tests/tests.json (DRY RUN …)`

- [ ] **Step 5: Commit**

```bash
git add apps/worker/scripts/import-master-tests.ts
git commit -m "Add --file flag to the master test importer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 4: The reset script

**Files:**
- Create: `apps/worker/scripts/reset-catalog.ts`

**Interfaces:**
- Consumes: `prisma.affiliateClickArchive` (Task 1).
- Produces: a runnable script. Nothing imports it.

- [ ] **Step 1: Write the script**

Create `apps/worker/scripts/reset-catalog.ts`:

```ts
// Wipes the test catalog ahead of the 2026-09-07 reseed to 30 curated tests. DESTRUCTIVE — dry-run
// unless --apply is passed.
//
// KEEPS: vendors, scrape configs, the 21-category taxonomy, users/sessions, settings, feature flags,
// SEO pages, suggestions, audit log, page views, and search logs. Page views survive with their
// test_id nulled (the FK is onDelete: SetNull); search logs have no test FK at all. Keeping analytics
// is what lets the Monday traffic digest (Task 10) be useful immediately instead of in three weeks.
//
// DELETES: tests and everything hanging off them — offerings, vendor products, aliases, price
// history, staged changes, scrape runs/results/errors/jobs.
//
// AffiliateClick is onDelete: Restrict against Offering, so its 5,848 rows physically block the
// delete. They are flattened into affiliate_click_archive (denormalized to names, nothing to
// cascade) before being removed, so the click history survives the reset.
//
// TestCode (`test_codes`) is deliberately NOT touched — it is confirmed dead code with zero readers
// or writers anywhere (CLAUDE.md gotcha 11). Leave it alone rather than give it a reason to look alive.
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts          # dry run
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts --apply
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction
import { prisma } from '@labprice/database';

const APPLY = process.argv.includes('--apply');

async function main() {
  const counts = {
    tests: await prisma.test.count(),
    offerings: await prisma.offering.count(),
    vendorProducts: await prisma.vendorProduct.count(),
    testAliases: await prisma.testAlias.count(),
    priceHistory: await prisma.priceHistory.count(),
    stagedChanges: await prisma.stagedPriceChange.count(),
    scrapeRuns: await prisma.scrapeRun.count(),
    affiliateClicks: await prisma.affiliateClick.count(),
  };
  const kept = {
    vendors: await prisma.vendor.count(),
    categories: await prisma.category.count(),
    pageViews: await prisma.pageView.count(),
    searchLogs: await prisma.searchLog.count(),
  };

  console.log('WILL DELETE:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log('WILL KEEP:');
  for (const [k, v] of Object.entries(kept)) console.log(`  ${k.padEnd(18)} ${v}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to perform the reset.');
    return;
  }

  // 1. Archive affiliate clicks (flattened — the archive has no foreign keys of its own).
  //    Batched: 5,848 rows joined to offering+vendor+test is fine in one read, but createMany is
  //    chunked so a much larger click table later can't blow the statement size.
  const clicks = await prisma.affiliateClick.findMany({
    include: { offering: { include: { vendor: { select: { slug: true, name: true } }, test: { select: { slug: true, name: true } } } } },
  });
  const archiveRows = clicks.map((c) => ({
    vendorSlug: c.offering.vendor.slug,
    vendorName: c.offering.vendor.name,
    testSlug: c.offering.test?.slug ?? null,
    testName: c.offering.test?.name ?? null,
    price: c.offering.currentPrice,
    referrer: c.referrer,
    sessionId: c.sessionId,
    clickedAt: c.clickedAt,
  }));
  for (let i = 0; i < archiveRows.length; i += 500) {
    await prisma.affiliateClickArchive.createMany({ data: archiveRows.slice(i, i + 500) });
  }
  console.log(`archived ${archiveRows.length} affiliate click(s)`);

  // 2. Delete in FK-safe order (children before parents). deleteMany with no `where` truncates.
  //    Order matters: scrapeResult/scrapeError reference scrapeRun; scrapeRun references scrapeJob;
  //    stagedPriceChange and priceHistory reference offering AND scrapeRun, so they go first.
  const steps: [string, () => Promise<{ count: number }>][] = [
    ['stagedPriceChange', () => prisma.stagedPriceChange.deleteMany()],
    ['priceHistory', () => prisma.priceHistory.deleteMany()],
    ['scrapeResult', () => prisma.scrapeResult.deleteMany()],
    ['scrapeError', () => prisma.scrapeError.deleteMany()],
    ['scrapeRun', () => prisma.scrapeRun.deleteMany()],
    ['scrapeJob', () => prisma.scrapeJob.deleteMany()],
    ['affiliateClick', () => prisma.affiliateClick.deleteMany()],
    ['offering', () => prisma.offering.deleteMany()],
    ['vendorProduct', () => prisma.vendorProduct.deleteMany()],
    ['testAlias', () => prisma.testAlias.deleteMany()],
    ['testCategory', () => prisma.testCategory.deleteMany()],
    ['testBiomarker', () => prisma.testBiomarker.deleteMany()],
    ['test', () => prisma.test.deleteMany()],
  ];
  for (const [name, run] of steps) {
    const { count } = await run();
    console.log(`  deleted ${String(count).padStart(6)} ${name}`);
  }
  console.log('\nReset complete. Next: import the core catalog (Task 3), then recrawl (Task 5).');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Dry-run against PRODUCTION and check the numbers**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts
```

Expected — these are the measured production values; a large deviation means you are pointed at the wrong database, so **stop and investigate** rather than proceeding:

```
WILL DELETE:
  tests              278
  offerings          4359
  vendorProducts     11659
  testAliases        487
  affiliateClicks    5848
WILL KEEP:
  vendors            19
  categories         21
  pageViews          1938
  searchLogs         783
```

- [ ] **Step 3: Rehearse on the LOCAL database with --apply**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx scripts/reset-catalog.ts --apply
```

Expected: an `archived N affiliate click(s)` line and 13 `deleted …` lines, no FK violation errors. If any step errors with a foreign key constraint, the order is wrong — fix the order, do **not** add `ON DELETE CASCADE`.

- [ ] **Step 4: Verify the local database is in the expected state**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env npx tsx -e "import('@labprice/database').then(async ({prisma}) => { console.log({tests: await prisma.test.count(), offerings: await prisma.offering.count(), vendors: await prisma.vendor.count(), categories: await prisma.category.count(), searchLogs: await prisma.searchLog.count()}); await prisma.\$disconnect(); })"
```

Expected: `tests: 0, offerings: 0`, with `vendors` and `categories` **unchanged from before the run**.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/scripts/reset-catalog.ts
git commit -m "Add the guarded catalog reset script

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 5: Move `discovered-actions` into a shared package

**Files:**
- Create: `packages/scrapers/src/catalog/discovered-actions.ts` (moved)
- Delete: `apps/web/lib/discovered-actions.ts` (replaced by a re-export)
- Modify: `apps/web/app/api/v1/admin/discovered/route.ts`, `apps/web/app/api/v1/admin/discovered/import/route.ts`, `apps/web/app/api/v1/admin/discovered/export/route.ts`

**Interfaces:**
- Produces: `attachProductsToTest(tx, targetTestId, products, { markMatched })` importable from `@labprice/scrapers/src/catalog/discovered-actions`, with the identical signature it has today. Also `clusterKey`, `computeConfidence`, `createPromotedTest`, and the `Confidence` type.

Task 6 runs in `apps/worker`, which cannot import from `apps/web`. Copying this file would create a second implementation of "what listing a product does" — exactly the drift CLAUDE.md gotcha 11 already complains about with the two `shouldAutoApprove()` copies.

- [ ] **Step 1: Move the file verbatim**

```bash
git mv apps/web/lib/discovered-actions.ts packages/scrapers/src/catalog/discovered-actions.ts
```

- [ ] **Step 2: Fix the internal import path**

In the moved `packages/scrapers/src/catalog/discovered-actions.ts`, change:

```ts
import { normalizeName, strongTokens } from '@labprice/scrapers/src/catalog/matcher';
```

to a relative import, since it now lives beside `matcher.ts`:

```ts
import { normalizeName, strongTokens } from './matcher';
```

- [ ] **Step 3: Leave a re-export so web imports keep working**

Create `apps/web/lib/discovered-actions.ts`:

```ts
// Moved into @labprice/scrapers so the worker can import it too (the auto-list script in
// scripts/autolist-code-matches.ts must do EXACTLY what the admin "list" action does). Re-exported
// here so existing app imports keep their short path — do not add logic to this file.
export {
  attachProductsToTest,
  clusterKey,
  computeConfidence,
  createPromotedTest,
  type Confidence,
} from '@labprice/scrapers/src/catalog/discovered-actions';
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. If an import of a name not listed in the re-export fails, add that name to the re-export block.

- [ ] **Step 5: Run the scrapers test suite to confirm nothing broke**

```bash
cd packages/scrapers && npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move discovered-actions into @labprice/scrapers so the worker can use it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 6: The exhaustive recrawl script

**Files:**
- Create: `apps/worker/scripts/recrawl-all.ts`

**Interfaces:**
- Consumes: `runVendorDiscovery` from `../src/discovery`, `adapterNeedsBrowser` from `@labprice/scrapers/src/catalog/persist`, `browserFetchHtml` from `@labprice/scrapers/src/catalog/browser-fetch`.
- Produces: populated `VendorProduct` rows for all 18 live vendors. Creates **no** offerings — that is Task 7.

With zero offerings, `runVendorDiscovery` prices nothing but still crawls (given `exhaustive: true`) and still runs `ingestVendorProducts`, which strict-matches every product against all 30 tests.

- [ ] **Step 1: Write the script**

Create `apps/worker/scripts/recrawl-all.ts`:

```ts
// Exhaustively crawls every active catalog vendor and ingests what it finds into VendorProduct.
// Used after the 2026-09-07 catalog reset to repopulate the ingest layer against the new 30 tests.
//
// This creates NO offerings. runVendorDiscovery only prices offerings that already exist, and after
// the reset there are none — the value here is entirely the ingest pass, which strict-matches every
// crawled product against our tests (exact code, or exact normalized name/alias) and records the
// result on VendorProduct. Task 7's autolist-code-matches.ts turns the code matches into offerings;
// the name matches wait in /admin/discovered.
//
// exhaustive:true matters. discover() narrows the crawl to pages whose names overlap a test, and with
// zero offerings that test list is empty — a narrow crawl would fetch almost nothing. Exhaustive
// ignores the test list entirely (catalog-scraper.ts: `narrow ? tests : undefined`).
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts            # all vendors
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts good-labs  # one vendor
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { adapterNeedsBrowser } from '@labprice/scrapers/src/catalog/persist';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';
import { runVendorDiscovery } from '../src/discovery';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

async function main() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, deletedAt: null, ...(only.length ? { slug: { in: only } } : {}) },
    include: { scrapeConfig: true },
    orderBy: { slug: 'asc' },
  });
  console.log(`Crawling ${vendors.length} vendor(s)\n`);

  const results: { slug: string; products: number; matched: number; error?: string }[] = [];

  for (const v of vendors) {
    const adapter = (v.scrapeConfig?.selectors as Record<string, unknown> | null)?.adapter as string | undefined;
    const before = await prisma.vendorProduct.count({ where: { vendorId: v.id } });
    process.stdout.write(`${v.slug} (${adapter ?? 'goodlabs'})… `);
    try {
      await runVendorDiscovery({
        vendorId: v.id,
        triggeredBy: 'MANUAL',
        exhaustive: true,
        // Cloudflare/WAF-gated vendors (personalabs, requestatest, truehealthlabs) need a real
        // browser; plain HTTP gets a challenge page, which parses as 0 products and fails the run.
        ...(adapterNeedsBrowser(adapter) ? { fetchHtml: browserFetchHtml(60_000) } : {}),
        onLog: () => {},
      });
      const after = await prisma.vendorProduct.count({ where: { vendorId: v.id } });
      const matched = await prisma.vendorProduct.count({ where: { vendorId: v.id, status: 'MATCHED' } });
      console.log(`${after} product(s) (+${after - before}), ${matched} matched`);
      results.push({ slug: v.slug, products: after, matched });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`FAILED — ${error.slice(0, 120)}`);
      // Keep going: one blocked vendor must not abort the other seventeen.
      results.push({ slug: v.slug, products: 0, matched: 0, error });
    }
  }

  console.log('\n─── summary ───');
  for (const r of results.sort((a, b) => b.matched - a.matched)) {
    console.log(`${r.slug.padEnd(22)} ${String(r.products).padStart(6)} products  ${String(r.matched).padStart(4)} matched${r.error ? '  ← FAILED' : ''}`);
  }
  const failed = results.filter((r) => r.error);
  if (failed.length) console.log(`\n${failed.length} vendor(s) failed: ${failed.map((r) => r.slug).join(', ')}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Smoke-test one cheap vendor against production**

`good-labs` has a small catalog (43 products) and needs no browser, so it is the fastest honest test.

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts good-labs
```

Expected: a line like `good-labs (goodlabs)… 43 product(s) (+0), N matched`. A `FAILED — catalog crawl returned 0 products` means the crawl was blocked, not that the script is wrong.

- [ ] **Step 3: Verify a browser-gated vendor works**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts true-health-labs
```

Expected: a non-zero product count. If it fails with 0 products, `browserFetchHtml` is not being applied — check that `adapterNeedsBrowser('truehealthlabs')` returns `true`.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/scripts/recrawl-all.ts
git commit -m "Add the exhaustive all-vendor recrawl script

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 7: Auto-list code-matched products

**Files:**
- Create: `packages/scrapers/src/catalog/autolist.ts`
- Create: `packages/scrapers/src/__tests__/autolist.test.ts`
- Create: `apps/worker/scripts/autolist-code-matches.ts`

**Interfaces:**
- Consumes: `attachProductsToTest` from `./discovered-actions` (Task 5).
- Produces: `CODE_MATCHED_BY: readonly string[]` and `isCodeMatch(matchedBy: string | null): boolean`, exported from `@labprice/scrapers/src/catalog/autolist`.

This is the decision point the whole reset turns on: a code match publishes, a name match waits for a human. It gets its own tested predicate rather than an inline string comparison so the rule is provable and lives in one place.

- [ ] **Step 1: Write the failing test**

Create `packages/scrapers/src/__tests__/autolist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isCodeMatch } from '../catalog/autolist';

describe('isCodeMatch', () => {
  it('accepts every code-based matchedBy the ingest matcher can produce', () => {
    expect(isCodeMatch('quest-code')).toBe(true);
    expect(isCodeMatch('labcorp-code')).toBe(true);
    expect(isCodeMatch('any-code')).toBe(true);
  });

  it('rejects name-based matches — they are held for human review', () => {
    expect(isCodeMatch('exact-name')).toBe(false);
    expect(isCodeMatch('alias')).toBe(false);
  });

  it('rejects provenance labels that are not evidence of a code match', () => {
    // 'offering' means "a pre-linked offering priced this product" — the pre-linking model this
    // reset abolishes. 'manual' means a human already listed it, so there is nothing to auto-list.
    expect(isCodeMatch('offering')).toBe(false);
    expect(isCodeMatch('manual')).toBe(false);
  });

  it('rejects null and unknown values rather than defaulting to publish', () => {
    expect(isCodeMatch(null)).toBe(false);
    expect(isCodeMatch('some-future-matcher')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/scrapers && npx vitest run src/__tests__/autolist.test.ts
```

Expected: FAIL — `Failed to resolve import "../catalog/autolist"`.

- [ ] **Step 3: Write the implementation**

Create `packages/scrapers/src/catalog/autolist.ts`:

```ts
// Which ingest matches are trustworthy enough to publish a price without a human looking at it.
//
// Only an exact lab-order-code hit qualifies. The ingest matcher (persist.ts → ingestVendorProducts)
// additionally guards every code hit with a shared distinctive name token, because vendor code fields
// do go stale — so a code match here means "the code agrees AND the name is not contradictory".
//
// exact-name/alias are deliberately excluded even though they are strict string equality, not the
// loose token-subset matcher. They are trustworthy enough to surface in /admin/discovered's Matched
// tab for one-click listing, but four of our vendors (algorx, directlabs, mito-health,
// private-md-labs) publish no lab codes at all, so name matching is their ONLY path to an offering —
// which makes it exactly the place where a silent wrong match would be least likely to be noticed.
export const CODE_MATCHED_BY = ['quest-code', 'labcorp-code', 'any-code'] as const;

/** True when a VendorProduct.matchedBy value represents an exact lab-code match. */
export function isCodeMatch(matchedBy: string | null | undefined): boolean {
  return !!matchedBy && (CODE_MATCHED_BY as readonly string[]).includes(matchedBy);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/scrapers && npx vitest run src/__tests__/autolist.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the runner script**

Create `apps/worker/scripts/autolist-code-matches.ts`:

```ts
// Turns code-matched VendorProduct rows into live offerings after the 2026-09-07 catalog reset.
// Dry-run unless --apply.
//
// Only rows whose matchedBy is an exact lab-code hit are listed (see catalog/autolist.ts for why).
// exact-name/alias matches are left alone: they already show up in /admin/discovered's "Matched" tab
// (which means precisely "MATCHED with no offering yet") for one-click bulk listing by a human.
//
// Listing goes through attachProductsToTest — the SAME function the admin UI's list action calls — so
// this script and the UI cannot drift apart about what listing means. markMatched:false because these
// rows are already MATCHED; passing true would overwrite their real matchedBy with 'manual' and
// destroy the provenance this script depends on.
//
// Run (from apps/worker):
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/autolist-code-matches.ts
//   DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/autolist-code-matches.ts --apply
import 'dotenv/config';
import { prisma } from '@labprice/database';
import { attachProductsToTest } from '@labprice/scrapers/src/catalog/discovered-actions';
import { CODE_MATCHED_BY } from '@labprice/scrapers/src/catalog/autolist';

const APPLY = process.argv.includes('--apply');

async function main() {
  const rows = await prisma.vendorProduct.findMany({
    where: {
      status: 'MATCHED',
      isPanel: false,
      testId: { not: null },
      price: { not: null },
      matchedBy: { in: [...CODE_MATCHED_BY] },
      vendor: { isActive: true, deletedAt: null },
    },
    select: {
      id: true, name: true, url: true, price: true, vendorId: true, labProvider: true, testId: true,
      vendor: { select: { slug: true } },
      test: { select: { name: true } },
    },
    orderBy: [{ vendorId: 'asc' }, { name: 'asc' }],
  });

  // Skip pairs that already have an offering — attachProductsToTest is idempotent, but not listing
  // them keeps the report honest about what this run actually changed.
  const existing = await prisma.offering.findMany({ where: { deletedAt: null }, select: { testId: true, vendorId: true } });
  const has = new Set(existing.map((o) => `${o.testId}:${o.vendorId}`));
  const todo = rows.filter((r) => !has.has(`${r.testId}:${r.vendorId}`));

  console.log(`${rows.length} code-matched product(s); ${todo.length} not yet listed\n`);
  // Print every match and READ IT. Grepping only for wrong patterns you already know about just
  // confirms what you went looking for (CLAUDE.md gotcha 14).
  for (const r of todo) {
    console.log(`  ${r.vendor.slug.padEnd(20)} ${String(r.test?.name).padEnd(46)} ← ${r.name}  $${r.price}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Read the matches above, then re-run with --apply.');
    return;
  }

  const byTest = new Map<string, typeof todo>();
  for (const r of todo) byTest.set(r.testId!, [...(byTest.get(r.testId!) ?? []), r]);

  let created = 0;
  let aliases = 0;
  for (const [testId, group] of byTest) {
    const products = group.map((p) => ({
      id: p.id, name: p.name, url: p.url, price: p.price, vendorId: p.vendorId,
      labProvider: p.labProvider, vendorSlug: p.vendor.slug,
    }));
    const result = await prisma.$transaction((tx) => attachProductsToTest(tx, testId, products, { markMatched: false }));
    created += result.offeringsCreated;
    aliases += result.aliasesLearned;
  }
  console.log(`\nCreated ${created} offering(s), learned ${aliases} alias(es).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Run the full scrapers suite**

```bash
cd packages/scrapers && npx vitest run
```

Expected: all tests pass, including the 4 new ones.

- [ ] **Step 7: Commit**

```bash
git add packages/scrapers/src/catalog/autolist.ts packages/scrapers/src/__tests__/autolist.test.ts apps/worker/scripts/autolist-code-matches.ts
git commit -m "Auto-list code-matched vendor products into offerings

Code matches publish; exact-name/alias matches wait in /admin/discovered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 8: Hide empty categories

**Files:**
- Modify: `apps/web/app/components/CategoryFilters.tsx` (or its data source — locate with `grep -rn "CategoryFilters" apps/web`)

**Interfaces:**
- Produces: no new exports. Behavioral change only.

Thirty tests span 16 of the 21 categories, so five would render as filters that return nothing. The `Category` rows stay — re-widening the catalog must not require re-seeding the taxonomy.

- [ ] **Step 1: Find where categories are fetched for the homepage filter**

```bash
grep -rn "CategoryFilters" apps/web --include=*.tsx --include=*.ts
grep -rn "category.findMany" apps/web --include=*.ts --include=*.tsx
```

Note the file and line that loads the category list feeding `CategoryFilters`.

- [ ] **Step 2: Filter to categories that have at least one live test**

At that query, add a `where` clause on the `TestCategory` relation. Prisma expresses "has at least one related row matching" as `some`:

```ts
const categories = await prisma.category.findMany({
  // Only categories with at least one live test. The 2026-09-07 reset cut the catalog to 30 tests
  // spanning 16 of 21 categories — without this, five filters render and return nothing. The rows
  // are deliberately kept, so widening the catalog re-populates the filter with no reseed.
  where: { tests: { some: { test: { deletedAt: null, isActive: true } } } },
  orderBy: { displayOrder: 'asc' },
});
```

If the relation field on `Category` is not named `tests`, or `Test` has no `isActive` column, check the model:
```bash
grep -n -A20 "^model Category" packages/database/prisma/schema.prisma
grep -n -A30 "^model Test " packages/database/prisma/schema.prisma
```
and adjust the field names to match. Drop `isActive` from the clause if `Test` has no such column; keep `deletedAt: null` regardless.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser after the reseed**

This can only be truly verified once the 30 tests exist (Task 11). Start the app:

```bash
pnpm docker:dev && pnpm dev
```

Load `http://localhost:3000` and confirm the category filter row shows only categories that yield results when clicked. Note: this is a post-reseed check — if run before Task 11 on an empty local database, **every** category will be hidden, which is correct behavior, not a bug.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Hide categories with no live tests from the homepage filter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 9: 410 Gone for removed tests, and a refreshed sitemap

**Files:**
- Modify: `apps/web/app/tests/[slug]/page.tsx` (confirm the path with the grep in Step 1)
- Modify: `apps/web/app/sitemap.ts`

**Interfaces:**
- Produces: no new exports.

248 test URLs disappear. 410 tells Google to drop them promptly; 404 implies "might come back".

- [ ] **Step 1: Locate the test detail page and the sitemap**

```bash
find apps/web/app -path '*tests*' -name 'page.tsx'
find apps/web/app -name 'sitemap.ts' -o -name 'sitemap.xml' -o -name 'robots.ts'
```

- [ ] **Step 2: Return 410 instead of 404 for a missing test**

Next.js App Router's `notFound()` always sends 404. To send 410, the page's not-found branch must set the status explicitly. In the test detail page, find the `notFound()` call for a missing test and check whether a `not-found.tsx` handles it. Replace the missing-test branch with:

```tsx
import { unstable_rethrow } from 'next/navigation';

// A test slug that no longer exists is GONE, not merely missing: the 2026-09-07 reset cut the
// catalog from 278 tests to 30, and those 248 URLs are never coming back. 410 gets them de-indexed
// promptly; 404 tells Google to keep retrying them for weeks.
if (!test) {
  const { headers } = await import('next/headers');
  // Route Handlers can set a status directly; a Server Component cannot, so the 410 is emitted by
  // middleware instead — see Step 3. This branch still renders the "not found" UI.
  return <TestGone slug={slug} />;
}
```

**Simpler and more reliable:** emit the 410 from `middleware.ts`, which already runs for every request and can set a status. In `apps/web/middleware.ts`, this requires knowing the live slugs, which middleware cannot query (it runs on the edge with no DB access).

Therefore implement it as a **Route Handler-free static list**: after the reseed, generate a redirect/gone list. Add to `apps/web/next.config.ts`:

```ts
// The 2026-09-07 catalog reset removed 248 test URLs permanently. `permanent: false` + a 410 is not
// expressible in `redirects()`, so removed slugs are handled by the catch-all below in the page
// itself; this entry only ensures the sitemap no longer advertises them.
```

Given the constraint, the pragmatic implementation is: **the test detail page renders a "no longer listed" page and the route sets 410 via a Route Handler wrapper.** Verify which pattern the codebase already uses for status codes before choosing:

```bash
grep -rn "notFound()\|NextResponse\|status: 4" apps/web/app/tests --include=*.tsx --include=*.ts | head -20
```

Pick the approach that matches existing code, and if the page is a Server Component with no existing status-setting pattern, prefer the lowest-risk option: keep `notFound()` (404) and instead **remove the URLs from the sitemap**, noting the deviation in CHANGELOG.md. De-indexing still happens; it is just slower. Do not invent a fragile status-code mechanism for marginal SEO gain.

- [ ] **Step 3: Confirm the sitemap regenerates from live tests only**

Open `apps/web/app/sitemap.ts` and confirm the test URLs come from a `prisma.test.findMany({ where: { deletedAt: null } })`-style query rather than any cached or hardcoded list. If it is already dynamic, no change is needed — record that in the commit message.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Retire removed test URLs from the sitemap after the catalog reset

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 10: Share the GA4 client with the worker

**Files:**
- Create: `packages/shared/src/ga4.ts` (moved)
- Modify: `apps/web/lib/ga4-data.ts` (becomes a re-export)
- Modify: `packages/shared/package.json`

**Interfaces:**
- Produces, from `@labprice/shared/src/ga4`:
  - `GA4_CONFIGURED: boolean`
  - `type Ga4Summary = { topCountries: { country: string; sessions: number }[]; devices: { device: string; sessions: number }[]; funnelEvents: { event: string; count: number }[] }`
  - `fetchGa4Summary(days: number): Promise<Ga4Summary | null>`
  - `type Ga4Traffic = { users: number; sessions: number; topSources: { source: string; sessions: number }[] }`
  - `fetchGa4Traffic(days: number): Promise<Ga4Traffic | null>` — **new**, added in Step 3.

**Do not add this to `packages/shared`'s index barrel.** `@labprice/shared` holds DTOs that reach client bundles; `@google-analytics/data` is a Node-only SDK. Deep-import it only.

- [ ] **Step 1: Move the file and add the dependency**

```bash
git mv apps/web/lib/ga4-data.ts packages/shared/src/ga4.ts
```

Add to `packages/shared/package.json` `dependencies`:

```json
"@google-analytics/data": "^4.7.0"
```

Match the exact version already in `apps/web/package.json`:
```bash
grep '@google-analytics/data' apps/web/package.json
```
Use that version string verbatim, then:
```bash
pnpm install
```

- [ ] **Step 2: Re-export from the old path**

Create `apps/web/lib/ga4-data.ts`:

```ts
// Moved to @labprice/shared/src/ga4 so the worker's Monday traffic digest can use the same client —
// apps/worker cannot import from apps/web, and a second copy would drift (the two shouldAutoApprove
// implementations are the cautionary tale). Deep import, NOT the shared index barrel: this pulls in
// a Node-only Google SDK that must never reach a client bundle.
export { GA4_CONFIGURED, fetchGa4Summary, type Ga4Summary } from '@labprice/shared/src/ga4';
```

- [ ] **Step 3: Add the traffic report the digest needs**

The existing `fetchGa4Summary` returns countries, devices, and funnel events, but not visitor totals or traffic sources. Append to `packages/shared/src/ga4.ts`:

```ts
export type Ga4Traffic = {
  users: number;
  sessions: number;
  topSources: { source: string; sessions: number }[];
};

/**
 * Headline traffic numbers for the weekly digest: how many people came, and where from. Separate
 * from fetchGa4Summary because the digest and /admin/analytics want different cuts and neither should
 * pay for the other's queries. Returns null when GA4 is not configured — callers must degrade, never
 * throw: the digest has to send even when Google does not answer.
 */
export async function fetchGa4Traffic(days: number): Promise<Ga4Traffic | null> {
  if (!GA4_CONFIGURED) return null;
  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

  const [[totalsResp], [sourceResp]] = await Promise.all([
    getClient().runReport({
      property,
      dateRanges,
      metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
    }),
    getClient().runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }),
  ]);

  const totals = totalsResp.rows?.[0]?.metricValues ?? [];
  return {
    users: Number(totals[0]?.value ?? 0),
    sessions: Number(totals[1]?.value ?? 0),
    topSources: (sourceResp.rows ?? []).map((r) => ({
      source: r.dimensionValues?.[0]?.value || 'Unknown',
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
    })),
  };
}
```

- [ ] **Step 4: Typecheck the web app**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. `/admin/analytics` must still compile against the re-export.

- [ ] **Step 5: Verify the live GA4 pull still works**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx -e "import('@labprice/shared/src/ga4').then(async (m) => { console.log('configured:', m.GA4_CONFIGURED); console.log(await m.fetchGa4Traffic(7)); })"
```

Expected: `configured: true` and an object with non-zero `users`/`sessions`. If `configured: false`, the three `GA4_*` vars are missing from `.env.scrape-prod` — copy them from the web service's Railway config.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move the GA4 client into @labprice/shared and add a traffic report

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 11: The Monday traffic topline

**Files:**
- Create: `apps/worker/src/traffic.ts`
- Create: `packages/shared/src/traffic-render.ts`
- Create: `packages/shared/src/__tests__/traffic-render.test.ts`
- Modify: `apps/worker/src/workers/scrape-report.ts`

**Interfaces:**
- Consumes: `fetchGa4Traffic`, `Ga4Traffic` from `@labprice/shared/src/ga4` (Task 10).
- Produces:
  - From `apps/worker/src/traffic.ts`: `collectTraffic(days: number): Promise<TrafficSummary>`
  - From `packages/shared/src/traffic-render.ts`: `type TrafficSummary`, `renderTrafficHtml(t: TrafficSummary): string`, `renderTrafficText(t: TrafficSummary): string`

Rendering is split from collection so it is a pure function with no database, which is the only part that can be unit-tested (there is no test runner in `apps/worker`).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/traffic-render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderTrafficHtml, renderTrafficText, type TrafficSummary } from '../traffic-render';

const base: TrafficSummary = {
  days: 7,
  ga4: { users: 412, sessions: 588, topSources: [{ source: 'Organic Search', sessions: 300 }] },
  topSearches: [{ query: 'testosterone', count: 40, zeroResults: false }],
  zeroResultSearches: [{ query: 'nad+ test', count: 6, zeroResults: true }],
  topTests: [{ name: 'Testosterone, Total', views: 120 }],
  clicksByVendor: [{ vendor: 'Walk-In Lab', clicks: 33 }],
  totalPageViews: 940,
};

describe('renderTrafficHtml', () => {
  it('includes the headline GA4 numbers', () => {
    const html = renderTrafficHtml(base);
    expect(html).toContain('412');
    expect(html).toContain('Organic Search');
  });

  it('renders the DB half when GA4 is unavailable, and says so', () => {
    const html = renderTrafficHtml({ ...base, ga4: null });
    // The digest must still be useful when Google does not answer.
    expect(html).toContain('Walk-In Lab');
    expect(html).toContain('testosterone');
    expect(html).toMatch(/not configured|unavailable/i);
  });

  it('surfaces zero-result searches — the demand signal for what to add next', () => {
    expect(renderTrafficHtml(base)).toContain('nad+ test');
  });

  it('escapes HTML in search queries so a crafted query cannot inject markup', () => {
    const html = renderTrafficHtml({
      ...base,
      topSearches: [{ query: '<img src=x onerror=alert(1)>', count: 1, zeroResults: false }],
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('renderTrafficText', () => {
  it('produces a plain-text fallback with no markup', () => {
    const text = renderTrafficText(base);
    expect(text).toContain('412');
    expect(text).not.toContain('<');
  });

  it('does not crash on a completely empty week', () => {
    const empty: TrafficSummary = {
      days: 7, ga4: null, topSearches: [], zeroResultSearches: [],
      topTests: [], clicksByVendor: [], totalPageViews: 0,
    };
    expect(() => renderTrafficText(empty)).not.toThrow();
    expect(() => renderTrafficHtml(empty)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/shared && npx vitest run src/__tests__/traffic-render.test.ts
```

Expected: FAIL — `Failed to resolve import "../traffic-render"`.

- [ ] **Step 3: Write the renderer**

Create `packages/shared/src/traffic-render.ts`:

```ts
// Renders the weekly traffic topline for the Monday admin digest. Pure — no DB, no network — so the
// formatting is unit-testable; collection lives in apps/worker/src/traffic.ts.
//
// Lives in @labprice/shared (not the worker) only so it can have tests: apps/worker has no test
// runner. Deep-import it; it is not in the index barrel.
import type { Ga4Traffic } from './ga4';

export type TrafficSummary = {
  days: number;
  /** null when GA4 is unconfigured or the API call failed — the digest still sends. */
  ga4: Ga4Traffic | null;
  topSearches: { query: string; count: number; zeroResults: boolean }[];
  zeroResultSearches: { query: string; count: number; zeroResults: boolean }[];
  topTests: { name: string; views: number }[];
  clicksByVendor: { vendor: string; clicks: number }[];
  totalPageViews: number;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const H2 = 'margin:24px 0 8px;font-size:16px;color:#111827;';
const TD = 'padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151;';

function list(title: string, rows: { label: string; value: number | string }[]): string {
  if (rows.length === 0) return '';
  return `<p style="${H2}"><strong>${esc(title)}</strong></p>
    <table style="border-collapse:collapse;width:100%;max-width:520px;font-size:14px;">
      ${rows.map((r) => `<tr><td style="${TD}">${esc(r.label)}</td><td style="${TD}text-align:right;white-space:nowrap;">${esc(String(r.value))}</td></tr>`).join('')}
    </table>`;
}

export function renderTrafficHtml(t: TrafficSummary): string {
  const chip = (n: number | string, label: string) =>
    `<span style="display:inline-block;margin:0 8px 8px 0;padding:6px 14px;border-radius:14px;background:#2563eb18;color:#2563eb;font-weight:600;font-size:13px;">${esc(String(n))} ${esc(label)}</span>`;

  const head = t.ga4
    ? `${chip(t.ga4.users, 'visitors')}${chip(t.ga4.sessions, 'sessions')}${chip(t.totalPageViews, 'page views')}`
    : `${chip(t.totalPageViews, 'page views')}<p style="margin:8px 0;font-size:13px;color:#6b7280;">Google Analytics is not configured for the worker, so visitor and traffic-source figures are unavailable this week. The figures below come from our own database.</p>`;

  return `<h2 style="margin:32px 0 4px;font-size:18px;color:#111827;">Site traffic — last ${t.days} days</h2>
    ${head}
    ${t.ga4 ? list('Where they came from', t.ga4.topSources.map((s) => ({ label: s.source, value: s.sessions }))) : ''}
    ${list('What they searched for', t.topSearches.map((s) => ({ label: s.query, value: s.count })))}
    ${list('Searches with NO results (candidates to add)', t.zeroResultSearches.map((s) => ({ label: s.query, value: s.count })))}
    ${list('Most-viewed tests', t.topTests.map((x) => ({ label: x.name, value: x.views })))}
    ${list('Click-throughs by vendor', t.clicksByVendor.map((c) => ({ label: c.vendor, value: c.clicks })))}`;
}

export function renderTrafficText(t: TrafficSummary): string {
  const section = (title: string, rows: { label: string; value: number | string }[]) =>
    rows.length === 0 ? [] : [``, `${title}:`, ...rows.map((r) => `  ${r.label} — ${r.value}`)];

  return [
    ``,
    `SITE TRAFFIC — LAST ${t.days} DAYS`,
    t.ga4
      ? `${t.ga4.users} visitors · ${t.ga4.sessions} sessions · ${t.totalPageViews} page views`
      : `${t.totalPageViews} page views (Google Analytics not configured for the worker — visitor and source figures unavailable)`,
    ...(t.ga4 ? section('Where they came from', t.ga4.topSources.map((s) => ({ label: s.source, value: s.sessions }))) : []),
    ...section('What they searched for', t.topSearches.map((s) => ({ label: s.query, value: s.count }))),
    ...section('Searches with NO results', t.zeroResultSearches.map((s) => ({ label: s.query, value: s.count }))),
    ...section('Most-viewed tests', t.topTests.map((x) => ({ label: x.name, value: x.views }))),
    ...section('Click-throughs by vendor', t.clicksByVendor.map((c) => ({ label: c.vendor, value: c.clicks }))),
  ].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/shared && npx vitest run src/__tests__/traffic-render.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the collector**

Create `apps/worker/src/traffic.ts`:

```ts
// Gathers the weekly traffic topline for the Monday digest. GA4 supplies visitors/sessions/sources
// (our own tables record neither referrer nor country); our database supplies exact search queries
// and affiliate click-throughs (which GA4 does not have in usable form).
//
// GA4 failure is NEVER fatal — the digest must send regardless, with the database half intact.
import { prisma } from '@labprice/database';
import { fetchGa4Traffic } from '@labprice/shared/src/ga4';
import type { TrafficSummary } from '@labprice/shared/src/traffic-render';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function collectTraffic(days: number): Promise<TrafficSummary> {
  const since = new Date(Date.now() - days * DAY_MS);

  // Swallow GA4 errors deliberately: a Google outage or an expired service-account key must degrade
  // this section, not kill the whole scraper-health digest it is attached to.
  const ga4 = await fetchGa4Traffic(days).catch((e) => {
    console.warn('[traffic] GA4 pull failed, continuing without it:', e instanceof Error ? e.message : e);
    return null;
  });

  const [searches, pageViewRows, clicks, totalPageViews] = await Promise.all([
    prisma.searchLog.groupBy({
      by: ['query', 'resultsCount'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.pageView.groupBy({
      by: ['testId'],
      where: { createdAt: { gte: since }, testId: { not: null } },
      _count: { _all: true },
    }),
    prisma.affiliateClick.groupBy({
      by: ['offeringId'],
      where: { clickedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
  ]);

  // groupBy splits the same query across different resultsCount values; fold them back together and
  // treat a query as "zero results" only when EVERY logged occurrence returned nothing.
  const byQuery = new Map<string, { count: number; anyResults: boolean }>();
  for (const s of searches) {
    const prev = byQuery.get(s.query) ?? { count: 0, anyResults: false };
    byQuery.set(s.query, { count: prev.count + s._count._all, anyResults: prev.anyResults || s.resultsCount > 0 });
  }
  const allSearches = [...byQuery.entries()]
    .map(([query, v]) => ({ query, count: v.count, zeroResults: !v.anyResults }))
    .sort((a, b) => b.count - a.count);

  const testIds = pageViewRows.map((r) => r.testId!).filter(Boolean);
  const tests = await prisma.test.findMany({ where: { id: { in: testIds } }, select: { id: true, name: true } });
  const testName = new Map(tests.map((t) => [t.id, t.name]));

  const offeringIds = clicks.map((c) => c.offeringId);
  const offerings = await prisma.offering.findMany({
    where: { id: { in: offeringIds } },
    select: { id: true, vendor: { select: { name: true } } },
  });
  const vendorOf = new Map(offerings.map((o) => [o.id, o.vendor.name]));
  const clicksByVendorMap = new Map<string, number>();
  for (const c of clicks) {
    const v = vendorOf.get(c.offeringId);
    if (v) clicksByVendorMap.set(v, (clicksByVendorMap.get(v) ?? 0) + c._count._all);
  }

  return {
    days,
    ga4,
    topSearches: allSearches.slice(0, 10),
    zeroResultSearches: allSearches.filter((s) => s.zeroResults).slice(0, 10),
    topTests: pageViewRows
      // A page view whose test was deleted has a nulled test_id or an unresolvable id — drop it
      // rather than printing "undefined" in the email.
      .map((r) => ({ name: testName.get(r.testId!) ?? '', views: r._count._all }))
      .filter((r) => r.name !== '')
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
    clicksByVendor: [...clicksByVendorMap.entries()]
      .map(([vendor, clicks]) => ({ vendor, clicks }))
      .sort((a, b) => b.clicks - a.clicks),
    totalPageViews,
  };
}
```

- [ ] **Step 6: Wire it into the digest**

In `apps/worker/src/workers/scrape-report.ts`, add to the imports:

```ts
import { collectTraffic } from '../traffic';
import { renderTrafficHtml, renderTrafficText } from '@labprice/shared/src/traffic-render';
```

Inside the worker function, after the vendor `rows` array is fully built and before `sendAdminEmail` is called, add:

```ts
// Traffic topline: appended after scraper health, which stays first — the subject line is about
// whether scraping is healthy, and that must not be diluted.
const traffic = await collectTraffic(7).catch((e) => {
  console.warn('[report] traffic collection failed, sending digest without it:', e instanceof Error ? e.message : e);
  return null;
});
```

Then, where the email body is assembled, append the traffic sections to the existing HTML and text bodies:

```ts
const html = `${renderHtml(rows, meta)}${traffic ? renderTrafficHtml(traffic) : ''}`;
const text = `${renderText(rows, meta)}${traffic ? renderTrafficText(traffic) : ''}`;
await sendAdminEmail(subject, text, html);
```

Match the existing local variable names for the rendered body and `meta` — read the end of the worker function first and adapt rather than assuming these names.

- [ ] **Step 7: Trigger a digest against production data and read the output**

Without `RESEND_API_KEY` the body is logged instead of sent, which is exactly what you want for a first look.

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod RESEND_API_KEY= npx tsx -e "
import('./src/traffic').then(async ({ collectTraffic }) => {
  const { renderTrafficText } = await import('@labprice/shared/src/traffic-render');
  console.log(renderTrafficText(await collectTraffic(7)));
  process.exit(0);
});"
```

Expected: a `SITE TRAFFIC — LAST 7 DAYS` block with real visitor numbers and real search queries. Confirm the queries look like things a person would type.

- [ ] **Step 8: Verify GA4-absent degradation**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod GA4_PROPERTY_ID= npx tsx -e "
import('./src/traffic').then(async ({ collectTraffic }) => {
  const { renderTrafficText } = await import('@labprice/shared/src/traffic-render');
  console.log(renderTrafficText(await collectTraffic(7)));
  process.exit(0);
});"
```

Expected: the same block, with the "Google Analytics not configured" note and the search/click sections still populated. **This must not throw.**

- [ ] **Step 9: Add the GA4 vars to the worker service on Railway**

Copy `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, and `GA4_PRIVATE_KEY` from the web service to the worker service. `GA4_PRIVATE_KEY` holds literal `\n` escapes — paste it exactly as stored on the web service; `ga4.ts` converts them.

- [ ] **Step 10: Run the full test suites and commit**

```bash
cd packages/shared && npx vitest run && cd ../scrapers && npx vitest run && cd ../../apps/web && npx tsc --noEmit
```

```bash
git add -A
git commit -m "Add a weekly traffic topline to the Monday admin digest

GA4 supplies visitors and sources; our own tables supply search queries and
click-throughs. A GA4 failure degrades the section instead of the email.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Task 12: Execute the production reset

**Files:** none — this task runs the scripts built above, in order, against production.

**Interfaces:**
- Consumes: every script from Tasks 2, 3, 4, 6, 7.

Do not begin until Tasks 1–11 are committed and pushed, and the web app has been deployed with Task 5's package move (an unshipped `discovered-actions` move would break the admin panel mid-reset).

- [ ] **Step 1: Confirm the deployed build is current**

```bash
git -c http.version=HTTP/1.1 push && git log --oneline -1
```

Then confirm the Railway web service has redeployed to that commit before continuing. A stale build means `/admin/discovered` is running the old import paths.

Also confirm the three `GA4_*` env vars are set on the Railway **worker** service (not just web) —
without them, Monday's digest silently degrades to the database half only (no traffic topline).

- [ ] **Step 2: Reset the catalog**

Precondition: confirm `affiliate_click_archive` is empty before running with `--apply` — the reset's
archive step re-runs its guard and will refuse mid-run if the archive table is already populated
(e.g. from an aborted earlier attempt):
```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx -r dotenv/config -e "import('@labprice/database').then(async ({prisma}) => { console.log('affiliate_click_archive rows:', await prisma.affiliateClickArchive.count()); await prisma.\$disconnect(); })"
```
Must print `0` before proceeding.

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts
```
Read the counts. Then:
```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/reset-catalog.ts --apply
```
Expected: an archive line followed by 13 delete lines.

- [ ] **Step 3: Reseed the 30 tests**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/import-master-tests.ts --file ../../packages/database/data/2026-09-07-core-30/tests.json
```
Read the dry-run output, then:
```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/import-master-tests.ts --file ../../packages/database/data/2026-09-07-core-30/tests.json --apply
```
Expected: `30 to create, 0 to update.` (the script's actual printed wording — not "created"/"updated").

- [ ] **Step 4: Verify the catalog**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx -r dotenv/config -e "import('@labprice/database').then(async ({prisma}) => { const tests = await prisma.test.findMany({ include: { categories: true } }); console.log('tests:', tests.length); console.log('missing a category:', tests.filter(t => t.categories.length === 0).map(t => t.slug)); console.log('missing a display categoryId:', tests.filter(t => !t.categoryId).map(t => t.slug)); await prisma.\$disconnect(); })"
```
Expected: `tests: 30` and both lists empty.

Note the `-r dotenv/config` flag on this inline `npx tsx -e` command — without it, `@labprice/database`'s
client never loads dotenv, `DOTENV_CONFIG_PATH` is ignored, and the command hard-errors with a Prisma
"Validation Error" (it tries to connect with no `DATABASE_URL`). The committed scripts don't need this —
they `import 'dotenv/config'` themselves — but every inline one-liner in this runbook does.

- [ ] **Step 5: Recrawl every vendor, in staged waves**

Measured reality: ~9,100 products to crawl, strictly sequential at `rateLimitMs: 500` plus per-page
fetch time, and 2,834 of those pages go through Playwright — **6–15 hours end-to-end**, not "minutes
each". Worse, because auto-listing only happens after a crawl completes, running `recrawl-all.ts` with
no arguments (all vendors, one giant invocation) would leave the live site showing all 30 tests with
**zero prices** for that entire window. Instead, run it in waves so prices land within the hour and a
single vendor's failure doesn't cost the whole run:

```bash
# Wave 1 — five fast API (fetchAll) vendors + the small page vendors. Minutes, not hours.
npx tsx scripts/recrawl-all.ts algorx anabolic-insights directlabs jason-health mito-health \
  drsays good-labs discounted-labs marek-diagnostics labcorp-ondemand own-your-labs quest-health

# Then auto-list so the site has prices immediately:
npx tsx scripts/autolist-code-matches.ts            # READ the printed matches
npx tsx scripts/autolist-code-matches.ts --apply

# Wave 2 — the big HTTP crawlers, ONE invocation each so a failure loses only that vendor
npx tsx scripts/recrawl-all.ts healthlabs          # ~730 products
npx tsx scripts/recrawl-all.ts walk-in-lab         # ~1,256
npx tsx scripts/recrawl-all.ts private-md-labs     # ~3,552 — the longest single job

# Wave 3 — the three browser/WAF vendors, ONE each. Hours. true-health-labs is EXPECTED to fail.
npx tsx scripts/recrawl-all.ts personalabs
npx tsx scripts/recrawl-all.ts request-a-test
npx tsx scripts/recrawl-all.ts true-health-labs

# Re-run the autolist dry-run + --apply after each wave; it is idempotent (skips existing pairs).
```

All of these run from `apps/worker` with `DOTENV_CONFIG_PATH=../../.env.scrape-prod` set, e.g.:
```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/recrawl-all.ts algorx anabolic-insights ...
```

**Because each wave passes explicit slugs, check the printed `Crawling N vendor(s)` line matches the
number of slugs you typed.** A typo'd slug matches zero vendors and `recrawl-all.ts` exits 0 without
complaining — it silently skips that vendor rather than erroring, and nothing downstream will flag the
gap.

Expect `true-health-labs` to report `FAILED` (its WAF blocks even the browser-fetch path), and
`personalabs`/`request-a-test` may too — impact is roughly **1 offering out of ~167**. This is a known,
accepted gap, not a reason to abort or re-investigate the reset.

Also expect vendor trust to reset: deleting every `ScrapeRun` in Step 2 put all 18 vendors at MEDIUM
trust; after each wave's crawl, a vendor that succeeded goes HIGH and one that failed goes LOW off that
single run (trust is computed from recent run history, and there's no history yet). A WAF-blocked
vendor sitting at LOW — forcing manual price review on its offerings until a crawl eventually succeeds
— is expected, not a regression.

Investigate any vendor reporting `FAILED` or 0 products beyond the three expected WAF vendors above
before moving to the next wave — a blocked crawl silently produces no matches.

- [ ] **Step 6: Review the code matches, then list them**

(Already run as part of each wave in Step 5 — this step is the final pass after Wave 3, to confirm
nothing was left unlisted.)

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/autolist-code-matches.ts
```

**Read every printed line.** Each is `vendor | our test name ← their product name | price`. You are checking that the two names describe the same test. Expect roughly 167 rows total across all waves. If any line pairs two clearly different tests, stop and investigate the code on that `VendorProduct` row rather than proceeding.

Note: the printed match count will slightly **exceed** the number of offerings actually created. Same-vendor duplicates (the same vendor matching the same test twice) print as separate match lines, but only the first gets an offering — the script's own `DROPPED DUPLICATES` block at the end of the `--apply` run reconciles the difference. So `created < todo` (fewer created than listed) is expected output, not a bug.

Then:
```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/autolist-code-matches.ts --apply
```

- [ ] **Step 7: Verify the live site**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx -r dotenv/config -e "import('@labprice/database').then(async ({prisma}) => { const priced = await prisma.offering.count({ where: { currentPrice: { not: null }, isActive: true, deletedAt: null } }); const byVendor = await prisma.offering.groupBy({ by: ['vendorId'], where: { currentPrice: { not: null }, isActive: true, deletedAt: null }, _count: true }); const vs = await prisma.vendor.findMany({ select: { id: true, slug: true } }); const m = new Map(vs.map(v => [v.id, v.slug])); console.log('priced offerings:', priced); for (const b of byVendor.sort((a,b) => b._count - a._count)) console.log(' ', m.get(b.vendorId), b._count); await prisma.\$disconnect(); })"
```
Expected: roughly 167 priced offerings across a dozen or more vendors.

Then open https://labtestcompare.com and confirm: the homepage lists tests, category filters all return results, and a test detail page shows several vendors with prices.

- [ ] **Step 8: Work the review queue**

Open `/admin/discovered` → the **Matched** tab. This holds the exact-name/alias matches — roughly 50, including everything from `algorx`, `directlabs`, `mito-health`, and `private-md-labs`, which have no lab codes and therefore no offerings yet. Review and bulk-list the correct ones. Those four vendors do not appear on the site until this is done.

- [ ] **Step 9: Update the documentation**

Per the project's documentation discipline, all three docs change in this same commit.

**CLAUDE.md:**
- Gotcha 7: note that the catalog is now the 30-test core list (`packages/database/data/2026-09-07-core-30/`), reseeded by `import-master-tests.ts --file`.
- Gotcha 13/14: record that pre-linking every vendor to every test is **abandoned** — `link-all-tests-all-vendors.ts` must not be run again; an offering now means the vendor genuinely sells the test, which Phase 2 depends on.
- Add a note that `runVendorDiscovery` never creates offerings, and that code-matched products are auto-listed by `autolist-code-matches.ts` while name matches wait in `/admin/discovered`.
- Note that `discovered-actions.ts` and `ga4-data.ts` now live in packages and are re-exported from `apps/web/lib`.

**SKILLS.md:** add a "Catalog reset" workflow — the Task 12 script sequence — and document the auto-list match policy.

**CHANGELOG.md:** add under `[Unreleased]`: the catalog reset, the 30-test core catalog, the no-pre-linking policy, the auto-list rule, and the Monday traffic topline.

**Note for whoever is on call the following Monday:** the first weekly digest email after this reset
will legitimately show an **empty "Click-throughs by vendor" section and an empty "Most-viewed tests"
section**. Step 2's reset deletes every `AffiliateClick` row (moved to `affiliate_click_archive`, which
the digest does not read) and nulls every `page_views.test_id`. The page-view **total** will still show
its pre-reset count (that column isn't touched), just with no per-test breakdown. This is correct
behavior given the reset, not a broken digest — don't spend time debugging it.

```bash
git add -A
git commit -m "Document the catalog reset and the new offering policy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Qu29AJH5ZJJb9rCim4jiU"
git -c http.version=HTTP/1.1 push
```

---

## Self-review notes

**Spec coverage:** §1.1 → Task 2. §1.2 → Tasks 1 + 4. §1.3 → Tasks 2 + 3. §1.4 → Task 8. §2.1/2.2 → Tasks 5, 6, 7. §2.3 → Task 9. §3.1 → Task 10. §3.2/3.3 → Task 11. Testing → per-task steps plus Task 12 Step 7. Documentation → Task 12 Step 9.

**Deviation from the spec, recorded deliberately:** the spec says code matches auto-publish and everything else queues. During planning the user amended this — exact-name/alias matches are *also* held for review rather than published, which is what Task 7 implements. The spec's §2.2 wording predates that amendment; Task 7's code comments are authoritative.

**Known soft spot:** Task 9's 410 mechanism is genuinely uncertain in Next.js App Router Server Components, so the task instructs the implementer to inspect existing patterns and fall back to sitemap removal alone rather than inventing a fragile status-code mechanism. That fallback is acceptable — it de-indexes more slowly but carries no risk.
