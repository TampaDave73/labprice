# Deliverable #6 — Admin Panel Design

Mounted at `/admin` (Next.js App Router route group `(admin)`), gated by `requireRole(EDITOR+)` middleware with per-screen role checks. Shares the public site's design language: DM Sans typography, oklch color tokens, Tailwind utility classes, and the same component library (shadcn/ui). All data fetching uses React Server Components with server actions for mutations. Optimistic UI on the Change Queue for fast approve/reject workflows.

---

## 1. Role Matrix

Three roles form a strict hierarchy: **EDITOR < ADMIN < SUPER_ADMIN**. Higher roles inherit all lower-role permissions.

| Screen | EDITOR | ADMIN | SUPER_ADMIN |
|---|---|---|---|
| Dashboard | view | view | view |
| Change Queue | approve / reject | approve / reject + bulk | all |
| Tests | view | CRUD | CRUD |
| Vendors | view | CRUD | CRUD |
| Offerings | view | CRUD + manual price | CRUD + manual price |
| Scrape Config | view | edit + test run | edit + test run |
| Scraper Monitor | view | view + retry | view + retry |
| Error Logs | view | view | view |
| Price History | view | view | view + export |
| Users | --- | view | CRUD + role change |
| Analytics | view | view | view |
| SEO Pages | --- | CRUD | CRUD |
| Feature Flags | --- | --- | toggle |
| System Settings | --- | --- | edit |
| Proxies | --- | --- | CRUD |
| Audit Log | --- | view | view |

---

## 2. Shared Layout & Navigation

### 2.1 Shell

```
+--sidebar (240 px, collapsible)--+--main content area---------+
| Logo / "LabPrice Admin"        | top bar: breadcrumb, user  |
| nav groups (see below)         | avatar, role badge, logout |
|                                | page content               |
+---------------------------------+----------------------------+
```

- **Sidebar** groups: *Core* (Dashboard, Change Queue), *Catalog* (Tests, Vendors, Offerings), *Scraping* (Scrape Config, Scraper Monitor, Error Logs), *Data* (Price History, Analytics), *Content* (SEO Pages), *System* (Users, Feature Flags, System Settings, Proxies, Audit Log).
- Items hidden if the user lacks the minimum role for that screen.
- Active item highlighted with `oklch(0.65 0.25 265)` left border + subtle background.
- Sidebar collapses to icon-only on small viewports; toggled via hamburger in top bar.

### 2.2 Common Patterns

- **Tables:** built on `@tanstack/react-table`. Column sorting, resizable columns, sticky header, row selection checkboxes (where bulk actions exist). Pagination: cursor-based, 20 rows default.
- **Filters:** filter bar above table with dropdowns, date pickers, and a search input. Applied via URL search params (shareable links).
- **Forms:** slide-over panel (right drawer, 480 px) or full-page depending on complexity. Validated client-side with zod, server-side with the same schema.
- **Toasts:** bottom-right, auto-dismiss 5 s. Success (green), error (red), warning (amber).
- **Confirmation dialogs:** destructive actions (delete, deactivate) require a confirmation modal with the entity name typed to confirm for critical operations.
- **Empty states:** illustration + description + primary action CTA.
- **Loading:** skeleton shimmer matching the layout shape.

---

## 3. Screen Specifications

### 3.1 Dashboard

| Property | Value |
|---|---|
| **URL** | `/admin` |
| **Purpose** | At-a-glance operational health; fast links to daily tasks |
| **Min role** | EDITOR |

#### UI Elements

**KPI Cards** (top row, 5 cards in a responsive grid):

| Card | Value | Subtext | Color coding |
|---|---|---|---|
| Total Tests | count from `tests` | `+N this week` | neutral |
| Total Vendors | count from `vendors` where `is_active` | `N inactive` | neutral |
| Total Offerings | count from `offerings` | `N active` | neutral |
| Pending Changes | count from `staged_price_changes` where `status = PENDING` | link: "Review queue" | amber if > 0, red if > 50 |
| Scrape Health | % of vendors with successful scrape in last 24 h | `N failing` | green >= 90 %, amber 70-89 %, red < 70 % |

**Recent Activity Feed** (left 2/3, card):
- Last 20 entries from `audit_logs`, rendered as timeline items.
- Each entry: actor avatar + name, action verb, entity link, relative timestamp.
- "View all" links to Audit Log.

**Quick Actions** (right 1/3, card):
- "Review pending changes" (badge with count)
- "Add new test"
- "Add new vendor"
- "Run all scrapes"
- "View error logs" (badge with count if errors in last 24 h)

**Stalest Vendors** (bottom row, card):
- Table of vendors sorted by `last_successful_scrape_at` ascending, limited to 5.
- Columns: vendor name, last success, hours since, status badge.
- Row click navigates to that vendor's scrape config.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/analytics/overview` | KPI aggregates |
| `GET /api/v1/audit-logs?limit=20` | activity feed |
| `GET /admin/scrape/health` | per-vendor freshness |
| `GET /admin/changes?status=PENDING&limit=1` | pending count |

---

### 3.2 Change Queue

| Property | Value |
|---|---|
| **URL** | `/admin/changes` |
| **Purpose** | The core daily workflow. Review, approve, or reject scraped price changes before they go live. Every scraped price delta must pass through this gate. |
| **Min role** | EDITOR (bulk actions require ADMIN) |

#### UI Elements

**Filter Bar:**
- Status dropdown: PENDING (default), ANOMALY, APPROVED, REJECTED, ALL
- Vendor dropdown (multi-select)
- Date range picker (scrape timestamp)
- Delta size range slider (e.g., show only changes > 10 %)
- Search input (test name)
- "Clear filters" button

**Table Columns:**

| Column | Description | Sortable |
|---|---|---|
| Checkbox | row selection for bulk actions | --- |
| Test | test name, linked to test detail | yes |
| Vendor | vendor name with trust-level badge (HIGH / MEDIUM / LOW) | yes |
| Old Price | previous `current_price` on the offering | yes |
| New Price | scraped price from the change record | yes |
| Delta | absolute and percentage change; color-coded: green (decrease), red (increase), amber (> SANITY_MAX_PCT) | yes |
| In-Stock | stock status change indicator (if changed) | --- |
| Scraped At | relative timestamp of the scrape run | yes |
| Source | link to the scrape run detail | --- |
| Actions | Approve / Reject buttons | --- |

**Bulk Actions Bar** (appears when rows selected, ADMIN+):
- "Approve selected (N)"
- "Reject selected (N)" (opens reason modal)
- "Select all low-risk" helper button (selects rows where `|delta_pct| < AUTO_APPROVE_THRESHOLD_PCT` AND vendor trust = HIGH)

**Keyboard Shortcuts** (shown in footer hint bar):

| Key | Action |
|---|---|
| `j` | move focus to next row |
| `k` | move focus to previous row |
| `a` | approve focused row |
| `r` | reject focused row (opens reason input) |
| `x` | toggle selection on focused row |
| `Shift+A` | bulk approve all selected |

**Row Expansion:**
- Click row to expand inline detail panel.
- Shows: scraped HTML snapshot (iframe/image), product URL, scrape confidence score, extraction reason text, raw extracted values.

#### Approve Workflow
1. User clicks Approve (or presses `a`).
2. Optimistic UI: row fades to green, moves to bottom or is hidden (based on filter).
3. Server action `POST /admin/changes/{id}/approve` executes in a transaction: updates `offerings.current_price`, inserts `price_history` row with `source = SCRAPE`, sets change status to `APPROVED`, writes `audit_logs` entry.
4. On failure: row snaps back, red toast with error message.

#### Reject Workflow
1. User clicks Reject (or presses `r`).
2. Inline input appears for rejection reason (required, min 3 chars).
3. `POST /admin/changes/{id}/reject` with `{ reason }`.
4. Row fades to red, filtered out.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/changes` | paginated list with filters |
| `POST /admin/changes/{id}/approve` | approve single |
| `POST /admin/changes/{id}/reject` | reject single |
| `POST /admin/changes/bulk` | bulk approve/reject |

---

### 3.3 Tests

| Property | Value |
|---|---|
| **URL** | `/admin/tests` |
| **Purpose** | CRUD management of the test catalog |
| **Min role** | EDITOR (view), ADMIN (create/edit/delete) |

#### UI Elements

**Filter Bar:**
- Search input (name, quest code, labcorp code)
- Category dropdown (multi-select)
- Status dropdown: ACTIVE, DRAFT, ARCHIVED
- Popular toggle (show only `is_popular = true`)

**Table Columns:**

| Column | Sortable |
|---|---|
| Name (linked to edit form) | yes |
| Category | yes |
| Quest Code | yes |
| LabCorp Code | yes |
| Offerings Count | yes |
| Popular | yes (boolean badge) |
| Status | yes |
| Actions (Edit, Archive) | --- |

**Create / Edit Form** (slide-over drawer, 560 px):

| Section | Fields |
|---|---|
| Basic Info | name (required), short_name, slug (auto-generated from name, locked after first publish), category (select), status (DRAFT / ACTIVE / ARCHIVED) |
| Lab Codes | quest_code (text), labcorp_code (text) |
| Clinical Content | description (textarea, markdown), preparation (textarea), turnaround_time (text), sample_type (select) |
| Search & SEO | synonyms (tag input, comma-separated), seo_title, seo_description (with char counter, max 160) |
| Flags | is_popular (toggle) |

**Validation Rules:**
- `name` unique, 2-200 chars.
- `slug` unique, auto-kebab-case, immutable once test has offerings.
- `quest_code` / `labcorp_code` optional, must match pattern if provided.
- `seo_title` max 70 chars, `seo_description` max 160 chars.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/tests` | list with filters, pagination |
| `POST /admin/tests` | create |
| `PATCH /admin/tests/{id}` | update |
| `DELETE /admin/tests/{id}` | soft-delete (archive) |

---

### 3.4 Vendors

| Property | Value |
|---|---|
| **URL** | `/admin/vendors` |
| **Purpose** | Manage ordering services (vendors) that sell lab test requisitions |
| **Min role** | EDITOR (view), ADMIN (create/edit/delete) |

#### UI Elements

**Table Columns:**

| Column | Sortable |
|---|---|
| Name (linked to edit) | yes |
| Website (external link icon) | --- |
| Trust Level (HIGH / MEDIUM / LOW badge) | yes |
| Offerings Count | yes |
| Active (toggle, inline) | yes |
| Last Scrape (relative timestamp, freshness badge) | yes |
| Actions (Edit, Scrape Config, View Offerings) | --- |

**Freshness Badge Logic:**
- Green: last successful scrape < 24 h ago
- Amber: 24-48 h ago
- Red: > 48 h ago or never

**Create / Edit Form** (slide-over drawer):

| Section | Fields |
|---|---|
| Basic Info | name (required, unique), slug (auto-generated), website (URL, required) |
| Logo | logo upload (drag-and-drop, max 500 KB, PNG/SVG/WebP) |
| Affiliate | affiliate_url_template (text with `{clickId}` and `{vendorSku}` token placeholders), affiliate_network (select), commission_rate (decimal) |
| Trust & Priority | trust_level (HIGH / MEDIUM / LOW select), display_priority (integer, tie-break for same-price ordering) |
| Status | is_active (toggle) |

**Affiliate URL Preview:**
- Below the template input, a live preview shows the resolved URL with sample values substituted.

**Tab Links:**
- "Scrape Config" navigates to `/admin/scrape/configs?vendor={id}`
- "Offerings" navigates to `/admin/offerings?vendor={id}`

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/vendors` | list |
| `POST /admin/vendors` | create |
| `PATCH /admin/vendors/{id}` | update |
| `DELETE /admin/vendors/{id}` | soft-delete (deactivate) |

---

### 3.5 Offerings

| Property | Value |
|---|---|
| **URL** | `/admin/offerings` |
| **Purpose** | Manage test + vendor + price combinations; apply manual price overrides |
| **Min role** | EDITOR (view), ADMIN (create/edit, manual price) |

#### UI Elements

**Filter Bar:**
- Test search (typeahead)
- Vendor dropdown (multi-select)
- Active status toggle
- Price range inputs (min / max)
- Staleness filter: Fresh / Stale / All

**Table Columns:**

| Column | Sortable |
|---|---|
| Test (linked to test edit) | yes |
| Vendor (linked to vendor edit) | yes |
| Current Price | yes |
| Last Updated (relative timestamp) | yes |
| In Stock (boolean badge) | yes |
| Product URL (external link) | --- |
| Freshness (badge) | yes |
| Active (toggle, inline) | yes |
| Actions (Edit, Manual Price, Re-scrape) | --- |

**Manual Price Override** (modal):
- Current price displayed (read-only).
- New price input (decimal, required).
- Reason input (required, e.g., "vendor site confirmed $39.00 via support chat").
- On submit: writes `price_history` with `source = MANUAL`, updates `offerings.current_price`, creates `audit_logs` entry.
- Warning banner: "Manual prices will be overwritten by the next scrape unless the offering is marked inactive."

**Re-scrape Action:**
- `POST /admin/scrape/offerings/{id}/run` enqueues a single-offering scrape job.
- Button shows spinner until job completes; toast with result.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/offerings` | list with filters |
| `POST /admin/offerings` | create |
| `PATCH /admin/offerings/{id}` | update (including manual price) |
| `POST /admin/scrape/offerings/{id}/run` | re-scrape single offering |

---

### 3.6 Scrape Config

| Property | Value |
|---|---|
| **URL** | `/admin/scrape/configs` |
| **Purpose** | Configure per-vendor scrape parameters: selectors, URLs, schedules, engine settings |
| **Min role** | EDITOR (view), ADMIN (edit, test run) |

#### UI Elements

**Vendor Selector:**
- Left sidebar list of all vendors, each showing a health dot (green/amber/red) and last-run timestamp.
- Click a vendor to load its config in the main area.
- URL updates to `/admin/scrape/configs?vendor={id}`.

**Config Form** (main area, tabbed):

**Tab 1: URLs & Navigation**

| Field | Description |
|---|---|
| Engine | select: PLAYWRIGHT, HTTP, API_FEED |
| List URL Template | URL pattern for the vendor's product listing page |
| Detail URL Template | URL pattern for individual product pages |
| Navigation Steps | JSON array of Playwright actions (click, wait, scroll) for SPAs |
| Rate Limit | requests per second (decimal) |
| Concurrency | max parallel requests (integer, 1-10) |
| Request Timeout | seconds (integer, default 30) |

**Tab 2: Selectors**

- **JSON Editor** (Monaco editor, syntax-highlighted, schema-validated) for the selectors object:
  ```json
  {
    "price": { "selector": ".price-value", "attribute": "textContent", "regex": "\\$([\\d.]+)" },
    "inStock": { "selector": ".availability", "match": "In Stock" },
    "productName": { "selector": "h1.product-title" }
  }
  ```
- Schema validation runs on blur; errors shown inline with line numbers.
- "Format JSON" button.

**Tab 3: Schedule & Options**

| Field | Description |
|---|---|
| Schedule | cron expression input with human-readable preview ("Every day at 3:00 AM UTC") |
| Enabled | toggle |
| Use Proxy | toggle |
| Proxy Tier | select (RESIDENTIAL, DATACENTER) — only shown if Use Proxy is on |
| Custom Headers | key-value pair editor |
| Max Retries | integer (default 2) |

**Test Run Button** (ADMIN+):
- Prominent button: "Test Run (1 offering)".
- Opens a bottom panel showing live output:
  - Step-by-step log: "Navigating to URL...", "Waiting for selector...", "Extracting price..."
  - Extracted values displayed in a result card: price, in-stock, product name.
  - Screenshot of the page at extraction time (Playwright only).
  - Duration and status (success / failure with error message).
- Does NOT write to `offerings` or `price_history`; purely diagnostic.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/vendors/{id}/scrape-config` | load config |
| `PUT /admin/vendors/{id}/scrape-config` | save config |
| `POST /admin/scrape/offerings/{id}/run` | test run (with `?dryRun=true` flag) |

---

### 3.7 Scraper Monitor

| Property | Value |
|---|---|
| **URL** | `/admin/scrape/monitor` |
| **Purpose** | Monitor running and historical scrape jobs; retry failures; assess per-vendor health |
| **Min role** | EDITOR (view), ADMIN (retry, run now) |

#### UI Elements

**Three Sub-tabs:**

**Tab 1: Jobs** (`/admin/scrape/monitor/jobs`)

| Column | Description |
|---|---|
| Vendor | name + logo |
| Status | IDLE / RUNNING / PAUSED |
| Enabled | toggle (ADMIN) |
| Last Run | timestamp + duration |
| Next Scheduled | computed from cron |
| Actions | "Run Now" button (ADMIN) |

- "Run Now" enqueues an immediate scrape: `POST /admin/scrape/jobs/{id}/run`.
- Running jobs show a progress indicator (offerings scraped / total).

**Tab 2: Runs** (`/admin/scrape/monitor/runs`)

**Filter Bar:**
- Vendor dropdown
- Status: SUCCESS, PARTIAL, FAILED, RUNNING
- Trigger: SCHEDULED, MANUAL
- Date range

| Column | Sortable |
|---|---|
| Vendor | yes |
| Status (color-coded badge) | yes |
| Trigger | yes |
| Started At | yes |
| Duration | yes |
| Prices Found | yes |
| Prices Changed | yes |
| Errors | yes |
| Proxy Used | --- |
| Actions (View Detail, Retry) | --- |

**Run Detail** (slide-over or drill-down page):
- Summary card: vendor, status, timestamps, duration, trigger.
- Results table: offering, old price, new price, delta, extraction confidence.
- Errors table: error type, URL, message, screenshot link.
- "Retry this run" button (ADMIN): re-enqueues with same config.

**Tab 3: Health** (`/admin/scrape/monitor/health`)

Per-vendor health dashboard as a card grid:

| Metric | SLO | Display |
|---|---|---|
| Success Rate (7d) | >= 90 % | circular progress, green/amber/red |
| Freshness | last success < 24 h | relative time + color badge |
| Block Rate (7d) | < 5 % | percentage + bar |
| Avg Duration | < 60 s | seconds |
| Last Success | --- | timestamp |

- Cards sorted: worst-health-first by default.
- Card actions: "View runs", "Edit config", "Pause vendor" (ADMIN).

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/scrape/jobs` | job list |
| `POST /admin/scrape/jobs/{id}/run` | trigger run |
| `GET /admin/scrape/runs` | run history |
| `GET /admin/scrape/runs/{id}` | run detail |
| `GET /admin/scrape/health` | per-vendor health metrics |

---

### 3.8 Error Logs

| Property | Value |
|---|---|
| **URL** | `/admin/scrape/errors` |
| **Purpose** | Searchable log of all scrape errors for debugging and selector maintenance |
| **Min role** | EDITOR |

#### UI Elements

**Filter Bar:**
- Error type dropdown: BLOCKED, SELECTOR_MISS, TIMEOUT, PARSE_ERROR, NETWORK_ERROR, CAPTCHA, OTHER
- Vendor dropdown (multi-select)
- Date range picker
- URL search input

**Table Columns:**

| Column | Sortable |
|---|---|
| Timestamp | yes |
| Vendor | yes |
| Error Type (color-coded badge) | yes |
| URL (truncated, full on hover) | --- |
| Message (truncated) | --- |
| Run (linked to run detail) | --- |
| Offering (linked to offering) | --- |
| Actions (View Detail) | --- |

**Error Detail** (slide-over):
- Full error message and stack trace (code block, monospace).
- Screenshot viewer: rendered Playwright screenshot at time of failure (zoomable image).
- Request/response metadata: status code, headers, response body preview.
- "Open in Scrape Config" link: navigates to the vendor's config editor for selector tuning.
- "Open URL" link: external link to the failing page.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/scrape/errors` | paginated, filterable error list |
| `GET /admin/scrape/runs/{id}` | parent run context |

---

### 3.9 Price History

| Property | Value |
|---|---|
| **URL** | `/admin/price-history` |
| **Purpose** | Visualize and export historical price data across tests and vendors |
| **Min role** | EDITOR (view), SUPER_ADMIN (export) |

#### UI Elements

**Selection Controls:**
- Test typeahead search (required to load chart).
- Vendor multi-select checkboxes (default: all vendors for the selected test).
- Date range picker (presets: 7d, 30d, 90d, 1y, All).

**Chart** (main area):
- Line chart (Recharts or similar) with one line per vendor, color-coded.
- X-axis: date. Y-axis: price (USD).
- Tooltips on hover: date, vendor, price, source (SCRAPE / MANUAL / IMPORT).
- Legend below chart with vendor names; click to toggle lines.
- Annotations: vertical dashed lines for MANUAL overrides.

**Data Table** (below chart, collapsible):

| Column | Sortable |
|---|---|
| Date | yes |
| Vendor | yes |
| Price | yes |
| Source (SCRAPE / MANUAL / IMPORT / FEED) | yes |
| Changed By (for MANUAL) | --- |
| Run ID (for SCRAPE, linked) | --- |

**Export** (SUPER_ADMIN only):
- "Export CSV" button in top-right.
- Exports all rows matching current filters: date, test, vendor, price, source.
- Filename: `price-history-{test_slug}-{date}.csv`.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/tests/{slug}/trends` | chart data points |
| `GET /admin/price-history?test={id}` | detailed history table (admin-enriched with source, actor) |

---

### 3.10 Users

| Property | Value |
|---|---|
| **URL** | `/admin/users` |
| **Purpose** | Manage user accounts and roles |
| **Min role** | ADMIN (view), SUPER_ADMIN (edit roles, deactivate) |

#### UI Elements

**Filter Bar:**
- Search input (email, name)
- Role dropdown: USER, EDITOR, ADMIN, SUPER_ADMIN, ALL
- Status dropdown: ACTIVE, SUSPENDED, ALL

**Table Columns:**

| Column | Sortable |
|---|---|
| Email | yes |
| Name | yes |
| Role (badge) | yes |
| Status (badge) | yes |
| Created At | yes |
| Last Login | yes |
| Saved Tests (count) | yes |
| Active Alerts (count) | yes |
| Actions | --- |

**Actions** (SUPER_ADMIN only):
- **Role Change**: dropdown selector with confirmation modal. "Change role for user@example.com from EDITOR to ADMIN?" Changes are written to `audit_logs`.
- **Deactivate / Reactivate**: toggle with confirmation. Deactivated users cannot log in; their sessions are invalidated immediately.
- Cannot change own role or deactivate own account.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/users` | paginated user list |
| `PATCH /admin/users/{id}` | update role or status |

---

### 3.11 Analytics

| Property | Value |
|---|---|
| **URL** | `/admin/analytics` |
| **Purpose** | Understand user behavior: what they search, what they click, where the catalog has gaps |
| **Min role** | EDITOR |

#### UI Elements

**Three Sub-tabs:**

**Tab 1: Overview** (`/admin/analytics`)
- KPI cards: total searches (7d), total affiliate clicks (7d), click-through rate, unique visitors (7d).
- Trend line chart: searches and clicks over the past 30 days.
- Top 10 tests by search volume (bar chart).
- Top 5 vendors by click volume (bar chart).

**Tab 2: Searches** (`/admin/analytics/searches`)
- **Top Queries** table: query text, count, avg results returned. Sortable by count.
- **Zero-Result Queries** table (highlighted): query text, count, last searched.
  - Each row has a "Create Test" CTA button that navigates to `/admin/tests` with the query pre-filled as the test name.
  - These represent catalog gaps and are high-priority signals.
- Date range filter.

**Tab 3: Affiliate Clicks** (`/admin/analytics/clicks`)
- Filter by vendor, test, date range.
- Table: date, test, vendor, click count, estimated revenue (click count * vendor commission rate).
- Chart: clicks by vendor over time (stacked area chart).
- "Export CSV" button for reconciliation with affiliate networks.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/analytics/overview` | KPI aggregates and trends |
| `GET /admin/analytics/searches` | search query data |
| `GET /admin/analytics/clicks` | affiliate click data |

---

### 3.12 SEO Pages

| Property | Value |
|---|---|
| **URL** | `/admin/seo` |
| **Purpose** | CMS for creating and managing SEO landing pages (e.g., "Cheapest Thyroid Panel Tests") |
| **Min role** | ADMIN |

#### UI Elements

**Table Columns:**

| Column | Sortable |
|---|---|
| Title | yes |
| Slug (`/pages/{slug}`) | yes |
| Status (DRAFT / PUBLISHED) | yes |
| Updated At | yes |
| Actions (Edit, Preview, Publish/Unpublish) | --- |

**Create / Edit Form** (full page):

| Section | Fields |
|---|---|
| Content | title (required, max 70), slug (auto from title, editable, unique), heading (H1, defaults to title), body (rich text editor -- Tiptap with markdown shortcuts, supports headings, lists, links, images, tables) |
| SEO | meta_description (textarea, max 160, char counter), og_image (upload), canonical_url (optional) |
| Targeting | target_test (optional select -- links page to a specific test), target_category (optional select) |
| Status | publish toggle (DRAFT / PUBLISHED) |

**Preview:**
- "Preview" button opens the page in a new tab at `/pages/{slug}?preview=true` (bypasses published check for admin sessions).

**SEO Preview Card:**
- Below the form, a Google SERP snippet preview showing how the page will appear in search results: blue title link, green URL, gray description.

**Structured Data Validation:**
- On save, validates that JSON-LD structured data is well-formed; warning toast if issues detected.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/seo-pages` | list |
| `POST /admin/seo-pages` | create |
| `PATCH /admin/seo-pages/{id}` | update |
| `DELETE /admin/seo-pages/{id}` | delete (soft) |

---

### 3.13 Feature Flags

| Property | Value |
|---|---|
| **URL** | `/admin/flags` |
| **Purpose** | Toggle feature flags to enable/disable features without deploys |
| **Min role** | SUPER_ADMIN |

#### UI Elements

**Table** (no pagination needed; expect < 50 flags):

| Column | Description |
|---|---|
| Key | machine-readable key, e.g., `biomarker_search` |
| Description | human explanation of the flag's effect |
| Enabled | toggle switch (writes `audit_logs` on change) |
| Payload | optional JSON config (shown as collapsible code block) |
| Updated At | timestamp of last change |
| Updated By | actor name |

**Edit Payload** (inline expansion):
- Monaco JSON editor for the payload field (e.g., rollout percentage, audience rules).
- "Save" button validates JSON before persisting.

**Notable Flags (v1):**

| Key | Purpose |
|---|---|
| `biomarker_search` | enables search-by-biomarker on the public site |
| `price_alerts` | enables price-drop alert signup |
| `subset_compare` | enables side-by-side test comparison feature |

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/feature-flags` | list all flags |
| `PUT /admin/feature-flags` | update flag(s) |

---

### 3.14 System Settings

| Property | Value |
|---|---|
| **URL** | `/admin/settings` |
| **Purpose** | Edit global system tunables that govern business rules, scraping behavior, and retention |
| **Min role** | SUPER_ADMIN |

#### UI Elements

**Settings organized in collapsible sections:**

**Scraping Defaults:**

| Key | Type | Description | Default |
|---|---|---|---|
| `STALE_AFTER_DAYS` | integer | offerings older than this show "stale" badge | 3 |
| `HIDE_AFTER_DAYS` | integer | offerings older than this are hidden from public | 14 |
| `SCRAPE_HOUR_UTC` | integer | hour to start scheduled scrapes | 3 |
| `SCRAPE_JITTER_MINUTES` | integer | random jitter added to schedule | 30 |

**Approval Thresholds:**

| Key | Type | Description | Default |
|---|---|---|---|
| `AUTO_APPROVE_THRESHOLD_PCT` | decimal | changes below this % from HIGH-trust vendors are "low-risk" | 5.0 |
| `SANITY_MAX_PCT` | decimal | changes above this % are flagged as ANOMALY | 50.0 |

**User Limits:**

| Key | Type | Description | Default |
|---|---|---|---|
| `MAX_ALERTS_PER_USER` | integer | max price-drop alerts per user | 20 |
| `MAX_SAVED_TESTS_PER_USER` | integer | max saved tests per user | 50 |

**Data Retention:**

| Key | Type | Description | Default |
|---|---|---|---|
| `PRICE_HISTORY_RETENTION_DAYS` | integer | days to keep price history | 730 |
| `AUDIT_LOG_RETENTION_DAYS` | integer | days to keep audit logs | 365 |
| `SCRAPE_ERROR_RETENTION_DAYS` | integer | days to keep error logs | 90 |

**Form Behavior:**
- Each field shows its current value, default value, and description.
- "Save" button validates all values (type-checked, range-checked) before persisting.
- Changes are written to `audit_logs` with old and new values.
- Warning banner at top: "Changes to these settings affect system behavior immediately."

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/settings` | load all settings |
| `PUT /admin/settings` | update settings |

---

### 3.15 Proxies

| Property | Value |
|---|---|
| **URL** | `/admin/proxies` |
| **Purpose** | Manage the proxy pool used by scrapers to avoid IP blocks |
| **Min role** | SUPER_ADMIN |

#### UI Elements

**Table Columns:**

| Column | Sortable |
|---|---|
| URL (masked: `http://***@proxy.example.com:8080`) | --- |
| Provider | yes |
| Type (RESIDENTIAL / DATACENTER) | yes |
| Active (toggle) | yes |
| Success Rate (7d, percentage bar) | yes |
| Fail Count (7d) | yes |
| Last Used | yes |
| Actions (Edit, Test, Delete) | --- |

**Create / Edit Form** (modal):

| Field | Description |
|---|---|
| URL | full proxy URL including credentials (stored encrypted) |
| Provider | text (e.g., "BrightData", "Oxylabs") |
| Type | RESIDENTIAL / DATACENTER select |
| Active | toggle |

**Test Proxy Button:**
- Sends a test request through the proxy to a known endpoint (e.g., `httpbin.org/ip`).
- Displays: response IP, latency, status (pass/fail).

**Health Display:**
- Per-proxy: total requests, success rate, avg latency, last failure reason.
- Aggregated at top: total active proxies, overall success rate.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /admin/proxies` | list (credentials masked in response) |
| `POST /admin/proxies` | create |
| `PATCH /admin/proxies/{id}` | update |
| `DELETE /admin/proxies/{id}` | hard delete |

---

### 3.16 Audit Log

| Property | Value |
|---|---|
| **URL** | `/admin/audit` |
| **Purpose** | Immutable, read-only log of all admin actions for accountability and debugging |
| **Min role** | ADMIN (view), SUPER_ADMIN (view) |

#### UI Elements

**Filter Bar:**
- Actor search (name or email)
- Action type dropdown: CREATE, UPDATE, DELETE, APPROVE, REJECT, LOGIN, ROLE_CHANGE, SETTING_CHANGE, ALL
- Entity type dropdown: TEST, VENDOR, OFFERING, CHANGE, USER, SETTING, FLAG, SEO_PAGE, PROXY, ALL
- Date range picker

**Table Columns:**

| Column | Sortable |
|---|---|
| Timestamp | yes |
| Actor (name + avatar) | yes |
| Action (verb badge) | yes |
| Entity Type | yes |
| Entity (name/ID, linked to entity) | --- |
| Summary (auto-generated description) | --- |
| Actions (View Diff) | --- |

**Diff Viewer** (slide-over):
- Side-by-side or unified diff view of `old_values` vs `new_values` JSON.
- Syntax-highlighted, with changed fields highlighted.
- Read-only; no actions available.

**Export** (SUPER_ADMIN only):
- "Export CSV" button exports filtered results.

#### Data Sources

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/audit-logs` | paginated, filterable log entries |

---

## 4. Cross-Cutting Concerns

### 4.1 Authentication & Authorization

- All `/admin` routes are wrapped in a layout-level `requireRole('EDITOR')` check that redirects unauthenticated users to `/login?redirect=/admin`.
- Per-screen role checks are enforced both in the layout (hides nav items) and in server actions (returns 403).
- Role hierarchy is enforced server-side: SUPER_ADMIN > ADMIN > EDITOR > USER.
- Session timeout: 8 hours of inactivity.

### 4.2 Responsive Behavior

- Admin panel is designed for desktop-first (1280 px+).
- At tablet widths (768-1279 px): sidebar collapses, tables scroll horizontally.
- At mobile widths (< 768 px): sidebar becomes a top-level hamburger menu; tables use card layout for critical screens (Dashboard, Change Queue).
- The Change Queue keyboard shortcuts are desktop-only.

### 4.3 Audit Trail

Every mutation (create, update, delete, approve, reject, role change, setting change, flag toggle) writes an `audit_logs` entry with: actor ID, action, entity type, entity ID, old values (JSON), new values (JSON), IP address, timestamp.

### 4.4 Optimistic UI

The Change Queue uses optimistic updates for approve/reject. Other CRUD operations use standard loading states (submit button shows spinner, disables during request).

### 4.5 Error Handling

- Server action failures show a toast with the error message.
- Network failures show a persistent error banner with a "Retry" button.
- Form validation errors appear inline below the relevant field.
- 403 responses redirect to a "Not authorized" page with a link back to the dashboard.

### 4.6 Keyboard Navigation

The Change Queue implements `j/k/a/r/x` shortcuts. All other screens rely on standard browser tab navigation and `Enter` to submit. Shortcut hints are displayed in a footer bar on the Change Queue.
