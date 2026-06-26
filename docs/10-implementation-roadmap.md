# Deliverable #10 — Implementation Roadmap

> **Status**: Phase 0 (Design) complete. Ready to begin Phase 1 on approval.
>
> **Scope**: LabPrice v1 — lab test price comparison platform. No CPT codes, no ratings, no bookmarks in v1. Ratings, ZIP-aware results, and test bundles are deferred to v2.

---

## How to read this document

Each phase is **dependency-ordered** and ends with a shippable, testable increment. Complexity uses T-shirt sizing (S / M / L / XL). Duration estimates assume a single full-time developer. Tests are written **within** each phase, never deferred. A phase does not start until its dependency phases are green.

---

## Phase 0 — Design (CURRENT)

**Status**: Complete

Architecture documentation (Deliverables #1 through #10) finalized. Prototype analysis complete.

**Gate**: Product owner reviews and approves this document set before any code is written.

---

## Phase 1 — Foundation: Monorepo, Database, Authentication

| | |
|---|---|
| **Complexity** | M-L |
| **Duration** | ~1 to 1.5 weeks |
| **Dependencies** | Phase 0 approval |

### Goal

Establish the monorepo scaffold, deploy the database schema, and wire up authentication so a user can register and log in.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 1.1 | Initialize monorepo | pnpm workspaces + Turborepo. Create `apps/web`, `packages/{database,shared,ui,config}`. CI skeleton (typecheck, lint, test). |
| 1.2 | Create `packages/database` | Promote `schema.prisma` from docs. Prisma client generation. Connection pooling config. |
| 1.3 | Run initial migration + manual DDL | Migrations `0001-0004` covering extensions (`pg_trgm`, `pgcrypto`), full-text search indexes, table partitioning (`price_history` by month), check constraints, and partial indexes. |
| 1.4 | Seed database | Idempotent `seed.ts`: 5 categories, 12 tests (with biomarkers), 10 vendors, 120 offerings with baseline `price_history` rows, 1 super-admin user. |
| 1.5 | Set up `packages/shared` | Error classes (`AppError`, `NotFoundError`, `ValidationError`), shared TypeScript types, cache helper utilities, constant definitions. |
| 1.6 | Set up `packages/config` | Shared ESLint config, base `tsconfig.json`, Tailwind CSS preset (DM Sans, oklch color tokens from prototype). |
| 1.7 | Create `apps/web` | Next.js 15 (App Router) with TypeScript, Tailwind CSS, basic layout shell, health-check endpoint (`/api/health`). |
| 1.8 | Implement Auth.js v5 | Magic link (email) + Google OAuth providers. Database session strategy. RBAC utilities (`can()`, `requireRole()`). Auth routes (`/auth/signin`, `/auth/signout`, `/auth/verify`). Profile endpoint (`/api/me`). |
| 1.9 | Create basic middleware | Auth guard middleware, rate limiting (Redis-backed sliding window), structured error handling (JSON error envelope), CSP and security headers, structured logging. |
| 1.10 | Set up `packages/ui` | Design tokens extracted from prototype: DM Sans font family, oklch color palette, spacing scale, component primitives (Button, Input, Card). |

### Acceptance criteria

- [ ] User can register via magic link email and log in successfully
- [ ] User can register and log in via Google OAuth
- [ ] Database schema matches `docs/database/schema.prisma` exactly
- [ ] Seed data loads idempotently (`pnpm db:seed` can run repeatedly)
- [ ] Migrations apply forward and roll back cleanly
- [ ] `pnpm dev` starts the web app on `localhost:3000`
- [ ] `pnpm test` runs and passes (unit tests for shared utilities, auth helpers)
- [ ] `pnpm lint` and `pnpm typecheck` pass across all packages
- [ ] RBAC enforces role-based access (admin routes reject non-admin users)
- [ ] Rate limiting returns 429 after threshold is exceeded
- [ ] Health check endpoint returns 200 with service status

---

## Phase 2 — Core Product: Search, Browse, Compare

| | |
|---|---|
| **Complexity** | L-XL |
| **Duration** | ~2 to 3 weeks |
| **Dependencies** | Phase 1 |

### Goal

Build the complete public-facing experience — search, browse, and compare lab test prices — pixel-perfect to the approved prototype.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 2.1 | Build home page | Hero section with headline and CTA, search bar with inline autocomplete dropdown, popular test cards (top 6 by search volume), full all-tests list with category filter tabs and A-Z / Price sort, show-more pagination. |
| 2.2 | Build test detail page | Price comparison table (all vendors sorted cheapest-first), expandable accordion for test details (description, biomarkers, preparation), best-price banner with savings calculation (BR-1, BR-2, BR-4), vendor cards with affiliate CTA buttons. |
| 2.3 | Implement search service | Full-text search via `tsvector` (test name, aliases, category), trigram matching for typo tolerance, biomarker keyword search, result ranking and scoring. |
| 2.4 | Implement autocomplete API | `GET /api/search/autocomplete?q=`. Debounced on frontend (300ms). Server-side: prefix match + trigram fallback. **Target: p95 < 150ms response time.** |
| 2.5 | Build category filter and sort controls | Category tabs (All, Blood, Hormone, STD, Wellness, Other), sort options (A-Z, Price low-high, Price high-low), filter state preserved in URL query params. |
| 2.6 | Implement offerings service | Fetch offerings by test, compute best price and savings percentage, apply business rules (BR-1: cheapest = best, BR-2: savings vs. median, BR-4: vendor active check). Redis cache-aside pattern. |
| 2.7 | Build affiliate redirect endpoint | `GET /go/:offeringId` — logs click to `analytics_events` (offering ID, test ID, vendor ID, user ID if logged in, referrer, timestamp), then 302 redirects to vendor affiliate URL. |
| 2.8 | Implement cache layer | Redis cache-aside for test listings (TTL 5 min), test detail + offerings (TTL 5 min), search results (TTL 2 min), autocomplete (TTL 10 min). Cache invalidation on price updates. |
| 2.9 | Build responsive layouts | Mobile-first design. Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl). Touch-friendly tap targets. Collapsible navigation. |
| 2.10 | Add SEO metadata | Dynamic `<title>` and `<meta description>` per page, canonical URLs, `robots.txt`, `sitemap.xml` (static generation for all test and category pages), JSON-LD structured data (MedicalTest, Offer schemas). |
| 2.11 | Implement analytics endpoints | `POST /api/analytics/event` — log pageviews, search queries (with result count), affiliate clicks. Lightweight insert, no blocking. |

### Acceptance criteria

- [ ] Home page matches prototype pixel-perfectly (verified via overlay comparison)
- [ ] Autocomplete returns results in < 150ms (p95), measured under load
- [ ] Search returns relevant results for exact names, partial matches, and common typos
- [ ] Test detail page displays all 10 vendor prices sorted cheapest-first
- [ ] Best-price banner shows correct savings percentage
- [ ] Affiliate links log click events and redirect to correct vendor URLs
- [ ] Category filter and sort controls work correctly and preserve state in URL
- [ ] All pages are mobile-responsive and usable on 375px viewport
- [ ] Lighthouse SEO score > 90 on all public pages
- [ ] Structured data validates in Google Rich Results Test
- [ ] Sitemap includes all test and category URLs
- [ ] Zero-result searches are logged for gap analysis
- [ ] E2E test covers: home -> search -> test detail -> affiliate click flow

---

## Phase 3 — Scrapers + Approval Workflow

| | |
|---|---|
| **Complexity** | XL |
| **Duration** | ~2 to 3 weeks |
| **Dependencies** | Phase 1 (database), Phase 2 (offerings service) |

### Goal

Build the automated price collection framework with scrape engines, proxy rotation, change detection, and admin approval workflow.

> **LEGAL GATE**: Production scraping requires per-vendor Terms of Service review (see Deliverable #5). Build and fully test the framework against staging/test targets. Deploy against production vendor sites only after legal clearance per vendor.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 3.1 | Build `packages/scrapers` framework | Engine interface (`IScrapeEngine`), adapter pattern for vendor-specific configs, result normalization pipeline, error classification (retryable vs. permanent). |
| 3.2 | Implement Playwright engine | Headless Chromium via Playwright. Stealth plugin (`playwright-extra` + `stealth`). Configurable timeouts, viewport, user-agent rotation. Screenshot capture on failure for debugging. |
| 3.3 | Implement HTTP engine | Lightweight `fetch`-based engine for vendors with simple HTML or JSON API responses. Cheerio for HTML parsing. Falls back to Playwright engine on failure. |
| 3.4 | Build ProxyManager | Proxy pool with health tracking (success rate, latency, last-used). Rotation strategies (round-robin, least-recently-used, health-weighted). Auto-disable unhealthy proxies. Health-check cron. |
| 3.5 | Build price normalization and change detection | Normalize scraped prices (strip currency symbols, handle ranges). Compare against current `offerings.current_price`. Flag changes exceeding thresholds (BR-6 through BR-9). |
| 3.6 | Implement BullMQ scrape queue | `apps/worker` entry point. Queues: `scrape:schedule` (daily fan-out), `scrape:execute` (per-vendor-test jobs), `scrape:publish` (approved changes). Concurrency limits per vendor. Retry with exponential backoff. |
| 3.7 | Build `staged_price_changes` workflow | Scrape results insert into `staged_price_changes` with status `PENDING`. Admin reviews and sets `APPROVED` or `REJECTED`. Bulk actions supported. |
| 3.8 | Implement auto-approval rules | BR-6: Auto-approve if price change < 5% and vendor has > 95% accuracy over last 30 days. BR-7: Auto-approve if price matches a secondary source. BR-8: Flag for manual review if price change > 20%. BR-9: Auto-reject if scraped price is zero or negative. |
| 3.9 | Build publish transaction | Atomic operation: update `offerings.current_price` + insert `price_history` row + write `audit_logs` entry + purge relevant Redis cache keys + enqueue price-alert evaluation job. |
| 3.10 | Set up `apps/worker` | BullMQ worker process. Graceful shutdown handling. Health endpoint. Connection to shared Redis and PostgreSQL. Structured logging. |
| 3.11 | Create vendor configs | Config-driven scrape definitions for 2-3 initial vendors (test against staging targets). Selector paths, pagination rules, rate limits, engine preference. |
| 3.12 | Build scrape monitoring endpoints | `GET /api/admin/scrapes` — list recent scrape runs with status, duration, error counts. `GET /api/admin/scrapes/:id` — detail view with per-offering results. |

### Acceptance criteria

- [ ] Can scrape prices from at least 2 vendor test targets end-to-end
- [ ] Scraped price changes appear in `staged_price_changes` with `PENDING` status
- [ ] Auto-approval rules (BR-6, BR-7, BR-8, BR-9) apply correctly
- [ ] Approved changes update `offerings.current_price` and insert `price_history`
- [ ] Cache is purged atomically on price publish
- [ ] Failed scrapes retry with exponential backoff and proxy rotation
- [ ] Permanently failed scrapes are logged with error classification and screenshot
- [ ] ProxyManager disables unhealthy proxies automatically
- [ ] Admin can view scrape run history, results, and errors
- [ ] Worker process starts cleanly and shuts down gracefully
- [ ] Scrape concurrency respects per-vendor rate limits

---

## Phase 4 — Admin Panel + User Engagement

| | |
|---|---|
| **Complexity** | L-XL |
| **Duration** | ~1.5 to 2 weeks |
| **Dependencies** | Phase 2, Phase 3 |

### Goal

Build the complete admin panel for catalog and system management, plus user-facing engagement features (saved tests, price alerts).

### Tasks

| # | Task | Detail |
|---|------|--------|
| 4.1 | Build admin layout | Sidebar navigation (Dashboard, Change Queue, Tests, Vendors, Offerings, Scrapers, Users, Analytics, Settings). Top bar with admin user info. Responsive collapse. |
| 4.2 | Build admin dashboard | KPI cards (total tests, vendors, offerings, active users, pending changes). Recent activity feed (last 20 audit log entries). Quick-action links. |
| 4.3 | Build change queue screen | Table of `staged_price_changes` with status filter (Pending, Approved, Rejected). Inline approve/reject buttons. Bulk select + bulk approve/reject. Keyboard shortcuts (`a` = approve, `r` = reject, `j/k` = navigate). Detail drawer showing old price, new price, percentage change, scrape source. |
| 4.4 | Build tests / vendors / offerings CRUD | Data tables with search, sort, pagination. Create/edit forms with validation. Soft-delete with confirmation. Offerings: manual price override capability. Tests: biomarker management. Vendors: logo upload, affiliate URL config. |
| 4.5 | Build scrape config editor | Form to create/edit vendor scrape configurations. Selector path builder. Test-run capability (execute scrape against single test, show results inline without staging). Engine selection (Playwright / HTTP). |
| 4.6 | Build scraper monitor and error logs | Real-time job status (running, completed, failed). Run history with duration, success/fail counts. Error log table with classification, stack trace, screenshot link. |
| 4.7 | Build price history with trend charts | Per-offering price history table and line chart. Date range selector. Export to CSV. |
| 4.8 | Build user management screen | User list with search and role filter. Edit role (USER, ADMIN, SUPER_ADMIN). Disable/enable accounts. View user activity (logins, saved tests, alerts). |
| 4.9 | Build feature flags, system settings, proxies screens | Feature flags: toggle on/off with description. System settings: key-value pairs (scrape schedule, cache TTLs, rate limits). Proxies: add/remove/test proxies, view health stats. |
| 4.10 | Build audit log viewer | Searchable, filterable table of `audit_logs`. Filter by actor, entity type, action, date range. Detail view showing before/after JSON diff. |
| 4.11 | Implement saved tests | Logged-in users can save tests to their dashboard. `POST /api/me/saved-tests`, `DELETE /api/me/saved-tests/:id`. Saved indicator on test detail page. |
| 4.12 | Implement price alerts | `POST /api/me/alerts` — create alert (test ID, target price or "any drop"). `alerts:evaluate` BullMQ job runs after each price publish. Matching alerts trigger email notification via transactional email service. Notification logged to `notifications` table. Rate limit: max 1 email per alert per 24 hours. |
| 4.13 | Build user dashboard | `/dashboard` — saved tests list with current best prices, active alerts with status, notification history. Quick actions (remove saved test, edit/delete alert). |

### Acceptance criteria

- [ ] Admin can approve and reject price changes individually and in bulk
- [ ] Keyboard shortcuts work in change queue (a/r/j/k)
- [ ] Admin can create, edit, and soft-delete tests, vendors, and offerings
- [ ] Admin can manually override an offering price
- [ ] Admin can configure scrape selectors and run a test scrape
- [ ] Admin can view scrape job history, errors, and screenshots
- [ ] Admin can manage users and change roles
- [ ] Admin can toggle feature flags and update system settings
- [ ] Admin can manage proxy pool and view proxy health
- [ ] Audit log captures all admin write operations with before/after state
- [ ] Users can save tests and see them on their dashboard
- [ ] Users can create price alerts with a target price
- [ ] Price alerts trigger email notifications when a qualifying price drop occurs
- [ ] Alert emails are rate-limited to 1 per alert per 24 hours
- [ ] User dashboard displays saved tests, active alerts, and notification history

---

## Phase 5 — Analytics, SEO, and Content

| | |
|---|---|
| **Complexity** | M |
| **Duration** | ~1 to 1.5 weeks |
| **Dependencies** | Phase 2, Phase 4 |

### Goal

Build the admin analytics dashboard, deepen SEO with content pages, and add price trend visualizations.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 5.1 | Build analytics dashboard | Overview tab: total pageviews, unique visitors, searches, affiliate clicks (daily/weekly/monthly). Top searches table (query, count, avg results). Zero-result queries table (gap analysis for missing tests). Affiliate click breakdown by vendor and test. |
| 5.2 | Build SEO pages CMS | Admin can create/edit/publish static landing pages (e.g., "Cheapest Blood Tests in 2026"). Rich text editor. URL slug, meta title, meta description, publish/draft status. Pages rendered at `/pages/:slug` with full SEO metadata. |
| 5.3 | Implement structured data | JSON-LD on test detail pages: `MedicalTest` schema (name, description, category). `Offer` schema per vendor (price, URL, availability). `BreadcrumbList` on all pages. Validate against Google Rich Results Test. |
| 5.4 | Build sitemap.xml generation | BullMQ job (daily) generates sitemap XML. Includes: all test pages, category pages, CMS landing pages. Submits to Google Search Console API (if configured). |
| 5.5 | Build robots.txt | Allow all public pages. Disallow `/admin`, `/api`, `/auth`, `/dashboard`. Reference sitemap URL. |
| 5.6 | Implement Open Graph and Twitter Card meta tags | Dynamic OG image generation (test name + best price). `og:title`, `og:description`, `og:image`, `og:url`. Twitter Card (`summary_large_image`). |
| 5.7 | Build price trend charts on test detail page | Line chart showing price history over time per vendor. Tooltip with exact price and date. "Cheapest over time" overlay. Powered by `price_history` data. Date range selector (30d, 90d, 1yr). |
| 5.8 | Aggregate analytics data | Hourly BullMQ job: roll up raw `analytics_events` into `analytics_daily` aggregate table. Daily job: compute top searches, zero-result queries, click-through rates. Prune raw events older than 90 days. |

### Acceptance criteria

- [ ] Admin analytics dashboard shows pageviews, searches, and clicks with date filtering
- [ ] Admin can identify zero-result search queries for test catalog gaps
- [ ] Admin can create, edit, and publish SEO landing pages
- [ ] Published CMS pages render with correct SEO metadata
- [ ] Structured data (JSON-LD) validates in Google Rich Results Test
- [ ] Sitemap includes all public pages and is accessible at `/sitemap.xml`
- [ ] `robots.txt` correctly allows/disallows the appropriate paths
- [ ] Open Graph tags render correct previews when shared on social media
- [ ] Price trend charts display on test detail pages with accurate historical data
- [ ] Analytics aggregation job runs without errors and prunes old data

---

## Phase 6 — Hardening and Production Deployment

| | |
|---|---|
| **Complexity** | L |
| **Duration** | ~1.5 to 2 weeks |
| **Dependencies** | All previous phases |

### Goal

Harden the application for production: containerize, deploy, monitor, optimize performance, and verify security.

### Tasks

| # | Task | Detail |
|---|------|--------|
| 6.1 | Write Dockerfiles | Multi-stage builds for `apps/web` (Next.js standalone output) and `apps/worker` (Node.js). Minimal final images (node:20-slim base). Non-root user. |
| 6.2 | Create docker-compose.yml | Development compose: web + worker + PostgreSQL 16 + Redis 7 + Mailpit (email testing). Production compose: web + worker (external DB and Redis). |
| 6.3 | Set up GitHub Actions CI/CD | PR checks: typecheck, lint, test, build. Deploy pipeline: build images, push to registry, deploy to VPS via SSH. Staging deploy on push to `develop`. Production deploy on push to `main` (manual approval gate). |
| 6.4 | Configure Cloudflare | DNS records, CDN caching rules (static assets: 1 year, API: no-cache), WAF rules (rate limiting, bot protection, country blocking if needed), SSL (Full Strict mode), page rules. |
| 6.5 | Provision VPS and deploy | VPS setup: Docker, firewall (ufw: 22, 80, 443 only), fail2ban, unattended-upgrades. Deploy application stack. Verify all services healthy. |
| 6.6 | Set up PostgreSQL backups | Nightly `pg_dump` to encrypted offsite storage. WAL archiving for point-in-time recovery. Monthly restore drill (documented in runbook). Retention: 30 daily, 12 monthly. |
| 6.7 | Configure Sentry error tracking | Sentry SDK in `apps/web` and `apps/worker`. Source map upload in CI. Alert rules: new error types, error rate spikes. Release tracking tied to git SHA. |
| 6.8 | Set up Prometheus + Grafana monitoring | Node.js metrics (event loop lag, heap, GC). Application metrics (request latency, error rate, cache hit ratio, scrape success rate). PostgreSQL metrics (connections, query duration, table sizes). Redis metrics. Grafana dashboards. Alert rules (error rate > 1%, latency p99 > 2s, disk > 80%). |
| 6.9 | Performance optimization | Next.js ISR for test detail pages (revalidate: 300s). Edge caching via Cloudflare for static assets. Database query optimization (EXPLAIN ANALYZE on slow queries). Connection pooling tuning. Bundle size analysis and optimization. |
| 6.10 | Load testing with k6 | Scenarios: homepage load, search + autocomplete, test detail page, affiliate redirect. Targets: TTFB < 200ms (p95), autocomplete < 150ms (p95), 100 concurrent users sustained. Run against staging environment. |
| 6.11 | Security audit | CSP headers (strict policy, no unsafe-inline). Rate limiting verified on all API endpoints. Input validation review (all user inputs sanitized). SQL injection review (Prisma parameterized queries). XSS review. CSRF protection. Dependency audit (`pnpm audit`). |
| 6.12 | Write operational runbook | Deployment procedure (blue-green with rollback steps). Incident response checklist. Database restore procedure. Scraper failure triage. Certificate renewal. Scaling guidance. |

### Acceptance criteria

- [ ] Application deployed to production VPS behind Cloudflare
- [ ] CI/CD pipeline deploys automatically on merge to `main` (with manual approval gate)
- [ ] All Docker images build successfully in CI (< 5 min)
- [ ] Monitoring dashboards display application health metrics in Grafana
- [ ] Alert rules fire correctly (tested via synthetic failures)
- [ ] Nightly database backup runs and completes successfully
- [ ] Backup restore tested and documented (< 30 min RTO)
- [ ] Load test passes all performance targets (TTFB < 200ms, autocomplete < 150ms)
- [ ] Security headers score A+ on securityheaders.com
- [ ] `pnpm audit` shows zero high/critical vulnerabilities
- [ ] Sentry captures errors with source maps and release context
- [ ] Operational runbook covers deployment, rollback, incident response, and restore

---

## Summary Timeline

| Phase | Scope | Duration | Cumulative |
|-------|-------|----------|------------|
| P0: Design | Architecture docs, prototype analysis | Done | — |
| P1: Foundation | Monorepo, database, auth | 1-1.5 wk | 1.5 wk |
| P2: Core Product | Search, browse, compare, SEO basics | 2-3 wk | 4.5 wk |
| P3: Scrapers | Scrape framework, queues, approval workflow | 2-3 wk | 7.5 wk |
| P4: Admin + Engagement | Admin panel, saved tests, price alerts | 1.5-2 wk | 9.5 wk |
| P5: Analytics + SEO | Analytics dashboard, CMS, trends | 1-1.5 wk | 11 wk |
| P6: Hardening | Docker, CI/CD, monitoring, security | 1.5-2 wk | 13 wk |

**Total estimated: 10-14 weeks** (single developer, full-time)

---

## Dependency Graph

```
P0 ──► P1 ──► P2 ──┬──► P4 ──► P5 ──► P6
                    │         ▲
                    └──► P3 ──┘

P3 also depends on P1 directly.
P3 is gated by per-vendor legal sign-off.
P5 depends on P2 and P4.
P6 depends on all previous phases.
```

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Vendor ToS prohibits scraping | Medium | High — blocks Phase 3 for that vendor | Legal review early in Phase 2. Build data-feed ingestion as fallback. Design scraper framework so it works with fewer vendors. App never hard-depends on live scraping (seed/manual data drives UI). |
| R2 | Vendor site redesigns break selectors | High | Medium — scrape failures until fixed | Scrape monitoring with alerting. Screenshot capture on failure. Admin notification email. Config-driven selectors for fast updates without code deploy. |
| R3 | PostgreSQL partition maintenance missed | Low | High — inserts fail when partition missing | Automated BullMQ job creates partitions 2 months ahead. Monitoring alert if partition creation fails. Manual creation documented in runbook. |
| R4 | Prisma migration conflicts with manual DDL | Medium | Medium — schema drift | Migration runbook documents order of operations. CI validates schema matches. Manual DDL wrapped in idempotent scripts (`IF NOT EXISTS`). |
| R5 | Single point of failure (VPS) | Medium | High — downtime | Nightly backups with verified restore (< 30 min RTO). Documented restore procedure. Upgrade path to managed cloud (AWS/GCP) documented for when traffic justifies cost. |
| R6 | Email deliverability issues (magic link, alerts) | Medium | Medium — auth and alerts degraded | Use established transactional email provider (e.g., Resend, Postmark). SPF/DKIM/DMARC configured. Monitor bounce rates. Fallback: Google OAuth for auth. |
| R7 | Scope creep from v2 features | Medium | Medium — delays timeline | v2 features (ratings, ZIP-aware results, test bundles, bookmarks) are explicitly out of scope. Feature flags gate any premature surfaces. |
| R8 | Performance targets not met under load | Low | Medium — poor UX | Performance budgets established early (Phase 2). Load testing in Phase 6 with time to optimize. Redis caching and ISR reduce DB pressure. |

---

## Cross-Cutting Concerns (Every Phase)

These practices apply throughout all phases, not as a separate work item:

- **Testing**: Unit tests for services and utilities. Integration tests for API routes. E2E tests from Phase 2 onward (search-to-redirect flow). Tests written alongside implementation, not deferred.
- **Audit logging**: All privileged write operations log to `audit_logs` with actor, action, entity, and before/after state.
- **Observability**: Structured logging (JSON) from Phase 1. Metrics hooks added as features are built. Error tracking from Phase 6 (Sentry).
- **Documentation**: This document set kept current as implementation reveals adjustments. API endpoints documented inline (JSDoc / OpenAPI).
- **Feature flags**: Risky or incomplete surfaces gated behind flags. v2-scoped features never exposed without a flag.
- **Accessibility**: WCAG 2.1 AA compliance. Semantic HTML, keyboard navigation, ARIA labels, color contrast ratios. Verified in Phase 6.
- **Mobile responsiveness**: Mobile-first design throughout. All pages tested on 375px, 768px, and 1024px+ viewports.
- **Migrations**: Expand/contract pattern so production deploys and rollbacks never require down-migrations.

---

## Sequencing Notes

1. **Phase 3 is the long pole and legally gated.** Scraper framework development can proceed in parallel with legal review. The application functions fully on seed and manually-entered data until scraping is cleared per vendor.

2. **The public read path is independent of worker health.** If the scraper worker goes down, the app continues serving cached and last-known prices. Users are never impacted by scrape infrastructure failures.

3. **Phases 2 and 3 can partially overlap** if a second developer joins. Phase 3 depends on Phase 2's offerings service, but the scraper framework (tasks 3.1-3.6) depends only on Phase 1.

4. **Commit strategy**: Code is committed in logical, reviewable chunks within each phase (e.g., Phase 1: scaffold -> schema + migrations -> seed -> auth -> middleware), each with passing tests.

---

> **Next step after approval**: Begin Phase 1, starting with monorepo scaffold and database setup.
