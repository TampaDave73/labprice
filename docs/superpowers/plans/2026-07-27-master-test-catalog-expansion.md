# Master Test Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand LabTestCompare's production test catalog to the 246-row master biomarker list
(`labtestcompare-master-tests.xlsx`), add the methodology/confidence/cardio-IQ data model needed to
stop collapsing distinct lab methodologies into one price comparison, and update the scraper matching
+ UI to respect that new data. All schema/data changes run against the production database directly
(no staging tier) — this repo's local Docker Postgres only ever had a 12-row dev seed and is not the
target of any step in this plan.

**Architecture:** The existing schema already normalizes categories/aliases into join tables
(`TestCategory`, `TestAlias`, `Category`) — the source spec assumed a flatter table, so this plan
adapts Sections 1–6 of the spec onto the *real* schema rather than replacing it. `Test.questCode`/
`Test.labcorpCode` (plain nullable strings) are confirmed the sole canonical code fields in every
real code path (`TestCode` child table is defined but has zero readers/writers anywhere — dead code,
left alone). New Test-level fields (methodology, confidence, etc.) are added as plain columns
alongside them. The 246-row master list is imported as data (upsert on slug) rather than as code;
matching-rule changes are threaded through the existing `packages/scrapers/src/catalog` pipeline
(`TestKey` → `matcher.ts` → `persist.ts`/`scrape-execute.ts`).

**Tech Stack:** Prisma (PostgreSQL 16, `db:push` workflow — no migration files), Next.js 15 App
Router, `tsx` worker scripts, `exceljs` (already a dependency of `apps/web`), Vitest (`@labprice/scrapers` tests).

## Global Constraints

- `quest_code`/`labcorp_code` stay nullable `TEXT`, never unique-constrained (one code can legitimately
  belong to >1 test row — panel + component, or a Cardio IQ sibling with no code of its own on one side).
- Every schema change goes through `packages/database/prisma/schema.prisma` + `db:push` — **stop all
  dev servers first** (Windows Prisma query-engine DLL lock), batch every field addition into one pass.
- `categories`/`aliases` UI stays pipe-delimited at the presentation edge (Excel columns, CSV-era
  contracts) even though storage is relational — match the existing Tests Excel round-trip's contract.
- The literal category string is `Sexual Health / STD` (space-slash-space) — never slugify that into
  the stored `Category.name`; slugify only when deriving `Category.slug` (`sexual-health-std`).
- Every script that mutates the DB in bulk (fixes, import) must default to a dry run and require an
  explicit `--apply` flag, matching this codebase's existing "preview → confirm" contract for bulk
  admin writes (Tests/Discovered Excel import).
- Confidence gating: a `confidence = 'LOW'` test row must never auto-approve a scraped price — same
  shape as the existing `trustLevel === 'LOW'` vendor rule, applied as a *second*, independent gate.
- Follow the project's documentation discipline: update `CLAUDE.md`, `SKILLS.md`, and `CHANGELOG.md`
  in the same change that adds/changes the feature they describe (final task in this plan).
- **Target the production database, not the local Docker Postgres, for every DB-touching command in
  this plan** (schema push, seed, fixes, import, and all verification queries) — this environment has
  no staging tier, so production IS the only database whose current state matters. Every worker
  script/CLI invocation that would otherwise use `DOTENV_CONFIG_PATH=../../.env` (local) instead uses
  `DOTENV_CONFIG_PATH=../../.env.scrape-prod` (the Railway production `DATABASE_URL`) from
  `apps/worker`, and `packages/database`'s `db:push`/`db:generate` run via
  `npx dotenv -e ../../.env.scrape-prod -- prisma db push` (bypassing the `package.json` script,
  which is hardcoded to the local `.env`). There is no local `psql`/`docker exec` access to this
  remote database — verification queries use `npx dotenv -e ../../.env.scrape-prod -- prisma db
  execute --stdin` (pipe the SQL in) instead of `docker exec labprice-postgres-1 psql`. Since
  production is a live site, prefer read-only verification queries; the only writes in this plan are
  the explicit `--apply` runs of the fixes/import scripts and the one `db:push` schema migration, all
  pre-authorized to run straight through (no per-step pause) per explicit user confirmation before
  this plan's execution began.

## Scope decisions made while adapting the spec (flag to the user before/while executing)

1. **Cardio IQ "one analyte heading" (spec 5b)** is implemented as a badge + cross-link note, not a
   new analyte-grouping browsing feature — the master list already models each Cardio IQ variant as
   its own `Test` row (separate slug/name), so "don't dedupe, don't conflict" is already true by
   construction; the remaining work is purely presentational.
2. **Region-variable codes (spec 6.4)** reuse the new generic `Test.notes` column instead of a new
   boolean/flag column — the spec's Section 1 migration doesn't list a dedicated column for this, and
   no row in the current 246-row master list actually needs it yet, so a generic "render `notes` as a
   callout" mechanism covers this without speculative schema.
3. **`Category.isPrimary`** is a new column *not* in the spec's literal Section 1 SQL (which only
   migrates `tests`) — added because Section 2's "original 10 as primary chips, 11 new as secondary
   facet" UI requirement has no other non-hardcoded way to know which 10 are "original" once more
   categories get added later via the admin Categories CRUD.

---

### Task 1: Schema migration — new `Test` columns, `Confidence` enum, `Category.isPrimary`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `docs/database/ddl.sql` (document the two partial indexes Prisma's `db:push` can't express)

**Interfaces:**
- Produces: `Test.methodology: string | null`, `Test.labVariant: string | null`,
  `Test.cardioIq: boolean` (default false), `Test.confidence: Confidence` (default `LOW`),
  `Test.thirdPartyOnly: boolean` (default false), `Test.notes: string | null`,
  `Test.codeVerifiedAt: Date | null`, `Category.isPrimary: boolean` (default true) — every later task
  reads/writes these exact field names.

- [ ] **Step 1: Add the `Confidence` enum next to the other enums**

In `packages/database/prisma/schema.prisma`, right after the existing `TrustLevel` enum (around line 42):

```prisma
enum Confidence {
  HIGH
  MEDIUM
  LOW
}
```

- [ ] **Step 2: Add the new `Test` columns**

In the `Test` model, after `labcorpCode` (around line 224):

```prisma
  labcorpCode  String?   @map("labcorp_code")
  // Free-text lab methodology ("LC/MS-MS", "ECLIA immunoassay", "equilibrium dialysis + LC/MS-MS").
  // Two tests with the same analyte but different methodology are NEVER the same product — this is
  // what stops the matcher from comparing a $29 immunoassay total-T next to an $89 dialysis free+total.
  methodology  String?   @map("methodology")
  // Free-text variant label ("standard", "Cardio IQ", "ultrasensitive", "dialysis") — human-readable
  // sibling of `cardioIq` below; not matched on, purely descriptive/UI.
  labVariant   String?   @map("lab_variant")
  // Quest routes advanced-CV analytes through branded order codes (Cardio IQ®). A cardioIq=true row
  // is a SIBLING SKU of a standard-code row for the same analyte, never a duplicate to merge and
  // never a conflict to flag — see packages/scrapers/src/catalog/matcher.ts, unaffected either way
  // since each is its own Test row with its own code.
  cardioIq     Boolean   @default(false) @map("cardio_iq")
  // How reliably this test's codes were verified against the labs' own directories. Gates automated
  // scraper matching (LOW never auto-approves a price — see shouldAutoApprove in persist.ts /
  // scrape-execute.ts) independently of vendor trust.
  confidence   Confidence @default(LOW)
  // True for tests with no standard Quest/LabCorp order code at all (specialty-only: Omega-3 Index,
  // Zonulin, Biological Age, Telomere Length, NAD+, GlycanAge, Klotho). Drives the "Not offered by
  // Quest or Labcorp" empty state instead of a blank price table.
  thirdPartyOnly Boolean @default(false) @map("third_party_only")
  // Free-text research note — verification caveats, "PASS 3: codes unverified", region-variable code
  // callouts ("Quest gates this by service area — verify locally"). Rendered as a small UI callout
  // when present; not otherwise machine-read.
  notes        String?   @map("notes")
  // Stamped NOW() only when confidence is promoted to HIGH (by the import script or a future manual
  // admin action) — when a code was actually last confirmed against the lab's own directory.
  codeVerifiedAt DateTime? @map("code_verified_at")
```

- [ ] **Step 3: Add the two code indexes**

Still in `Test`, alongside the existing `@@index` lines (around line 248):

```prisma
  @@index([categoryId])
  @@index([isPopular])
  @@index([displayOrder])
  @@index([questCode])
  @@index([labcorpCode])
  @@map("tests")
```

(Plain indexes, not partial — Prisma's `db:push` flow can't express `WHERE col IS NOT NULL`. Document
the partial-index intent in `ddl.sql` in Step 5 for whoever eventually runs raw SQL against production.)

- [ ] **Step 4: Add `Category.isPrimary`**

In the `Category` model (around line 194):

```prisma
model Category {
  id           String   @id @default(cuid())
  name         String   @unique
  slug         String   @unique
  displayOrder Int      @default(0) @map("display_order")
  // The original 10-category taxonomy renders as primary filter chips on the homepage; anything added
  // later (the 2026-07-27 taxonomy expansion's 11 new categories, or any future admin-created one
  // this flag is left true for unless explicitly demoted) renders in the secondary/expandable facet.
  isPrimary    Boolean  @default(true) @map("is_primary")
  colorBg      String?  @map("color_bg")
  colorText    String?  @map("color_text")
```

- [ ] **Step 5: Document the partial indexes in `ddl.sql`**

Append to `docs/database/ddl.sql` (near the existing `tests` slug-uniqueness section, ~line 215):

```sql
-- Partial indexes for the two lab-code lookups (Prisma's db:push can't express a WHERE clause on
-- @@index, so these are applied here as raw SQL directly against production once — see Step 6).
-- The plain non-partial equivalents from schema.prisma cover every environment already; these two
-- are a production-only refinement.
CREATE INDEX IF NOT EXISTS idx_tests_quest_code
    ON tests (quest_code) WHERE quest_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tests_labcorp_code
    ON tests (labcorp_code) WHERE labcorp_code IS NOT NULL;
```

- [ ] **Step 6: Stop dev servers, push the schema to PRODUCTION, regenerate the client, apply the partial indexes**

```bash
# Stop any running `pnpm dev` / `pnpm dev:worker` first (Windows Prisma DLL lock).
cd packages/database
npx dotenv -e ../../.env.scrape-prod -- prisma db push
npx dotenv -e ../../.env.scrape-prod -- prisma generate
```

Expected: `db:push` reports the new columns/enum/indexes applied with no data loss (all new columns
have defaults or are nullable — additive only, so `db push` should not ask for `--accept-data-loss`;
if it does, STOP and report back rather than passing that flag automatically). `prisma generate`
regenerates the Prisma client with the new fields typed.

Then apply the two partial indexes from Step 5 directly (Prisma's `db push` can't express them):

```bash
npx dotenv -e ../../.env.scrape-prod -- prisma db execute --stdin --schema=prisma/schema.prisma <<'EOF'
CREATE INDEX IF NOT EXISTS idx_tests_quest_code ON tests (quest_code) WHERE quest_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tests_labcorp_code ON tests (labcorp_code) WHERE labcorp_code IS NOT NULL;
EOF
```

- [ ] **Step 7: Verify the columns exist on production**

```bash
npx dotenv -e ../../.env.scrape-prod -- prisma db execute --stdin --schema=prisma/schema.prisma <<'EOF'
SELECT column_name FROM information_schema.columns WHERE table_name = 'tests' AND column_name IN
  ('methodology','lab_variant','cardio_iq','confidence','third_party_only','notes','code_verified_at');
SELECT column_name FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'is_primary';
SELECT indexname FROM pg_indexes WHERE tablename = 'tests' AND indexname LIKE 'idx_tests_%code%';
EOF
```

Expected: all 7 `tests` columns listed, `is_primary` listed for `categories`, and both partial indexes
listed.

- [ ] **Step 8: Commit**

```bash
git add packages/database/prisma/schema.prisma docs/database/ddl.sql
git commit -m "Add methodology/confidence/cardio-IQ fields to Test, isPrimary to Category"
```

---

### Task 2: Category taxonomy — seed the 11 new categories, mark originals primary

**Files:**
- Create: `packages/database/data/2026-07-27-master-tests/categories.json` (also used by Task 5's import)
- Create: `apps/worker/scripts/seed-category-taxonomy.ts`
- Modify: `apps/web/app/api/v1/categories/route.ts` (expose `isPrimary`)

**Interfaces:**
- Consumes: `Category.isPrimary` (Task 1).
- Produces: `/api/v1/categories` response rows gain an `isPrimary: boolean` field — Task 8's homepage
  filter reads this to split primary chips from the secondary facet.

- [ ] **Step 1: Write the categories data file**

`packages/database/data/2026-07-27-master-tests/categories.json`:

```json
[
  { "name": "Vitamins & Minerals", "isPrimary": true },
  { "name": "Hormones", "isPrimary": true },
  { "name": "Metabolic", "isPrimary": true },
  { "name": "Blood Count", "isPrimary": true },
  { "name": "Cancer Markers", "isPrimary": true },
  { "name": "Genetics", "isPrimary": true },
  { "name": "Inflammation", "isPrimary": true },
  { "name": "Heavy Metals", "isPrimary": true },
  { "name": "Cardiovascular", "isPrimary": true },
  { "name": "General Health", "isPrimary": true },
  { "name": "Thyroid", "isPrimary": false },
  { "name": "Liver", "isPrimary": false },
  { "name": "Kidney", "isPrimary": false },
  { "name": "Electrolytes", "isPrimary": false },
  { "name": "Autoimmune", "isPrimary": false },
  { "name": "Allergy", "isPrimary": false },
  { "name": "Fertility", "isPrimary": false },
  { "name": "Nutrition", "isPrimary": false },
  { "name": "Coagulation", "isPrimary": false },
  { "name": "Bone Health", "isPrimary": false },
  { "name": "Sexual Health / STD", "isPrimary": false }
]
```

- [ ] **Step 2: Write the seed script**

`apps/worker/scripts/seed-category-taxonomy.ts`:

```ts
// One-time (idempotent) taxonomy expansion: upserts the 21-category list (10 original + 11 new from
// the 2026-07-27 master biomarker research pass) and stamps isPrimary on every row, including any
// pre-existing category not in this file (left untouched otherwise). Safe to re-run.
import { prisma } from '@labprice/database';
import categories from '../../../packages/database/data/2026-07-27-master-tests/categories.json';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  const existing = await prisma.category.findMany({ select: { name: true, displayOrder: true } });
  let nextOrder = Math.max(0, ...existing.map((c) => c.displayOrder)) + 1;

  for (const cat of categories as { name: string; isPrimary: boolean }[]) {
    const already = existing.find((e) => e.name === cat.name);
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { isPrimary: cat.isPrimary },
      create: {
        name: cat.name,
        slug: slugify(cat.name),
        displayOrder: already ? already.displayOrder : nextOrder++,
        isPrimary: cat.isPrimary,
      },
    });
    console.log(`${already ? 'updated' : 'created'}: ${cat.name} (isPrimary=${cat.isPrimary})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 3: Run it**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/seed-category-taxonomy.ts
```

Expected: 10 `updated` lines (the pre-existing categories, now `isPrimary=true`) + 11 `created` lines
(the new ones, `isPrimary=false`).

- [ ] **Step 4: Verify**

```bash
cd packages/database && npx dotenv -e ../../.env.scrape-prod -- prisma db execute --stdin --schema=prisma/schema.prisma <<'EOF'
SELECT name, slug, is_primary FROM categories ORDER BY display_order;
EOF
```

Expected: 21 rows; the original 10 show `is_primary = t`; the 11 new ones (including
`Sexual Health / STD` with slug `sexual-health-std`, NOT a literal slash) show `is_primary = f`.

- [ ] **Step 5: Expose `isPrimary` from the categories API**

In `apps/web/app/api/v1/categories/route.ts`, add `isPrimary: true` to the `select`-equivalent
(it's a plain `findMany` with no `select`, so just add the field to the mapped `data` array):

```ts
    const data = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      displayOrder: c.displayOrder,
      isPrimary: c.isPrimary,
      colorBg: c.colorBg,
      colorText: c.colorText,
      testCount: c._count.tests,
    }));
```

- [ ] **Step 6: Commit**

```bash
git add packages/database/data/2026-07-27-master-tests/categories.json apps/worker/scripts/seed-category-taxonomy.ts apps/web/app/api/v1/categories/route.ts
git commit -m "Seed the 21-category taxonomy and expose isPrimary"
```

---

### Task 3: Commit the master-list data snapshot (Tests / Fixes / Pass-3 Queue)

**Files:**
- Create: `packages/database/data/2026-07-27-master-tests/tests.json`
- Create: `packages/database/data/2026-07-27-master-tests/fixes.json`
- Create: `packages/database/data/2026-07-27-master-tests/pass3-queue.json`

**Interfaces:**
- Produces: three JSON files, each an array of plain objects with the exact column names from the
  source workbook's header row (`name`, `short_name`, `slug`, `quest_code`, `labcorp_code`,
  `methodology`, `lab_variant`, `cardio_iq`, `categories`, `aliases`, `confidence`,
  `third_party_only`, `is_popular`, `notes` for tests.json; `existing_test_name`, `field`,
  `current_value`, `corrected_value`, `severity`, `why`, `source` for fixes.json;
  `name`, `slug`, `missing`, `quest_code`, `labcorp_code`, `categories`, `notes` for
  pass3-queue.json). Tasks 4 and 5 read these files by exact key name.

This data already exists as extracted JSON in the session scratchpad
(`sheet-Tests.json`, `sheet-Fixes-to-Apply.json`, `sheet-Pass-3-Queue.json`, each shaped
`{ header: string[], records: Record<string,string>[] }`) — this task just re-shapes and commits it.

- [ ] **Step 1: Re-shape and write `tests.json`**

Take the `records` array from the scratchpad's `sheet-Tests.json` verbatim (246 objects, string
values exactly as in the workbook — `"TRUE"`/`"FALSE"` for booleans, empty string for blanks) and
write it as a plain JSON array to `packages/database/data/2026-07-27-master-tests/tests.json`.

- [ ] **Step 2: Re-shape and write `fixes.json`**

Same for `sheet-Fixes-to-Apply.json`'s `records` (11 objects) →
`packages/database/data/2026-07-27-master-tests/fixes.json`.

- [ ] **Step 3: Re-shape and write `pass3-queue.json`**

Same for `sheet-Pass-3-Queue.json`'s `records` (108 objects) →
`packages/database/data/2026-07-27-master-tests/pass3-queue.json`. This file isn't consumed by any
script in this plan — it's committed as the admin's work list for filling in the remaining blank
codes by hand later (per the spec's closing section), so it needs to live somewhere durable.

- [ ] **Step 4: Sanity-check row counts**

```bash
node -e "console.log(require('./packages/database/data/2026-07-27-master-tests/tests.json').length)"
node -e "console.log(require('./packages/database/data/2026-07-27-master-tests/fixes.json').length)"
node -e "console.log(require('./packages/database/data/2026-07-27-master-tests/pass3-queue.json').length)"
```

Expected: `246`, `11`, `108`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/data/2026-07-27-master-tests/
git commit -m "Commit the 2026-07-27 master biomarker list data (tests, fixes, pass-3 queue)"
```

---

### Task 4: Apply the `Fixes to Apply` corrections, audit-logged

**Files:**
- Create: `apps/worker/scripts/apply-master-test-fixes.ts`

**Interfaces:**
- Consumes: `packages/database/data/2026-07-27-master-tests/fixes.json` (Task 3),
  `prisma.auditLog.create` (existing model — no schema change; `actorId: null` = system).
- Produces: console report of applied / skipped-no-match / skipped-no-change fixes; one `AuditLog`
  row per actually-applied field change (`action: 'test.fix_applied'`).

This must run **before** Task 5's import, against production's real `tests` rows (the spec's
"existing ~68 rows" — this environment's local Docker Postgres only has the 12-row dev seed and is
NOT the target; see the Global Constraints). Some of the 11 fix rows are `NO CHANGE`/`LABEL FIX`
severity, kept purely for the audit trail even when nothing needs to move. Matching is by exact
`existing_test_name` — case-sensitive, matching the sheet's byte-for-byte spelling — against whatever
test names actually exist in production, which this plan cannot enumerate in advance.

- [ ] **Step 1: Write the script**

`apps/worker/scripts/apply-master-test-fixes.ts`:

```ts
// Applies packages/database/data/2026-07-27-master-tests/fixes.json against whatever `tests` rows
// currently exist, BEFORE the master-list import (import-master-tests.ts) runs. Matching is by exact
// existing_test_name. Every applied field change gets its own AuditLog row (actorId: null = system) —
// "log every applied fix to an audit table" per the migration spec, reusing the existing AuditLog
// model rather than adding a new one.
//
// Dry-run by default; pass --apply to write.
import { prisma } from '@labprice/database';
import fixes from '../../../packages/database/data/2026-07-27-master-tests/fixes.json';

type Fix = {
  existing_test_name: string;
  field: string;
  current_value: string;
  corrected_value: string;
  severity: string;
  why: string;
  source: string;
};

const FIELD_MAP: Record<string, 'questCode' | 'labcorpCode' | 'name'> = {
  quest_code: 'questCode',
  labcorp_code: 'labcorpCode',
  name: 'name',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = fixes as Fix[];

  let applied = 0, skippedNoMatch = 0, skippedNoOp = 0;

  for (const fix of rows) {
    if (fix.severity === 'NO CHANGE') { skippedNoOp++; console.log(`NO-OP  (${fix.severity}) ${fix.existing_test_name} — ${fix.why}`); continue; }

    const test = await prisma.test.findFirst({ where: { name: fix.existing_test_name, deletedAt: null } });
    if (!test) { skippedNoMatch++; console.log(`SKIP   no test named "${fix.existing_test_name}" exists in the database`); continue; }

    const field = FIELD_MAP[fix.field];
    if (!field) { console.log(`SKIP   unrecognized field "${fix.field}" on ${fix.existing_test_name}`); continue; }

    const before = (test as unknown as Record<string, string | null>)[field];
    const after = fix.corrected_value;
    if ((before ?? '') === after) { skippedNoOp++; console.log(`NO-OP  ${fix.existing_test_name}.${field} already "${after}"`); continue; }

    console.log(`${apply ? 'APPLY' : 'WOULD APPLY'} ${fix.existing_test_name}.${field}: "${before ?? ''}" -> "${after}"`);
    applied++;
    if (!apply) continue;

    await prisma.$transaction([
      prisma.test.update({ where: { id: test.id }, data: { [field]: after } }),
      prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'test.fix_applied',
          entityType: 'test',
          entityId: test.id,
          oldValues: { [field]: before },
          newValues: { [field]: after, severity: fix.severity, why: fix.why, source: fix.source },
        },
      }),
    ]);
  }

  console.log(`\n${applied} ${apply ? 'applied' : 'would apply'}, ${skippedNoMatch} skipped (no matching test), ${skippedNoOp} no-op.`);
  if (!apply) console.log('Dry run only — re-run with --apply to write.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 2: Dry-run it**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/apply-master-test-fixes.ts
```

Expected: production is the spec's "existing ~68 rows," not this dev environment's 12-row seed, so
the exact set of `WOULD APPLY` lines depends on which `existing_test_name` values are actually present
in production right now — this is genuinely unknown until the script runs. Read the dry-run output
line by line before proceeding to Step 3: every `WOULD APPLY` line should read as a plausible,
targeted correction (matches the spec's fixes.json entries); anything else (an unexpected match, an
unexpected diff) is a reason to stop and investigate rather than apply blind. `NO CHANGE`-severity
rows always report `NO-OP`; rows whose `existing_test_name` isn't present report `SKIP`.

- [ ] **Step 3: Apply it**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/apply-master-test-fixes.ts --apply
```

Expected: the same `APPLY` lines seen in Step 2's dry run, now applied; exits 0.

- [ ] **Step 4: Verify the audit trail**

```bash
cd packages/database && npx dotenv -e ../../.env.scrape-prod -- prisma db execute --stdin --schema=prisma/schema.prisma <<'EOF'
SELECT action, entity_id, old_values, new_values FROM audit_logs WHERE action = 'test.fix_applied';
EOF
```

Expected: one row per fix actually applied in Step 3 (however many that turned out to be against
production's real data — see the Step 2 dry-run output for the exact count), each showing the
old/new value and the `why`/`source`/`severity` in `new_values`.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/scripts/apply-master-test-fixes.ts
git commit -m "Add script to apply master-list corrections to existing tests, audit-logged"
```

---

### Task 5: Import the 246-row master test list

**Files:**
- Create: `apps/worker/scripts/import-master-tests.ts`

**Interfaces:**
- Consumes: `packages/database/data/2026-07-27-master-tests/tests.json` (Task 3), the 21 seeded
  `Category` rows (Task 2), `normalizeName` from `@labprice/scrapers/src/catalog/matcher`.
- Produces: upserted `Test` rows (by `slug`) with full `TestCategory`/`TestAlias` sets; a printed
  report of pre-existing tests whose slug isn't in the master list (the spec's "flag for manual
  review" — a report, not a schema field, since nothing about those rows needs to change).

Must run **after** Task 4 (fixes) and Task 2 (categories). Upsert key is `slug`, matching the spec
and this codebase's existing Tests-importer convention (`apps/web/app/api/v1/admin/tests/import`) —
reused here: `categories`/`aliases` are pipe-delimited, `cardio_iq`/`third_party_only`/`is_popular`
arrive as `"TRUE"`/`"FALSE"` strings, empty code strings become `null`. Unlike the admin importer,
an **unknown category name fails the whole import** (spec 4: "fail the import on an unknown value
rather than inserting it") rather than auto-creating it — Task 2 already seeded all 21 valid names,
so any row citing something else is a data error in the sheet, not a legitimately new category.

- [ ] **Step 1: Write the script**

`apps/worker/scripts/import-master-tests.ts`:

```ts
// Imports the 246-row 2026-07-27 master biomarker list. Upserts on slug (create if new, update if a
// test with that slug already exists); never deletes. Run AFTER apply-master-test-fixes.ts.
//
// Category names are validated against the already-seeded 21-category taxonomy (seed-category-
// taxonomy.ts) — an unrecognized category FAILS THE WHOLE IMPORT (nothing partially applied), per the
// migration spec: a plausible-looking wrong category is worse than a loud rejection.
import { prisma } from '@labprice/database';
import { normalizeName } from '@labprice/scrapers/src/catalog/matcher';
import tests from '../../../packages/database/data/2026-07-27-master-tests/tests.json';

type Row = {
  name: string; short_name: string; slug: string; quest_code: string; labcorp_code: string;
  methodology: string; lab_variant: string; cardio_iq: string; categories: string; aliases: string;
  confidence: string; third_party_only: string; is_popular: string; notes: string;
};

const toBool = (s: string) => s.trim().toUpperCase() === 'TRUE';
const toNull = (s: string) => (s.trim() === '' ? null : s.trim());
const splitPipes = (s: string) => s.split('|').map((p) => p.trim()).filter(Boolean);
const CONFIDENCE = new Set(['High', 'Medium', 'Low']);

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = tests as Row[];

  const categories = await prisma.category.findMany({ select: { id: true, name: true, displayOrder: true } });
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  // Fail fast on any unknown category BEFORE touching the DB — "fail the import" means the whole
  // file, not a partial apply.
  const unknown = new Set<string>();
  for (const row of rows) {
    for (const catName of splitPipes(row.categories)) {
      if (!categoryByName.has(catName)) unknown.add(`${catName} (row: ${row.name})`);
    }
    if (!CONFIDENCE.has(row.confidence)) unknown.add(`confidence="${row.confidence}" (row: ${row.name})`);
  }
  if (unknown.size > 0) {
    console.error(`Import ABORTED — unknown category/confidence value(s):\n  ${[...unknown].join('\n  ')}`);
    process.exit(1);
  }

  const existing = await prisma.test.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } });
  const existingBySlug = new Map(existing.map((t) => [t.slug, t]));
  const touchedSlugs = new Set<string>();

  let created = 0, updated = 0;
  for (const row of rows) {
    touchedSlugs.add(row.slug);
    const cats = splitPipes(row.categories).map((n) => categoryByName.get(n)!);
    const displayCategoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;
    const confidence = row.confidence.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW';

    const data = {
      name: row.name,
      shortName: row.short_name || row.name,
      slug: row.slug,
      questCode: toNull(row.quest_code),
      labcorpCode: toNull(row.labcorp_code),
      methodology: toNull(row.methodology),
      labVariant: toNull(row.lab_variant),
      cardioIq: toBool(row.cardio_iq),
      confidence,
      thirdPartyOnly: toBool(row.third_party_only),
      isPopular: toBool(row.is_popular),
      notes: toNull(row.notes),
      categoryId: displayCategoryId,
      codeVerifiedAt: confidence === 'HIGH' ? new Date() : null,
    };

    const already = existingBySlug.get(row.slug);
    const testId = apply
      ? (already
          ? (await prisma.test.update({ where: { id: already.id }, data })).id
          : (await prisma.test.create({ data })).id)
      : already?.id ?? '(new)';

    if (apply && testId !== '(new)') {
      await prisma.testCategory.deleteMany({ where: { testId } });
      await prisma.testCategory.createMany({ data: cats.map((c) => ({ testId, categoryId: c.id })), skipDuplicates: true });

      const aliasRows = splitPipes(row.aliases)
        .map((a) => ({ testId, alias: a, normalized: normalizeName(a), source: 'master-import' }));
      const seen = new Set<string>();
      const deduped = aliasRows.filter((a) => a.normalized && !seen.has(a.normalized) && seen.add(a.normalized));
      await prisma.testAlias.deleteMany({ where: { testId } });
      if (deduped.length > 0) await prisma.testAlias.createMany({ data: deduped });
    }

    if (already) updated++; else created++;
  }

  console.log(`${apply ? '' : '[dry run] '}${created} to create, ${updated} to update.`);

  // Flag existing tests NOT present in the master list — kept (never deleted), just surfaced.
  const orphaned = existing.filter((t) => !touchedSlugs.has(t.slug));
  if (orphaned.length > 0) {
    console.log(`\n${orphaned.length} existing test(s) NOT in the master list (kept, flagged for manual review):`);
    orphaned.forEach((t) => console.log(`  - ${t.slug}`));
  }

  if (apply) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'tests.master_import',
        entityType: 'test',
        entityId: 'bulk',
        newValues: { created, updated, orphaned: orphaned.map((t) => t.slug) },
      },
    });
  } else {
    console.log('\nDry run only — re-run with --apply to write.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 2: Dry-run it**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/import-master-tests.ts
```

Expected: no "unknown category" abort (if it DOES abort, STOP — an unknown category name means either
the sheet or Task 2's seed has a mismatch, and that must be resolved before any write, not
worked around). A line like `[dry run] N to create, M to update.` — the exact split depends on how
many of production's real existing test slugs collide with the master list's 246 slugs, which is
unknown until this runs; read the printed list of "existing tests NOT in the master list" afterward
and treat it as informational (kept, not deleted, per spec), not an error.

- [ ] **Step 3: Apply it**

```bash
cd apps/worker && DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/import-master-tests.ts --apply
```

Expected: same counts as the Step 2 dry run, no dry-run notice; exits 0.

- [ ] **Step 4: Verify**

```bash
cd packages/database && npx dotenv -e ../../.env.scrape-prod -- prisma db execute --stdin --schema=prisma/schema.prisma <<'EOF'
SELECT count(*) FROM tests WHERE deleted_at IS NULL;
SELECT confidence, count(*) FROM tests GROUP BY confidence;
EOF
```

Expected: total test count matches production's pre-import count plus Step 3's "to create" number
(nothing is ever deleted by this script); confidence breakdown roughly `HIGH ~145, MEDIUM ~33,
LOW ~68` from the master list, plus whatever confidence value production's pre-existing,
not-in-the-master-list tests already carried (unaffected by this import).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/scripts/import-master-tests.ts
git commit -m "Add master test list import script (246 rows, upsert on slug)"
```

---

### Task 6: Matching rules — confidence gating + consumer-SKU suffix stripping

**Files:**
- Modify: `packages/scrapers/src/catalog/types.ts` (`TestKey.confidence`)
- Modify: `packages/scrapers/src/catalog/matcher.ts` (`normalizeLabCode` helper + apply it)
- Modify: `packages/scrapers/src/catalog/persist.ts` (`shouldAutoApprove` confidence gate, `TestKey` construction)
- Modify: `apps/worker/src/workers/scrape-execute.ts` (`shouldAutoApprove` confidence gate, `TestKey`-equivalent construction)
- Test: `packages/scrapers/src/__tests__/matcher.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `Test.confidence` (Task 1).
- Produces: `TestKey.confidence?: 'HIGH' | 'MEDIUM' | 'LOW'` — read by both `shouldAutoApprove`
  implementations; `normalizeLabCode(code: string): string` exported from `matcher.ts`.

Section 5a ("match on analyte+methodology, not name") is satisfied by data modeling alone — Task 5
imports each methodology variant as its own `Test` row with its own distinct code/name, and the
existing `matchTestToProducts` already matches per-`Test` (code tier first, name tier only as
fallback with `sharesStrongToken` guarding generic-word collisions). No matcher change is needed for
5a itself; this task covers 5c (SKU suffix) and 5d (confidence gating), which DO need code changes.
5b (Cardio IQ siblings) needs no matcher change either — covered by Task 7's UI badge.

- [ ] **Step 1: Write a failing test for `normalizeLabCode`**

Add to `packages/scrapers/src/__tests__/matcher.test.ts`:

```ts
import { normalizeLabCode } from '../catalog/matcher';

describe('normalizeLabCode', () => {
  it('strips a trailing consumer-SKU letter suffix', () => {
    expect(normalizeLabCode('34604M')).toBe('34604');
  });
  it('leaves a plain numeric code untouched', () => {
    expect(normalizeLabCode('34604')).toBe('34604');
  });
  it('leaves a zero-padded LabCorp code untouched (no trailing letters)', () => {
    expect(normalizeLabCode('004598')).toBe('004598');
  });
  it('strips multiple trailing letters', () => {
    expect(normalizeLabCode('17306ABC')).toBe('17306');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter @labprice/scrapers test -- matcher
```

Expected: FAIL — `normalizeLabCode is not exported` / `is not a function`.

- [ ] **Step 3: Implement `normalizeLabCode` and apply it in code comparisons**

In `packages/scrapers/src/catalog/matcher.ts`, add near the other exported helpers (after `normalizeName`):

```ts
/**
 * Strip a trailing consumer-SKU letter suffix a vendor's own listing appended to a lab order code
 * (QuestHealth DTC SKUs: "34604M"). `^(\d+)[A-Z]*$` — only strips when the whole remainder after the
 * digits is letters; a code that isn't purely digits+letters (shouldn't happen for a real lab code)
 * is returned unchanged rather than mangled.
 */
export function normalizeLabCode(code: string): string {
  const m = /^(\d+)[A-Z]*$/i.exec(code.trim());
  return m ? m[1]! : code.trim();
}
```

Then use it wherever a vendor-supplied code is compared against `test.questCode`/`test.labcorpCode`.
In `tierMatches` (same file):

```ts
  if (tier === 'quest') {
    return (anyProvider || provider.labProvider === 'quest') && !!test.questCode &&
      provider.labTestIDs.some((id) => normalizeLabCode(id) === test.questCode);
  }
  if (tier === 'labcorp') {
    return (anyProvider || provider.labProvider === 'labcorp') && !!test.labcorpCode &&
      provider.labTestIDs.some((id) => normalizeLabCode(id) === test.labcorpCode);
  }
```

And in the `mergeCodeTiers` block's `codeHits` filter (still `matcher.ts`, ~line 63):

```ts
    const codeHits = flat.filter(
      (f) =>
        (!!test.questCode && f.provider.labTestIDs.some((id) => normalizeLabCode(id) === test.questCode)) ||
        (!!test.labcorpCode && f.provider.labTestIDs.some((id) => normalizeLabCode(id) === test.labcorpCode)),
    );
```

Note: this compares the NORMALIZED vendor code against our OWN `test.questCode`/`labcorpCode`, which
stay exactly as imported (clean digits) — `normalizeLabCode` is never applied to our stored code, only
to what a vendor's catalog reports, so a suffixed form is never persisted as `Test.questCode` (5c's
"never persist the suffixed form" requirement is satisfied by construction — nothing in this change
writes `questCode`/`labcorpCode` from vendor data at all).

- [ ] **Step 4: Run the test again, confirm it passes**

```bash
pnpm --filter @labprice/scrapers test -- matcher
```

Expected: PASS, including the pre-existing matcher tests (unaffected — `normalizeLabCode` on an
already-clean code is a no-op).

- [ ] **Step 5: Add `confidence` to `TestKey` and thread it through**

In `packages/scrapers/src/catalog/types.ts`, extend `TestKey`:

```ts
export interface TestKey {
  id: string;
  name: string;
  questCode?: string | null;
  labcorpCode?: string | null;
  aliases?: string[];
  /** Gates automated auto-approval independently of vendor trust — see shouldAutoApprove. */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

In `packages/scrapers/src/catalog/persist.ts`, add `confidence: true` to both `test` selects
(~line 207 and ~line 589) and thread it into the `TestKey` construction (~line 213-219):

```ts
  const tests: TestKey[] = offerings.map((o) => ({
    id: o.test.id,
    name: o.test.name,
    questCode: o.test.questCode,
    labcorpCode: o.test.labcorpCode,
    aliases: o.test.aliases.map((a) => a.alias),
    confidence: o.test.confidence,
  }));
```

(and the equivalent `select`/mapping around line 589-592 for the ingest-matching path).

Then gate `shouldAutoApprove` (~line 734) with an extra parameter:

```ts
function shouldAutoApprove(oldPrice: Prisma.Decimal | null, newPrice: Prisma.Decimal, trust: TrustLevel, confidence: 'HIGH' | 'MEDIUM' | 'LOW' | undefined, baseDecrease: number, baseIncrease: number): boolean {
  if (trust === 'LOW') return false;
  if (confidence === 'LOW') return false;
  if (!oldPrice) return true;
  ...
```

Update both call sites (~line 379, ~line 464) to pass `test.confidence` (the in-scope `test`/`TestKey`
at each call site — confirm the exact local variable name at each site before editing; both already
have the matched `TestKey` in scope as `test`).

- [ ] **Step 6: Apply the same gate in `scrape-execute.ts`**

In `apps/worker/src/workers/scrape-execute.ts`, find the local `shouldAutoApprove` (line 40) and its
call site (line 189) — same change: add a `confidence` parameter, `if (confidence === 'LOW') return false;`
as the first check (or second, right after the existing trust check), and pass through whatever this
file's per-offering test-lookup query returns (add `confidence: true` to that query's `select`/`include`
if not already selecting the full test row).

- [ ] **Step 7: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no new errors (this touches `@labprice/scrapers` and `apps/worker`, but `apps/web` also
imports from `@labprice/scrapers`, so a signature mismatch there would surface here too).

```bash
cd ../../apps/worker && npx tsc --noEmit
```

Expected: no NEW errors beyond the pre-existing ioredis/`publisher.ts` ones already called out in
`CLAUDE.md` gotcha #16 (don't treat those as regressions unless this task touched those files — it doesn't).

- [ ] **Step 8: Commit**

```bash
git add packages/scrapers/src/catalog/types.ts packages/scrapers/src/catalog/matcher.ts packages/scrapers/src/catalog/persist.ts packages/scrapers/src/__tests__/matcher.test.ts apps/worker/src/workers/scrape-execute.ts
git commit -m "Gate scraper auto-approval on test confidence, strip consumer-SKU suffixes in code matching"
```

---

### Task 7: Test detail page UI — third-party-only, confidence badge, notes callout, Cardio IQ badge

**Files:**
- Modify: `apps/web/app/test/[slug]/page.tsx` (pass the new fields down)
- Modify: `apps/web/app/test/[slug]/TestDetailClient.tsx` (render them)

**Interfaces:**
- Consumes: `test.thirdPartyOnly`, `test.confidence`, `test.notes`, `test.cardioIq`, `test.labVariant` (Task 1/5).

- [ ] **Step 1: Pass the new fields from the server component**

In `apps/web/app/test/[slug]/page.tsx`, the `getTest` query already does `prisma.test.findUnique`
with no narrow `select` (full row), so the fields are already fetched — just add them to the
`<TestDetailClient test={{...}}>` prop object (~line 98-111):

```ts
        test={{
          id: test.id,
          name: test.name,
          slug: test.slug,
          category: test.category.name,
          categorySlug: test.category.slug,
          description: test.description,
          purpose: test.purpose,
          procedure: test.procedure,
          preparation: test.preparation,
          normalRange: test.normalRange,
          questCode,
          labcorpCode,
          thirdPartyOnly: test.thirdPartyOnly,
          confidence: test.confidence,
          notes: test.notes,
          cardioIq: test.cardioIq,
          labVariant: test.labVariant,
        }}
```

- [ ] **Step 2: Extend the client component's props type**

In `apps/web/app/test/[slug]/TestDetailClient.tsx`, extend the test prop interface (~line 35-36):

```ts
  questCode: string | null;
  labcorpCode: string | null;
  thirdPartyOnly: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  notes: string | null;
  cardioIq: boolean;
  labVariant: string | null;
```

- [ ] **Step 3: Add the Cardio IQ + confidence badges next to the existing Quest/LabCorp code chips**

Right after the `labcorpCode` chip block (~line 189-194):

```tsx
          {test.cardioIq && (
            <div style={{ padding: '4px 12px', background: 'oklch(0.95 0.05 300)', borderRadius: 20, border: '1px solid oklch(0.85 0.08 300)', fontSize: 12, fontWeight: 600, color: 'oklch(0.4 0.1 300)' }}>
              Cardio IQ&reg; branded variant{test.labVariant ? ` — ${test.labVariant}` : ''}
            </div>
          )}
          {test.confidence !== 'HIGH' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: 'oklch(0.97 0.05 80)', borderRadius: 20, border: '1px solid oklch(0.88 0.08 80)', fontSize: 12, fontWeight: 600, color: 'oklch(0.45 0.1 60)' }}>
              &#9888; {test.confidence === 'MEDIUM' ? 'Partially verified' : 'Unverified'} — codes may need confirmation
            </div>
          )}
```

- [ ] **Step 4: Render `notes` as a callout when present**

Just below the badge row (after the closing `</div>` of the code-chip flex row, ~line 206):

```tsx
      {test.notes && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', marginBottom: 16, borderRadius: 10, background: 'oklch(0.97 0.03 80)', border: '1px solid oklch(0.88 0.06 80)', fontSize: 13, color: 'oklch(0.4 0.06 60)' }}>
        <span aria-hidden="true">&#9432;</span>
        <span>{test.notes}</span>
        </div>
      )}
```

- [ ] **Step 5: Show "Not offered by Quest or Labcorp" instead of an empty price table**

Find the price-table section (~line 339-347, right before `{sorted.map((row) => {`). Wrap the
existing table body in a conditional and add the empty state:

```tsx
            {offerings.length === 0 && test.thirdPartyOnly ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 14, color: 'oklch(0.5 0.04 260)' }}>
                Not offered by Quest or LabCorp — this is a specialty/third-party test.
              </div>
            ) : offerings.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 14, color: 'oklch(0.5 0.04 260)' }}>
                No ordering services currently list this test.
              </div>
            ) : (
              sorted.map((row) => {
                const isBest = cheapest != null && row.price === cheapest.price;
                return (
                  <div
                    key={row.id}
                    className={isBest ? 'td-row-best' : 'td-row'}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px', alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid oklch(0.96 0.01 260)', transition: 'background 0.1s', background: isBest ? BEST.rowBg : '#fff' }}
                  >
```

...and close the added `)` after the existing `.map()`'s closing (find the matching `})}` that ends
the map and change it to close the new ternary too — read the surrounding ~40 lines in the actual
file before editing to get the exact brace/paren nesting right, since this plan only shows the two
edit boundaries, not the full unchanged body in between).

- [ ] **Step 6: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Verify in a browser, against production data**

Task 5's import ran against production, not the local Docker Postgres, so point the local dev
server's `DATABASE_URL` at production for this read-only check (this only affects requests you make
yourself in the browser — don't click any admin mutating action while pointed at prod):

```bash
cd apps/web && DATABASE_URL="$(grep ^DATABASE_URL= ../../.env.scrape-prod | cut -d= -f2-)" pnpm dev
```

Visit a test whose `thirdPartyOnly=true` (e.g. `/test/zonulin` or `/test/klotho`, present in the
master list imported by Task 5) — expect the "Not offered by Quest or LabCorp" message instead of an
empty table. Visit a `cardioIq=true` test (e.g. `/test/homocysteine-cardio-iq`) — expect the Cardio IQ
badge. Visit a `confidence=LOW` test — expect the "Unverified" badge. Visit a test with a `notes`
value (e.g. any `PASS 3: ...` row) — expect the callout. Stop the dev server when done (`Ctrl+C`) so
nothing keeps a live connection to production open unnecessarily.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/test/\[slug\]/page.tsx apps/web/app/test/\[slug\]/TestDetailClient.tsx
git commit -m "Add third-party-only, confidence, Cardio IQ, and notes UI to the test detail page"
```

---

### Task 8: Homepage category filter — primary chips + secondary expandable facet, AND/OR semantics

**Files:**
- Modify: `apps/web/app/components/CategoryTabs.tsx` (or replace with a new two-facet component — see Step 1)
- Modify: `apps/web/app/components/HomeTestList.tsx` (filtering logic + props)
- Modify: `apps/web/app/page.tsx` (pass `isPrimary` through to categories prop)

**Interfaces:**
- Consumes: `Category.isPrimary` (Task 1/2).
- Produces: `HomeTestList`'s `categories` prop gains `isPrimary: boolean`; internal filter state
  changes from a single `activeCategory: string` to two `Set<string>` selections (primary, secondary),
  OR-matched within each set, AND-matched between the two sets.

- [ ] **Step 1: Rename/restructure the filter component for multi-select two-facet use**

Replace the single-select `CategoryTabs` with a `CategoryFilters` component that renders the primary
chips as toggleable (not radio-style) buttons plus a "More filters" disclosure for the secondary set:

`apps/web/app/components/CategoryFilters.tsx` (new file, `CategoryTabs.tsx` deleted once this replaces
its only usage in `HomeTestList.tsx`):

```tsx
'use client';
import { useState } from 'react';

interface Cat { name: string; slug: string; isPrimary: boolean }
interface Props {
  categories: Cat[];
  activePrimary: Set<string>;
  activeSecondary: Set<string>;
  onTogglePrimary: (slug: string) => void;
  onToggleSecondary: (slug: string) => void;
}

const chipStyle = (active: boolean) => ({
  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer' as const,
  transition: 'all 150ms', border: '1.5px solid',
  background: active ? 'linear-gradient(135deg, oklch(0.58 0.136 260), oklch(0.49 0.14 262))' : '#fff',
  color: active ? '#fff' : 'oklch(0.45 0.074 260)',
  borderColor: active ? 'oklch(0.58 0.136 260)' : 'oklch(0.88 0.03 260)',
});

export default function CategoryFilters({ categories, activePrimary, activeSecondary, onTogglePrimary, onToggleSecondary }: Props) {
  const [expanded, setExpanded] = useState(false);
  const primary = categories.filter((c) => c.isPrimary);
  const secondary = categories.filter((c) => !c.isPrimary);
  const secondaryActiveCount = secondary.filter((c) => activeSecondary.has(c.slug)).length;

  return (
    <div>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {primary.map((cat) => (
          <button key={cat.slug} onClick={() => onTogglePrimary(cat.slug)} style={chipStyle(activePrimary.has(cat.slug))}>
            {cat.name}
          </button>
        ))}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ ...chipStyle(secondaryActiveCount > 0), fontWeight: 600 }}
        >
          More filters{secondaryActiveCount > 0 ? ` (${secondaryActiveCount})` : ''} {expanded ? '−' : '+'}
        </button>
      </div>
      {expanded && (
        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
          {secondary.map((cat) => (
            <button key={cat.slug} onClick={() => onToggleSecondary(cat.slug)} style={chipStyle(activeSecondary.has(cat.slug))}>
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `HomeTestList`'s filter state and filtering logic**

In `apps/web/app/components/HomeTestList.tsx`, replace the single `activeCategory` state (~line 36)
and its filter (~line 41-43) and the `CategoryTabs` usage (~line 69):

```tsx
  const [activePrimary, setActivePrimary] = useState<Set<string>>(new Set());
  const [activeSecondary, setActiveSecondary] = useState<Set<string>>(new Set());

  const togglePrimary = (slug: string) => setActivePrimary((prev) => {
    const next = new Set(prev);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    return next;
  });
  const toggleSecondary = (slug: string) => setActiveSecondary((prev) => {
    const next = new Set(prev);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    return next;
  });
```

And the filter itself (replacing the old ternary at ~line 41-43) — OR within each facet, AND across
facets, no filter selected in a facet = that facet doesn't constrain:

```tsx
    let list = tests.filter((t) => {
      const slugs = t.categorySlugs ?? [t.categorySlug];
      const primaryOk = activePrimary.size === 0 || slugs.some((s) => activePrimary.has(s));
      const secondaryOk = activeSecondary.size === 0 || slugs.some((s) => activeSecondary.has(s));
      return primaryOk && secondaryOk;
    });
```

And the component usage (~line 69):

```tsx
          <CategoryFilters
            categories={categories}
            activePrimary={activePrimary}
            activeSecondary={activeSecondary}
            onTogglePrimary={togglePrimary}
            onToggleSecondary={toggleSecondary}
          />
```

Update the `categories` prop type (~line 31) from `{ name: string; slug: string }[]` to
`{ name: string; slug: string; isPrimary: boolean }[]`.

- [ ] **Step 3: Pass `isPrimary` from the homepage server component**

In `apps/web/app/page.tsx`, wherever `categories` is mapped into the `HomeTestList` prop (find the
`categories.map(...)` near where `prisma.category.findMany` result is shaped for the client — add
`isPrimary: c.isPrimary` to that mapped object, same pattern as the existing `name`/`slug` fields).
Also add `isPrimary: true` to the `DEMO_CATEGORIES`-equivalent fallback array at the top of the file
if one exists for the no-DB-data case (check for a `DEMO_*` categories constant near the
`DEMO_TESTS` array at line 28 — give every demo category `isPrimary: true` since the demo set mirrors
the original 10).

- [ ] **Step 4: Delete the now-unused `CategoryTabs.tsx`**

```bash
rm apps/web/app/components/CategoryTabs.tsx
```

Confirm nothing else imports it: `grep -rn "CategoryTabs" apps/web/app` should return no results
after this task's edits.

- [ ] **Step 5: Typecheck and verify in browser (against production data, read-only)**

```bash
cd apps/web && npx tsc --noEmit
DATABASE_URL="$(grep ^DATABASE_URL= ../../.env.scrape-prod | cut -d= -f2-)" pnpm dev
```

On the homepage: click 2 primary chips → tests from EITHER category show (OR). Click "More filters"
→ secondary chips appear; click one → combined with an active primary chip, only tests in BOTH
appear (AND across facets). Confirm `Sexual Health / STD` renders correctly (not literally
`sexual-health-std` as the display name — that's the slug; the chip label comes from `name`, so it
should read `Sexual Health / STD` with the real slash). Only browse — don't click any admin mutating
action while the dev server is pointed at prod. Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/CategoryFilters.tsx apps/web/app/components/HomeTestList.tsx apps/web/app/page.tsx
git rm apps/web/app/components/CategoryTabs.tsx
git commit -m "Homepage: two-facet category filter (primary chips OR, secondary facet OR, AND across)"
```

---

### Task 9: Admin — expose the new fields for editing (single-test form + Excel round-trip)

**Files:**
- Modify: `apps/web/app/api/v1/admin/tests/[id]/route.ts` (zod schema)
- Modify: `apps/web/app/admin/tests/[id]/page.tsx` (form fields)
- Modify: `apps/web/app/api/v1/admin/tests/export/route.ts` (columns)
- Modify: `apps/web/app/api/v1/admin/tests/import/route.ts` (columns)

**Interfaces:**
- Consumes: `Test.methodology`, `labVariant`, `cardioIq`, `confidence`, `thirdPartyOnly`, `notes` (Task 1).
- `codeVerifiedAt` is deliberately READ-ONLY everywhere in this task (system-stamped by the import
  script / a future promote-to-High action) — not added to the PATCH schema or the Excel round-trip.

- [ ] **Step 1: Extend the PATCH zod schema**

In `apps/web/app/api/v1/admin/tests/[id]/route.ts`, add to `patchSchema` (~line 11-25):

```ts
    methodology: z.string().trim().max(200).nullable(),
    labVariant: z.string().trim().max(100).nullable(),
    cardioIq: z.boolean(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    thirdPartyOnly: z.boolean(),
    notes: z.string().max(2000).nullable(),
```

- [ ] **Step 2: Add form fields to the admin test editor**

In `apps/web/app/admin/tests/[id]/page.tsx`, extend the `TestData` interface (~line 15-20) with the
same six fields, add them to the initial state object (~line 38-39) and the save payload (~line
216-218), then add inputs following the exact existing pattern (text input for `questCode` at
~line 329, checkbox for `isPopular` at ~line 363):

```tsx
          <div>
            <label className="admin-label">Methodology</label>
            <input type="text" className="admin-input" value={test.methodology ?? ''} onChange={(e) => handleChange('methodology', e.target.value)} placeholder="e.g. LC/MS-MS, ECLIA immunoassay" />
          </div>
          <div>
            <label className="admin-label">Lab Variant</label>
            <input type="text" className="admin-input" value={test.labVariant ?? ''} onChange={(e) => handleChange('labVariant', e.target.value)} placeholder="e.g. standard, Cardio IQ, ultrasensitive" />
          </div>
          <div>
            <label className="admin-label">Confidence</label>
            <select className="admin-input" value={test.confidence} onChange={(e) => handleChange('confidence', e.target.value)}>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="cardioIq" className="h-4 w-4 rounded" checked={test.cardioIq} onChange={(e) => handleChange('cardioIq', e.target.checked)} />
            <label htmlFor="cardioIq" className="text-sm font-medium text-brand-700">Cardio IQ&reg; branded variant</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="thirdPartyOnly" className="h-4 w-4 rounded" checked={test.thirdPartyOnly} onChange={(e) => handleChange('thirdPartyOnly', e.target.checked)} />
            <label htmlFor="thirdPartyOnly" className="text-sm font-medium text-brand-700">Third-party only (not offered by Quest/LabCorp)</label>
          </div>
          <div>
            <label className="admin-label">Notes</label>
            <textarea className="admin-input" rows={2} value={test.notes ?? ''} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Verification caveats, region-variability notes, etc." />
          </div>
```

- [ ] **Step 3: Add the columns to the Excel export**

In `apps/web/app/api/v1/admin/tests/export/route.ts`, extend `COLUMNS` (~line 15-25, right before
the closing `is_popular` entry, order doesn't matter but keep it adjacent to related fields) and the
`include`/mapped row (~line 44-91):

```ts
  { key: 'methodology', header: 'methodology', width: 22, note: 'Free-text lab methodology, e.g. "LC/MS-MS", "ECLIA immunoassay".' },
  { key: 'lab_variant', header: 'lab_variant', width: 18, note: 'Free-text variant label, e.g. "standard", "Cardio IQ", "ultrasensitive".' },
  { key: 'cardio_iq', header: 'cardio_iq', width: 10, note: 'true/false — Quest Cardio IQ branded order code.' },
  { key: 'confidence', header: 'confidence', width: 10, note: 'High, Medium, or Low — how reliably the codes were verified.' },
  { key: 'third_party_only', header: 'third_party_only', width: 12, note: 'true/false — not offered by Quest or LabCorp at all.' },
  { key: 'notes', header: 'notes', width: 40, note: 'Free-text research/verification note.' },
```

and in the row-building loop:

```ts
      methodology: t.methodology ?? '',
      lab_variant: t.labVariant ?? '',
      cardio_iq: t.cardioIq,
      confidence: t.confidence,
      third_party_only: t.thirdPartyOnly,
      notes: t.notes ?? '',
```

- [ ] **Step 4: Add the columns to the Excel import**

In `apps/web/app/api/v1/admin/tests/import/route.ts`, extend `RowPlan['fields']` (~line 22-31),
the field-building block (~line 118-127), the diff `cmp()` calls (~line 139-144), and the
create/update `data` object (~line 187-195):

```ts
    methodology: string | null;
    labVariant: string | null;
    cardioIq: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    thirdPartyOnly: boolean;
    notes: string | null;
```

```ts
      methodology: 'methodology' in rec ? (rec.methodology || null) : (existing?.methodology ?? null),
      labVariant: 'lab_variant' in rec ? (rec.lab_variant || null) : (existing?.labVariant ?? null),
      cardioIq: 'cardio_iq' in rec ? parseBool(rec.cardio_iq ?? '') : (existing?.cardioIq ?? false),
      confidence: 'confidence' in rec ? (rec.confidence.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW') : (existing?.confidence ?? 'LOW'),
      thirdPartyOnly: 'third_party_only' in rec ? parseBool(rec.third_party_only ?? '') : (existing?.thirdPartyOnly ?? false),
      notes: 'notes' in rec ? (rec.notes || null) : (existing?.notes ?? null),
```

```ts
    cmp('methodology', existing.methodology, fields.methodology);
    cmp('lab_variant', existing.labVariant, fields.labVariant);
    cmp('cardio_iq', String(existing.cardioIq), String(fields.cardioIq));
    cmp('confidence', existing.confidence, fields.confidence);
    cmp('third_party_only', String(existing.thirdPartyOnly), String(fields.thirdPartyOnly));
    cmp('notes', existing.notes, fields.notes);
```

```ts
        methodology: plan.fields.methodology,
        labVariant: plan.fields.labVariant,
        cardioIq: plan.fields.cardioIq,
        confidence: plan.fields.confidence,
        thirdPartyOnly: plan.fields.thirdPartyOnly,
        notes: plan.fields.notes,
```

Also add `methodology: true, labVariant: true, cardioIq: true, confidence: true, thirdPartyOnly: true, notes: true`
to the `prisma.test.findMany` `select`-less full-row fetch — this route already fetches full rows
via `include` with no `select`, so the new scalar columns are already present; no query change needed
there, only the `RowPlan`/mapping code above.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Verify in browser, against production — revert any test edit you make**

This check genuinely needs write access (saving the new fields, running a real Excel import), so
point the dev server at production for it, same as Tasks 7/8:

```bash
cd apps/web && DATABASE_URL="$(grep ^DATABASE_URL= ../../.env.scrape-prod | cut -d= -f2-)" pnpm dev
```

Open `/admin/tests`, pick any one real test, note its current `methodology`/`notes` values, edit them
to a throwaway value, save, reload the page, confirm the six new fields persisted — then **edit it
back to the original values and save again** (this is a verification smoke test, not an intended data
change; production shouldn't end up with a stray edit). Export Excel, confirm the new columns appear
with the right values for that same test; re-import that unmodified export as a dry run (no field
changes) and confirm the diff shows zero changes for it (round-trip integrity check without touching
any real value) — do not import a modified sheet in this step, since Step 7 above already covers the
scenario where the import actually needs to move a field. Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/v1/admin/tests/\[id\]/route.ts apps/web/app/admin/tests/\[id\]/page.tsx apps/web/app/api/v1/admin/tests/export/route.ts apps/web/app/api/v1/admin/tests/import/route.ts
git commit -m "Expose methodology/confidence/cardio-IQ/notes fields in the admin test editor and Excel round-trip"
```

---

### Task 10: Documentation discipline — CLAUDE.md, SKILLS.md, CHANGELOG.md

**Files:**
- Modify: `.claude/CLAUDE.md`
- Modify: `SKILLS.md`
- Modify: `CHANGELOG.md`

Per this project's own mandated discipline (`.claude/CLAUDE.md` header), this is not optional cleanup
— it's part of the change.

- [ ] **Step 1: Add a gotcha entry to `CLAUDE.md`**

Append a new numbered gotcha (after the existing #10) documenting: `Test.confidence` gates scraper
auto-approval independently of vendor trust (so a future reader doesn't add a second, redundant gate
elsewhere); `TestCode` model is confirmed dead code (zero readers/writers) — `Test.questCode`/
`labcorpCode` are the sole canonical fields, don't resurrect `TestCode` without checking this note
first; `Category.isPrimary` drives the homepage primary/secondary facet split, not a hardcoded name list.

- [ ] **Step 2: Update `SKILLS.md`'s feature catalog**

Under "Admin panel → Tests", note the six new editable fields and their Excel round-trip columns.
Under "Test detail" (public site section), note the third-party-only empty state, confidence badge,
Cardio IQ badge, and notes callout. Under "Category model", note `isPrimary` and the two-facet
homepage filter (replacing the old single-select description). Under "Scrape pipeline → Auto-approval",
note the confidence gate alongside the existing trust-level rule.

- [ ] **Step 3: Add a `CHANGELOG.md` entry under `[Unreleased]`**

```markdown
### Added
- 246-row master biomarker list imported into production (methodology/confidence/Cardio-IQ data
  model), expanding the catalog and correcting several mismatched lab order codes carried over from
  earlier research. 21-category taxonomy (11 new: Thyroid, Liver, Kidney, Electrolytes, Autoimmune,
  Allergy, Fertility, Nutrition, Coagulation, Bone Health, Sexual Health / STD), split into
  primary/secondary homepage filter facets.
- Test-level `confidence` (High/Medium/Low) now gates scraper auto-approval, independently of vendor
  trust — a Low-confidence code never auto-publishes a scraped price.
- Consumer-SKU letter suffixes (e.g. QuestHealth's `34604M`) are stripped before comparing a vendor's
  code against ours, so a suffixed listing still matches.

### Fixed
- Corrected 3 mismatched/wrong lab order codes carried over from earlier research (TSH Quest code,
  Estradiol Sensitive LabCorp code, PSA LabCorp/Quest codes) — audit-logged, see
  `apps/worker/scripts/apply-master-test-fixes.ts`.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/CLAUDE.md SKILLS.md CHANGELOG.md
git commit -m "Document the master test catalog expansion in CLAUDE.md/SKILLS.md/CHANGELOG.md"
```

---

## Self-Review Notes (spec coverage check)

- **Section 1 (schema)**: Task 1. `code_verified_at` gating on `confidence='High'` handled in Task 5's
  import, not Task 1 (schema only adds the column). Partial indexes documented in `ddl.sql` since
  Prisma's `db:push` can't express them (plain indexes added instead, functionally sufficient for
  this dataset's size).
- **Section 2 (categories)**: Task 2 (seed + isPrimary) + Task 8 (UI facets). `Sexual Health / STD`
  slug handling verified explicitly in Task 2 Step 4 and Task 8 Step 5.
- **Section 3 (fixes)**: Task 4. Audit table = existing `AuditLog` model (no new schema).
- **Section 4 (import)**: Task 5. Fail-fast on unknown category (explicit script behavior, differs
  deliberately from the existing admin Excel importer's auto-create).
- **Section 5 (matching)**: 5a — data modeling only (no code task; explained in Task 6's intro). 5b —
  Task 7 (badge). 5c — Task 6 Steps 1-4. 5d — Task 6 Steps 5-6.
- **Section 6 (UI)**: third_party_only + blank-code suppression (already existed, verified not
  regressed) + confidence badge + notes-as-region-variable-callout — all Task 7.
- **Documentation discipline**: Task 10.
