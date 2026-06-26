# Deliverable #1 — Product Requirements Document

**Product:** LabPrice — self-pay blood test price comparison
**Version:** 1.0 (v1 scope, with v2 hooks called out)
**Source:** Derived from the `Lab Test Price Comparison.dc.html` prototype + design transcripts.

---

## 1. Executive Summary

Most U.S. consumers overpay for routine blood tests because cash (self-pay) prices are opaque and
scattered across a dozen online "ordering services." These services sell a lab requisition online;
the patient then visits a Quest or LabCorp patient service center for the actual draw. The same test
(e.g., Vitamin D, Quest #17306 / LabCorp #081950) can range from **$29 to $79** depending purely on
which service you buy the requisition from.

LabPrice aggregates these prices into a single, fast, trustworthy comparison. A user searches for a
test by name or by a Quest/LabCorp test number, reads a plain-language clinical explainer, and sees a
ranked price table across ~10 ordering services with the cheapest highlighted and the total possible
savings surfaced. Each row links out (affiliate) to the vendor's order page.

The platform is built to scale to thousands of users and millions of historical price points, with
**automated daily scraping** keeping prices current, **historical tracking** powering trend charts,
and **price-drop alerts** bringing users back. An **admin approval workflow** gates every scraped
price change before it goes live, protecting data quality and the brand's credibility.

**Business model:** affiliate commissions on outbound clicks/orders. This makes click attribution and
price accuracy first-class concerns, not afterthoughts.

### Goals (v1)
1. Let a consumer find any catalog test in < 3 seconds and compare prices across all vendors.
2. Keep prices fresh via automated daily scraping with human-approved changes.
3. Track price history and expose trends.
4. Capture affiliate clicks with reliable attribution.
5. Rank for long-tail SEO ("vitamin d test cost", "cheapest tsh test").

### Non-goals (v1)
- Booking/scheduling the draw, payments, or holding lab results (we link out; we are not a lab).
- Insurance pricing/estimation.
- Vendor-submitted reviews/ratings (v2; schema-ready).
- Native mobile apps (the API is built mobile-ready, apps come later).

---

## 2. User Personas

| Persona | Description | Primary needs | Success looks like |
|---|---|---|---|
| **Health-Conscious Hannah** (primary) | 25–45, tracks biomarkers, orders her own labs, price-sensitive. | Fast search, trustworthy cheapest price, clear "what is this test." | Finds Vitamin D, sees Life Extension is cheapest at $29, clicks Order. |
| **Chronic-Condition Carl** | 50–70, recurring tests (HbA1c, lipid, PSA), wants the best recurring deal and price-drop alerts. | Saved tests, price alerts, trend history. | Sets an alert on TSH; gets emailed when it drops below $25. |
| **Caregiver Casey** | Orders tests for a parent; needs guidance on prep/fasting. | Clear "How to prepare" + which code to give the lab. | Reads CMP fasting note, copies LabCorp #322000. |
| **Affiliate-Partner Pat** (external/business) | Vendor marketing manager whose company is listed. | Accurate listing, working affiliate links, traffic. | Their offering shows correct price and drives orders. |
| **Admin / Data Editor Dana** (internal) | Reviews scraped changes, manages catalog & vendors. | Approval queue, error visibility, content editing. | Clears the daily change queue in minutes; catches a bad scrape. |
| **Ops / Engineer Omar** (internal) | Runs scrapers and infra. | Job monitoring, error logs, manual re-scrape, alerts. | Sees a vendor adapter failing and re-runs it. |

---

## 3. User Flows

### 3.1 Search & Compare (core, anonymous-allowed)
1. User lands on home (hero + search, popular chips, "Popular Tests" cards, "All Tests" list).
2. Types `vitamin d` (or `17306`, or `081950`) → autocomplete shows up to 6 matches with "from $X".
3. Selects a test → Results page (`/tests/{slug}`).
4. Sees header (name, Quest/LabCorp codes, vendor count, description), left accordion (About, How
   It's Performed, How To Prepare, Normal Ranges), and right price table (10 vendors, cheapest
   highlighted, savings banner).
5. Sorts by Price or A–Z.
6. Clicks **Order** on a row → `302` through `/go/{offeringId}` (logs an affiliate click) → vendor.

### 3.2 Browse / Filter
1. Home "All Tests" list → filter by category chips (All, Vitamins & Minerals, Hormones, Metabolic,
   Blood Count, Cancer Markers).
2. Sort A–Z or Price ↑. "View all N tests" expands beyond the initial 8.

### 3.3 Account & Saved Tests
1. Click "Free Account" → sign up (email magic link or OAuth).
2. On any test, **Save** adds it to the dashboard.
3. Dashboard lists saved tests with current cheapest price + delta since saved.

### 3.4 Price Alert
1. On a test (or saved test), **Set price alert** → choose threshold (absolute $ or "any drop").
2. Worker detects a qualifying price change → emails the user → logged as a notification.

### 3.5 Admin Approval (internal)
1. Daily scrape produces *staged* price changes.
2. Dana opens **Admin → Change Queue**, sees old→new per offering with % delta and confidence.
3. Approves (publishes to live price + appends history) or rejects (keeps old, flags source).
4. Bulk-approve "low-risk" (small deltas) is available.

### 3.6 Scrape Operations (internal)
1. Daily cron enqueues one job per active vendor adapter.
2. Omar watches **Admin → Scraper Monitor**: runs, durations, success rate, errors.
3. On failure, automatic retry w/ backoff; if still failing, alert email + manual re-scrape button.

---

## 4. Business Rules

**Pricing & comparison**
- BR-1: "Best Price" = the lowest **active, in-stock** offering price for a test. Ties → higher vendor
  priority (configurable; default alphabetical).
- BR-2: "Savings" displayed = (max active price − min active price) for that test.
- BR-3: Prices are self-pay cash rates, USD, exclusive of any draw fee unless the vendor bundles it
  (flag `includes_draw_fee`). A disclaimer is always shown.
- BR-4: An offering with a stale price (no successful scrape within `STALE_AFTER_DAYS`, default 7) is
  badged "price may be outdated" and excluded from "Best Price" if older than `HIDE_AFTER_DAYS`
  (default 30).
- BR-5: Currency is USD-only in v1.

**Data freshness & approval**
- BR-6: Scraped changes never auto-publish if the absolute delta ≥ `AUTO_APPROVE_THRESHOLD_PCT`
  (default 15%) or the new value fails validation → must be human-approved.
- BR-7: Changes below the threshold and passing validation may be auto-approved if the vendor's
  `trust_level` = HIGH; otherwise they queue.
- BR-8: Every published price writes an immutable row to `price_history`.
- BR-9: A price that drops to $0 or rises > `SANITY_MAX_PCT` (default 300%) is auto-rejected and
  flagged as a scrape anomaly.

**Catalog**
- BR-10: A test must have ≥ 1 active offering to be publicly visible (otherwise `draft`/hidden).
- BR-11: Test slugs are immutable once published (SEO); renames create a 301 alias.
- BR-12: Quest/LabCorp codes are display-only identifiers, not used for matching vendors→tests
  (matching is by internal `test_id`).

**Alerts**
- BR-13: A user may have at most `MAX_ALERTS_PER_USER` (default 50) active alerts.
- BR-14: An alert fires at most once per (alert, price-change) and is rate-limited to one email per
  alert per 24h.

**Affiliate**
- BR-15: Every outbound order click is logged with offering, user (if known), and timestamp before
  redirecting. Redirect must still occur if logging fails (fire-and-forget, never block the user).
- BR-16: Affiliate URL templates are per-vendor and may include a subID = our click ID for
  reconciliation.

**Access**
- BR-17: Browsing/search/compare is fully anonymous. Saving tests and alerts require an account.
- BR-18: Admin actions require role ADMIN+; destructive/config actions require SUPER_ADMIN.

---

## 5. Functional Requirements

### 5.1 Catalog & Search
- FR-1: Catalog of tests with category, slug, clinical content (description, purpose, procedure,
  preparation, normal range), and Quest/LabCorp codes.
- FR-2: Full-text + fuzzy search by test name, short name, synonyms, category, and Quest/LabCorp code.
- FR-3: **Search by biomarker** (e.g., "cholesterol" → Lipid Panel, CMP) via a biomarker↔test mapping.
- FR-4: Autocomplete (≤6 results) showing name, code string, and "from $X".
- FR-5: Category filtering and A–Z / Price sorting on the browse list; "show more/less".
- FR-6: Test detail page with accordion content sections and SEO metadata.

### 5.2 Pricing & Comparison
- FR-7: Per-test price table across all active vendors, cheapest highlighted, savings banner.
- FR-8: Sort price table by Price or A–Z.
- FR-9: **Compare multiple vendors side-by-side** for a test (already inherent) and
  **compare a test across selectable vendors** (pick subset) — v1 shows all; subset selection is a
  v1.1 enhancement flagged in the API.
- FR-10: **Price trend chart** per offering and per-test "cheapest over time" (historical data).
- FR-11: Affiliate outbound redirect with click logging.

### 5.3 Accounts
- FR-12: Sign up / sign in (magic-link email + optional OAuth: Google).
- FR-13: Save/bookmark tests; user dashboard.
- FR-14: **Price alerts** (threshold or any-drop) with email delivery and a notification log.
- FR-15: Account settings (email, notification prefs, delete account / GDPR export).

### 5.4 Vendors & Ratings (v2-ready)
- FR-16: Vendor profiles (name, logo, website, trust level, affiliate template).
- FR-17: Vendor ratings/reviews — **schema and API present but disabled in v1 UI** (deferred).

### 5.5 Scraping & Data Ops
- FR-18: Per-vendor scrape configuration (selectors, URL templates) editable without code deploy.
- FR-19: Daily automated scraping; manual re-scrape (per vendor or per offering).
- FR-20: Change detection → staged changes → admin approval queue.
- FR-21: Scrape job/run history, error logs, success metrics, email alerts on failure.

### 5.6 Admin
- FR-22: Manage users, vendors, tests, biomarkers, categories, content/SEO pages, feature flags,
  settings; review scrape changes; view analytics. (See Deliverable #6.)

### 5.7 SEO & Analytics
- FR-23: Server-rendered, indexable test pages with structured data (schema.org), sitemap, canonical
  URLs, and editable **SEO landing pages** (e.g., "cheapest vitamin d test").
- FR-24: Track searches, page views, and affiliate clicks for analytics dashboards and conversion.

### 5.8 Public API
- FR-25: Versioned, documented REST API (`/api/v1`) covering search, tests, prices, history — built
  to also serve a future mobile app. (See Deliverable #4.)

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Test page TTFB < 200 ms cached / < 600 ms uncached; search autocomplete p95 < 150 ms; LCP < 2.5 s mobile. |
| **Scalability** | Design for 10k MAU early, 100k+ later; `price_history` to tens of millions of rows (partitioned). Stateless web tier, horizontally scalable; workers scale independently. |
| **Availability** | 99.9% for the public read path; scraping/admin may degrade without taking the site down (reads served from cache/DB). |
| **Caching** | Cloudflare edge cache for public pages/JSON (stale-while-revalidate); Redis for hot queries, search, and rate limits. |
| **SEO** | SSR/ISR, semantic HTML, structured data, fast Core Web Vitals, clean URLs, sitemap, robots. |
| **Accessibility** | WCAG 2.1 AA: keyboard nav, focus states, color-contrast on accent themes, ARIA on accordions/autocomplete. |
| **Responsiveness** | Mobile-first; the two-column results collapse to stacked on < 900px. |
| **Security** | See Deliverable #7 (authn/z, RBAC, validation, OWASP Top 10, audit, secrets). |
| **Privacy** | GDPR/CCPA: data export + delete; minimal PII (email only); cookie consent for analytics. |
| **Observability** | Structured logs, request tracing, scrape metrics, error tracking (Sentry), uptime alerts. |
| **Data integrity** | Approval workflow + validation + immutable history; idempotent scrapers; transactional publishes. |
| **i18n-ready** | USD/English v1; schema carries `currency` and content is string-keyed for future locales. |
| **Compliance** | Medical disclaimer on every clinical page; "not medical advice"; affiliate disclosure. |

---

## 7. Future Features (v2+)

- Vendor ratings & user reviews (schema ready in v1).
- ZIP/distance-aware results (which draw sites are near you).
- Test **bundles/panels** comparison (multi-test baskets).
- Insurance vs. cash comparison.
- Subset vendor selection in the compare view; multi-test compare matrix.
- Browser-extension price overlay; native mobile apps (API already mobile-ready).
- Personalized recommendations & "tests people also compare".
- Multi-currency / international vendors.
- A/B testing framework on landing pages; revenue analytics by vendor/test.

---

## 8. Risks & Assumptions

### Assumptions
- A-1: Sample data (12 tests, 10 vendors, prices) from the prototype seeds dev/staging; production
  prices come from scraping.
- A-2: Vendors expose self-pay prices on public, scrapable product pages.
- A-3: Affiliate programs (or trackable links) exist for the listed vendors; otherwise links are
  plain outbound and "affiliate" attribution degrades to click analytics only.
- A-4: One canonical price per (vendor, test); promotional/coupon pricing is out of scope for v1.

### Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Scraping ToS / legal exposure** (the chosen posture is aggressive live scraping of named vendors) | High | High | **See the dedicated legal/compliance section in Deliverable #5.** Robots/ToS reviewed per vendor with counsel; respect `Retry-After`; keep request volume defensible; prefer official affiliate feeds where they exist; maintain takedown/opt-out process; isolate scraping infra; keep PII out of scraped data. Document exposure for stakeholders. |
| Anti-bot blocking / IP bans | High | Med | Proxy pool + rotation, human-like pacing, headful Playwright, per-vendor backoff, graceful staleness. |
| Selector drift breaks scrapers | High | Med | Config-driven selectors editable in admin, change-detection sanity checks, failure alerts, manual re-scrape. |
| Bad data published | Med | High | Validation + approval workflow + anomaly auto-reject + immutable history + quick rollback. |
| Stale prices erode trust | Med | High | Freshness badges (BR-4), daily scrape SLAs, monitoring. |
| Affiliate revenue depends on third parties | Med | Med | Track clicks independently of network reporting; diversify vendors. |
| Medical-content liability | Low | High | Prominent "not medical advice" disclaimers; content reviewed; no diagnostic claims. |
| Cost of proxies/scraping at scale | Med | Med | Cache aggressively; scrape only changed/active offerings; tier vendors by trust/frequency. |

> **Compliance note.** The aggressive live-scraping posture was explicitly chosen by the product
> owner. Engineering will build a polite-by-default, configurable framework (rate limits, backoff,
> robots awareness as a *toggle*, proxy isolation) and will surface the legal exposure to
> stakeholders. This document and Deliverable #5 record that the legal/ToS review is a **gating
> prerequisite** before scraping any specific vendor in production.
