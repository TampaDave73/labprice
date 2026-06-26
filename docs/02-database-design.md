# Deliverable #2 — Database Design (PostgreSQL 16)

> **Version:** 1.0  
> **Last updated:** 2026-06-26  
> **ORM:** Prisma 6.x  
> **Database:** PostgreSQL 16 with native partitioning

Authoritative schema lives in `prisma/schema.prisma`. Raw DDL is in `database/ddl.sql`; migration
strategy in `database/migrations.md`. This document is the human-readable spec: the ERD, per-table
definitions, and the conventions that bind them together.

---

## 1. Conventions (apply to every table)

| Convention | Detail |
|---|---|
| **Primary key** | `id TEXT NOT NULL` holding a CUID2 (app-generated, URL-safe, collision-resistant). Exception: high-volume partitioned tables use `id BIGSERIAL`. |
| **Timestamps** | `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL` (Prisma `@updatedAt`). Present on every table. |
| **Soft delete** | Mutable domain tables carry `deleted_at TIMESTAMPTZ NULL`. A partial index `WHERE deleted_at IS NULL` keeps the hot path fast. Append-only/event tables use time-based retention, not soft delete. |
| **Money** | `NUMERIC(10,2)` (Prisma `Decimal`), never floats. |
| **Enums** | PostgreSQL native enums (Prisma `enum`). |
| **FK policy** | `ON DELETE RESTRICT` for catalog references; `ON DELETE CASCADE` only for child rows owned by a parent (e.g., sessions, scrape results). |
| **Naming** | `snake_case` for tables and columns. Junction tables: `{parent}_{child}` alphabetical. |
| **Partitioning** | Range partitioning by month on `price_history`, `affiliate_clicks`, `search_logs`, `page_views`. |

---

## 2. Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ accounts : has
    users ||--o{ sessions : has
    users ||--o{ price_alerts : sets
    users ||--o{ affiliate_clicks : generates
    users ||--o{ audit_logs : actor
    users ||--o{ search_logs : searches
    users ||--o{ page_views : views

    categories ||--o{ tests : groups
    tests ||--o{ offerings : offered_as
    tests ||--o{ test_biomarkers : maps
    biomarkers ||--o{ test_biomarkers : maps
    tests ||--o{ test_codes : identified_by
    tests ||--o{ price_alerts : watched_by
    tests ||--o{ page_views : viewed

    vendors ||--o{ offerings : sells
    vendors ||--o| scrape_vendor_configs : configured_by
    vendors ||--o{ scrape_jobs : scraped_by
    vendors ||--o{ scrape_runs : scraped_in

    offerings ||--o{ price_history : records
    offerings ||--o{ staged_price_changes : proposes
    offerings ||--o{ affiliate_clicks : clicked
    offerings ||--o{ scrape_results : produced
    offerings ||--o{ alert_notifications : triggers

    scrape_jobs ||--o{ scrape_runs : executes
    scrape_runs ||--o{ scrape_results : yields
    scrape_runs ||--o{ scrape_errors : logs
    scrape_runs ||--o{ price_history : sources

    price_alerts ||--o{ alert_notifications : fires

    seo_pages }o--o| tests : targets
    seo_pages }o--o| categories : targets
```

---

## 3. Table Catalog

### 3.1 Identity and Auth (Auth.js / NextAuth Prisma Adapter)

---

#### `users`

**Purpose:** A registered user account.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `email` | `CITEXT` | NO | | Case-insensitive, unique |
| `name` | `TEXT` | YES | | Display name |
| `role` | `enum Role` | NO | `'USER'` | `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN` |
| `email_verified_at` | `TIMESTAMPTZ` | YES | | Set by magic-link or OAuth verification |
| `image` | `TEXT` | YES | | Avatar URL (OAuth) |
| `deleted_at` | `TIMESTAMPTZ` | YES | | Soft delete |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | Prisma `@updatedAt` |

**Indexes:**
- `UNIQUE (email)`
- `(role) WHERE deleted_at IS NULL`

**Constraints:**
- `role` must be a valid `Role` enum value.

---

#### `accounts`

**Purpose:** OAuth provider links (Auth.js adapter). Stores tokens for Google, GitHub, etc.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `user_id` | `TEXT` | NO | | FK -> `users(id)` ON DELETE CASCADE |
| `type` | `TEXT` | NO | | `oauth`, `oidc`, `email` |
| `provider` | `TEXT` | NO | | e.g., `google`, `github` |
| `provider_account_id` | `TEXT` | NO | | Provider's user ID |
| `refresh_token` | `TEXT` | YES | | Encrypted at rest |
| `access_token` | `TEXT` | YES | | Encrypted at rest |
| `expires_at` | `INTEGER` | YES | | Token expiry (epoch seconds) |
| `token_type` | `TEXT` | YES | | |
| `scope` | `TEXT` | YES | | |
| `id_token` | `TEXT` | YES | | |
| `session_state` | `TEXT` | YES | | |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (provider, provider_account_id)`
- `(user_id)`

**Foreign keys:**
- `user_id -> users(id) ON DELETE CASCADE`

---

#### `sessions`

**Purpose:** Database-backed sessions (Auth.js adapter).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `session_token` | `TEXT` | NO | | Unique token |
| `user_id` | `TEXT` | NO | | FK -> `users(id)` ON DELETE CASCADE |
| `expires` | `TIMESTAMPTZ` | NO | | Session expiry |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (session_token)`
- `(user_id)`

**Foreign keys:**
- `user_id -> users(id) ON DELETE CASCADE`

---

#### `verification_tokens`

**Purpose:** Magic-link and email verification tokens (Auth.js adapter).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `identifier` | `TEXT` | NO | | Email address |
| `token` | `TEXT` | NO | | Hashed token |
| `expires` | `TIMESTAMPTZ` | NO | | Token expiry |

**Primary key:** `(identifier, token)` composite.

**Indexes:**
- `UNIQUE (token)`

---

### 3.2 Catalog

---

#### `categories`

**Purpose:** Top-level test taxonomy (e.g., Vitamins & Minerals, Hormones, Metabolic, Blood Count, Cancer Markers).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `name` | `TEXT` | NO | | Display name, unique |
| `slug` | `TEXT` | NO | | URL-safe, unique |
| `display_order` | `INTEGER` | NO | `0` | Sort position in UI |
| `color_bg` | `TEXT` | YES | | Background color for UI badges |
| `color_text` | `TEXT` | YES | | Text color for UI badges |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (name)`
- `UNIQUE (slug)`
- `(display_order)`

---

#### `tests`

**Purpose:** A lab test in the catalog (e.g., "Vitamin D, 25-Hydroxy"). Central entity that offerings, alerts, and analytics reference.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `name` | `TEXT` | NO | | Full clinical name |
| `short_name` | `TEXT` | NO | | Abbreviated name for chips/cards |
| `slug` | `TEXT` | NO | | URL-safe, unique, immutable once published |
| `category_id` | `TEXT` | NO | | FK -> `categories(id)` ON DELETE RESTRICT |
| `description` | `TEXT` | YES | | About this test |
| `purpose` | `TEXT` | YES | | Why it is ordered |
| `procedure` | `TEXT` | YES | | How it is performed |
| `preparation` | `TEXT` | YES | | How to prepare |
| `normal_range` | `TEXT` | YES | | Expected result ranges |
| `quest_code` | `TEXT` | YES | | Quest Diagnostics test code |
| `labcorp_code` | `TEXT` | YES | | LabCorp test code |
| `is_popular` | `BOOLEAN` | NO | `false` | Drives "Popular Tests" section |
| `display_order` | `INTEGER` | NO | `0` | Sort within category |
| `search_vector` | `TSVECTOR` | YES | | `GENERATED ALWAYS AS (to_tsvector('english', name \|\| ' ' \|\| short_name))` |
| `deleted_at` | `TIMESTAMPTZ` | YES | | Soft delete |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (slug)`
- `(category_id) WHERE deleted_at IS NULL`
- `(is_popular) WHERE deleted_at IS NULL`
- `(display_order)`
- `GIN (search_vector)` -- full-text search

**Foreign keys:**
- `category_id -> categories(id) ON DELETE RESTRICT`

---

#### `test_codes`

**Purpose:** Normalized table of external lab identifiers for a test. Supports Quest and LabCorp codes. CPT codes are intentionally excluded (copyright).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `test_id` | `TEXT` | NO | | FK -> `tests(id)` ON DELETE CASCADE |
| `code_type` | `enum CodeType` | NO | | `QUEST`, `LABCORP` |
| `code_value` | `TEXT` | NO | | e.g., `"17306"` |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (test_id, code_type)`
- `(code_type, code_value)` -- lookup by code

**Foreign keys:**
- `test_id -> tests(id) ON DELETE CASCADE`

---

#### `biomarkers`

**Purpose:** Measurable analytes (e.g., "LDL cholesterol", "TSH"). Enables search-by-biomarker.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `name` | `TEXT` | NO | | Unique analyte name |
| `slug` | `TEXT` | NO | | URL-safe, unique |
| `unit` | `TEXT` | YES | | e.g., `"mg/dL"`, `"mIU/L"` |
| `description` | `TEXT` | YES | | What this biomarker measures |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (name)`
- `UNIQUE (slug)`

---

#### `test_biomarkers`

**Purpose:** Many-to-many junction between tests and biomarkers.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `test_id` | `TEXT` | NO | | FK -> `tests(id)` ON DELETE CASCADE |
| `biomarker_id` | `TEXT` | NO | | FK -> `biomarkers(id)` ON DELETE CASCADE |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Primary key:** `(test_id, biomarker_id)` composite.

**Foreign keys:**
- `test_id -> tests(id) ON DELETE CASCADE`
- `biomarker_id -> biomarkers(id) ON DELETE CASCADE`

---

### 3.3 Vendors and Offerings

---

#### `vendors`

**Purpose:** A lab test ordering service (e.g., Quest, LabCorp, Ulta Lab Tests, Life Extension).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `name` | `TEXT` | NO | | Unique vendor name |
| `slug` | `TEXT` | NO | | URL-safe, unique |
| `website_url` | `TEXT` | YES | | Vendor homepage |
| `affiliate_url_template` | `TEXT` | YES | | e.g., `https://x.com/p/{sku}?subid={clickId}` |
| `logo_url` | `TEXT` | YES | | Path or URL to vendor logo |
| `is_active` | `BOOLEAN` | NO | `true` | Toggles visibility |
| `trust_level` | `enum TrustLevel` | NO | `'MEDIUM'` | `LOW`, `MEDIUM`, `HIGH` |
| `deleted_at` | `TIMESTAMPTZ` | YES | | Soft delete |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (name)`
- `UNIQUE (slug)`
- `(is_active) WHERE deleted_at IS NULL`

---

#### `offerings`

**Purpose:** One vendor's sellable listing of one test. The denormalized `current_price` lives here for fast reads; `price_history` is the source of truth for historical data.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `test_id` | `TEXT` | NO | | FK -> `tests(id)` ON DELETE RESTRICT |
| `vendor_id` | `TEXT` | NO | | FK -> `vendors(id)` ON DELETE RESTRICT |
| `current_price` | `NUMERIC(10,2)` | YES | | Last published price |
| `previous_price` | `NUMERIC(10,2)` | YES | | Price before last update (enables "was $X" display) |
| `price_updated_at` | `TIMESTAMPTZ` | YES | | When `current_price` was last changed |
| `external_url` | `TEXT` | YES | | Product page / order URL at vendor |
| `is_active` | `BOOLEAN` | NO | `true` | Listing active flag |
| `deleted_at` | `TIMESTAMPTZ` | YES | | Soft delete |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (test_id, vendor_id) WHERE deleted_at IS NULL` -- one offering per test-vendor pair
- `(test_id) WHERE is_active = true AND deleted_at IS NULL` -- the comparison query
- `(vendor_id)`
- `(price_updated_at)`

**Foreign keys:**
- `test_id -> tests(id) ON DELETE RESTRICT`
- `vendor_id -> vendors(id) ON DELETE RESTRICT`

---

#### `price_history`

**Purpose:** Append-only time series of observed prices. The high-volume table (millions of rows) that powers trend charts and "cheapest over time" analysis.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NO | | PK (volume justifies bigint over CUID2) |
| `offering_id` | `TEXT` | NO | | FK -> `offerings(id)` ON DELETE CASCADE |
| `old_price` | `NUMERIC(10,2)` | YES | | Previous price (null for first observation) |
| `new_price` | `NUMERIC(10,2)` | NO | | Observed price |
| `observed_at` | `TIMESTAMPTZ` | NO | | When the price was true at the vendor |
| `source` | `enum PriceSource` | NO | | `SCRAPE`, `MANUAL`, `IMPORT` |
| `scrape_run_id` | `TEXT` | YES | | FK -> `scrape_runs(id)`, null for manual entries |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |

**Partitioning:** `RANGE (observed_at)` -- monthly partitions.

**Indexes (per partition):**
- `(offering_id, observed_at DESC)` -- trend queries
- `(source)`

**Foreign keys:**
- `offering_id -> offerings(id) ON DELETE CASCADE`
- `scrape_run_id -> scrape_runs(id) ON DELETE SET NULL`

---

### 3.4 Scraping Infrastructure

---

#### `scrape_vendor_configs`

**Purpose:** Per-vendor scraper configuration. Editable in admin UI without code deploys.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `vendor_id` | `TEXT` | NO | | FK -> `vendors(id)`, unique (one config per vendor) |
| `engine` | `enum ScrapeEngine` | NO | | `PLAYWRIGHT`, `SELENIUM`, `HTTP` |
| `base_url` | `TEXT` | YES | | Vendor catalog base URL |
| `selectors` | `JSONB` | NO | `'{}'` | CSS/XPath selectors: `{price, title, inStock, ...}` |
| `auth_config` | `JSONB` | YES | | Login credentials / cookie config (encrypted) |
| `schedule_cron` | `TEXT` | YES | | Cron expression; overrides global default |
| `is_enabled` | `BOOLEAN` | NO | `true` | |
| `max_retries` | `INTEGER` | NO | `3` | Retry attempts on failure |
| `timeout_ms` | `INTEGER` | NO | `30000` | Navigation timeout in milliseconds |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (vendor_id)`

**Foreign keys:**
- `vendor_id -> vendors(id) ON DELETE RESTRICT`

---

#### `scrape_jobs`

**Purpose:** A logical scrape unit (usually one per vendor per run type). Defines what to scrape.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `vendor_id` | `TEXT` | YES | | FK -> `vendors(id)`, null for cross-vendor jobs |
| `triggered_by` | `enum RunTrigger` | NO | | `SCHEDULE`, `MANUAL`, `RETRY` |
| `status` | `enum JobStatus` | NO | `'PENDING'` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `scheduled_at` | `TIMESTAMPTZ` | YES | | When the job was scheduled to run |
| `started_at` | `TIMESTAMPTZ` | YES | | Actual start time |
| `completed_at` | `TIMESTAMPTZ` | YES | | End time |
| `error_message` | `TEXT` | YES | | Top-level error if the job failed |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(vendor_id, created_at DESC)`
- `(status)`

**Foreign keys:**
- `vendor_id -> vendors(id) ON DELETE SET NULL`

---

#### `scrape_runs`

**Purpose:** One execution of a scrape job against a specific vendor. Tracks progress and statistics.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `job_id` | `TEXT` | NO | | FK -> `scrape_jobs(id)` ON DELETE CASCADE |
| `vendor_id` | `TEXT` | NO | | FK -> `vendors(id)` (denormalized for fast filtering) |
| `status` | `enum RunStatus` | NO | `'QUEUED'` | `QUEUED`, `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`, `CANCELLED` |
| `tests_found` | `INTEGER` | YES | | Count of tests discovered |
| `prices_updated` | `INTEGER` | YES | | Count of prices that changed |
| `prices_unchanged` | `INTEGER` | YES | | Count of prices that stayed the same |
| `errors_count` | `INTEGER` | YES | | Count of errors during this run |
| `duration_ms` | `INTEGER` | YES | | Total run duration |
| `started_at` | `TIMESTAMPTZ` | YES | | |
| `completed_at` | `TIMESTAMPTZ` | YES | | |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(vendor_id, started_at DESC)`
- `(job_id)`
- `(status)`

**Foreign keys:**
- `job_id -> scrape_jobs(id) ON DELETE CASCADE`
- `vendor_id -> vendors(id) ON DELETE RESTRICT`

---

#### `scrape_results`

**Purpose:** Per-offering outcome within a scrape run. Each row records what was found for one test at one vendor.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `run_id` | `TEXT` | NO | | FK -> `scrape_runs(id)` ON DELETE CASCADE |
| `test_id` | `TEXT` | NO | | FK -> `tests(id)` ON DELETE RESTRICT |
| `scraped_price` | `NUMERIC(10,2)` | YES | | Price as parsed from the page |
| `matched_offering_id` | `TEXT` | YES | | FK -> `offerings(id)`, null if unmatched |
| `status` | `enum ResultStatus` | NO | | `MATCHED`, `UNMATCHED`, `PRICE_CHANGED`, `PRICE_SAME`, `ERROR` |
| `raw_html` | `TEXT` | YES | | HTML snapshot for debugging (nullable, large) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(run_id)`
- `(matched_offering_id)`
- `(test_id)`

**Foreign keys:**
- `run_id -> scrape_runs(id) ON DELETE CASCADE`
- `test_id -> tests(id) ON DELETE RESTRICT`
- `matched_offering_id -> offerings(id) ON DELETE SET NULL`

---

#### `scrape_errors`

**Purpose:** Structured error log for scraping failures. Each row is one error event within a run.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `run_id` | `TEXT` | NO | | FK -> `scrape_runs(id)` ON DELETE CASCADE |
| `error_type` | `enum ScrapeErrorType` | NO | | `NAV_TIMEOUT`, `BLOCKED`, `SELECTOR_MISS`, `PARSE_FAIL`, `HTTP_ERROR`, `ANOMALY`, `OTHER` |
| `message` | `TEXT` | NO | | Error description |
| `stack_trace` | `TEXT` | YES | | Stack trace if available |
| `url` | `TEXT` | YES | | URL that triggered the error |
| `screenshot_path` | `TEXT` | YES | | Object-store key to a screenshot |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |

**Indexes:**
- `(run_id)`
- `(error_type)`

**Foreign keys:**
- `run_id -> scrape_runs(id) ON DELETE CASCADE`

---

#### `staged_price_changes`

**Purpose:** Admin approval queue for scraped price changes. Separates "what the scraper saw" from "what is published," enabling review workflows and rollback.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `offering_id` | `TEXT` | NO | | FK -> `offerings(id)` ON DELETE CASCADE |
| `old_price` | `NUMERIC(10,2)` | YES | | Previous published price |
| `new_price` | `NUMERIC(10,2)` | NO | | Proposed new price |
| `scraped_at` | `TIMESTAMPTZ` | NO | | When the scraper observed this price |
| `scrape_run_id` | `TEXT` | NO | | FK -> `scrape_runs(id)` |
| `status` | `enum ChangeStatus` | NO | `'PENDING'` | `PENDING`, `APPROVED`, `REJECTED`, `AUTO_APPROVED` |
| `reviewed_by` | `TEXT` | YES | | FK -> `users(id)`, null for auto-approved |
| `reviewed_at` | `TIMESTAMPTZ` | YES | | When the review decision was made |
| `review_note` | `TEXT` | YES | | Reviewer's comment |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(status, created_at)` -- the admin queue view
- `(offering_id)`
- `(scrape_run_id)`

**Foreign keys:**
- `offering_id -> offerings(id) ON DELETE CASCADE`
- `scrape_run_id -> scrape_runs(id) ON DELETE RESTRICT`
- `reviewed_by -> users(id) ON DELETE SET NULL`

---

#### `proxies`

**Purpose:** Proxy pool for web scraping. Tracks health and rotation metrics.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `url` | `TEXT` | NO | | Proxy URL (`http://user:pass@host:port`), secret-managed |
| `provider` | `TEXT` | YES | | Proxy provider name |
| `type` | `enum ProxyType` | NO | | `DATACENTER`, `RESIDENTIAL` |
| `is_active` | `BOOLEAN` | NO | `true` | |
| `success_count` | `INTEGER` | NO | `0` | Lifetime successful requests |
| `fail_count` | `INTEGER` | NO | `0` | Lifetime failed requests |
| `last_used_at` | `TIMESTAMPTZ` | YES | | |
| `last_failed_at` | `TIMESTAMPTZ` | YES | | |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(is_active, last_used_at)` -- proxy rotation selection
- `(type)`

---

### 3.5 Engagement

---

#### `price_alerts`

**Purpose:** User-configured price watch rules. Supports either an absolute target price or a percentage-drop threshold.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `user_id` | `TEXT` | NO | | FK -> `users(id)` ON DELETE CASCADE |
| `test_id` | `TEXT` | NO | | FK -> `tests(id)` ON DELETE CASCADE |
| `vendor_id` | `TEXT` | YES | | FK -> `vendors(id)`, null = watch all vendors |
| `target_price` | `NUMERIC(10,2)` | YES | | Alert when price drops below this |
| `threshold_percent` | `INTEGER` | YES | | Alert when price drops by this percentage |
| `is_active` | `BOOLEAN` | NO | `true` | |
| `last_triggered_at` | `TIMESTAMPTZ` | YES | | Rate-limiting: last time alert fired |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(user_id) WHERE is_active = true`
- `(test_id) WHERE is_active = true`
- `(vendor_id) WHERE vendor_id IS NOT NULL`

**Constraints:**
- `CHECK ((target_price IS NOT NULL AND threshold_percent IS NULL) OR (target_price IS NULL AND threshold_percent IS NOT NULL))` -- exactly one trigger type

**Foreign keys:**
- `user_id -> users(id) ON DELETE CASCADE`
- `test_id -> tests(id) ON DELETE CASCADE`
- `vendor_id -> vendors(id) ON DELETE SET NULL`

---

#### `alert_notifications`

**Purpose:** Delivery log for triggered price alerts. One row per notification sent.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `alert_id` | `TEXT` | NO | | FK -> `price_alerts(id)` ON DELETE CASCADE |
| `offering_id` | `TEXT` | NO | | FK -> `offerings(id)` ON DELETE RESTRICT |
| `triggered_price` | `NUMERIC(10,2)` | NO | | The price that triggered the alert |
| `sent_at` | `TIMESTAMPTZ` | NO | | When the notification was dispatched |
| `channel` | `enum NotificationChannel` | NO | | `EMAIL`, `PUSH` |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `(alert_id, sent_at DESC)`
- `(offering_id)`

**Foreign keys:**
- `alert_id -> price_alerts(id) ON DELETE CASCADE`
- `offering_id -> offerings(id) ON DELETE RESTRICT`

---

#### `affiliate_clicks`

**Purpose:** Outbound order clicks for revenue attribution. The click ID becomes the subID passed to the vendor's affiliate program.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NO | | PK (high volume, partitioned) |
| `offering_id` | `TEXT` | NO | | FK -> `offerings(id)` ON DELETE RESTRICT |
| `user_id` | `TEXT` | YES | | FK -> `users(id)`, null if anonymous |
| `session_id` | `TEXT` | YES | | Hashed anonymous session identifier |
| `ip_hash` | `TEXT` | YES | | Hashed IP, for fraud detection only |
| `user_agent_hash` | `TEXT` | YES | | Hashed user-agent |
| `referrer` | `TEXT` | YES | | HTTP referrer |
| `clicked_at` | `TIMESTAMPTZ` | NO | `now()` | When the click occurred |

**Partitioning:** `RANGE (clicked_at)` -- monthly partitions.

**Indexes (per partition):**
- `(clicked_at)`
- `(offering_id, clicked_at)`
- `(user_id) WHERE user_id IS NOT NULL`

**Foreign keys:**
- `offering_id -> offerings(id) ON DELETE RESTRICT`
- `user_id -> users(id) ON DELETE SET NULL`

---

### 3.6 Analytics and Operations

---

#### `search_logs`

**Purpose:** Records every search query for gap analysis (no-results queries) and trending tests.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NO | | PK (high volume, partitioned) |
| `query` | `TEXT` | NO | | Raw search query string |
| `results_count` | `INTEGER` | NO | | Number of results returned |
| `user_id` | `TEXT` | YES | | FK -> `users(id)`, null if anonymous |
| `session_id` | `TEXT` | YES | | Hashed session identifier |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |

**Partitioning:** `RANGE (created_at)` -- monthly partitions.

**Indexes (per partition):**
- `(created_at)`
- `(user_id) WHERE user_id IS NOT NULL`
- `(results_count) WHERE results_count = 0` -- zero-result analysis

**Foreign keys:**
- `user_id -> users(id) ON DELETE SET NULL`

---

#### `page_views`

**Purpose:** Lightweight first-party analytics. Tracks page visits with optional test association.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NO | | PK (high volume, partitioned) |
| `path` | `TEXT` | NO | | URL path visited |
| `test_id` | `TEXT` | YES | | FK -> `tests(id)`, set when viewing a test page |
| `user_id` | `TEXT` | YES | | FK -> `users(id)`, null if anonymous |
| `session_id` | `TEXT` | YES | | Hashed session identifier |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |

**Partitioning:** `RANGE (created_at)` -- monthly partitions.

**Indexes (per partition):**
- `(created_at)`
- `(test_id, created_at) WHERE test_id IS NOT NULL`
- `(path)`

**Foreign keys:**
- `test_id -> tests(id) ON DELETE SET NULL`
- `user_id -> users(id) ON DELETE SET NULL`

---

#### `seo_pages`

**Purpose:** Editable SEO landing pages. Can target a specific test or category for contextual content.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `slug` | `TEXT` | NO | | URL path, unique |
| `title` | `TEXT` | NO | | Page title / `<title>` tag |
| `meta_description` | `TEXT` | YES | | `<meta name="description">` |
| `heading` | `TEXT` | YES | | `<h1>` heading |
| `body_html` | `TEXT` | YES | | Page body content (HTML) |
| `test_id` | `TEXT` | YES | | FK -> `tests(id)`, optional association |
| `category_id` | `TEXT` | YES | | FK -> `categories(id)`, optional association |
| `is_published` | `BOOLEAN` | NO | `false` | Controls visibility |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (slug)`
- `(test_id) WHERE test_id IS NOT NULL`
- `(category_id) WHERE category_id IS NOT NULL`
- `(is_published)`

**Foreign keys:**
- `test_id -> tests(id) ON DELETE SET NULL`
- `category_id -> categories(id) ON DELETE SET NULL`

---

#### `feature_flags`

**Purpose:** Runtime feature toggles, controlled via admin UI.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `key` | `TEXT` | NO | | Flag identifier, unique |
| `description` | `TEXT` | YES | | Human-readable description |
| `is_enabled` | `BOOLEAN` | NO | `false` | Global on/off toggle |
| `payload` | `JSONB` | YES | | Arbitrary config data (rollout %, audience rules, etc.) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (key)`

---

#### `system_settings`

**Purpose:** Application-wide configuration values (e.g., `STALE_AFTER_DAYS`, `AUTO_APPROVE_THRESHOLD_PCT`). Key-value store with JSON payloads.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `key` | `TEXT` | NO | | Setting identifier, unique |
| `value` | `JSONB` | NO | | Setting value |
| `updated_by` | `TEXT` | YES | | FK -> `users(id)`, who last changed it |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NO | | |

**Indexes:**
- `UNIQUE (key)`

**Foreign keys:**
- `updated_by -> users(id) ON DELETE SET NULL`

---

#### `audit_logs`

**Purpose:** Immutable append-only log of significant actions. Captures before/after state for compliance and debugging.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `TEXT` | NO | CUID2 | PK |
| `actor_id` | `TEXT` | YES | | FK -> `users(id)`, null for system actions |
| `action` | `TEXT` | NO | | e.g., `price.approve`, `test.create`, `user.suspend` |
| `entity_type` | `TEXT` | NO | | Table/domain name (e.g., `offering`, `user`) |
| `entity_id` | `TEXT` | NO | | PK of the affected row |
| `old_values` | `JSONB` | YES | | State before the change |
| `new_values` | `JSONB` | YES | | State after the change |
| `ip_address` | `TEXT` | YES | | Requester IP (hashed or plain depending on policy) |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | |

**Indexes:**
- `(entity_type, entity_id)` -- "show me all changes to this row"
- `(actor_id, created_at DESC)` -- "show me what this user did"
- `(action)`
- `(created_at)`

**Foreign keys:**
- `actor_id -> users(id) ON DELETE SET NULL`

---

## 4. Enum Definitions

| Enum Name | Values |
|---|---|
| `Role` | `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN` |
| `CodeType` | `QUEST`, `LABCORP` |
| `TrustLevel` | `LOW`, `MEDIUM`, `HIGH` |
| `PriceSource` | `SCRAPE`, `MANUAL`, `IMPORT` |
| `ScrapeEngine` | `PLAYWRIGHT`, `SELENIUM`, `HTTP` |
| `RunTrigger` | `SCHEDULE`, `MANUAL`, `RETRY` |
| `JobStatus` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `RunStatus` | `QUEUED`, `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`, `CANCELLED` |
| `ResultStatus` | `MATCHED`, `UNMATCHED`, `PRICE_CHANGED`, `PRICE_SAME`, `ERROR` |
| `ScrapeErrorType` | `NAV_TIMEOUT`, `BLOCKED`, `SELECTOR_MISS`, `PARSE_FAIL`, `HTTP_ERROR`, `ANOMALY`, `OTHER` |
| `ChangeStatus` | `PENDING`, `APPROVED`, `REJECTED`, `AUTO_APPROVED` |
| `NotificationChannel` | `EMAIL`, `PUSH` |
| `ProxyType` | `DATACENTER`, `RESIDENTIAL` |

---

## 5. Partitioning Strategy

Four tables use PostgreSQL native `RANGE` partitioning by month:

| Table | Partition Key | Estimated Volume | Retention |
|---|---|---|---|
| `price_history` | `observed_at` | Millions/year | 3 years, then archive to cold storage |
| `affiliate_clicks` | `clicked_at` | Hundreds of thousands/year | 2 years |
| `search_logs` | `created_at` | Hundreds of thousands/year | 1 year |
| `page_views` | `created_at` | Millions/year | 6 months |

Partition creation is automated via a cron job that pre-creates the next month's partition. Old partitions are detached (not dropped) and moved to archival storage.

Example DDL for `price_history`:

```sql
CREATE TABLE price_history (
    id          BIGSERIAL,
    offering_id TEXT            NOT NULL,
    old_price   NUMERIC(10,2),
    new_price   NUMERIC(10,2)  NOT NULL,
    observed_at TIMESTAMPTZ    NOT NULL,
    source      price_source   NOT NULL,
    scrape_run_id TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    PRIMARY KEY (id, observed_at)
) PARTITION BY RANGE (observed_at);

CREATE TABLE price_history_2026_01 PARTITION OF price_history
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

## 6. Soft Delete Pattern

Tables with `deleted_at`:
- `users`
- `tests`
- `vendors`
- `offerings`

All queries in the application layer filter `WHERE deleted_at IS NULL` by default. Prisma middleware enforces this automatically. Partial indexes ensure deleted rows do not degrade query performance:

```sql
-- Example: offerings active-only index
CREATE UNIQUE INDEX offerings_test_vendor_active
    ON offerings (test_id, vendor_id)
    WHERE deleted_at IS NULL;
```

---

## 7. Design Rationale

- **Offering as the join entity with denormalized `current_price`** keeps the hot comparison query a single indexed read (`SELECT ... FROM offerings WHERE test_id = ? AND is_active AND deleted_at IS NULL ORDER BY current_price`) while `price_history` stays append-only and partitioned.

- **Staging table** (`staged_price_changes`) cleanly separates "what the scraper saw" from "what is published," enabling admin approval workflows and instant rollback without touching history.

- **Config-in-DB scraping** (`scrape_vendor_configs`) satisfies the requirement to add or adjust vendors without code changes or deploys.

- **Monthly partitioning** on `price_history`, `affiliate_clicks`, `search_logs`, and `page_views` keeps high-volume time-series tables manageable and cheaply prunable by retention jobs.

- **Soft deletes + audit + immutable history** provide the data-integrity and change-tracking the brief requires, without bloating hot reads (partial indexes exclude deleted rows).

- **No CPT codes** anywhere in the schema. The `test_codes` table supports `QUEST` and `LABCORP` code types only, with the enum extensible for future lab networks.

- **CUID2 primary keys** are URL-safe, non-enumerable (no row-count leakage), and collision-resistant. High-volume partitioned tables use `BIGSERIAL` for storage efficiency.
