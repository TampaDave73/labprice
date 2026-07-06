-- LabTestCompare — CORE production DDL (launch subset of ddl.sql)
-- ============================================================================
-- Prisma has no migrations in this repo (schema is managed with `prisma db push`),
-- and `db push` can't express these. Apply this ONCE, immediately AFTER `prisma db push`,
-- against the production database. It uses Prisma's own executor so no psql is required:
--
--   cd packages/database
--   pnpm exec prisma db push --skip-generate
--   pnpm exec prisma db execute --schema prisma/schema.prisma --file ../../docs/database/ddl-core.sql
--   pnpm exec tsx prisma/seed.ts        # optional: seed categories/admin/etc.
--
-- This is the subset of ddl.sql the app NEEDS to function:
--   • case-insensitive email (login matching)
--   • the generated tsvector column + GIN indexes that power /search (full-text + fuzzy)
--
-- It deliberately OMITS the RANGE-partitioning of the four analytics tables (price_history,
-- affiliate_clicks, search_logs, page_views) from ddl.sql section 4 — that is a scale-time
-- optimization. `prisma db push` creates those as ordinary tables and the app works fine; the
-- partition-maintenance / retention worker jobs simply don't apply until you migrate to partitioned
-- tables. See docs/database/ddl.sql for the full partitioned setup.
--
-- Idempotent (safe to re-run). NOTE: a FUTURE `prisma db push` will DROP `search_vector` again
-- (it isn't in schema.prisma) — re-run this file after any db push. See docs/database/migrations.md.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy / typo-tolerant search
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- composite GIN indexes

-- Case-insensitive email (no-op if already citext) --------------------------
ALTER TABLE users ALTER COLUMN email TYPE CITEXT;

-- Generated full-text search vector on tests (Prisma can't model GENERATED columns) ----
ALTER TABLE tests ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(short_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(purpose, '')), 'C')
    ) STORED;

-- GIN indexes for full-text and fuzzy search --------------------------------
CREATE INDEX IF NOT EXISTS tests_search_gin ON tests USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS tests_name_trgm  ON tests USING GIN (name gin_trgm_ops);
