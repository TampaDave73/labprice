# Database Migrations & Seeding Strategy

## Tooling
- **Prisma Migrate** owns the schema lifecycle. `schema.prisma` is the source of truth for tables,
  columns, enums, FKs, and indexes.
- Pieces Prisma can't express (extensions, `CITEXT`, the `tests.search_vector` generated column,
  `RANGE` partitioning, `CHECK` constraints) are applied as **manual SQL appended to the relevant
  Prisma migration** (`prisma migrate dev --create-only`, then edit the generated `migration.sql`,
  then apply). The exact SQL lives in [`ddl.sql`](./ddl.sql).

## Migration ordering (Phase 1)
1. `0001_init` — enums + all base tables from `schema.prisma`.
2. `0002_extensions_search` — `citext`, `pg_trgm`, `btree_gin`; convert `users.email` to `CITEXT`;
   add `tests.search_vector` generated column + GIN/trigram indexes.
3. `0003_partitioning` — convert `price_history`, `affiliate_clicks`, `search_logs`, `page_views`
   to partitioned parents; create the first 3 monthly partitions.
4. `0004_constraints` — the `CHECK` constraints (price ≥ 0, rating 1–5, alert XOR target,
   threshold-required) and partial indexes.

> Partitioning conversion is done at init while tables are empty (cheap). Converting a populated
> table later requires a data-copy migration — avoided by partitioning from day one.

## Partition maintenance
A scheduled BullMQ job (`partition-maintenance`, daily) runs idempotent SQL:
- Ensure the next 2 months' partitions exist for each partitioned table.
- Detach + archive (to cold storage / `*_archive` table or object store) partitions older than the
  retention window: `price_history` = 24 months, `affiliate_clicks` = 24 months (revenue audit),
  `search_logs`/`page_views` = 6 months. Tunable via `system_settings`.
- `pg_partman` is an acceptable drop-in replacement for this job.

## Seeding
`prisma/seed.ts` is idempotent (upsert by natural key) and loads the prototype's real data so dev,
CI, and staging never depend on live scraping:
- **5 categories** (with the prototype's oklch color hints): Vitamins & Minerals, Hormones,
  Metabolic, Blood Count, Cancer Markers.
- **12 tests** with full clinical content + Quest/LabCorp codes + `is_popular` flags exactly as in
  `Lab Test Price Comparison.dc.html` (Vitamin D, Testosterone Total, CBC, Lipid Panel, TSH, HbA1c,
  CMP, PSA, Ferritin, Cortisol, Vitamin B12, Estradiol).
- **10 vendors** (ordering services): Life Extension, Ulta Lab Tests, True Health Labs, DirectLabs,
  Walk-In Lab, Request A Test, Quest Diagnostics, LabCorp, Health Testing Centers, Any Lab Test Now —
  with `trust_level` (Quest/LabCorp = HIGH) and `priority`.
- **120 offerings** (12 tests × 10 vendors) with the prototype prices, each writing one seed row to
  `price_history` (`source = IMPORT`) so trend charts have a baseline.
- **Biomarkers** for the biomarker-search feature (e.g., LDL/HDL/Triglycerides → Lipid Panel & CMP;
  Glucose → HbA1c & CMP; 25-OH-D → Vitamin D).
- A `super_admin` user (email from `SEED_ADMIN_EMAIL`) and default `system_settings`/`feature_flags`.

## Backups & recovery
See Deliverable #8 — nightly `pg_dump` + WAL archiving (PITR), 30-day retention, monthly restore
drills.
