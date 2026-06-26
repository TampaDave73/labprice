# Deliverable #6 — Admin Panel

Mounted at `/admin` (Next.js App Router segment), gated by `requireRole(EDITOR+)` with per-screen
role checks. Shares the design language/accent tokens of the public site. Server components +
server actions for data, with optimistic UI on the approval queue.

## Roles → access
| Screen | EDITOR | ADMIN | SUPER_ADMIN |
|---|---|---|---|
| Dashboard, Change Queue, Tests, SEO Pages | ✅ | ✅ | ✅ |
| Vendors, Offerings, Scraper Monitor, Users, Analytics, Feature Flags, Ratings | ❌ | ✅ | ✅ |
| Proxies, System Settings, Audit Log | ❌ | ❌ | ✅ |

## Screens

### 1. Dashboard (home)
KPI cards: pending changes, scrape runs today (success/fail), zero-result searches (24h), affiliate
clicks (7d), stalest vendors. Quick links to the queue and any failing vendor. Activity feed from
`audit_logs`.

### 2. Change Queue *(the core daily workflow — FR-20)*
- Table of `staged_price_changes` filtered to `PENDING`/`ANOMALY` by default; filter by vendor,
  status, delta size; sort by `delta_pct`.
- Each row: test, vendor, old→new price, **% delta** (color-coded), in-stock change, source run link,
  confidence/reason, and the scraped HTML snapshot link.
- Actions: **Approve** (publish tx), **Reject** (reason), open offering. **Bulk select** + bulk
  approve/reject; a "select all low-risk (|Δ|<5%)" helper. Keyboard shortcuts (A/R/J/K).
- Approve/reject is optimistic; failures roll back the row with a toast.

### 3. Tests (catalog management) *(EDITOR+)*
- List with search/filter (category, status, popular). CRUD a test: name, short name, slug
  (locked after publish), category, popular flag, status, all accordion content fields, synonyms,
  SEO title/description.
- Sub-editors: **Codes** (Quest/LabCorp), **Biomarkers** (attach/detach for biomarker search).
- Live preview of the public Results header/accordion.

### 4. Vendors *(ADMIN)*
CRUD vendor: name, slug, website, logo, **affiliate URL template** (with `{clickId}`/`{vendorSku}`
tokens + live preview), affiliate network, **trust level** (drives auto-approve, BR-7), priority
(tie-break), active toggle. Tab to that vendor's **Scrape Config** and **Offerings**.

### 5. Offerings *(ADMIN)*
Per-vendor or per-test grid of offerings: current price, freshness badge, in-stock, product URL,
last scraped. Inline **manual price set** (writes `price_history` `source=MANUAL` + audit), toggle
active, "re-scrape this offering."

### 6. Scrape Config editor *(ADMIN — FR-18)*
Form over `scrape_vendor_configs`: engine, list/detail URL templates, **selectors JSON** (with
schema hints + validation), nav steps, price regex, headers, proxy use, rate limit, concurrency,
schedule cron, enabled. **"Test run" button** scrapes a single sample offering and shows the raw
extraction inline so editors tune selectors without a deploy.

### 7. Scraper Monitor *(ADMIN — FR-21)*
- **Jobs**: per-vendor job list, enabled toggle, "Run now," next scheduled time.
- **Runs**: history table (vendor, status, trigger, duration, found/changed/errors, proxy). Filter by
  vendor/status/date. Drill into a run → its `scrape_results` + `scrape_errors` with snapshots.
- **Health**: per-vendor success rate, freshness %, block rate, last success, against SLOs (green/
  amber/red). Manual re-scrape + "pause vendor."

### 8. Error Logs *(ADMIN)*
Unified `scrape_errors` stream filterable by type (BLOCKED, SELECTOR_MISS, …), vendor, date; links to
the offending run/offering and snapshot. "Create config fix" jumps to the Scrape Config editor.

### 9. Price History *(ADMIN)*
Pick a test/offering → trend chart + tabular `price_history` with source (SCRAPE/MANUAL/IMPORT/FEED)
and the run that produced each point. Export CSV.

### 10. Users *(ADMIN)*
List/search users; view role, status, saved tests/alerts counts, signup date. Change role (audited),
suspend/reactivate, trigger GDPR export/delete. SUPER_ADMIN-only: grant ADMIN/SUPER_ADMIN.

### 11. Analytics *(ADMIN — FR-24)*
- **Overview**: searches, clicks, top tests/vendors, conversion proxy (clicks/views), trends.
- **Searches**: top queries + **zero-result queries** (catalog gap → "create test" CTA).
- **Affiliate clicks**: by vendor/test/day, click→assumed-revenue (using per-vendor commission
  config), CSV export for reconciliation.

### 12. SEO Pages (content management) *(EDITOR+ — FR-23)*
CRUD `seo_pages`: slug, title, H1, body (MDX), meta, optional test/category target, status, publish.
Live SEO preview (title/description/snippet) + structured-data validation.

### 13. Feature Flags *(ADMIN)*
Toggle flags, rollout %, audience JSON. Notable flags: `vendor_ratings_v2`, `biomarker_search`,
`subset_compare`, `price_alerts`.

### 14. System Settings *(SUPER_ADMIN)*
Edit `system_settings` tunables referenced by business rules: `STALE_AFTER_DAYS`,
`HIDE_AFTER_DAYS`, `AUTO_APPROVE_THRESHOLD_PCT`, `SANITY_MAX_PCT`, `MAX_ALERTS_PER_USER`, scrape
hour/jitter, retention windows. Validated; changes audited.

### 15. Proxies *(SUPER_ADMIN)*
Manage `proxies` (masked credentials): add/remove, tier, active, health, fail counts, last used.
"Test proxy" button.

### 16. Ratings Moderation *(ADMIN — v2)*
Queue of `vendor_ratings` (PENDING) → approve/reject. Hidden until `vendor_ratings_v2` flag on.

### 17. Audit Log *(SUPER_ADMIN)*
Filterable `audit_logs` (actor, action, entity, date) with before/after diffs. Read-only, exportable.
