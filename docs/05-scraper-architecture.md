# Deliverable #5 — Scraper Architecture

> **Status:** Draft | **Last updated:** 2026-06-26
>
> **Posture (confirmed by product owner): aggressive live scraping** of named ordering-service
> websites (Playwright/Selenium, proxy pool + rotation, anti-bot handling), with data feeds
> secondary. The framework is built **polite-by-default and fully configurable** so volume/behavior
> can be tuned per vendor. **The legal/compliance section is a gating prerequisite** — a per-vendor
> ToS/robots review must be signed off before that vendor is scraped in production.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Scraping Engines](#2-scraping-engines)
3. [Vendor Configuration](#3-vendor-configuration)
4. [Proxy Management](#4-proxy-management)
5. [Job Scheduling & Queue](#5-job-scheduling--queue)
6. [Scrape Pipeline](#6-scrape-pipeline)
7. [Change Detection & Approval Rules](#7-change-detection--approval-rules)
8. [Error Handling & Recovery](#8-error-handling--recovery)
9. [Monitoring & Alerting](#9-monitoring--alerting)
10. [Adding a New Vendor](#10-adding-a-new-vendor)
11. [Legal & Compliance](#11-legal--compliance)

---

## 1. Architecture Overview

LabPrice scrapes self-pay blood test prices from **10 ordering services**: Life Extension, Ulta Lab
Tests, True Health Labs, DirectLabs, Walk-In Lab, Request A Test, Quest Diagnostics, LabCorp,
Health Testing Centers, and Any Lab Test Now. These are ordering services (not laboratories) that
sell blood tests to consumers at published prices. Prices are compared across 12+ commonly ordered
lab tests.

The scraper subsystem follows a **config-driven vendor adapter pattern**. Adding or adjusting a
vendor requires no code changes and no deployments — only database configuration (CSS/XPath
selectors, URL templates, scheduling parameters) managed through the admin panel.

### High-Level Flow

```
                                ┌──────────────────────────────────┐
                                │        Admin Panel               │
                                │  (vendor config, manual runs,    │
                                │   selector tuning, approvals)    │
                                └──────────────┬───────────────────┘
                                               │ config / trigger
                                               ▼
┌─────────────┐   enqueue    ┌─────────────────────────┐
│  Scheduler  │─────────────►│  BullMQ: scrape queue   │
│  (daily     │              │  (one job per vendor)    │
│   cron)     │              └────────────┬────────────┘
└─────────────┘                           │ dequeue
                                          ▼
                              ┌───────────────────────┐
                              │   Worker Pool          │
                              │   (concurrency: 3)     │
                              └────────────┬──────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   ┌────────────┐   ┌────────────┐   ┌────────────┐
                   │ Playwright │   │ Selenium   │   │   HTTP     │
                   │  Engine    │   │  Engine    │   │  Engine    │
                   └──────┬─────┘   └──────┬─────┘   └──────┬─────┘
                          │                │                │
                          └────────────────┼────────────────┘
                                           │
                                    ProxyManager
                                    (rotate, health-track)
                                           │
                                           ▼
                              ┌───────────────────────┐
                              │  Parse & Normalize    │
                              │  (price text → USD    │
                              │   Decimal, validate)  │
                              └────────────┬──────────┘
                                           │
                                           ▼
                              ┌───────────────────────┐
                              │  Change Detector      │
                              │  (BR-6, BR-7, BR-8,   │
                              │   BR-9 business rules) │
                              └────────────┬──────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   AUTO_APPROVED       PENDING          ANOMALY
                   (publish tx)    (admin queue)     (auto-reject)
                          │                │                │
                          ▼                ▼                ▼
                   ┌──────────────────────────────────────────┐
                   │  staged_price_changes table              │
                   └──────────────────┬───────────────────────┘
                                      │ on approve
                                      ▼
                   ┌──────────────────────────────────────────┐
                   │  Publish Transaction (atomic)            │
                   │  1. Update offering.current_price        │
                   │  2. Insert price_history row             │
                   │  3. Create audit_log entry               │
                   │  4. Purge Redis cache                    │
                   │  5. Enqueue alert evaluation             │
                   └──────────────────────────────────────────┘
```

### Core Interface

```ts
interface VendorAdapter {
  vendorId: string;
  engine: 'PLAYWRIGHT' | 'SELENIUM' | 'HTTP';

  /**
   * Discover the URLs/targets to scrape for this vendor's active offerings.
   * Reads from the offerings table joined with scrape_vendor_configs.
   */
  resolveTargets(ctx: ScrapeContext): Promise<ScrapeTarget[]>;

  /**
   * Fetch and extract a single target into a normalized observation.
   * Receives a browser Page (Playwright/Selenium) or an HTTP response.
   */
  scrapeOne(target: ScrapeTarget, page: Page, ctx: ScrapeContext): Promise<RawObservation>;
}

interface ScrapeTarget {
  offeringId: string;
  vendorSku?: string;
  url: string;
  selectors: SelectorMap;
}

interface RawObservation {
  offeringId?: string;
  vendorSku?: string;
  rawPriceText?: string;
  parsedPrice?: Decimal;
  inStock?: boolean;
  htmlSnapshotKey?: string;
}

interface SelectorMap {
  price: string;       // CSS or XPath selector for price element
  title?: string;      // CSS or XPath selector for test name
  inStock?: string;    // CSS or XPath selector for availability indicator
  addToCart?: string;   // presence indicates in-stock
}
```

A **config-driven default adapter** covers approximately 90% of vendors. It reads selectors,
navigation steps, and URL templates from the `scrape_vendor_configs` table and requires zero
custom code. For the rare vendor with non-standard page behavior (e.g., multi-step price reveal,
dynamic AJAX loading without predictable selectors), a named TypeScript hook can be registered by
`vendorId` to override `resolveTargets` or `scrapeOne`.

---

## 2. Scraping Engines

Engine selection is configured per vendor in the `scrape_vendor_configs.engine` column. All three
engines conform to the same `VendorAdapter` contract, making the queue/worker code engine-agnostic.

### Playwright (Primary)

The default engine for most vendors. Provides the best balance of capability and blocking
resistance.

| Aspect | Detail |
|---|---|
| Runtime | Headless Chromium via `playwright` npm package |
| Stealth | `playwright-extra` + `puppeteer-extra-plugin-stealth` for fingerprint masking |
| User-Agent | Realistic, rotated from a curated list of current Chrome UAs |
| Viewport | Randomized within common desktop resolutions (1366x768 to 1920x1080) |
| Locale/timezone | `en-US`, `America/New_York` (matches target audience) |
| Cookie walls | `nav_steps` config supports scripted click-through of consent banners |
| Wait strategy | `networkidle` + optional explicit `waitForSelector` per vendor |
| Screenshots | Captured on every failure; optional on success for audit trail |
| Resource blocking | Images, fonts, and media blocked by default to reduce bandwidth and speed |
| Browser context | Fresh context per vendor run; cookies not persisted across runs |

### Selenium (Fallback)

Reserved for vendors whose anti-bot systems specifically detect Playwright's browser automation
protocol. Uses `selenium-webdriver` with ChromeDriver.

| Aspect | Detail |
|---|---|
| Runtime | ChromeDriver + headless Chrome |
| Use case | Sites that detect CDP (Chrome DevTools Protocol) used by Playwright |
| Interface | Same `VendorAdapter` contract; `Page` object wrapped to expose identical API |
| Trade-off | Slower startup, higher resource usage; used only when Playwright is blocked |

### HTTP (Lightweight)

For vendors that serve prices in static HTML or expose undocumented JSON endpoints. No browser
overhead.

| Aspect | Detail |
|---|---|
| Runtime | Node.js `fetch` + `cheerio` for HTML parsing |
| Use case | Static HTML price pages, JSON API responses, RSS/XML feeds |
| Performance | 10-50x faster than browser engines; minimal memory footprint |
| Limitation | Cannot handle JavaScript-rendered prices or complex SPA navigation |
| Proxy support | Full — requests routed through ProxyManager like browser engines |

### Engine Selection Guidelines

| Vendor Characteristic | Recommended Engine |
|---|---|
| JavaScript-rendered prices, SPAs | PLAYWRIGHT |
| Known Playwright detection | SELENIUM |
| Static HTML price pages | HTTP |
| Public API or JSON endpoint | HTTP |
| Unknown / new vendor | PLAYWRIGHT (safest default) |

---

## 3. Vendor Configuration

All vendor scraping behavior is driven by the `scrape_vendor_configs` table. Administrators manage
this configuration through the admin panel without requiring code changes or deployments.

### Configuration Schema

Reference: `scrape_vendor_configs` table (Deliverable #2 — Database Design)

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | text | yes | Primary key (CUID2) |
| `vendor_id` | text | yes | Unique FK to `vendors` table |
| `engine` | enum | yes | `PLAYWRIGHT`, `SELENIUM`, or `HTTP` |
| `list_url_template` | text | no | Catalog/listing page URL template |
| `detail_url_template` | text | no | Per-offering URL template (interpolates `product_url`) |
| `selectors` | jsonb | yes | CSS/XPath selector map for data extraction |
| `nav_steps` | jsonb | no | Scripted interactions (clicks, waits, form fills) |
| `price_regex` | text | no | Regex to extract numeric price from text content |
| `headers` | jsonb | no | Custom HTTP headers (User-Agent, cookies, etc.) |
| `use_proxy` | boolean | yes | Whether to route through ProxyManager (default: `true`) |
| `rate_limit_ms` | int | yes | Minimum delay between requests to this vendor (default: `4000`) |
| `concurrency` | int | yes | Max parallel pages within this vendor's run (default: `2`) |
| `schedule_cron` | text | no | Per-vendor cron override (default: global daily schedule) |
| `enabled` | boolean | yes | Master on/off switch (default: `true`) |

### Selectors JSONB Structure

```jsonc
{
  "price": "span.product-price",           // Required: CSS selector for price element
  "title": "h1.product-title",             // Optional: verify correct product page
  "inStock": "button.add-to-cart",          // Optional: presence = in stock
  "outOfStock": "span.out-of-stock",        // Optional: presence = out of stock
  "salePrice": "span.sale-price",           // Optional: sale price (preferred over regular)
  "originalPrice": "span.original-price"    // Optional: regular/list price
}
```

Selectors support both CSS selectors and XPath expressions. XPath selectors are prefixed with
`xpath:` (e.g., `"xpath://div[@class='price']/span"`).

### Navigation Steps (nav_steps)

For vendors requiring interaction before prices are visible (cookie consent, location selection,
login):

```jsonc
[
  { "action": "waitForSelector", "selector": "#cookie-banner", "timeout": 5000 },
  { "action": "click", "selector": "#accept-cookies" },
  { "action": "wait", "ms": 1000 },
  { "action": "click", "selector": "a.view-pricing" },
  { "action": "waitForSelector", "selector": "span.product-price", "timeout": 10000 }
]
```

Supported actions: `click`, `type`, `select`, `waitForSelector`, `waitForNavigation`, `wait`,
`scroll`, `hover`.

### Auth Configuration

For vendors requiring authentication (stored in secrets manager, referenced by key):

```jsonc
{
  "auth_type": "FORM_LOGIN",
  "login_url": "https://vendor.example.com/login",
  "credentials_secret_key": "vendor_xyz_credentials",
  "steps": [
    { "action": "type", "selector": "#email", "value": "{{username}}" },
    { "action": "type", "selector": "#password", "value": "{{password}}" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "waitForNavigation" }
  ]
}
```

Credentials are never stored in the config table — only a reference to the secrets manager key.

### Example Configuration: Walk-In Lab

```jsonc
{
  "engine": "PLAYWRIGHT",
  "detail_url_template": "{{product_url}}",
  "selectors": {
    "price": "span.price-value",
    "title": "h1.product-name",
    "inStock": "button.add-to-cart"
  },
  "nav_steps": [
    { "action": "waitForSelector", "selector": "span.price-value", "timeout": 10000 }
  ],
  "price_regex": "[\\d,]+\\.\\d{2}",
  "use_proxy": true,
  "rate_limit_ms": 4000,
  "concurrency": 2,
  "schedule_cron": null,
  "enabled": true
}
```

---

## 4. Proxy Management

The `ProxyManager` class manages a pool of proxies to prevent IP-based blocking and distribute
request load. Proxy records are stored in the `proxies` table (Deliverable #2).

### Proxy Tiers

| Tier | `ProxyKind` | Cost | Detection Risk | Use Case |
|---|---|---|---|---|
| Datacenter | `DATACENTER` | Low ($0.50-2/GB) | Higher | Default tier; sufficient for most vendors |
| Residential | `RESIDENTIAL` | Medium ($5-15/GB) | Low | Vendors that block datacenter IPs |
| Mobile | `MOBILE` | High ($20-40/GB) | Very low | Last resort for aggressive anti-bot sites |

### ProxyManager Class

```ts
class ProxyManager {
  /**
   * Acquire a proxy for a scrape request.
   * Selection: round-robin within the lowest healthy tier,
   * weighted by health score and least-recently-used.
   */
  async acquire(vendorId: string, preferredTier?: ProxyKind): Promise<ProxyLease>;

  /**
   * Release a proxy after use, reporting outcome.
   */
  async release(lease: ProxyLease, outcome: 'SUCCESS' | 'FAIL' | 'BLOCKED'): void;

  /**
   * Escalate to the next tier after repeated failures on current tier.
   */
  async escalate(vendorId: string, currentTier: ProxyKind): Promise<ProxyLease>;

  /**
   * Health check: ping all proxies, update health status.
   * Runs on a 5-minute interval.
   */
  async healthCheck(): Promise<void>;
}

interface ProxyLease {
  proxyId: string;
  url: string;           // http://user:pass@host:port
  kind: ProxyKind;
  acquiredAt: Date;
  vendorId: string;
}
```

### Health Tracking

| `ProxyHealth` | Condition | Behavior |
|---|---|---|
| `HEALTHY` | `fail_count` < 3 | Available for selection |
| `DEGRADED` | `fail_count` 3-9 | Deprioritized; selected only if no `HEALTHY` proxies in tier |
| `BANNED` | `fail_count` >= 10 | Excluded from selection; cooldown 1 hour, then reset to check |

On each request outcome:
- **Success**: reset `fail_count` to 0, update `last_used_at`, set `HEALTHY`
- **Fail/Timeout**: increment `fail_count`, update `last_failed_at`, evaluate health transition
- **Blocked (403/captcha)**: increment `fail_count` by 3 (accelerated degradation)

### Rotation Strategy

1. **Within tier**: round-robin weighted by health, with least-recently-used tiebreaker
2. **Tier escalation**: after 2 consecutive failures on the current tier for a vendor, automatically
   escalate to the next tier (DATACENTER -> RESIDENTIAL -> MOBILE)
3. **Sticky sessions**: when a vendor requires cookie continuity across multiple pages in a single
   run, the same proxy is held for the duration (via `ProxyLease`)
4. **De-escalation**: on the next scheduled run, reset to the lowest tier to minimize cost

### Provider Integration

The proxy pool is provider-agnostic. Proxies are stored as connection URLs in the `proxies` table
with credentials managed through the secrets manager. Compatible with BrightData, Oxylabs,
Smartproxy, or any provider that exposes HTTP/SOCKS5 proxy endpoints.

---

## 5. Job Scheduling & Queue

All scrape jobs are managed through **BullMQ** backed by the existing Redis instance. This provides
reliable job persistence, retry logic, concurrency control, and observability.

### Queue Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    BullMQ Queues                          │
├──────────────────────────────────────────────────────────┤
│  scrape:daily       Repeatable job, fans out per vendor  │
│  scrape:vendor      One job per vendor per run           │
│  scrape:offering    Single-offering re-scrape (manual)   │
│  alerts:evaluate    Post-publish alert checks            │
└──────────────────────────────────────────────────────────┘
```

### Daily Fan-Out Schedule

The `scrape:daily` repeatable job runs once per day during the **2:00-5:00 AM ET** maintenance
window. On each execution, it:

1. Queries all vendors where `scrape_vendor_configs.enabled = true`
2. For each vendor, enqueues a `scrape:vendor` job with a **jittered delay** of 0-30 minutes
   (random per vendor, deterministic by vendor ID to keep the spread consistent across days)
3. Vendors with a `schedule_cron` override are excluded from the daily fan-out and instead have
   their own repeatable BullMQ job

The jitter prevents all vendors from being hit simultaneously, which would spike proxy usage and
increase detection risk.

### Job Configuration

```ts
// scrape:vendor job options
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 30_000,       // 30s initial → 2min → 10min
  },
  removeOnComplete: { count: 100 },    // keep last 100 completed
  removeOnFail: { count: 500 },        // keep last 500 failed for debugging
}
```

### Concurrency Controls

| Control | Value | Mechanism |
|---|---|---|
| Global worker concurrency | 3 | BullMQ worker `concurrency` option |
| Per-vendor single-run lock | 1 | Redis distributed lock (`scrape:lock:{vendorId}`, TTL 30min) |
| Per-vendor page concurrency | 2 (configurable) | `scrape_vendor_configs.concurrency` |

If a `scrape:vendor` job is enqueued while another run for the same vendor is active, the new job
waits for the lock. If the lock is held past its TTL (stale run), the lock expires and the new run
proceeds. The API returns `409 run_already_active` when a manual trigger conflicts.

### Manual Runs

Administrators can trigger scrape runs from the admin panel:

- **Full vendor re-scrape**: enqueues a `scrape:vendor` job with `trigger=MANUAL`
- **Single offering re-scrape**: enqueues a `scrape:offering` job targeting one offering URL
- Both respect the per-vendor lock and concurrency limits

### Dead Letter Queue

Jobs that exhaust all 3 retry attempts are moved to a dead-letter holding area. An ops alert
(email to admin) is fired for each DLQ entry. Dead-letter jobs are retained for 7 days for
debugging, then purged.

---

## 6. Scrape Pipeline

Each `scrape:vendor` job executes the following pipeline for a single vendor in a single run.

### Pipeline Steps

```
Step 1: Load Config
   └─► Read scrape_vendor_configs for this vendor_id
   └─► Read active offerings for this vendor (offerings WHERE vendor_id = ? AND is_active = true)

Step 2: Create Scrape Run
   └─► Insert scrape_runs row (status: RUNNING, trigger: SCHEDULED|MANUAL)

Step 3: Acquire Proxy
   └─► ProxyManager.acquire(vendorId)
   └─► Configure browser/HTTP client with proxy

Step 4: Initialize Engine
   └─► Launch Playwright browser context / Selenium driver / HTTP client
   └─► Apply vendor-specific headers, UA, viewport settings

Step 5: Resolve Targets
   └─► VendorAdapter.resolveTargets() → list of ScrapeTarget objects
   └─► Each target = one offering URL to visit

Step 6: Scrape Loop (per target, rate-limited)
   ├── 6a. Navigate to product page (apply nav_steps if configured)
   ├── 6b. Wait for price selector to appear (timeout from config)
   ├── 6c. Extract raw price text using configured selectors
   ├── 6d. Normalize price:
   │       - Strip currency symbols ($, USD)
   │       - Remove commas from thousands
   │       - Handle price ranges (take lower bound)
   │       - Apply price_regex if configured
   │       - Parse to Decimal, validate numeric and > 0
   │       - Currency: USD only (v1)
   ├── 6e. Extract availability (in-stock / out-of-stock)
   ├── 6f. Capture HTML snapshot (save to object storage)
   ├── 6g. Insert scrape_results row
   ├── 6h. Compare parsedPrice against offering.current_price
   │       - If changed → create staged_price_change via Change Detector (Step 7)
   │       - If unchanged → update offering.last_scraped_at only
   └── 6i. Wait rate_limit_ms before next target

Step 7: Change Detection (see Section 7)
   └─► Apply business rules to each price change
   └─► Create staged_price_changes records

Step 8: Finalize Run
   ├── Update scrape_runs.status (SUCCESS | PARTIAL | FAILED)
   ├── Update scrape_runs.stats JSON ({found, changed, errors, durationMs})
   ├── Release proxy (ProxyManager.release with outcome)
   └── Close browser context
```

### Partial Runs

If some offerings scrape successfully but others error, the run is marked `PARTIAL`. Successfully
scraped prices proceed through change detection normally. Errored offerings are logged to
`scrape_errors` and left unchanged. The admin sees both the successes and the specific errors in
the run detail view.

### Price Normalization Rules

| Input | Normalized Output | Rule |
|---|---|---|
| `$129.99` | `129.99` | Strip `$` |
| `USD 129.99` | `129.99` | Strip currency prefix |
| `1,299.99` | `1299.99` | Remove thousands separator |
| `$99.00 - $149.00` | `99.00` | Price range: take lower bound |
| `From $99.00` | `99.00` | Strip "From" prefix |
| `$0.00` | ANOMALY | Zero price triggers anomaly detection |
| `Call for pricing` | `null` (in_stock=false) | Non-numeric: mark unavailable |
| Negative values | PARSE_FAIL | Invalid: log error |

---

## 7. Change Detection & Approval Rules

When a scraped price differs from the current `offering.current_price`, the Change Detector
evaluates business rules to determine the appropriate action. This ensures no scraped price reaches
the public site without validation.

### Business Rules

| Rule | Condition | Action | Staged Status |
|---|---|---|---|
| **BR-6** | Absolute delta >= `ANOMALY_THRESHOLD_PCT` (default: 30%) | Auto-reject, alert admin | `ANOMALY` |
| **BR-7** | Absolute delta < `AUTO_APPROVE_THRESHOLD_PCT` (default: 5%) AND vendor `trust_level = HIGH` AND passes validation | Auto-approve, publish immediately | `AUTO_APPROVED` |
| **BR-8** | All other changes (medium delta, or low-trust vendor) | Queue for admin review | `PENDING` |
| **BR-9** | Price is $0 or delta > `SANITY_MAX_PCT` (default: 300%) | Auto-reject (subset of BR-6) | `ANOMALY` |

Additional rule:
- **72-hour expiry**: `PENDING` changes not reviewed within 72 hours are auto-expired with an admin
  alert. The next scrape run will re-detect the change if it persists.

### Change Detection Flow

```ts
function detectChange(observation: RawObservation, offering: Offering): ChangeDecision {
  if (!observation.parsedPrice) return { action: 'SKIP', reason: 'no price parsed' };
  if (observation.parsedPrice.equals(offering.currentPrice)) return { action: 'UNCHANGED' };

  const deltaPct = observation.parsedPrice
    .minus(offering.currentPrice)
    .dividedBy(offering.currentPrice)
    .times(100)
    .abs();

  // BR-9: Sanity check
  if (observation.parsedPrice.isZero() || deltaPct.gte(SANITY_MAX_PCT)) {
    return { action: 'ANOMALY', reason: `Price $0 or delta ${deltaPct}% exceeds sanity max` };
  }

  // BR-6: Large change anomaly
  if (deltaPct.gte(ANOMALY_THRESHOLD_PCT)) {
    return { action: 'ANOMALY', reason: `Delta ${deltaPct}% exceeds anomaly threshold` };
  }

  // BR-7: Small change auto-approve for trusted vendors
  if (deltaPct.lt(AUTO_APPROVE_THRESHOLD_PCT) && offering.vendor.trustLevel === 'HIGH') {
    return { action: 'AUTO_APPROVE', reason: `Delta ${deltaPct}% below threshold, trusted vendor` };
  }

  // BR-8: Everything else pending
  return { action: 'PENDING', reason: `Delta ${deltaPct}%, requires review` };
}
```

### Publish Transaction

When a change is approved (manually by admin or auto-approved by BR-7), the following operations
execute in a single database transaction:

```
BEGIN TRANSACTION
  1. UPDATE offerings
     SET current_price = new_price,
         previous_price = old_price,
         price_observed_at = NOW(),
         updated_at = NOW()
     WHERE id = offering_id

  2. INSERT INTO price_history (
       offering_id, price, previous_price, delta_pct,
       source, scrape_run_id, recorded_at
     )

  3. UPDATE staged_price_changes
     SET status = 'APPROVED' | 'AUTO_APPROVED',
         reviewed_by = admin_user_id,   -- null for auto
         reviewed_at = NOW()
     WHERE id = change_id

  4. INSERT INTO audit_logs (
       actor_id, action, entity_type, entity_id, meta
     )
COMMIT

-- Post-commit (outside transaction, best-effort):
5. DELETE FROM redis WHERE key IN (
     'test:{slug}:prices', 'home:best-prices', 'compare:*'
   )

6. ENQUEUE 'alerts:evaluate' job with {
     offeringId, testId, oldPrice, newPrice
   }
```

The `alerts:evaluate` job checks all active `price_alerts` for the affected test and sends email
notifications to users whose target price thresholds have been met.

---

## 8. Error Handling & Recovery

### Error Types

All errors are logged to the `scrape_errors` table with structured context.

| `ScrapeErrorType` | Description | Auto-Retry | Recovery Action |
|---|---|---|---|
| `NAV_TIMEOUT` | Page navigation exceeded timeout | Yes | Retry with different proxy |
| `BLOCKED` | 403, captcha, or access denied response | Yes | Rotate proxy, escalate tier |
| `SELECTOR_MISS` | Configured selector not found on page | No | Disable vendor config, alert admin |
| `PARSE_FAIL` | Price text could not be parsed to numeric | No | Log raw text, alert admin |
| `ANOMALY` | Price fails sanity checks (BR-6/BR-9) | No | Auto-reject, alert admin |
| `HTTP_ERROR` | Non-200 response (5xx, 404, etc.) | Yes | Retry with backoff |
| `NETWORK` | DNS failure, connection reset, proxy down | Yes | Retry with different proxy |
| `AUTH_FAIL` | Login/authentication failed | No | Alert admin (credentials may need update) |

### Error Record Structure

```jsonc
// scrape_errors row
{
  "id": "err_abc123",
  "run_id": "run_xyz789",
  "offering_id": "off_456",
  "error_type": "SELECTOR_MISS",
  "message": "Selector 'span.product-price' not found after 10s wait",
  "context": {
    "url": "https://vendor.example.com/product/123",
    "statusCode": 200,
    "screenshotKey": "screenshots/2026-06-26/err_abc123.png",
    "htmlSnapshotKey": "snapshots/2026-06-26/err_abc123.html",
    "selectorTried": "span.product-price",
    "pageTitle": "Vendor Example - Product Page"
  },
  "created_at": "2026-06-26T03:14:22Z"
}
```

### Retry Strategy

```
Attempt 1: Original proxy, original settings
  ↓ (on retryable failure, wait 30s)
Attempt 2: Different proxy (same tier), rotate User-Agent
  ↓ (on failure, wait 2min)
Attempt 3: Escalated proxy tier, fresh browser context
  ↓ (on failure, wait 10min — handled by BullMQ backoff)
DLQ: Dead-letter queue → admin alert
```

### SELECTOR_MISS Handling

A `SELECTOR_MISS` error is the most common indicator that a vendor has redesigned their website.
When detected:

1. The specific offering is skipped (price left unchanged)
2. An HTML snapshot of the page is captured for debugging
3. A screenshot is captured (Playwright/Selenium engines only)
4. If >50% of a vendor's offerings hit `SELECTOR_MISS` in a single run, the vendor config is
   automatically disabled (`enabled = false`) and an urgent alert is sent to the admin
5. The admin reviews the snapshots, updates selectors in the admin panel, runs a test scrape, and
   re-enables the config

---

## 9. Monitoring & Alerting

### Admin Dashboard (`/admin/scrape/health`)

The scrape health dashboard provides real-time visibility into the scraping subsystem.

#### Per-Vendor Health View

| Metric | Description |
|---|---|
| Last successful run | Timestamp of most recent `SUCCESS` or `PARTIAL` run |
| Success rate (7d) | Percentage of runs completing as `SUCCESS` in the last 7 days |
| Average duration | Mean run duration over last 7 days |
| Prices updated | Count of prices changed in last run |
| Prices unchanged | Count of prices confirmed unchanged in last run |
| Errors | Count and breakdown of errors in last run |
| Freshness | Percentage of offerings scraped within `STALE_AFTER_DAYS` (default: 7) |
| Next scheduled run | Timestamp of next scheduled execution |

#### System-Wide Metrics

| Metric | Description |
|---|---|
| Total vendors active | Count of vendors with `enabled = true` |
| Queue depth | Current jobs waiting in BullMQ queues |
| Proxy pool health | Count of `HEALTHY` / `DEGRADED` / `BANNED` proxies per tier |
| Staged changes pending | Count of `PENDING` changes awaiting review |
| Changes auto-approved (24h) | Count of auto-approved changes in last 24 hours |
| Anomalies detected (24h) | Count of anomalies flagged in last 24 hours |

### BullMQ Dashboard

**Bull Board** is mounted at `/admin/queues` (behind admin authentication) providing:

- Queue status for all scrape queues
- Job listing with filters (completed, failed, delayed, active)
- Individual job inspection (data, logs, error stack traces)
- Manual retry/remove operations
- Real-time job progress

### Alert Rules

Alerts are sent via email to the admin address. Alert delivery uses the existing email
infrastructure (Brevo transactional API).

| Alert | Trigger | Severity |
|---|---|---|
| Vendor offline | No successful run for a vendor in >24 hours | High |
| Low success rate | Vendor success rate drops below 80% (7-day rolling) | Medium |
| Anomaly spike | >3 anomalies detected for a single vendor in one run | High |
| Proxy pool degraded | >50% of proxies in any tier are `DEGRADED` or `BANNED` | High |
| Staleness breach | Any vendor has >20% of offerings exceeding `STALE_AFTER_DAYS` | Medium |
| DLQ entry | A scrape job exhausts all retries | High |
| Pending review backlog | >10 staged changes older than 48 hours | Low |
| Selector miss cluster | >50% selector miss rate for a vendor | High (auto-disables vendor) |

### Observability

Metrics are exported via OpenTelemetry for integration with Prometheus/Grafana or similar:

- `scrape.runs.total` (counter, labels: vendor, status, trigger)
- `scrape.run.duration_ms` (histogram, labels: vendor)
- `scrape.items.total` (counter, labels: vendor, outcome)
- `scrape.errors.total` (counter, labels: vendor, error_type)
- `scrape.proxy.requests` (counter, labels: tier, outcome)
- `scrape.queue.depth` (gauge, labels: queue)
- `scrape.changes.total` (counter, labels: vendor, decision)

---

## 10. Adding a New Vendor

Adding a new ordering service requires **no code changes and no deployment**. The entire process is
performed through the admin panel.

### Step-by-Step Process

**Step 1: Create Vendor Record**

Navigate to Admin > Vendors > Add Vendor and fill in:
- Name (e.g., "Walk-In Lab")
- Website URL
- Affiliate URL template (for outbound order links)
- Trust level (`LOW`, `MEDIUM`, `HIGH`) — determines auto-approve eligibility
- Status: `active`

**Step 2: Create Scrape Configuration**

Navigate to Admin > Scrape Config > Add Config for the new vendor:
- Select engine (`PLAYWRIGHT` recommended for new vendors)
- Enter URL templates (detail page URL pattern)
- Define selectors JSON (use browser DevTools to identify CSS selectors for price, title,
  availability elements on the vendor's website)
- Set rate limiting (minimum 4000ms recommended)
- Set concurrency (start with 1 for new vendors)
- Leave `enabled = false` initially

**Step 3: Create Offerings**

For each lab test the vendor sells:
- Create an offering record linking the vendor to the test
- Enter the product URL on the vendor's site
- Enter the initial price (manually verified)

**Step 4: Test Scrape**

From the vendor's admin page, click "Run Test Scrape":
- Executes the scrape pipeline against all offerings
- Results displayed immediately in the admin panel
- Review: correct prices extracted? Selectors hitting the right elements?
- If selectors are wrong, adjust and re-run — no deploy needed

**Step 5: Enable Scheduled Scraping**

Once test scrapes return accurate results:
- Set `enabled = true` on the scrape config
- Optionally set `schedule_cron` for non-default scheduling
- The vendor will be included in the next daily fan-out

### Estimated Time

For a vendor with standard HTML structure: **30-60 minutes** from start to live scheduled scraping.
For vendors requiring `nav_steps` (cookie walls, SPAs): **1-2 hours**.
For vendors requiring a custom TypeScript hook: **2-4 hours** (requires a deploy).

---

## 11. Legal & Compliance

The aggressive-scraping posture carries real, material legal risk. This section defines the
requirements and guardrails that **must** be satisfied before scraping any vendor in production.
This is a **gating prerequisite** — no vendor is scraped until cleared.

### Per-Vendor Legal Review

Before enabling production scraping for any ordering service, the following must be completed and
documented:

1. **Terms of Service review**: Read and analyze the vendor's ToS for prohibitions on automated
   access, scraping, crawling, or data extraction. Document findings.

2. **robots.txt analysis**: Fetch and review `robots.txt` for the vendor's domain. Document any
   `Disallow` rules that apply to pricing pages. Respect all directives.

3. **API/feed alternative assessment**: Check whether the vendor offers an official API, affiliate
   data feed, or partner pricing feed. If available, **prefer the official feed** over scraping —
   the framework supports `source=FEED` ingestion alongside scraping.

4. **Legal counsel sign-off**: For each vendor, document the risk assessment considering:
   - Computer Fraud and Abuse Act (CFAA) implications
   - State-level computer access laws
   - Contract/ToS enforceability
   - Applicable data protection regulations (CCPA, etc.)

5. **Sign-off record**: Store the review outcome per vendor in the admin system with reviewer name,
   date, and decision (APPROVED / APPROVED_WITH_CONDITIONS / BLOCKED).

### Operational Guardrails (Enabled by Default)

| Guardrail | Setting | Rationale |
|---|---|---|
| Rate limiting | Minimum 2s between requests (`rate_limit_ms >= 2000`) | Prevent server overload |
| Concurrency | Max 2 parallel requests per vendor | Minimize load on vendor infrastructure |
| Jittered scheduling | Random 0-30min offset per vendor | Avoid synchronized request bursts |
| `robots.txt` compliance | Respect `Disallow` directives | Legal and ethical compliance |
| User-Agent identification | `LabPrice/1.0 PriceChecker (+https://labprice.com/bot)` | Transparent identification |
| No login scraping (default) | Auth config requires explicit admin approval | Reduce legal exposure |
| No personal data collection | Only public self-pay prices | Minimize data protection obligations |
| `Retry-After` / 429 respect | Honor rate-limit headers from vendor servers | Server-requested throttling |

### Data Handling

| Data Type | Retention | Storage |
|---|---|---|
| Normalized prices | Indefinite (in `price_history`) | PostgreSQL |
| Raw HTML snapshots | 30 days, then purged | Object storage (S3-compatible) |
| Failure screenshots | 30 days, then purged | Object storage (S3-compatible) |
| Scrape run logs | 90 days | PostgreSQL (`scrape_runs`, `scrape_results`) |
| Error records | 90 days | PostgreSQL (`scrape_errors`) |

### Vendor Opt-Out Process

A documented channel exists for any vendor to request delisting:

1. Vendor contacts LabPrice via published email address or website contact form
2. Request is acknowledged within 24 hours
3. Vendor is immediately disabled in scrape config (`enabled = false`, `is_active = false`)
4. All cached and stored raw data (HTML snapshots, screenshots) for the vendor is purged within 72
   hours
5. Vendor's offerings are soft-deleted (hidden from public site) or marked with a notice
6. Opt-out is documented in the audit log

### Infrastructure Isolation

- Scraping runs on **separate infrastructure/IPs** from the public-facing application
- Proxy credentials are stored in the **secrets manager**, not in application config or database
- Scraping failures **never degrade the user-facing site** — the public site serves cached or
  last-known prices with a freshness badge (BR-4) if scraping is down
- No vendor can infer the public site's infrastructure from scraping traffic

### Compliance Tracking

All legal review status is tracked in the PRD risk register (Deliverable #1, Section 8) and on the
launch checklist. The product owner owns the sign-off process. No vendor proceeds to Phase 3
(production scraping) without documented legal clearance.

---

## Cross-References

| Topic | Document |
|---|---|
| Database schema (all scrape tables) | Deliverable #2 — Database Design |
| API endpoints for scrape management | Deliverable #4 — API Design |
| Admin panel scrape UI | Deliverable #6 — Admin Panel |
| Security (secrets, access control) | Deliverable #7 — Security |
| Deployment (worker processes, Redis) | Deliverable #8 — Deployment |
| Implementation timeline (Phase 3) | Deliverable #10 — Implementation Roadmap |
