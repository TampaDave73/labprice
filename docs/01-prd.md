# Deliverable #1 — Product Requirements Document

**Product:** LabPrice — Self-Pay Blood Test Price Comparison Platform  
**Version:** 1.0 (v1 scope; v2 enhancements called out in Section 7)  
**Last updated:** 2026-06-26  
**Status:** Approved for implementation

---

## 1. Executive Summary

Most U.S. consumers overpay for routine blood tests because cash (self-pay) prices are opaque and scattered across a dozen online ordering services. These services sell a lab requisition online; the patient then visits a Quest Diagnostics or LabCorp patient service center for the actual blood draw. The same test — for example, Vitamin D 25-Hydroxy (Quest #17306 / LabCorp #081950) — can range from **$29 to $79** depending purely on which ordering service sells the requisition.

**LabPrice** aggregates these prices into a single, fast, trustworthy comparison. A user searches for a test by name or by a Quest/LabCorp test code, reads a plain-language clinical explainer, and sees a ranked price table across 10 ordering services with the cheapest highlighted and total possible savings surfaced. Each row links out via an affiliate redirect to the ordering service's purchase page.

The platform is built to scale to thousands of users and millions of historical price points, with **automated daily scraping** keeping prices current, **historical tracking** powering trend charts, and **price-drop alerts** bringing users back. An **admin approval workflow** gates every scraped price change before it goes live, protecting data quality and brand credibility.

**Business model:** Affiliate commissions on outbound clicks and orders placed through ordering services. This makes click attribution and price accuracy first-class concerns.

### Goals (v1)

1. Let a consumer find any catalog test in under 3 seconds and compare prices across all ordering services.
2. Keep prices fresh via automated daily scraping with human-approved changes.
3. Track price history and expose trend charts.
4. Capture affiliate clicks with reliable attribution.
5. Rank for long-tail SEO queries (e.g., "vitamin d test cost," "cheapest tsh test").

### Non-Goals (v1)

- Booking or scheduling the blood draw, processing payments, or holding lab results (we link out; we are not a lab or ordering service).
- Insurance pricing or estimation.
- Vendor ratings or user reviews (deferred to v2; database schema is v2-ready).
- Native mobile apps (the API is built mobile-ready; apps come later).
- Bookmarks/favorites beyond saved tests.
- Price range filtering or layout switching.
- Displaying turnaround time for test results.

---

## 2. User Personas

### 2.1 Health-Conscious Hannah (Primary Consumer)

| Attribute | Detail |
|---|---|
| **Age / Profile** | 25-45, health-conscious, tracks biomarkers proactively |
| **Behavior** | Orders her own labs 2-4x/year, shops for the cheapest option, price-sensitive |
| **Primary needs** | Fast search, trustworthy lowest price, clear explanation of what the test measures |
| **Success scenario** | Searches "Vitamin D," sees Life Extension is cheapest at $29, clicks Order, completes purchase |
| **Frustrations** | Having to visit 10 different websites and compare prices manually |

### 2.2 Chronic-Condition Carl (Repeat Consumer)

| Attribute | Detail |
|---|---|
| **Age / Profile** | 50-70, manages ongoing health conditions (diabetes, thyroid, prostate) |
| **Behavior** | Orders recurring tests (HbA1c, Lipid Panel, PSA, TSH) every 3-6 months |
| **Primary needs** | Price alerts for recurring tests, price trend history, reliable cheapest source |
| **Success scenario** | Sets an alert on TSH; gets emailed when it drops below $25; orders immediately |
| **Frustrations** | Prices changing without notice; not knowing if he is overpaying |

### 2.3 Caregiver Casey

| Attribute | Detail |
|---|---|
| **Age / Profile** | 35-55, orders tests on behalf of an elderly parent or family member |
| **Behavior** | Needs guidance on test preparation (fasting, timing) and which codes to reference |
| **Primary needs** | Clear "How to Prepare" instructions, Quest/LabCorp codes to give the draw site |
| **Success scenario** | Reads CMP fasting instructions, copies LabCorp code #322000, orders for parent |
| **Frustrations** | Medical jargon; uncertainty about whether the right test was ordered |

### 2.4 Admin Dana (Internal)

| Attribute | Detail |
|---|---|
| **Role** | Data editor / content manager |
| **Behavior** | Reviews scraped price changes daily, manages test catalog and vendor listings, edits clinical content |
| **Primary needs** | Efficient approval queue, error visibility, content editing tools, bulk operations |
| **Success scenario** | Clears the daily change queue in minutes; catches and rejects a bad scrape before it goes live |
| **Frustrations** | Noisy false-positive changes; having to approve changes one at a time |

### 2.5 Ops Engineer Omar (Internal)

| Attribute | Detail |
|---|---|
| **Role** | Runs scrapers and infrastructure |
| **Behavior** | Monitors scrape jobs, investigates failures, manages proxy configuration |
| **Primary needs** | Job monitoring dashboard, error logs, manual re-scrape trigger, failure alerts |
| **Success scenario** | Sees a vendor adapter failing, identifies the selector change, updates config, re-runs |
| **Frustrations** | Silent failures; having to deploy code to fix a CSS selector change |

---

## 3. User Flows

### 3.1 Search and Compare (Core Flow — Anonymous Allowed)

1. User lands on the home page (hero section with search bar, popular test chips, "Popular Tests" cards, "All Tests" list).
2. Types a query (e.g., `vitamin d`, `17306`, `081950`) into the search bar.
3. Autocomplete dropdown shows up to 6 matches displaying test name, Quest/LabCorp codes, and "from $X."
4. User selects a test and navigates to the test detail page (`/tests/{slug}`).
5. Page displays:
   - **Header:** Test name, Quest and LabCorp codes, number of ordering services with prices, short description.
   - **Left column:** Accordion sections (About This Test, How It's Performed, How To Prepare, Normal Ranges).
   - **Right column:** Price comparison table showing all 10 ordering services, cheapest row highlighted in green, savings banner at the top.
6. User sorts the price table by Price (low to high) or alphabetically (A-Z).
7. User clicks **Order** on a row, which triggers a `302` redirect through `/go/{offeringId}`, logs an affiliate click, and sends the user to the ordering service's purchase page.

### 3.2 Browse by Category

1. From the home page, user scrolls to the "All Tests" section.
2. Selects a category chip: All, Vitamins & Minerals, Hormones, Metabolic, Blood Count, or Cancer Markers.
3. Test list filters to show only tests in the selected category.
4. User sorts by A-Z or Price (lowest "from" price).
5. Clicks "View all N tests" to expand beyond the initial 8 displayed.
6. Clicks a test card to navigate to the test detail page (Flow 3.1, step 4).

### 3.3 Account Creation and Saved Tests

1. User clicks "Free Account" in the header.
2. Signs up via email magic link or Google OAuth.
3. On any test detail page, user clicks **Save** to add the test to their dashboard.
4. User's dashboard lists saved tests with current cheapest price and price change since saved.
5. From the dashboard, user can navigate to any saved test or remove it.

### 3.4 Price Alert Setup and Delivery

1. On a test detail page (or from the saved tests dashboard), user clicks **Set Price Alert**.
2. Chooses alert type: absolute threshold (e.g., "notify me when below $30") or "any price drop."
3. Alert is saved to the user's account.
4. Background worker detects a qualifying price change after an approved scrape update.
5. System sends an email notification with the new price, old price, and a direct link to the test page.
6. Alert event is logged in the user's notification history.

### 3.5 Admin Approval Workflow

1. Daily automated scrape produces staged price changes (not yet visible to users).
2. Admin Dana opens **Admin Panel > Change Queue**.
3. Each entry shows: test name, ordering service, old price, new price, percentage delta, confidence score, and timestamp.
4. Dana reviews and takes action:
   - **Approve:** Publishes the new price to the live site and appends a row to `price_history`.
   - **Reject:** Keeps the old price, flags the source for investigation.
   - **Bulk approve:** Select multiple low-risk changes (small deltas from high-trust vendors) and approve in one action.
5. Approved changes immediately update the public-facing price table and trigger any matching price alerts.

### 3.6 Scrape Operations (Internal)

1. Daily cron job enqueues one scrape job per active vendor adapter.
2. Omar monitors progress in **Admin Panel > Scraper Monitor**: active runs, durations, success rates, error counts.
3. On failure: automatic retry with exponential backoff (up to 3 retries).
4. If retries exhausted: alert email sent to ops; manual re-scrape button available in admin.
5. Omar can update scrape selectors and configuration in admin without a code deployment.

---

## 4. Business Rules

### Pricing and Comparison

**BR-1:** "Best Price" is defined as the lowest active, in-stock offering price for a given test. In the event of a tie, the ordering service with higher vendor priority wins (configurable in admin; default is alphabetical).

**BR-2:** "You Save" / savings amount displayed equals the difference between the highest and lowest active offering prices for that test.

**BR-3:** All prices are self-pay cash rates in USD, exclusive of any blood draw fee unless the ordering service bundles it (indicated by the `includes_draw_fee` flag on the offering). A disclaimer noting potential additional draw fees is always displayed.

**BR-4:** An offering whose price has not been successfully scraped within `STALE_AFTER_DAYS` (default: 7) is badged "Price may be outdated." If the last successful scrape exceeds `HIDE_AFTER_DAYS` (default: 30), the offering is excluded from "Best Price" calculations and hidden from the comparison table.

**BR-5:** All prices are displayed in USD. Multi-currency support is deferred to v2.

### Data Freshness and Approval

**BR-6:** Scraped price changes are never auto-published if the absolute delta exceeds `AUTO_APPROVE_THRESHOLD_PCT` (default: 15%) or if the new value fails validation rules. Such changes require human approval.

**BR-7:** Changes below the auto-approve threshold that pass all validation checks may be auto-approved only if the vendor's `trust_level` is set to `HIGH`. All other changes enter the approval queue.

**BR-8:** Every published price change writes an immutable row to the `price_history` table, recording the old price, new price, timestamp, source (scrape or manual), and approver.

**BR-9:** A scraped price that resolves to $0.00 or increases by more than `SANITY_MAX_PCT` (default: 300%) over the current live price is automatically rejected and flagged as a scrape anomaly for investigation.

### Catalog Management

**BR-10:** A test must have at least one active offering with a valid price to be publicly visible. Tests with zero active offerings are set to `draft` status and hidden from search and browse.

**BR-11:** Test URL slugs are immutable once published (to protect SEO value). If a test is renamed, the old slug is retained as a 301 redirect alias.

**BR-12:** Quest and LabCorp test codes are stored as display-only identifiers. Internal matching between ordering services and tests uses the `test_id` foreign key, not lab codes.

**BR-13:** The v1 catalog consists of 12 tests across 5 categories:
- **Vitamins & Minerals:** Vitamin D 25-Hydroxy, Vitamin B12, Ferritin
- **Hormones:** Testosterone Total, TSH, Cortisol, Estradiol
- **Metabolic:** Lipid Panel, HbA1c, Comprehensive Metabolic Panel
- **Blood Count:** CBC (Complete Blood Count)
- **Cancer Markers:** PSA (Prostate-Specific Antigen)

### Price Alerts

**BR-14:** A user may have at most `MAX_ALERTS_PER_USER` (default: 50) active price alerts.

**BR-15:** An alert fires at most once per (alert, price-change event). Additionally, each alert is rate-limited to one email notification per 24-hour period to prevent spam.

**BR-16:** Alerts are evaluated after each approved price change is published. Only active alerts belonging to verified email addresses are triggered.

### Affiliate Tracking

**BR-17:** Every outbound order click is logged with the offering ID, user ID (if authenticated), session ID, referrer, and timestamp before the redirect occurs. If logging fails, the redirect must still proceed (fire-and-forget pattern; never block the user).

**BR-18:** Affiliate URL templates are configured per ordering service and may include a sub-ID parameter set to LabPrice's internal click ID for reconciliation with affiliate network reports.

**BR-19:** Click-through rate and affiliate click counts are tracked per test and per ordering service for analytics and revenue reporting.

### Access Control

**BR-20:** Browsing, searching, and comparing prices is fully anonymous. No account is required.

**BR-21:** Saving tests and creating price alerts require an authenticated account.

**BR-22:** Admin panel access requires the `ADMIN` role. Destructive operations (deleting tests, vendors, users) and system configuration changes require the `SUPER_ADMIN` role.

---

## 5. Functional Requirements

### 5.1 Catalog and Search

**FR-1:** Maintain a catalog of tests, each with: name, slug, category, clinical content (description, purpose, procedure, preparation instructions, normal ranges), Quest test code, and LabCorp test code.

**FR-2:** Full-text and fuzzy search across test name, short name, synonyms, category name, Quest code, and LabCorp code. Search must handle partial matches and common misspellings.

**FR-3:** Support search by biomarker name (e.g., "cholesterol" returns Lipid Panel and CMP) via a maintained biomarker-to-test mapping table.

**FR-4:** Autocomplete endpoint returns up to 6 results, each displaying the test name, Quest/LabCorp codes, and the lowest current price ("from $X").

**FR-5:** Browse view supports category filtering via chips (All, Vitamins & Minerals, Hormones, Metabolic, Blood Count, Cancer Markers) and sorting by alphabetical or lowest price.

**FR-6:** "View all" / "Show more" toggle on the browse list expands beyond the initial 8 tests shown.

**FR-7:** Test detail page renders accordion sections for clinical content (About This Test, How It's Performed, How To Prepare, Normal Ranges) with proper semantic HTML.

### 5.2 Pricing and Comparison

**FR-8:** Display a price comparison table on each test detail page showing all active ordering services with their current price, cheapest row highlighted, and a savings banner.

**FR-9:** Price table is sortable by price (ascending) and by ordering service name (A-Z).

**FR-10:** Display the 10 ordering services: Life Extension, Ulta Lab Tests, True Health Labs, DirectLabs, Walk-In Lab, Request A Test, Quest Diagnostics, LabCorp, Health Testing Centers, Any Lab Test Now.

**FR-11:** Price trend chart showing historical price data per offering and a "cheapest over time" line for the test as a whole.

**FR-12:** Each ordering service row includes an **Order** button that redirects through the affiliate tracking endpoint (`/go/{offeringId}`).

**FR-13:** Freshness indicator on each price showing when it was last verified (e.g., "Verified 2 hours ago" or "Price may be outdated").

### 5.3 Accounts and Alerts

**FR-14:** User registration and authentication via email magic link and Google OAuth.

**FR-15:** Save/unsave tests from any test detail page; saved tests appear on the user dashboard.

**FR-16:** User dashboard displays saved tests with current cheapest price, price change since saved, and quick links to test detail pages.

**FR-17:** Create, view, edit, and delete price alerts with configurable thresholds (absolute dollar amount or "any drop").

**FR-18:** Email notification delivery for triggered alerts, including old price, new price, ordering service name, and a link to the test page.

**FR-19:** Notification history log accessible from the user's account page.

**FR-20:** Account settings: update email, manage notification preferences, delete account, request data export (GDPR/CCPA compliance).

### 5.4 Ordering Services (Vendors)

**FR-21:** Maintain vendor records with: name, display name, logo URL, website, affiliate URL template, trust level, active/inactive status, and priority ranking.

**FR-22:** Vendor profile data is admin-managed; there is no public-facing vendor detail page in v1.

### 5.5 Scraping and Data Operations

**FR-23:** Per-vendor scrape adapter configuration (CSS selectors, URL templates, request headers, rate limits) editable in the admin panel without requiring a code deployment.

**FR-24:** Automated daily scraping triggered by cron; each vendor adapter runs as an independent job.

**FR-25:** Manual re-scrape capability: trigger a scrape for a specific vendor or a specific offering from the admin panel.

**FR-26:** Change detection: compare scraped values against current live prices and stage differences as pending changes in the approval queue.

**FR-27:** Scrape job history: log each run with start time, duration, success/failure status, number of prices found, number of changes detected, and error details.

**FR-28:** Failure alerting: email notification to ops team when a scrape job fails after all retries are exhausted.

### 5.6 Admin Panel

**FR-29:** Approval queue interface: list pending price changes with old/new values, percentage delta, confidence score, vendor trust level, and approve/reject/bulk-approve actions.

**FR-30:** CRUD management for tests, categories, vendors, biomarker mappings, and offerings.

**FR-31:** Clinical content editor for test descriptions, preparation instructions, and normal ranges.

**FR-32:** Scraper monitor dashboard: active jobs, recent runs, success rates, error logs, manual re-scrape triggers.

**FR-33:** User management: view users, assign roles (USER, ADMIN, SUPER_ADMIN), deactivate accounts.

**FR-34:** System settings management: configure thresholds (staleness, auto-approve, sanity checks), feature flags, and operational parameters.

**FR-35:** Analytics dashboard: search query volume, page views, affiliate click counts, click-through rates by test and vendor.

### 5.7 SEO and Content

**FR-36:** Server-rendered, indexable test detail pages with structured data (schema.org `MedicalTest` and `Offer` markup), canonical URLs, and Open Graph metadata.

**FR-37:** Auto-generated XML sitemap including all published test pages.

**FR-38:** Editable SEO landing pages (e.g., "cheapest vitamin d test") managed through the admin panel.

**FR-39:** Medical disclaimer displayed on every page containing clinical content ("This information is not medical advice").

**FR-40:** Affiliate disclosure statement accessible from every page (footer link or inline notice).

### 5.8 Public API

**FR-41:** Versioned REST API (`/api/v1`) covering: test search, test detail, price listings, price history, and categories. Designed to serve a future mobile app.

**FR-42:** API rate limiting per IP (anonymous) and per API key (authenticated) to prevent abuse.

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Metric | Target |
|---|---|
| Test detail page TTFB (cached) | < 200 ms |
| Test detail page TTFB (uncached) | < 600 ms |
| Search autocomplete response (p95) | < 150 ms |
| Largest Contentful Paint (mobile) | < 2.5 s |
| First Input Delay | < 100 ms |
| Cumulative Layout Shift | < 0.1 |

### 6.2 Scalability

- Design for 10,000 MAU initially, scaling to 100,000+ without architectural changes.
- `price_history` table designed for tens of millions of rows (partitioned by date).
- Stateless web tier, horizontally scalable behind a load balancer.
- Background workers (scraping, alerts) scale independently of the web tier.

### 6.3 Availability

- **99.9% uptime** for the public read path (search, browse, test detail pages).
- Scraping and admin panel may degrade independently without affecting the public site.
- Public reads served from cache or database replicas; scraper failures do not cause downtime.

### 6.4 Caching

- Cloudflare edge caching for public pages and JSON responses (stale-while-revalidate strategy).
- Redis for hot queries, search results, rate limiting, and session data.
- Cache invalidation triggered by approved price changes.

### 6.5 SEO

- Server-side rendering (SSR) or incremental static regeneration (ISR) for all public pages.
- Semantic HTML5 markup with proper heading hierarchy.
- Structured data (schema.org) on test pages.
- Core Web Vitals targets met (see Performance above).
- Clean, human-readable URLs (`/tests/vitamin-d-25-hydroxy`).
- XML sitemap and robots.txt.

### 6.6 Accessibility

- WCAG 2.1 Level AA compliance.
- Full keyboard navigation with visible focus indicators.
- Sufficient color contrast ratios on all text and interactive elements, including the green accent theme.
- ARIA attributes on accordions, autocomplete dropdown, modals, and dynamic content.
- Screen reader compatibility for price comparison tables.

### 6.7 Responsiveness

- Mobile-first responsive design.
- Two-column layout (clinical content + price table) collapses to stacked single-column below 900px viewport width.
- Touch-friendly tap targets (minimum 44x44px).

### 6.8 Security

- Authentication and authorization (RBAC) as detailed in Deliverable #7.
- Input validation and output encoding (OWASP Top 10 coverage).
- Audit logging for admin actions.
- Secrets management (no credentials in code or version control).

### 6.9 Privacy and Compliance

- GDPR and CCPA compliance: data export and account deletion on request.
- Minimal PII collection (email address only for accounts).
- Cookie consent mechanism for analytics and tracking cookies.
- Affiliate disclosure per FTC guidelines.
- Medical disclaimer on all clinical content pages.

### 6.10 Observability

- Structured logging with request correlation IDs.
- Error tracking integration (e.g., Sentry).
- Scrape job metrics and success rate monitoring.
- Uptime monitoring with alerting.
- Affiliate click and conversion tracking dashboards.

### 6.11 Data Integrity

- Approval workflow prevents unreviewed data from reaching users.
- Validation rules reject anomalous prices before they enter the queue.
- Immutable `price_history` table provides a complete audit trail.
- Idempotent scrape operations (re-running a scrape for the same vendor/date does not create duplicates).
- Transactional price publishes (approval + history write + cache invalidation as a single unit).

### 6.12 Internationalization Readiness

- USD and English only in v1.
- Database schema includes a `currency` field on prices.
- Clinical content stored with string keys to support future locale expansion.

---

## 7. Future Features (v2 and Beyond)

| Feature | Description | Dependency |
|---|---|---|
| **Vendor Ratings and Reviews** | User-submitted ratings and reviews for ordering services. Database schema is v1-ready; UI is deferred. | Account system, moderation tooling |
| **ZIP-Aware Results** | Show which Quest/LabCorp draw sites are near the user; factor in regional pricing if applicable. | Geolocation API, draw site database |
| **Test Bundles / Panels** | Compare prices for multi-test baskets (e.g., "Annual Wellness Panel" = CBC + CMP + Lipid + TSH). | Bundle pricing from vendors |
| **Insurance vs. Cash Comparison** | Show estimated insurance copay alongside cash price to help users decide. | Insurance pricing data source |
| **Native Mobile Apps** | iOS and Android apps consuming the existing REST API. | Stable API (v1 delivers this) |
| **Multi-Test Compare Matrix** | Side-by-side comparison of multiple tests across selected vendors. | UI design, API extension |
| **Browser Extension** | Price overlay that shows LabPrice comparison when visiting an ordering service's test page. | Extension development, vendor URL matching |
| **Personalized Recommendations** | "Tests people also compare" and personalized suggestions based on saved tests. | Usage analytics, recommendation engine |
| **Multi-Currency / International** | Support for non-USD currencies and international ordering services. | i18n framework, international vendors |
| **A/B Testing Framework** | Test variations of landing pages, CTAs, and layouts for conversion optimization. | Analytics infrastructure |
| **Revenue Analytics** | Detailed revenue reporting by vendor, test, and traffic source with affiliate network reconciliation. | Affiliate sub-ID tracking (v1 delivers this) |
| **Subset Vendor Selection** | Allow users to select a subset of ordering services for a focused comparison view. | UI enhancement |

---

## 8. Risks and Assumptions

### 8.1 Assumptions

**A-1:** The v1 catalog of 12 tests across 10 ordering services is seeded with sample data for development and staging. Production prices come exclusively from automated scraping.

**A-2:** All 10 ordering services expose self-pay test prices on publicly accessible, scrapable product pages.

**A-3:** Affiliate programs (or at minimum trackable outbound links) exist for the listed ordering services. Where no affiliate program exists, links are plain outbound and attribution degrades to click analytics only.

**A-4:** Each ordering service has one canonical price per test. Promotional pricing, coupons, and member discounts are out of scope for v1.

**A-5:** Users understand that LabPrice is a comparison tool, not a lab or ordering service. The blood draw happens at Quest or LabCorp, not through LabPrice.

**A-6:** Clinical content (test descriptions, preparation instructions, normal ranges) is sourced from publicly available medical references and reviewed for accuracy before publication.

### 8.2 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | **Scraping ToS / legal exposure** — live scraping of named ordering services may violate their terms of service | High | High | Review each vendor's ToS and robots.txt with legal counsel before production scraping. Prefer official affiliate data feeds where available. Maintain a takedown/opt-out process. Isolate scraping infrastructure. Document exposure for stakeholders. See Deliverable #5 for detailed scraping compliance framework. |
| R-2 | **Anti-bot blocking / IP bans** — ordering services deploy bot detection that blocks scrapers | High | Medium | Proxy pool with rotation, human-like request pacing, headful browser automation (Playwright), per-vendor backoff configuration, graceful staleness handling when blocked. |
| R-3 | **Selector drift** — website redesigns break scrape adapters | High | Medium | Config-driven selectors editable in admin without code deploys, automated change-detection with sanity checks, failure alerts, manual re-scrape capability. |
| R-4 | **Bad data published** — incorrect prices reach the public site | Medium | High | Multi-layer defense: validation rules, anomaly auto-rejection (BR-9), human approval workflow, immutable price history for quick rollback. |
| R-5 | **Stale prices erode trust** — users see outdated prices and lose confidence | Medium | High | Freshness badges on every price (BR-4), daily scrape SLA monitoring, proactive staleness alerts to ops team. |
| R-6 | **Affiliate revenue depends on third parties** — ordering services change or discontinue affiliate programs | Medium | Medium | Track clicks independently of affiliate network reporting. Diversify across all 10 ordering services. Monitor for affiliate program changes. |
| R-7 | **Medical content liability** — users misinterpret clinical information as medical advice | Low | High | Prominent "not medical advice" disclaimers on every clinical content page. No diagnostic claims. Content reviewed by qualified personnel. |
| R-8 | **Proxy and scraping infrastructure costs** — costs scale faster than revenue at high scrape volumes | Medium | Medium | Aggressive caching of scraped data. Scrape only changed or active offerings. Tier vendors by trust level and scrape frequency. Monitor cost per scrape. |
| R-9 | **Competitor emergence** — similar comparison tools launch with more resources | Low | Medium | Focus on data accuracy, speed, and SEO as differentiators. Build user trust through transparency (freshness badges, price history). Grow organic traffic through content and long-tail SEO. |

### 8.3 Compliance Note

The aggressive live-scraping posture was explicitly chosen by the product owner. Engineering will build a polite-by-default, configurable scraping framework (rate limits, exponential backoff, robots.txt awareness as a toggle, proxy isolation) and will surface legal exposure to stakeholders. This document and Deliverable #5 record that **legal and ToS review is a gating prerequisite** before scraping any specific ordering service in production.

---

## Appendix A: v1 Catalog Reference

### Tests (12)

| Test Name | Category | Quest Code | LabCorp Code |
|---|---|---|---|
| Vitamin D 25-Hydroxy | Vitamins & Minerals | 17306 | 081950 |
| Vitamin B12 | Vitamins & Minerals | TBD | TBD |
| Ferritin | Vitamins & Minerals | TBD | TBD |
| Testosterone Total | Hormones | TBD | TBD |
| TSH | Hormones | TBD | TBD |
| Cortisol | Hormones | TBD | TBD |
| Estradiol | Hormones | TBD | TBD |
| Lipid Panel | Metabolic | TBD | TBD |
| HbA1c | Metabolic | TBD | TBD |
| Comprehensive Metabolic Panel | Metabolic | TBD | TBD |
| CBC (Complete Blood Count) | Blood Count | TBD | TBD |
| PSA (Prostate-Specific Antigen) | Cancer Markers | TBD | TBD |

### Ordering Services (10)

| Ordering Service | Type |
|---|---|
| Life Extension | Third-party ordering service |
| Ulta Lab Tests | Third-party ordering service |
| True Health Labs | Third-party ordering service |
| DirectLabs | Third-party ordering service |
| Walk-In Lab | Third-party ordering service |
| Request A Test | Third-party ordering service |
| Quest Diagnostics | Direct from lab (also a draw site) |
| LabCorp | Direct from lab (also a draw site) |
| Health Testing Centers | Third-party ordering service |
| Any Lab Test Now | Third-party ordering service |

### Categories (5)

1. Vitamins & Minerals
2. Hormones
3. Metabolic
4. Blood Count
5. Cancer Markers
