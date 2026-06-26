# Deliverable #5 — Scraper Architecture

> **Posture (confirmed by product owner): aggressive live scraping** of named vendor sites
> (Playwright/Selenium, proxy pool + rotation, anti-bot handling), with data feeds secondary.
> The framework is built **polite-by-default and fully configurable** so volume/behavior can be
> tuned per vendor. **The legal/compliance section at the end is a gating prerequisite** — a
> per-vendor ToS/robots review must be signed off before that vendor is scraped in production.

## Goals
- Add/adjust vendors **without code deploys** (config in `scrape_vendor_configs`).
- **Daily** automated scraping + **manual** re-scrape (per vendor or per offering).
- Robust against selector drift and anti-bot blocking (retry, backoff, proxy rotation, snapshots).
- **Change detection → staged changes → admin approval** before anything goes live.
- Full observability: runs, results, errors, success SLOs, email alerts.
- Historical tracking: every published price appended to `price_history`.

## Components

```
scheduler ──enqueue──► [BullMQ: scrape] ──► Worker pool ──► VendorAdapter
   (daily cron / repeatable jobs)                │              │ Playwright/Selenium/HTTP
                                                 │              │ via ProxyManager
                                 ScrapeRun row ◄─┘              ▼
                                                        parse → normalize
                                                                │
                              ChangeDetector ◄──────────────────┘
                              (business rules BR-6/7/9)
                                    │
                         staged_price_changes (PENDING / AUTO_APPROVED / ANOMALY)
                                    │ approve
                       publish tx (offering + price_history) ──► alerts:evaluate ──► email
```

### 1. Vendor adapter framework (`packages/scrapers`)
A single generic engine driven by config; per-vendor specifics live in the DB and (optionally) a
small code hook for awkward sites.

```ts
interface VendorAdapter {
  vendorId: string;
  engine: 'PLAYWRIGHT' | 'SELENIUM' | 'HTTP';
  // Discover/resolve the URLs to fetch for the active offerings.
  resolveTargets(ctx: ScrapeContext): Promise<ScrapeTarget[]>;
  // Fetch + extract a single target into a normalized observation.
  scrapeOne(target: ScrapeTarget, page: Page, ctx: ScrapeContext): Promise<RawObservation>;
}
interface RawObservation {
  offeringId?: string; vendorSku?: string; rawPriceText?: string;
  parsedPrice?: Decimal; inStock?: boolean; htmlSnapshotKey?: string;
}
```
- **Config-driven default adapter** reads `selectors` (JSONB: `{price, title, inStock, ...}` as CSS
  or XPath), `nav_steps` (scripted clicks/waits for SPA/cookie walls), `price_regex`, `headers`.
  90% of vendors need only config. The remaining handful register a named TS hook.
- **Normalization**: price text → `Decimal` via locale-aware parse + `price_regex`; currency forced
  USD (v1); stock inferred from selector/keywords.

### 2. Engines
- **Playwright (primary):** headful-in-headless Chromium, realistic UA/viewport/locale, cookie
  acceptance, network idle waits, optional stealth tweaks. Best blocking resistance.
- **Selenium (adapter):** parity interface for sites/tooling that need it; same `VendorAdapter`
  contract so the queue/worker code is engine-agnostic.
- **HTTP (fast path):** plain `fetch` + parser for static price pages — cheapest, used when a vendor
  doesn't require JS.

### 3. ProxyManager
- Pool from `proxies` (datacenter → residential → mobile tiers).
- Per-request selection weighted by `health` and least-recently-used; sticky session per run where a
  vendor needs cookie continuity.
- On block/timeout: mark proxy `DEGRADED`, rotate, exponential backoff; repeated failures →
  `BANNED` + alert. Per-vendor `rate_limit_ms` and `concurrency` throttle request pacing.

### 4. Scheduling & queue (BullMQ)
- **Repeatable job** `scrape:daily` fans out one `scrape:vendor` job per active, enabled vendor at a
  configurable hour (jittered to avoid synchronized hammering). Per-vendor `schedule_cron` overrides.
- **Manual** runs enqueue the same job with `trigger=MANUAL`; single-offering re-scrape uses
  `kind=SINGLE_OFFERING`.
- Job options: `attempts: 3`, exponential `backoff` (e.g., 1m/5m/30m), `removeOnComplete` capped,
  dead-letter queue for exhausted retries → ops alert.
- Concurrency capped globally and per vendor; one active run per vendor (enforced via a Redis lock →
  API returns 409 `run_already_active`).

### 5. Retry & failure recovery
| Failure | Handling |
|---|---|
| Nav timeout / transient | retry with backoff + new proxy (job-level attempts). |
| Blocked (captcha/403) | rotate proxy + UA, lower concurrency, `BLOCKED` error; if persistent, pause vendor + alert. |
| Selector miss | `SELECTOR_MISS` error w/ HTML snapshot; offering left unchanged; surfaced in admin to fix config. |
| Parse fail | `PARSE_FAIL`; raw text retained for debugging. |
| Anomaly ($0 or >300%) | `ANOMALY` → staged change auto-rejected (BR-9), never published, alert. |
| Whole run fails | run `FAILED`, error summary, email alert, automatic single retry next cycle; manual re-run button. |

`partial` runs (some offerings ok, some errored) publish the good ones and report the rest.

### 6. Change detection
For each normalized observation vs the current `offering`:
1. Compute `delta_pct`. Validate (non-negative, within sanity bounds).
2. **Anomaly** (BR-9) → `ANOMALY`, auto-reject, alert.
3. **Auto-approve** if `|delta_pct| < AUTO_APPROVE_THRESHOLD_PCT` **and** vendor `trust_level=HIGH`
   **and** passes validation → `AUTO_APPROVED` → published immediately in the publish tx.
4. Otherwise → `PENDING` in the approval queue.
No-change observations update `last_scraped_at`/`price_observed_at` only (freshness), no history row.

### 7. Publish transaction (on approve / auto-approve)
Single DB transaction: update `offerings.current_price/in_stock/price_observed_at`, insert
`price_history` (`source=SCRAPE`, link `scrape_run_id`), mark change `APPROVED/AUTO_APPROVED`, write
`audit_logs`, then (post-commit) enqueue `alerts:evaluate` + purge caches (`test:{slug}`, home).

### 8. Monitoring & alerting
- **Per-vendor health** (`/admin/scrape/health`): last success, success rate (7d), avg duration,
  freshness (offerings scraped < `STALE_AFTER_DAYS`), error breakdown.
- **Metrics** exported (OpenTelemetry/Prometheus): runs started/succeeded/failed, items changed,
  block rate, proxy health, queue depth, job latency.
- **Email alerts** (BR via worker): run `FAILED`, vendor success rate < SLO, block rate spike,
  anomaly detected, proxy pool degraded, staleness breach.
- **Debugging:** HTML snapshots + screenshots to object storage, keyed on `scrape_results`/errors,
  retained 14 days.

### 9. Historical tracking
`price_history` (partitioned monthly) is the immutable record powering trend charts (`/tests/{slug}/
trend`, `/offerings/{id}/trend`) and analytics. Seeded with prototype prices as a baseline.

## Adding a vendor (no deploy)
1. Admin → Vendors → create vendor (name, website, affiliate template, trust level).
2. Admin → Scrape Config → set engine, list/detail URL templates, selectors JSON, rate limit,
   concurrency, schedule.
3. Create offerings (or let a discovery run create `NEW` results to map).
4. "Run now" → review `scrape_results`/errors → tweak selectors live → approve staged changes.
Only genuinely hostile sites need a code hook (registered by `vendorId`).

---

## Legal & compliance (gating prerequisite)

The aggressive-scraping posture carries real, material risk. Before scraping **any** specific vendor
in production, the following must be completed and recorded:

1. **Per-vendor review** of Terms of Service, `robots.txt`, and any API/affiliate-feed alternative.
   Where an official feed or affiliate product API exists, prefer it (lower risk, more reliable) —
   the framework supports `source=FEED` ingestion alongside scraping.
2. **Counsel sign-off** captured per vendor (CFAA/contract/CCPA considerations differ by site).
3. **Operational guardrails enabled by default:** honor `Retry-After`/429, conservative
   `rate_limit_ms`, low `concurrency`, jittered scheduling, identifiable contact UA where
   appropriate, no scraping behind logins/paywalls, no collection of personal data — **only public
   self-pay prices**.
4. **Opt-out / takedown process:** a documented channel for a vendor to request delisting; honored
   promptly; vendor flagged `is_active=false`.
5. **Isolation:** scraping runs on separate infra/IPs from the public app; proxy credentials in the
   secrets manager; failures never degrade the user-facing site (it serves cached/last-known prices
   with a freshness badge).

This is recorded in the PRD risk register (Deliverable #1 §8) and must be tracked as a launch
checklist item, owned by the product owner, before Phase 3 scraping targets go live.
