# Database Migrations & Seeding Strategy

## Tooling

- **Prisma Migrate** owns the schema lifecycle. `schema.prisma` is the source of truth for tables,
  columns, enums, FKs, and indexes.
- Pieces Prisma cannot express (extensions, `CITEXT`, `GENERATED` columns, `RANGE` partitioning,
  `CHECK` constraints, partial unique indexes) are applied as **manual SQL migrations** after the
  base Prisma migration. The exact SQL lives in [`ddl.sql`](./ddl.sql).

## Migration Ordering (Phase 1)

Prisma Migrate creates the initial migration, then 3 manual migrations are appended in order:

### 1. `0001_init` — Base Tables from Prisma

```bash
npx prisma migrate dev --name init
```

This generates all enums, tables, standard indexes, and FK constraints from `schema.prisma`.
The 4 partitioned tables (`price_history`, `affiliate_clicks`, `search_logs`, `page_views`) are
created as regular tables by Prisma. They will be converted to partitioned tables in step 3.

### 2. `0002_extensions_search` — Extensions, CITEXT, Search Vector

```bash
npx prisma migrate dev --create-only --name extensions_search
# Then replace the generated migration.sql with the following:
```

Applied SQL:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Case-insensitive email
ALTER TABLE users ALTER COLUMN email TYPE CITEXT;

-- Full-text search generated column
ALTER TABLE tests ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(short_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(purpose, '')), 'C')
    ) STORED;

-- GIN indexes for search
CREATE INDEX tests_search_gin ON tests USING GIN (search_vector);
CREATE INDEX tests_name_trgm  ON tests USING GIN (name gin_trgm_ops);
```

### 3. `0003_partitioning` — Convert 4 Tables to Partitioned

```bash
npx prisma migrate dev --create-only --name partitioning
```

This migration:

1. Renames the Prisma-created tables to `*_old` (they are empty at init time).
2. Creates the partitioned parent tables with `PARTITION BY RANGE`.
3. Creates the initial 3 monthly partitions for each table (current month + 2 ahead).
4. Drops the `*_old` tables.

> **Why at init?** Converting a populated table to partitioned requires a full data copy. By
> partitioning at init (while tables are empty), we avoid this cost entirely.

Applied SQL (see `ddl.sql` sections 4a-4d for full CREATE TABLE statements):

```sql
-- Drop Prisma-created regular tables (empty at init)
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS affiliate_clicks CASCADE;
DROP TABLE IF EXISTS search_logs CASCADE;
DROP TABLE IF EXISTS page_views CASCADE;

-- Recreate as partitioned (full DDL in ddl.sql)
-- price_history:    PARTITION BY RANGE (observed_at)
-- affiliate_clicks: PARTITION BY RANGE (clicked_at)
-- search_logs:      PARTITION BY RANGE (created_at)
-- page_views:       PARTITION BY RANGE (created_at)

-- Create initial partitions: 2026_06, 2026_07, 2026_08 for each table
```

### 4. `0004_constraints` — CHECK Constraints and Partial Unique Indexes

```bash
npx prisma migrate dev --create-only --name constraints
```

Applied SQL:

```sql
-- CHECK constraints
ALTER TABLE offerings ADD CONSTRAINT offerings_price_nonneg
    CHECK (current_price IS NULL OR current_price >= 0);

ALTER TABLE price_alerts ADD CONSTRAINT price_alerts_one_trigger
    CHECK (
        (target_price IS NOT NULL AND threshold_percent IS NULL) OR
        (target_price IS NULL AND threshold_percent IS NOT NULL)
    );

ALTER TABLE price_history ADD CONSTRAINT price_history_new_price_nonneg
    CHECK (new_price >= 0);

ALTER TABLE proxies ADD CONSTRAINT proxies_success_nonneg
    CHECK (success_count >= 0);
ALTER TABLE proxies ADD CONSTRAINT proxies_fail_nonneg
    CHECK (fail_count >= 0);

-- Partial unique indexes (soft-delete safe)
CREATE UNIQUE INDEX offerings_test_vendor_active
    ON offerings (test_id, vendor_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX vendors_slug_active
    ON vendors (slug) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX tests_slug_active
    ON tests (slug) WHERE deleted_at IS NULL;
```

## Partition Maintenance

A **BullMQ scheduled job** (`partition-maintenance`) runs monthly and:

1. **Creates partitions 2 months ahead** for all 4 partitioned tables.
2. **Detaches expired partitions** beyond the retention window and archives them.

### Partition Naming Convention

```
{table_name}_{YYYY}_{MM}
```

Examples:
- `price_history_2025_07`
- `price_history_2025_08`
- `affiliate_clicks_2025_07`
- `search_logs_2025_07`
- `page_views_2025_07`

### Retention Windows

| Table | Retention | Archive Strategy |
|---|---|---|
| `price_history` | 3 years | Detach, pg_dump to S3, then DROP |
| `affiliate_clicks` | 2 years | Detach, pg_dump to S3, then DROP |
| `search_logs` | 1 year | Detach and DROP (aggregated stats retained) |
| `page_views` | 6 months | Detach and DROP (aggregated stats retained) |

### Maintenance Job Implementation

The job runs the following idempotent SQL for each partitioned table:

```sql
DO $$
DECLARE
    target_month DATE;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
    tbl TEXT;
BEGIN
    FOR i IN 1..2 LOOP
        target_month := date_trunc('month', now()) + (i || ' months')::interval;
        start_date := to_char(target_month, 'YYYY-MM-DD');
        end_date := to_char(target_month + '1 month'::interval, 'YYYY-MM-DD');

        FOREACH tbl IN ARRAY ARRAY['price_history', 'affiliate_clicks', 'search_logs', 'page_views'] LOOP
            partition_name := tbl || '_' || to_char(target_month, 'YYYY_MM');
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                partition_name, tbl, start_date, end_date
            );
        END LOOP;
    END LOOP;
END $$;
```

## Seed Data

`prisma/seed.ts` is idempotent (upsert by natural key) and loads real prototype data so dev, CI,
and staging environments never depend on live scraping.

### Categories (5)

| Name | Slug | Color |
|---|---|---|
| Vitamins & Minerals | `vitamins-minerals` | oklch badge colors |
| Hormones | `hormones` | oklch badge colors |
| Metabolic | `metabolic` | oklch badge colors |
| Blood Count | `blood-count` | oklch badge colors |
| Cancer Markers | `cancer-markers` | oklch badge colors |

### Tests (12)

All tests include full clinical content (description, purpose, preparation, normal ranges),
Quest/LabCorp codes via the `test_codes` table, and `is_popular` flags matching the prototype.

| Test | Category | Quest Code | LabCorp Code |
|---|---|---|---|
| Vitamin D, 25-Hydroxy | Vitamins & Minerals | 17306 | 081950 |
| Vitamin B12 | Vitamins & Minerals | 927 | 081950 |
| Ferritin | Vitamins & Minerals | 457 | 004598 |
| Testosterone, Total | Hormones | 15983 | 004226 |
| Estradiol | Hormones | 4021 | 004515 |
| Cortisol | Hormones | 4624 | 004051 |
| TSH | Hormones | 899 | 004259 |
| HbA1c | Metabolic | 496 | 001453 |
| Comprehensive Metabolic Panel (CMP) | Metabolic | 10231 | 322000 |
| Lipid Panel | Metabolic | 7600 | 303756 |
| Complete Blood Count (CBC) | Blood Count | 6399 | 005009 |
| PSA | Cancer Markers | 5363 | 010322 |

### Vendors (10)

| Vendor | Trust Level |
|---|---|
| Life Extension | MEDIUM |
| Ulta Lab Tests | MEDIUM |
| True Health Labs | MEDIUM |
| DirectLabs | MEDIUM |
| Walk-In Lab | MEDIUM |
| Request A Test | MEDIUM |
| Quest Diagnostics | HIGH |
| LabCorp | HIGH |
| Health Testing Centers | MEDIUM |
| Any Lab Test Now | MEDIUM |

### Offerings (120)

12 tests x 10 vendors = 120 offerings, each with prices from the prototype HTML. Each offering
seeds one row into `price_history` with `source = IMPORT` so trend charts have a baseline data
point from day one.

### Biomarkers

Biomarkers are seeded for each test to support biomarker-based search:

- **Lipid Panel**: LDL, HDL, Triglycerides, Total Cholesterol
- **CMP**: Glucose, BUN, Creatinine, Sodium, Potassium, Calcium, CO2, Chloride, AST, ALT, Bilirubin, Albumin, Total Protein, ALP
- **CBC**: WBC, RBC, Hemoglobin, Hematocrit, Platelets, MCV, MCH, MCHC, RDW
- **HbA1c**: Hemoglobin A1c, Estimated Average Glucose
- **Vitamin D**: 25-Hydroxyvitamin D
- **TSH**: Thyroid Stimulating Hormone
- **Testosterone**: Total Testosterone
- **Estradiol**: Estradiol (E2)
- **Cortisol**: Cortisol (AM)
- **Ferritin**: Ferritin
- **Vitamin B12**: Cobalamin
- **PSA**: Prostate-Specific Antigen

### Admin User

A `SUPER_ADMIN` user is created using the email from the `SEED_ADMIN_EMAIL` environment variable.

### System Settings and Feature Flags

Default `system_settings` entries:

- `STALE_AFTER_DAYS`: 7 (mark prices stale after 7 days without update)
- `AUTO_APPROVE_THRESHOLD_PCT`: 5 (auto-approve price changes under 5%)
- `PARTITION_RETENTION_MONTHS`: `{ price_history: 36, affiliate_clicks: 24, search_logs: 12, page_views: 6 }`

Default `feature_flags` entries:

- `price_alerts`: enabled
- `affiliate_tracking`: enabled
- `scraper_auto_approve`: disabled
- `biomarker_search`: enabled
- `seo_pages`: disabled

## Expand/Contract Migration Pattern

LabPrice follows the **expand/contract** pattern for zero-downtime schema changes. Down migrations
are never used.

### Rules

1. **Never use down migrations.** Prisma Migrate does not generate down migrations by design.
   Rollbacks are forward-only (deploy a new migration that reverts the change).

2. **Additive changes first (expand).** Add new columns, tables, or indexes in one deployment.
   The application code is updated to write to both old and new locations.

3. **Backfill data.** A background job or migration populates the new column/table from the old one.

4. **Switch reads.** Deploy application code that reads from the new location.

5. **Remove old columns (contract).** After confirming the new path is stable (typically 1-2
   deployment cycles), deploy a migration that drops the old column/table.

### Example: Renaming a Column

```
Deploy 1 (expand):   ALTER TABLE tests ADD COLUMN display_name TEXT;
                     -- App writes to both `name` and `display_name`
Backfill:            UPDATE tests SET display_name = name WHERE display_name IS NULL;
Deploy 2 (switch):   -- App reads from `display_name`, still writes both
Deploy 3 (contract): ALTER TABLE tests DROP COLUMN name;
                     -- App only uses `display_name`
```

### CI Safety Checks

- All migrations run in CI against a real PostgreSQL instance (Docker).
- `prisma migrate diff` validates no drift between schema.prisma and the database.
- Manual migrations in `ddl.sql` are applied after Prisma migrations in the CI pipeline.

## Backups & Recovery

See Deliverable #8 -- nightly `pg_dump` + WAL archiving (PITR), 30-day retention, monthly restore
drills.
