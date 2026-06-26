# Deliverable #2 — Database Design (PostgreSQL 16)

Authoritative schema lives in [`database/schema.prisma`](./database/schema.prisma). Raw DDL is in
[`database/ddl.sql`](./database/ddl.sql); migration strategy in
[`database/migrations.md`](./database/migrations.md). This document is the human-readable spec: the
ERD, per-table purpose, and the conventions that bind them together.

## Conventions (apply to every table)

- **PK:** `id` — `TEXT` holding a CUID2 (app-generated, URL-safe, non-enumerable). Chosen over
  bigserial so IDs can appear in URLs/APIs without leaking row counts.
- **Timestamps:** `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL`
  (Prisma `@updatedAt`).
- **Soft delete:** mutable domain tables carry `deleted_at TIMESTAMPTZ NULL`; a partial index
  `WHERE deleted_at IS NULL` keeps the hot path fast. Append-only/event tables are hard-deleted by
  retention jobs, not soft-deleted.
- **Money:** `NUMERIC(10,2)` (Prisma `Decimal`), never floats. `currency CHAR(3) DEFAULT 'USD'`.
- **Enums:** Postgres native enums (Prisma `enum`).
- **Audit:** sensitive writes also emit an `audit_logs` row (see Deliverable #7).
- **FK policy:** `ON DELETE RESTRICT` for catalog references; `ON DELETE CASCADE` only for
  child rows owned by a parent (e.g., a user's sessions, an offering's staged changes).

## ERD

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : has
    User ||--o{ SavedTest : saves
    User ||--o{ PriceAlert : sets
    User ||--o{ VendorRating : writes
    User ||--o{ AffiliateClick : generates
    User ||--o{ AuditLog : actor

    Category ||--o{ Test : groups
    Test ||--o{ Offering : offered_as
    Test ||--o{ TestBiomarker : maps
    Biomarker ||--o{ TestBiomarker : maps
    Test ||--o{ SavedTest : saved_in
    Test ||--o{ PriceAlert : watched_by
    Test ||--o{ TestCode : identified_by

    Vendor ||--o{ Offering : sells
    Vendor ||--o| ScrapeVendorConfig : configured_by
    Vendor ||--o{ VendorRating : rated
    Vendor ||--o{ ScrapeRun : scraped_in

    Offering ||--o{ PriceHistory : records
    Offering ||--o{ StagedPriceChange : proposes
    Offering ||--o{ AffiliateClick : clicked
    Offering ||--o{ ScrapeResult : produced
    Offering ||--o{ PriceAlert : watched_by

    ScrapeJob ||--o{ ScrapeRun : executes
    ScrapeRun ||--o{ ScrapeResult : yields
    ScrapeRun ||--o{ ScrapeError : logs
    ScrapeResult ||--o| StagedPriceChange : may_create
    Proxy ||--o{ ScrapeRun : used_by

    PriceAlert ||--o{ AlertNotification : fires
    StagedPriceChange ||--o{ AlertNotification : triggers

    SeoPage }o--o| Test : targets
    SeoPage }o--o| Category : targets
```

---

## Table catalog

### Identity & auth (Auth.js / NextAuth Prisma adapter)

**`users`** — a registered account.
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | cuid | PK |
| email | citext | no | | unique, case-insensitive |
| email_verified | timestamptz | yes | | set by magic-link/OAuth |
| name | text | yes | | |
| image | text | yes | | avatar URL |
| role | enum `Role` | no | `USER` | USER, EDITOR, ADMIN, SUPER_ADMIN |
| status | enum `UserStatus` | no | `ACTIVE` | ACTIVE, SUSPENDED, DELETED |
| notification_email | boolean | no | true | master toggle for emails |
| created_at / updated_at / deleted_at | timestamptz | | | conventions |

Indexes: `unique(email)`, `(role)`, `(status) WHERE deleted_at IS NULL`.

**`accounts`** — OAuth provider links (Auth.js). FK `user_id → users`, cascade. Unique
`(provider, provider_account_id)`.
**`sessions`** — DB sessions (Auth.js). FK `user_id`, cascade. Index `(user_id)`, unique
`session_token`.
**`verification_tokens`** — magic-link tokens. PK `(identifier, token)`, unique `token`.

### Catalog

**`categories`** — test taxonomy (the 5 in the prototype: Vitamins & Minerals, Hormones, Metabolic,
Blood Count, Cancer Markers).
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | cuid | PK |
| name | text | no | | unique |
| slug | text | no | | unique, URL |
| color_hint | text | yes | | UI accent (oklch) |
| sort_order | int | no | 0 | |
| description | text | yes | | SEO |
| created_at/updated_at/deleted_at | | | | |

**`tests`** — the catalog test (e.g., "Vitamin D, 25-Hydroxy").
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | cuid | PK |
| category_id | text | no | | FK → categories (RESTRICT) |
| name | text | no | | full clinical name |
| short_name | text | no | | display/chips |
| slug | text | no | | unique, immutable once published (BR-11) |
| status | enum `PublishStatus` | no | `DRAFT` | DRAFT, PUBLISHED, ARCHIVED |
| is_popular | boolean | no | false | drives "Popular Tests" |
| description | text | yes | | accordion: About |
| purpose | text | yes | | accordion: About (appended) |
| procedure | text | yes | | accordion: How It's Performed |
| preparation | text | yes | | accordion: How To Prepare |
| normal_range | text | yes | | accordion: Normal Ranges |
| synonyms | text[] | no | `{}` | search aliases |
| seo_title | text | yes | | |
| seo_description | text | yes | | |
| search_vector | tsvector | yes | | GENERATED (name, short_name, synonyms) |
| created_at/updated_at/deleted_at | | | | |

Indexes: `unique(slug)`, `(category_id)`, `(is_popular) WHERE status='PUBLISHED'`,
GIN `(search_vector)`, GIN `(synonyms)`.

**`test_codes`** — external lab identifiers for a test (Quest/LabCorp; extensible). CPT intentionally
excluded (copyright).
| Column | Type | Null | Notes |
|---|---|---|---|
| id | text | no | PK |
| test_id | text | no | FK → tests, cascade |
| system | enum `CodeSystem` | no | QUEST, LABCORP (CPT reserved/disabled) |
| code | text | no | e.g., "17306" |
Unique `(test_id, system)`. Index `(system, code)` for code search.

**`biomarkers`** — measurable analytes for "search by biomarker."
| Column | Type | Null | Notes |
|---|---|---|---|
| id | text | no | PK |
| name | text | no | unique (e.g., "LDL cholesterol") |
| slug | text | no | unique |
| unit | text | yes | e.g., "mg/dL" |
| aliases | text[] | no | search |

**`test_biomarkers`** — m:n join. PK `(test_id, biomarker_id)`, both FKs cascade.

### Vendors & offerings

**`vendors`** — an ordering service (Quest, LabCorp, Ulta Lab Tests, Life Extension, …).
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | cuid | PK |
| name | text | no | | unique |
| slug | text | no | | unique |
| website_url | text | yes | | |
| logo_url | text | yes | | |
| affiliate_url_template | text | yes | | e.g., `https://x.com/p/{vendorSku}?subid={clickId}` |
| affiliate_network | text | yes | | CJ, Impact, direct, … |
| trust_level | enum `TrustLevel` | no | `MEDIUM` | LOW, MEDIUM, HIGH (BR-7) |
| priority | int | no | 100 | tie-break ordering (BR-1) |
| is_active | boolean | no | true | |
| created_at/updated_at/deleted_at | | | | |

**`offerings`** — one vendor's sellable listing of one test. The denormalized "current price" lives
here for fast reads; the source of truth for history is `price_history`.
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | cuid | PK |
| vendor_id | text | no | | FK → vendors (RESTRICT) |
| test_id | text | no | | FK → tests (RESTRICT) |
| vendor_sku | text | yes | | vendor's product id |
| product_url | text | yes | | scrape target / order page |
| current_price | numeric(10,2) | yes | | last published price |
| currency | char(3) | no | 'USD' | |
| includes_draw_fee | boolean | no | false | BR-3 |
| in_stock | boolean | no | true | |
| price_observed_at | timestamptz | yes | | when current_price was scraped |
| last_scraped_at | timestamptz | yes | | success timestamp (freshness, BR-4) |
| is_active | boolean | no | true | |
| created_at/updated_at/deleted_at | | | | |

Constraints: unique `(vendor_id, test_id)` (one canonical offering per pair, A-4).
Indexes: `(test_id) WHERE is_active AND deleted_at IS NULL` (the comparison query),
`(vendor_id)`, `(price_observed_at)`.

**`price_history`** — **append-only** time series of published prices (the millions-of-rows table).
| Column | Type | Null | Notes |
|---|---|---|---|
| id | bigserial | no | PK (volume → bigint, not cuid) |
| offering_id | text | no | FK → offerings, cascade |
| price | numeric(10,2) | no | |
| currency | char(3) | no | |
| in_stock | boolean | no | |
| source | enum `PriceSource` | no | SCRAPE, MANUAL, IMPORT, FEED |
| scrape_run_id | text | yes | FK → scrape_runs (nullable for manual) |
| observed_at | timestamptz | no | when the price was true at the vendor |
| created_at | timestamptz | no | when we recorded it |

**Partitioned by `RANGE (observed_at)`** monthly. Indexes per partition:
`(offering_id, observed_at DESC)`. This serves trend charts and "cheapest over time."

### Scraping & approval

**`scrape_vendor_configs`** — per-vendor scraper definition, **editable in admin without deploy**
(FR-18). FK `vendor_id` unique.
| Column | Type | Null | Notes |
|---|---|---|---|
| id | text | no | PK |
| vendor_id | text | no | unique FK → vendors |
| engine | enum `ScrapeEngine` | no | PLAYWRIGHT, SELENIUM, HTTP |
| list_url_template | text | yes | catalog/listing URL |
| detail_url_template | text | yes | per-offering URL (uses `product_url`) |
| selectors | jsonb | no | `{price, title, inStock, ...}` CSS/XPath map |
| nav_steps | jsonb | yes | scripted interactions (clicks, waits) |
| price_regex | text | yes | extract numeric from text |
| headers | jsonb | yes | UA, accept-language, cookies |
| use_proxy | boolean | no | true |
| rate_limit_ms | int | no | 4000 | min delay between requests |
| concurrency | int | no | 2 |
| schedule_cron | text | yes | overrides global daily |
| enabled | boolean | no | true |

**`scrape_jobs`** — a logical scrape unit (usually one per vendor). Defines *what* to scrape.
| Column | Type | Null | Notes |
| id | text | no | PK |
| vendor_id | text | no | FK |
| name | text | no | |
| kind | enum `ScrapeKind` | no | FULL, INCREMENTAL, SINGLE_OFFERING |
| is_enabled | boolean | no | |

**`scrape_runs`** — one execution of a job (*when*, *how it went*).
| Column | Type | Null | Notes |
| id | text | no | PK |
| job_id | text | no | FK → scrape_jobs |
| vendor_id | text | no | FK (denormalized for fast filtering) |
| status | enum `RunStatus` | no | QUEUED, RUNNING, SUCCESS, PARTIAL, FAILED, CANCELLED |
| trigger | enum `RunTrigger` | no | SCHEDULED, MANUAL, RETRY |
| proxy_id | text | yes | FK → proxies |
| started_at / finished_at | timestamptz | yes | |
| stats | jsonb | yes | `{found, changed, errors, durationMs}` |
| error_summary | text | yes | |
Indexes: `(vendor_id, started_at DESC)`, `(status)`.

**`scrape_results`** — per-offering outcome within a run.
| Column | Type | Null | Notes |
| id | text | no | PK |
| run_id | text | no | FK → scrape_runs, cascade |
| offering_id | text | yes | FK (null if new/unmatched) |
| raw_price_text | text | yes | as-seen |
| parsed_price | numeric(10,2) | yes | |
| in_stock | boolean | yes | |
| outcome | enum `ResultOutcome` | no | UNCHANGED, CHANGED, NEW, MISSING, ERROR |
| html_snapshot_url | text | yes | object-store key for debugging |
Index `(run_id)`, `(offering_id)`.

**`scrape_errors`** — structured failures (selector miss, timeout, blocked, parse).
| Column | Type | Null | Notes |
| id | text | no | PK |
| run_id | text | no | FK cascade |
| offering_id | text | yes | FK |
| error_type | enum `ScrapeErrorType` | no | NAV_TIMEOUT, BLOCKED, SELECTOR_MISS, PARSE_FAIL, HTTP_ERROR, ANOMALY, OTHER |
| message | text | no | |
| context | jsonb | yes | url, status, screenshot key |
| created_at | timestamptz | no | |

**`staged_price_changes`** — the **admin approval queue** (FR-20, BR-6/7/9).
| Column | Type | Null | Notes |
| id | text | no | PK |
| offering_id | text | no | FK → offerings, cascade |
| scrape_result_id | text | yes | FK → scrape_results |
| old_price | numeric(10,2) | yes | |
| new_price | numeric(10,2) | no | |
| delta_pct | numeric(6,2) | yes | computed |
| old_in_stock / new_in_stock | boolean | yes | |
| status | enum `ChangeStatus` | no | PENDING, AUTO_APPROVED, APPROVED, REJECTED, ANOMALY |
| reason | text | yes | validation/auto-decision note |
| reviewed_by | text | yes | FK → users |
| reviewed_at | timestamptz | yes | |
| created_at | timestamptz | no | |
Indexes: `(status, created_at)` (queue), `(offering_id)`.

**`proxies`** — proxy pool for scraping.
| Column | Type | Null | Notes |
| id | text | no | PK |
| label | text | yes | |
| url | text | no | `http://user:pass@host:port` (secret-managed) |
| kind | enum `ProxyKind` | no | DATACENTER, RESIDENTIAL, MOBILE |
| is_active | boolean | no | |
| health | enum `ProxyHealth` | no | HEALTHY, DEGRADED, BANNED |
| last_used_at / last_failed_at | timestamptz | yes | |
| fail_count | int | no | 0 |

### Engagement: saves, alerts, ratings, clicks

**`saved_tests`** — user bookmarks. Unique `(user_id, test_id)`, both FKs cascade. Stores
`price_at_save numeric(10,2)` to show deltas.

**`price_alerts`** — FR-14.
| Column | Type | Null | Notes |
| id | text | no | PK |
| user_id | text | no | FK cascade |
| test_id | text | yes | FK (watch whole test's cheapest) |
| offering_id | text | yes | FK (watch a specific vendor) |
| kind | enum `AlertKind` | no | ANY_DROP, BELOW_THRESHOLD |
| threshold | numeric(10,2) | yes | for BELOW_THRESHOLD |
| is_active | boolean | no | true |
| last_fired_at | timestamptz | yes | rate-limit (BR-14) |
Check: exactly one of (`test_id`, `offering_id`) is non-null.

**`alert_notifications`** — delivery log. FK `alert_id` cascade, `staged_change_id` nullable.
`channel` enum EMAIL (SMS/PUSH future), `status` enum QUEUED/SENT/FAILED, `sent_at`.

**`vendor_ratings`** — v2-ready (UI off in v1). Unique `(user_id, vendor_id)`. `rating SMALLINT`
(1–5, check), `review TEXT`, `status` enum PENDING/APPROVED/REJECTED (moderation).

**`affiliate_clicks`** — outbound order clicks (BR-15, revenue attribution).
| Column | Type | Null | Notes |
| id | text | no | PK = the subID we pass to the vendor |
| offering_id | text | no | FK |
| test_id | text | no | FK (denormalized) |
| vendor_id | text | no | FK (denormalized) |
| user_id | text | yes | FK (null if anonymous) |
| session_hash | text | yes | hashed anon id |
| ip_hash | text | yes | hashed, for fraud only |
| user_agent | text | yes | |
| referer | text | yes | |
| created_at | timestamptz | no | |
Index `(created_at)`, `(vendor_id, created_at)`, `(offering_id)`. **Partitioned monthly** (volume).

### Analytics, content, ops

**`search_logs`** — query, normalized query, result_count, selected_test_id (nullable), user/session,
created_at. Powers "no results" gap analysis and trending tests. Partitioned monthly.

**`page_views`** — lightweight first-party analytics (path, test_id?, referer, session_hash,
created_at). Partitioned monthly. (External analytics like Plausible may supplement.)

**`seo_pages`** — editable landing pages (FR-23): slug, title, h1, body (MDX/HTML), meta, optional
`test_id`/`category_id` target, status, `published_at`. Unique `slug`.

**`feature_flags`** — key (unique), description, is_enabled, rollout_pct, audience jsonb, updated_by.

**`system_settings`** — key (unique), value jsonb, description. Holds the tunables referenced in BR
(`STALE_AFTER_DAYS`, `AUTO_APPROVE_THRESHOLD_PCT`, etc.).

**`audit_logs`** — actor_id (FK users, nullable for system), action (text), entity (text),
entity_id (text), before jsonb, after jsonb, ip_hash, created_at. Append-only; index
`(entity, entity_id)`, `(actor_id, created_at)`. (Detail in Deliverable #7.)

---

## Why this shape

- **Offering as the join + denormalized `current_price`** keeps the hot comparison query a single
  indexed read (`offerings WHERE test_id = ? AND is_active`) while `price_history` stays append-only
  and partitioned for the "millions of records" requirement and trend charts.
- **Staging table** (`staged_price_changes`) cleanly separates "what the scraper saw" from "what is
  published," enabling the admin approval workflow and instant rollback without touching history.
- **Config-in-DB scraping** (`scrape_vendor_configs`) satisfies "add/adjust vendors without code
  changes."
- **Partitioning** `price_history`, `affiliate_clicks`, `search_logs`, `page_views` by month keeps
  the high-volume, time-series tables manageable and cheaply prunable by retention jobs.
- **Soft deletes + audit + immutable history** give the data-integrity and change-history the brief
  requires, without bloating hot reads (partial indexes exclude deleted rows).
