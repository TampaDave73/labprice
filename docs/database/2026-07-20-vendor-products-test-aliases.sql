-- Additive prod migration for the tests-database redesign (2026-07-20).
-- Adds two NEW tables — vendor_products (the ingest layer) and test_aliases (learned alt names) —
-- plus the VendorProductStatus enum. Touches NOTHING existing, so unlike a full `prisma db push`
-- it does NOT drop the tests.search_vector column (no ddl-core.sql re-run needed after this).
--
-- Safe to run more than once: every statement is guarded with IF NOT EXISTS / a DO block.
-- Run it in Railway → your Postgres service → the Data/Query console (paste the whole thing).

-- 1. Enum type (guarded — CREATE TYPE has no IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE "VendorProductStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. test_aliases
CREATE TABLE IF NOT EXISTS test_aliases (
    id text NOT NULL,
    test_id text NOT NULL,
    alias text NOT NULL,
    normalized text NOT NULL,
    source text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT test_aliases_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS test_aliases_normalized_idx ON test_aliases USING btree (normalized);
CREATE UNIQUE INDEX IF NOT EXISTS test_aliases_test_id_normalized_key ON test_aliases USING btree (test_id, normalized);

-- 3. vendor_products
CREATE TABLE IF NOT EXISTS vendor_products (
    id text NOT NULL,
    vendor_id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    url text,
    price numeric(10,2),
    lab_provider text,
    quest_code text,
    labcorp_code text,
    is_panel boolean DEFAULT false NOT NULL,
    status "VendorProductStatus" DEFAULT 'UNMATCHED'::"VendorProductStatus" NOT NULL,
    test_id text,
    matched_by text,
    suggested_test_id text,
    first_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    CONSTRAINT vendor_products_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS vendor_products_labcorp_code_idx ON vendor_products USING btree (labcorp_code);
CREATE INDEX IF NOT EXISTS vendor_products_normalized_name_idx ON vendor_products USING btree (normalized_name);
CREATE INDEX IF NOT EXISTS vendor_products_quest_code_idx ON vendor_products USING btree (quest_code);
CREATE INDEX IF NOT EXISTS vendor_products_status_is_panel_idx ON vendor_products USING btree (status, is_panel);
CREATE INDEX IF NOT EXISTS vendor_products_test_id_idx ON vendor_products USING btree (test_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_vendor_id_slug_key ON vendor_products USING btree (vendor_id, slug);

-- 4. Foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS before PG 9.6-era syntax).
DO $$ BEGIN
  ALTER TABLE test_aliases ADD CONSTRAINT test_aliases_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES tests(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE vendor_products ADD CONSTRAINT vendor_products_vendor_id_fkey
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE vendor_products ADD CONSTRAINT vendor_products_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES tests(id) ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE vendor_products ADD CONSTRAINT vendor_products_suggested_test_id_fkey
    FOREIGN KEY (suggested_test_id) REFERENCES tests(id) ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
