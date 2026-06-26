# Deliverable #9 — Project Structure

This document defines the complete file-level layout of the LabPrice monorepo, explains the
reasoning behind each structural decision, and codifies the dependency and import rules that keep
the codebase maintainable as it scales.

---

## 1. Monorepo Tooling

| Tool | Role |
|---|---|
| **pnpm** | Package manager. Workspace protocol (`workspace:*`) links internal packages at dev time; strict hoisting prevents phantom deps. |
| **Turborepo** | Build orchestrator. `turbo.json` declares task dependency graph (`build`, `lint`, `test`, `typecheck`); Turbo caches and parallelizes across packages. |
| **TypeScript** | Project references via `tsconfig.json` per package; a root `tsconfig.base.json` holds shared compiler options. |

Packages are published **only** internally (never to npm). Consumers reference them by their
`package.json` `name` field (e.g., `@labprice/shared`).

---

## 2. Complete Repository Tree

```
labprice/
│
├── apps/
│   ├── web/                              # Next.js 15 App Router — public site + admin + API
│   │   ├── app/
│   │   │   ├── (public)/                 # Route group: no auth required
│   │   │   │   ├── page.tsx              # Home — hero section, search bar, popular tests,
│   │   │   │   │                         #   all-tests list, category pills
│   │   │   │   ├── test/
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx      # Test detail / Results page — price comparison table,
│   │   │   │   │                         #   best-price highlight, savings badge, clinical
│   │   │   │   │                         #   accordion (description, purpose, procedure,
│   │   │   │   │                         #   preparation, normal range), trend chart, codes
│   │   │   │   ├── category/
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx      # Category listing — tests filtered by category with
│   │   │   │   │                         #   price ranges and popular flags
│   │   │   │   ├── vendor/
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx      # Vendor profile — logo, trust level, all offerings,
│   │   │   │   │                         #   rating (v2)
│   │   │   │   ├── compare/
│   │   │   │   │   └── page.tsx          # Side-by-side comparison of multiple tests
│   │   │   │   └── l/
│   │   │   │       └── [slug]/
│   │   │   │           └── page.tsx      # SEO landing pages (driven by seo_pages table,
│   │   │   │                             #   FR-23 — "cheapest tsh test" etc.)
│   │   │   │
│   │   │   ├── (auth)/                   # Route group: authentication flows
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx          # Email input for magic link; Google OAuth button
│   │   │   │   └── verify/
│   │   │   │       └── page.tsx          # "Check your email" confirmation + code entry
│   │   │   │
│   │   │   ├── dashboard/                # Route group: logged-in user pages (role >= USER)
│   │   │   │   ├── page.tsx              # User home — saved tests with current prices + deltas
│   │   │   │   ├── alerts/
│   │   │   │   │   └── page.tsx          # Manage price-drop alerts (create, toggle, delete)
│   │   │   │   └── settings/
│   │   │   │       └── page.tsx          # Profile, notification preferences, GDPR export/delete
│   │   │   │
│   │   │   ├── admin/                    # Admin panel (Deliverable #6), role-gated
│   │   │   │   ├── layout.tsx            # Admin shell: sidebar nav, role check via
│   │   │   │   │                         #   requireRole(EDITOR), breadcrumbs
│   │   │   │   ├── page.tsx              # Dashboard — KPI cards (pending changes, scrape
│   │   │   │   │                         #   success/fail, zero-result searches, affiliate
│   │   │   │   │                         #   clicks, stalest vendors), activity feed
│   │   │   │   ├── changes/
│   │   │   │   │   └── page.tsx          # Change queue — staged_price_changes approval
│   │   │   │   │                         #   workflow (PENDING/ANOMALY filter, bulk
│   │   │   │   │                         #   approve/reject, keyboard shortcuts A/R/J/K)
│   │   │   │   ├── tests/
│   │   │   │   │   └── page.tsx          # Test catalog CRUD — name, slug, category, content
│   │   │   │   │                         #   fields, codes, biomarkers, SEO meta, live preview
│   │   │   │   ├── vendors/
│   │   │   │   │   └── page.tsx          # Vendor CRUD — affiliate URL template, trust level,
│   │   │   │   │                         #   priority, active toggle; tabs to scrape config
│   │   │   │   ├── offerings/
│   │   │   │   │   └── page.tsx          # Offering grid — current price, freshness badge,
│   │   │   │   │                         #   manual price set, re-scrape button
│   │   │   │   ├── scrape/
│   │   │   │   │   ├── configs/
│   │   │   │   │   │   └── page.tsx      # Scrape config editor — selectors, engine, schedule,
│   │   │   │   │   │                     #   rate limits, "test run" button (FR-18)
│   │   │   │   │   ├── monitor/
│   │   │   │   │   │   └── page.tsx      # Scraper monitor — jobs list, run history, per-vendor
│   │   │   │   │   │                     #   health SLOs (green/amber/red), "run now" (FR-21)
│   │   │   │   │   └── errors/
│   │   │   │   │       └── page.tsx      # Error logs — scrape_errors stream, filterable by
│   │   │   │   │                         #   type/vendor/date, links to config editor
│   │   │   │   ├── price-history/
│   │   │   │   │   └── page.tsx          # Price history — trend chart + tabular view per
│   │   │   │   │                         #   test/offering, source tags, CSV export
│   │   │   │   ├── users/
│   │   │   │   │   └── page.tsx          # User management — role changes, suspend/reactivate,
│   │   │   │   │                         #   GDPR export/delete (ADMIN+)
│   │   │   │   ├── analytics/
│   │   │   │   │   └── page.tsx          # Analytics — searches, clicks, top tests/vendors,
│   │   │   │   │                         #   zero-result queries, revenue proxy (FR-24)
│   │   │   │   ├── seo/
│   │   │   │   │   └── page.tsx          # SEO pages CMS — CRUD seo_pages, MDX body,
│   │   │   │   │                         #   live SEO preview, structured data validation
│   │   │   │   ├── flags/
│   │   │   │   │   └── page.tsx          # Feature flags — toggle v2 features (ratings,
│   │   │   │   │                         #   biomarker search, etc.)
│   │   │   │   ├── settings/
│   │   │   │   │   └── page.tsx          # System settings — tunables (SUPER_ADMIN only)
│   │   │   │   ├── proxies/
│   │   │   │   │   └── page.tsx          # Proxy pool management — CRUD proxies, health
│   │   │   │   │                         #   stats, rotation config (SUPER_ADMIN)
│   │   │   │   └── audit/
│   │   │   │       └── page.tsx          # Audit log — immutable record of all privileged
│   │   │   │                             #   mutations (actor, action, before/after)
│   │   │   │
│   │   │   ├── api/
│   │   │   │   ├── v1/                   # Versioned REST API (Deliverable #4)
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   └── route.ts      # register, magic-link, token exchange, refresh,
│   │   │   │   │   │                     #   logout, session (Auth.js integration)
│   │   │   │   │   ├── search/
│   │   │   │   │   │   └── route.ts      # Full-text search + autocomplete + biomarker search
│   │   │   │   │   ├── tests/
│   │   │   │   │   │   ├── route.ts      # GET /tests — list/filter with cursor pagination
│   │   │   │   │   │   └── [slug]/
│   │   │   │   │   │       ├── route.ts  # GET /tests/{slug} — full detail + offerings + best price
│   │   │   │   │   │       ├── offerings/
│   │   │   │   │   │       │   └── route.ts  # GET — price table (sort=price|alpha)
│   │   │   │   │   │       └── trend/
│   │   │   │   │   │           └── route.ts  # GET — cheapest-over-time series
│   │   │   │   │   ├── categories/
│   │   │   │   │   │   └── route.ts      # GET /categories — the 5 categories with test counts
│   │   │   │   │   ├── vendors/
│   │   │   │   │   │   ├── route.ts      # GET /vendors — public vendor directory
│   │   │   │   │   │   └── [slug]/
│   │   │   │   │   │       └── route.ts  # GET /vendors/{slug} — vendor profile
│   │   │   │   │   ├── go/
│   │   │   │   │   │   └── [offeringId]/
│   │   │   │   │   │       └── route.ts  # GET — 302 redirect to affiliate URL, logs click (BR-15)
│   │   │   │   │   ├── me/
│   │   │   │   │   │   ├── route.ts      # GET/PATCH/DELETE /me — profile, prefs, GDPR delete
│   │   │   │   │   │   ├── saved-tests/
│   │   │   │   │   │   │   └── route.ts  # GET/POST/DELETE — saved test management
│   │   │   │   │   │   ├── alerts/
│   │   │   │   │   │   │   └── route.ts  # GET/POST/PATCH/DELETE — price alert CRUD
│   │   │   │   │   │   └── notifications/
│   │   │   │   │   │       └── route.ts  # GET — alert delivery log
│   │   │   │   │   ├── analytics/
│   │   │   │   │   │   └── route.ts      # POST /events/pageview — beacon ingest (sampled)
│   │   │   │   │   └── admin/
│   │   │   │   │       ├── tests/
│   │   │   │   │       │   └── route.ts  # CRUD — catalog management (EDITOR+)
│   │   │   │   │       ├── vendors/
│   │   │   │   │       │   └── route.ts  # CRUD — vendor management (ADMIN)
│   │   │   │   │       ├── offerings/
│   │   │   │   │       │   └── route.ts  # CRUD + manual price set (ADMIN)
│   │   │   │   │       ├── changes/
│   │   │   │   │       │   └── route.ts  # Approval queue — approve/reject/bulk (EDITOR+)
│   │   │   │   │       ├── scrape/
│   │   │   │   │       │   └── route.ts  # Jobs, runs, errors, health, config, manual triggers
│   │   │   │   │       ├── users/
│   │   │   │   │       │   └── route.ts  # User management (ADMIN)
│   │   │   │   │       ├── analytics/
│   │   │   │   │       │   └── route.ts  # Overview, searches, clicks (ADMIN)
│   │   │   │   │       ├── feature-flags/
│   │   │   │   │       │   └── route.ts  # GET/PUT (ADMIN)
│   │   │   │   │       ├── settings/
│   │   │   │   │       │   └── route.ts  # GET/PUT system tunables (SUPER_ADMIN)
│   │   │   │   │       ├── seo-pages/
│   │   │   │   │       │   └── route.ts  # CMS CRUD (EDITOR+)
│   │   │   │   │       ├── proxies/
│   │   │   │   │       │   └── route.ts  # Proxy pool CRUD (SUPER_ADMIN)
│   │   │   │   │       └── audit-logs/
│   │   │   │   │           └── route.ts  # GET — audit trail (ADMIN)
│   │   │   │   │
│   │   │   │   ├── auth/
│   │   │   │   │   └── [...nextauth]/
│   │   │   │   │       └── route.ts      # Auth.js catch-all handler
│   │   │   │   └── health/
│   │   │   │       └── route.ts          # Liveness probe for load balancer / Docker healthcheck
│   │   │   │
│   │   │   ├── layout.tsx                # Root layout: html/body, fonts, theme provider,
│   │   │   │                             #   analytics script, metadata defaults
│   │   │   ├── globals.css               # Tailwind directives + CSS custom properties for
│   │   │   │                             #   design tokens (accent colors, best-price styles)
│   │   │   ├── sitemap.ts                # Dynamic XML sitemap (tests, categories, vendors,
│   │   │   │                             #   SEO landing pages)
│   │   │   ├── robots.ts                 # robots.txt (allow public, disallow admin/api)
│   │   │   ├── not-found.tsx             # Custom 404
│   │   │   └── error.tsx                 # Global error boundary
│   │   │
│   │   ├── components/
│   │   │   ├── public/                   # Components used by (public) route group
│   │   │   │   ├── SearchBar.tsx         # Autocomplete search (debounced, /search/autocomplete)
│   │   │   │   ├── PriceTable.tsx        # Sorted vendor price rows, best-price highlight,
│   │   │   │   │                         #   savings badge, affiliate "Order" links
│   │   │   │   ├── TestAccordion.tsx     # Collapsible clinical content sections
│   │   │   │   ├── TrendChart.tsx        # Price-over-time line chart (recharts or similar)
│   │   │   │   ├── CategoryPills.tsx     # Horizontal scrollable category filter
│   │   │   │   ├── TestCard.tsx          # Card for test listings (name, from-price, category)
│   │   │   │   ├── VendorRow.tsx         # Single row in price table
│   │   │   │   ├── SaveTestButton.tsx    # Save toggle (optimistic, auth-gated)
│   │   │   │   ├── AlertButton.tsx       # "Alert me" trigger for price-drop alerts
│   │   │   │   └── HeroSection.tsx       # Home page hero with search
│   │   │   │
│   │   │   ├── admin/                    # Components used by admin/ route group
│   │   │   │   ├── Sidebar.tsx           # Admin navigation sidebar
│   │   │   │   ├── KPICard.tsx           # Dashboard metric card
│   │   │   │   ├── ChangeRow.tsx         # Approval queue row with approve/reject actions
│   │   │   │   ├── DataTable.tsx         # Reusable sortable/filterable table for admin grids
│   │   │   │   ├── ConfigEditor.tsx      # Scrape config form with JSON selector editor
│   │   │   │   ├── HealthBadge.tsx       # Green/amber/red SLO indicator
│   │   │   │   └── ActivityFeed.tsx      # Recent audit log entries
│   │   │   │
│   │   │   └── shared/                   # Shared UI primitives (wrappers around @labprice/ui
│   │   │       │                         #   or app-specific shared components)
│   │   │       ├── Header.tsx            # Site header with nav, search, auth state
│   │   │       ├── Footer.tsx            # Site footer
│   │   │       ├── Breadcrumbs.tsx       # Dynamic breadcrumb trail
│   │   │       ├── Pagination.tsx        # Cursor-based pagination controls
│   │   │       ├── Toast.tsx             # Notification toasts (success, error, info)
│   │   │       ├── Modal.tsx             # Dialog/modal wrapper
│   │   │       ├── LoadingSpinner.tsx    # Loading states
│   │   │       └── SEOHead.tsx           # Structured data (JSON-LD) injection
│   │   │
│   │   ├── lib/
│   │   │   ├── auth.ts                   # Auth.js (NextAuth v5) configuration — providers
│   │   │   │                             #   (email magic-link, Google OAuth), Prisma adapter,
│   │   │   │                             #   session strategy, callbacks
│   │   │   ├── api-client.ts             # Typed fetch wrapper for /api/v1 endpoints; handles
│   │   │   │                             #   auth headers, error parsing, cursor pagination
│   │   │   ├── hooks/
│   │   │   │   ├── useSearch.ts          # Debounced search with autocomplete
│   │   │   │   ├── useSavedTests.ts      # Optimistic saved test state
│   │   │   │   └── useAlerts.ts          # Alert CRUD with SWR/React Query
│   │   │   └── utils.ts                  # Client-side helpers (formatting, date, URL building)
│   │   │
│   │   ├── middleware.ts                 # Next.js middleware: CSP headers, origin validation,
│   │   │                                 #   rate-limit hook integration, auth session
│   │   │                                 #   forwarding, admin route protection
│   │   ├── next.config.ts                # Next.js config: standalone output, image domains,
│   │   │                                 #   transpile packages, headers
│   │   ├── tailwind.config.ts            # Extends @labprice/config/tailwind preset; imports
│   │   │                                 #   design tokens from @labprice/ui
│   │   ├── tsconfig.json                 # Extends @labprice/config/tsconfig/nextjs.json;
│   │   │                                 #   path aliases for @/ imports
│   │   ├── package.json                  # name: @labprice/web
│   │   │                                 #   deps: @labprice/shared, @labprice/database,
│   │   │                                 #   @labprice/ui, next, react, next-auth, zod
│   │   └── Dockerfile                    # Multi-stage build (deps → build → runtime);
│   │                                     #   standalone output, non-root user, port 3000
│   │
│   └── worker/                           # Standalone BullMQ worker process
│       ├── src/
│       │   ├── index.ts                  # Entry point: boots Redis connection, registers all
│       │   │                             #   BullMQ workers, attaches graceful shutdown handlers
│       │   ├── queues/                   # Queue definitions + worker registrations
│       │   │   ├── scrape.queue.ts       # scrape queue: per-vendor fan-out jobs
│       │   │   ├── change-detect.queue.ts # Change detection after scrape completion
│       │   │   ├── alerts.queue.ts       # Alert evaluation on published price changes
│       │   │   ├── email.queue.ts        # Transactional email delivery (magic links,
│       │   │   │                         #   alert notifications, GDPR exports)
│       │   │   ├── analytics.queue.ts    # Nightly rollup of pageviews + searches into
│       │   │   │                         #   daily/weekly aggregation tables
│       │   │   ├── maintenance.queue.ts  # Partition management, stale data cleanup,
│       │   │   │                         #   session pruning
│       │   │   └── cache-warm.queue.ts   # Pre-warm Redis cache after deploys or
│       │   │                             #   after bulk price publishes
│       │   ├── processors/               # One file per job processor (pure business logic
│       │   │   │                         #   calls into @labprice/shared services and
│       │   │   │                         #   @labprice/scrapers)
│       │   │   ├── scrape.processor.ts   # Invokes VendorAdapter, writes scrape_results,
│       │   │   │                         #   enqueues change-detect on completion
│       │   │   ├── change-detect.processor.ts  # Runs ChangeDetector rules (BR-6/7/9),
│       │   │   │                         #   creates staged_price_changes rows
│       │   │   ├── alerts.processor.ts   # Evaluates user alerts against published changes,
│       │   │   │                         #   enqueues email for triggered alerts
│       │   │   ├── email.processor.ts    # Renders and sends via Brevo/Resend
│       │   │   ├── analytics.processor.ts # Aggregates raw events into rollup tables
│       │   │   └── maintenance.processor.ts # PG partition create/detach, old session cleanup
│       │   │
│       │   └── scheduler.ts              # Cron job definitions using BullMQ repeatables:
│       │                                 #   - Daily scrape fan-out (one job per active vendor)
│       │                                 #   - Nightly analytics rollup
│       │                                 #   - Weekly partition maintenance
│       │                                 #   - Cache warm after overnight scrape cycle
│       ├── tsconfig.json                 # Extends @labprice/config/tsconfig/node.json
│       ├── package.json                  # name: @labprice/worker
│       │                                 #   deps: @labprice/shared, @labprice/database,
│       │                                 #   @labprice/scrapers, bullmq, ioredis
│       └── Dockerfile                    # Includes Playwright Chromium for browser-based
│                                         #   scraping; non-root user
│
├── packages/
│   ├── database/                         # @labprice/database — Prisma schema + client
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # Complete data model (Deliverable #2): users,
│   │   │   │                             #   tests, vendors, offerings, price_history,
│   │   │   │                             #   staged_price_changes, scrape_*, alerts,
│   │   │   │                             #   affiliate_clicks, analytics_*, seo_pages,
│   │   │   │                             #   feature_flags, audit_logs, sessions, etc.
│   │   │   ├── migrations/               # Prisma-managed migrations + manual SQL for
│   │   │   │                             #   partitioning, GIN indexes, custom functions
│   │   │   └── seed.ts                   # Development seed data: 5 categories, 12 tests,
│   │   │                                 #   10 vendors, ~120 offerings, sample price
│   │   │                                 #   history, admin user
│   │   ├── src/
│   │   │   └── client.ts                 # Singleton PrismaClient with connection pooling,
│   │   │                                 #   query logging (dev), and graceful disconnect.
│   │   │                                 #   This is the ONLY file that instantiates
│   │   │                                 #   PrismaClient in the entire codebase.
│   │   ├── tsconfig.json
│   │   └── package.json                  # name: @labprice/database
│   │                                     #   deps: prisma, @prisma/client
│   │
│   ├── shared/                           # @labprice/shared — the domain core
│   │   ├── src/
│   │   │   ├── services/                 # Service layer: THE ONLY CODE THAT TOUCHES PRISMA.
│   │   │   │   │                         # Every database query lives here, not in route
│   │   │   │   │                         # handlers or components. This makes business logic
│   │   │   │   │                         # testable and reusable across web + worker.
│   │   │   │   ├── catalog.service.ts    # Test/category CRUD, search, filtering, slug
│   │   │   │   │                         #   resolution, popular tests, test detail assembly
│   │   │   │   ├── pricing.service.ts    # Offering queries, price table assembly, best-price
│   │   │   │   │                         #   calculation, manual price set, publish transaction
│   │   │   │   │                         #   (offering update + price_history insert)
│   │   │   │   ├── search.service.ts     # Full-text search (PG tsvector), autocomplete,
│   │   │   │   │                         #   biomarker-based search, search analytics logging
│   │   │   │   ├── alert.service.ts      # Alert CRUD, evaluation against price changes,
│   │   │   │   │                         #   notification creation
│   │   │   │   ├── change.service.ts     # Staged change queries, approve/reject transactions,
│   │   │   │   │                         #   bulk operations, anomaly flagging
│   │   │   │   ├── vendor.service.ts     # Vendor CRUD, scrape config management, trust level
│   │   │   │   ├── affiliate.service.ts  # Click logging, URL generation with {clickId}/
│   │   │   │   │                         #   {vendorSku} token interpolation, attribution
│   │   │   │   ├── analytics.service.ts  # Event ingestion, rollup queries, KPI calculations,
│   │   │   │   │                         #   zero-result query surfacing
│   │   │   │   ├── user.service.ts       # Profile, role management, GDPR export/delete
│   │   │   │   ├── scrape.service.ts     # Run/result/error queries, job management, health SLOs
│   │   │   │   ├── seo.service.ts        # SEO page CRUD, sitemap generation data
│   │   │   │   └── audit.service.ts      # Audit log writes (called by other services on
│   │   │   │                             #   privileged mutations)
│   │   │   │
│   │   │   ├── schemas/                  # Zod validation schemas — shared between API route
│   │   │   │   │                         # handlers (input validation) and frontend forms
│   │   │   │   │                         # (client-side validation). Also used to generate
│   │   │   │   │                         # OpenAPI spec types.
│   │   │   │   ├── test.schema.ts        # CreateTest, UpdateTest, TestQuery params
│   │   │   │   ├── vendor.schema.ts      # CreateVendor, UpdateVendor, AffiliateUrlTemplate
│   │   │   │   ├── offering.schema.ts    # CreateOffering, ManualPriceSet
│   │   │   │   ├── search.schema.ts      # SearchQuery, AutocompleteQuery
│   │   │   │   ├── alert.schema.ts       # CreateAlert, UpdateAlert
│   │   │   │   ├── auth.schema.ts        # RegisterInput, MagicLinkInput, TokenExchange
│   │   │   │   ├── change.schema.ts      # ApproveChange, RejectChange, BulkAction
│   │   │   │   ├── scrape-config.schema.ts # ScrapeVendorConfig (selectors, schedule, engine)
│   │   │   │   ├── pagination.schema.ts  # CursorPagination (cursor, limit)
│   │   │   │   └── common.schema.ts      # Slug, Id, DateRange, SortOrder
│   │   │   │
│   │   │   ├── rules/                    # Pure business rules — no I/O, fully unit-testable.
│   │   │   │   │                         # Referenced by BR-* codes from the PRD.
│   │   │   │   ├── change-detection.ts   # BR-6: delta threshold for auto-approve vs anomaly
│   │   │   │   │                         #   BR-7: trust-level-based auto-approve
│   │   │   │   │                         #   BR-9: anomaly flagging (>30% swing)
│   │   │   │   ├── pricing.ts            # BR-3: best-price ranking (price → vendor priority)
│   │   │   │   │                         #   BR-4: out-of-stock handling
│   │   │   │   ├── affiliate.ts          # BR-15: click attribution window, URL template
│   │   │   │   │                         #   token substitution rules
│   │   │   │   ├── alerts.ts             # BR-12: alert trigger conditions (below threshold,
│   │   │   │   │                         #   any drop, back-in-stock)
│   │   │   │   ├── freshness.ts          # BR-8: staleness thresholds, freshness scoring
│   │   │   │   └── tunables.ts           # All tunable constants (thresholds, limits, defaults)
│   │   │   │                             #   in one file; overridable via system_settings
│   │   │   │
│   │   │   ├── cache/                    # Redis cache-aside helpers
│   │   │   │   ├── cache.ts              # get/set/invalidate with tag-based invalidation;
│   │   │   │   │                         #   serialization; TTL management
│   │   │   │   └── tags.ts               # Cache tag definitions: test:{slug}, vendor:{slug},
│   │   │   │                             #   category:{slug}, search:{hash}, etc.
│   │   │   │
│   │   │   ├── auth/                     # RBAC utilities
│   │   │   │   ├── rbac.ts              # can(user, action, resource) policy function;
│   │   │   │   │                         #   role hierarchy USER < EDITOR < ADMIN < SUPER_ADMIN
│   │   │   │   └── require-role.ts       # requireRole(minRole) guard for route handlers
│   │   │   │                             #   and server actions — throws 403 on failure
│   │   │   │
│   │   │   ├── errors/                   # Custom error classes
│   │   │   │   ├── app-error.ts          # Base AppError: code (SNAKE_CASE), message, status,
│   │   │   │   │                         #   details; serializes to the API error envelope
│   │   │   │   ├── not-found.ts          # NotFoundError (404)
│   │   │   │   ├── validation.ts         # ValidationError (400/422) — wraps zod issues
│   │   │   │   ├── forbidden.ts          # ForbiddenError (403)
│   │   │   │   ├── conflict.ts           # ConflictError (409) — duplicate slug, etc.
│   │   │   │   └── rate-limited.ts       # RateLimitedError (429)
│   │   │   │
│   │   │   └── types/                    # Shared TypeScript types and DTOs
│   │   │       ├── models.ts             # Domain types (Test, Vendor, Offering, etc.) that
│   │   │       │                         #   mirror Prisma models but add computed fields
│   │   │       ├── api.ts                # API response envelope types, pagination types,
│   │   │       │                         #   error envelope type
│   │   │       ├── events.ts             # Queue job payload types (ScrapeJob, AlertJob, etc.)
│   │   │       └── config.ts             # ScrapeConfig, ProxyConfig, SystemSettings types
│   │   │
│   │   ├── tsconfig.json
│   │   └── package.json                  # name: @labprice/shared
│   │                                     #   deps: @labprice/database, zod, ioredis
│   │                                     #   NO frontend deps (react, next, etc.)
│   │
│   ├── scrapers/                         # @labprice/scrapers — scraping framework
│   │   ├── src/
│   │   │   ├── engines/                  # Browser/HTTP engines for fetching vendor pages
│   │   │   │   ├── playwright.engine.ts  # Playwright-based: full JS rendering, stealth
│   │   │   │   │                         #   plugin, screenshot capture for snapshots
│   │   │   │   ├── http.engine.ts        # Lightweight HTTP/fetch for simple HTML pages
│   │   │   │   │                         #   or JSON APIs (vendor data feeds)
│   │   │   │   └── engine.interface.ts   # Common Engine interface: fetch(url, config) →
│   │   │   │                             #   { html, screenshot?, headers }
│   │   │   │
│   │   │   ├── adapters/                 # Vendor adapter layer
│   │   │   │   ├── base.adapter.ts       # Config-driven default adapter: reads selectors,
│   │   │   │   │                         #   nav steps, price regex from scrape_vendor_configs;
│   │   │   │   │                         #   works for most vendors without custom code
│   │   │   │   └── hooks/                # Per-vendor hooks for sites that need custom logic
│   │   │   │       └── *.hook.ts         #   (e.g., pagination, CAPTCHA workaround, API auth)
│   │   │   │
│   │   │   ├── proxy/                    # Proxy management
│   │   │   │   └── proxy-manager.ts      # Round-robin/weighted rotation across proxy pool,
│   │   │   │                             #   health tracking, auto-disable on repeated failures,
│   │   │   │                             #   per-vendor proxy affinity
│   │   │   │
│   │   │   ├── normalize/                # Price normalization
│   │   │   │   ├── price-parser.ts       # Extract numeric price from messy strings
│   │   │   │   │                         #   ("$29.00", "29 USD", "From $29"), currency handling
│   │   │   │   └── stock-inference.ts    # Infer in-stock/out-of-stock from page signals
│   │   │   │                             #   ("Add to Cart" vs "Out of Stock", disabled buttons)
│   │   │   │
│   │   │   ├── detect/                   # Change detection (uses shared/rules)
│   │   │   │   └── change-detector.ts    # Compares scraped result to current offering,
│   │   │   │                             #   applies BR-6/7/9 rules, creates staged_price_changes
│   │   │   │
│   │   │   └── index.ts                  # Public API: createScrapeRunner(config) → runner
│   │   │
│   │   ├── tsconfig.json
│   │   └── package.json                  # name: @labprice/scrapers
│   │                                     #   deps: @labprice/shared, @labprice/database,
│   │                                     #   playwright, cheerio
│   │
│   ├── ui/                              # @labprice/ui — shared design system
│   │   ├── src/
│   │   │   ├── tokens/                   # Design tokens extracted from the prototype
│   │   │   │   ├── colors.ts             # Accent palette (Indigo primary, Emerald success,
│   │   │   │   │                         #   Sky info), semantic colors, best-price highlight
│   │   │   │   │                         #   (Green/Gold/Accent variants from prototype)
│   │   │   │   ├── typography.ts         # Font families, sizes, weights, line heights
│   │   │   │   └── spacing.ts            # Spacing scale, border radii, breakpoints
│   │   │   │
│   │   │   ├── components/               # Reusable UI primitives (headless or lightly styled)
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Badge.tsx             # Status badges (freshness, role, price change)
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Checkbox.tsx
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   ├── Tabs.tsx
│   │   │   │   ├── Dropdown.tsx
│   │   │   │   └── Skeleton.tsx          # Loading skeleton placeholders
│   │   │   │
│   │   │   └── index.ts                  # Barrel export of all tokens + components
│   │   │
│   │   ├── tsconfig.json
│   │   └── package.json                  # name: @labprice/ui
│   │                                     #   deps: react (peerDep), tailwind-merge, clsx
│   │                                     #   NO backend deps — this package is pure UI
│   │
│   └── config/                           # @labprice/config — shared tooling configurations
│       ├── eslint/
│       │   ├── base.js                   # Base ESLint config: strict TypeScript rules,
│       │   │                             #   import ordering, no unused vars
│       │   ├── next.js                   # Extends base + Next.js-specific rules
│       │   └── node.js                   # Extends base + Node.js-specific rules (worker)
│       │
│       ├── tsconfig/
│       │   ├── base.json                 # Shared compiler options: strict, ESNext target,
│       │   │                             #   paths, declaration
│       │   ├── nextjs.json               # Extends base + JSX, Next.js module resolution
│       │   └── node.json                 # Extends base + CommonJS interop for worker
│       │
│       └── tailwind/
│           └── preset.js                 # Shared Tailwind preset: imports @labprice/ui tokens,
│                                         #   custom plugins, common utilities
│
├── infra/                                # Infrastructure & deployment configuration
│   ├── docker/
│   │   ├── Dockerfile.web                # Alternative to apps/web/Dockerfile for CI builds
│   │   └── Dockerfile.worker             # Alternative to apps/worker/Dockerfile for CI builds
│   │
│   ├── docker-compose.yml                # Production: web, worker, postgres, redis
│   │                                     #   with resource limits, restart policies, healthchecks
│   ├── docker-compose.dev.yml            # Development override: hot reload, exposed ports,
│   │                                     #   volume mounts for live code, debug logging
│   │
│   ├── terraform/                        # AWS infrastructure (v2 — ECS/Fargate + RDS +
│   │   ├── main.tf                       #   ElastiCache + S3/R2); used when scale demands
│   │   ├── variables.tf                  #   migration from the single-VPS Docker Compose setup
│   │   ├── outputs.tf
│   │   └── modules/
│   │       ├── ecs/                      # ECS service definitions for web + worker
│   │       ├── rds/                      # PostgreSQL RDS configuration
│   │       ├── elasticache/              # Redis ElastiCache cluster
│   │       └── s3/                       # Object storage for snapshots + backups
│   │
│   └── grafana/                          # Monitoring dashboards
│       ├── scraper-health.json           # Per-vendor success rate, freshness, block rate
│       ├── api-performance.json          # Response times, error rates, throughput
│       └── business-kpis.json            # Searches, clicks, revenue proxy, alert triggers
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # On PR: lint, typecheck, test (unit + integration),
│       │                                 #   Prisma schema validation, build all packages
│       └── deploy.yml                    # On merge to main: build Docker images, push to
│                                         #   registry, deploy to VPS via SSH / ECS update
│
├── docs/                                 # Architecture documentation (Deliverables #1-#10)
│   ├── 01-prd.md                         # Product Requirements Document
│   ├── 02-database-design.md             # Database schema + ERD
│   ├── 03-backend-architecture.md        # Topology, service layer, queue design
│   ├── 04-api-design.md                  # REST API spec + endpoint catalog
│   ├── 05-scraper-architecture.md        # Scraping framework design
│   ├── 06-admin-panel.md                 # Admin screens + workflows
│   ├── 07-security.md                    # Auth, RBAC, input validation, threat model
│   ├── 08-deployment.md                  # Docker, CI/CD, infrastructure
│   ├── 09-project-structure.md           # This document
│   ├── 10-implementation-roadmap.md      # Phased build plan
│   ├── README.md                         # Doc index
│   ├── api/
│   │   └── openapi.yaml                  # OpenAPI 3.1 spec (generated from zod schemas)
│   └── database/
│       ├── schema.prisma                 # Reference copy of the Prisma schema
│       └── migrations.md                 # Migration strategy notes
│
├── project/                              # Original Claude Design prototype
│   └── support.js                        # Prototype support assets — the visual source of
│                                         #   truth for UI/UX decisions. @labprice/ui tokens
│                                         #   encode its accent themes and best-price styles.
│
├── turbo.json                            # Turborepo pipeline config: build, lint, test,
│                                         #   typecheck task dependencies and cache settings
├── pnpm-workspace.yaml                   # Workspace definition: apps/*, packages/*
├── package.json                          # Root: devDependencies (turbo, typescript),
│                                         #   scripts (dev, build, lint, test, db:migrate)
├── tsconfig.base.json                    # Root TypeScript config inherited by all packages
├── .env.example                          # Template: DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET,
│                                         #   NEXTAUTH_URL, SMTP_*, PROXY_*, S3_*, etc.
├── .gitignore                            # node_modules, .next, .env, dist, coverage
└── README.md                             # Project overview, setup instructions, dev workflow
```

---

## 3. Dependency Graph & Import Rules

The monorepo enforces a strict unidirectional dependency flow. Violations are caught by ESLint
import rules configured in `@labprice/config/eslint`.

```
┌─────────────────────────────────────────────────┐
│                    APPS LAYER                    │
│  ┌──────────┐                ┌───────────┐      │
│  │ apps/web │                │apps/worker│      │
│  └────┬─────┘                └─────┬─────┘      │
│       │ imports                    │ imports     │
└───────┼────────────────────────────┼────────────┘
        │                            │
        ▼                            ▼
┌─────────────────────────────────────────────────┐
│                  PACKAGES LAYER                  │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐   │
│  │packages/ │   │packages/ │   │ packages/  │   │
│  │   ui     │   │ scrapers │   │  shared    │   │
│  └──────────┘   └────┬─────┘   └──────┬─────┘   │
│   (no backend        │                │          │
│    deps)             │ imports        │ imports  │
│                      ▼                ▼          │
│              ┌───────────────────────────────┐   │
│              │     packages/database         │   │
│              └───────────────────────────────┘   │
│                                                  │
│  ┌──────────────────┐                            │
│  │ packages/config  │  (no runtime deps;         │
│  │                  │   tooling configs only)     │
│  └──────────────────┘                            │
└──────────────────────────────────────────────────┘
```

### Import rules (enforced)

| Rule | Rationale |
|---|---|
| **Apps import packages, NEVER the reverse.** Packages must never `import` from `apps/web` or `apps/worker`. | Keeps packages reusable and independently testable. A package should work without knowing which app consumes it. |
| **`packages/shared` imports from `packages/database` only.** It must not import from `scrapers`, `ui`, or `config`. | `shared` is the domain core. It depends on the data layer and nothing else. |
| **`packages/scrapers` imports from `packages/shared` and `packages/database`.** | Scrapers need domain types, business rules (change detection), and database access (via services). |
| **`packages/ui` has NO backend dependencies.** No imports from `database`, `shared`, or `scrapers`. React is a peer dependency. | The UI package must be usable in any frontend context. It provides visual primitives only. |
| **`packages/config` has NO runtime dependencies.** | Config packages provide build-time tooling (ESLint, TSConfig, Tailwind). They never appear in production bundles. |

### What each app depends on

| App | Packages | Why |
|---|---|---|
| `apps/web` | `@labprice/shared`, `@labprice/database`, `@labprice/ui` | Route handlers call services (shared), pages use UI components (ui), auth adapter needs Prisma (database). |
| `apps/worker` | `@labprice/shared`, `@labprice/database`, `@labprice/scrapers` | Processors call services (shared), scraping jobs use the scraper framework (scrapers), both need database access. |

---

## 4. Key Architectural Patterns

### 4.1. Service Layer (packages/shared/src/services/)

The service layer is the **only code that touches Prisma**. This is the single most important
structural rule in the codebase.

```
Route handler / Server action / Worker processor
         │
         ▼
   Service function (packages/shared/src/services/*.service.ts)
         │
         ▼
   PrismaClient (packages/database/src/client.ts)
         │
         ▼
   PostgreSQL
```

**Why?** Concentrating all database queries in one place means:
- Business logic is testable without spinning up a database (mock the service).
- The same query is reused by both `apps/web` (route handlers) and `apps/worker` (processors),
  eliminating duplication.
- Schema changes propagate from a single location.
- Query optimization happens in one place.

**Anti-pattern:** A route handler that directly calls `prisma.test.findMany(...)` is a violation.
Route handlers must call `catalogService.listTests(params)` instead.

### 4.2. Validation at the Edge

Every API route handler and server action parses its input through a Zod schema from
`packages/shared/src/schemas/` as its very first step. The parsed (and typed) result is passed
to the service layer.

```typescript
// apps/web/app/api/v1/tests/route.ts
import { testQuerySchema } from "@labprice/shared/schemas/test.schema";

export async function GET(req: Request) {
  const params = testQuerySchema.parse(Object.fromEntries(url.searchParams));
  const result = await catalogService.listTests(params);
  return Response.json({ data: result.data, nextCursor: result.nextCursor });
}
```

This means:
- The same schema validates both server-side API input and client-side form input (imported by
  `apps/web/components/`), ensuring consistent validation rules.
- Invalid data never reaches the service layer.
- TypeScript infers the correct types from the schema, so there is no separate type definition
  to keep in sync.

### 4.3. Error Handling

All custom errors extend `AppError` from `packages/shared/src/errors/app-error.ts`. Route
handlers catch these and serialize them to the standard error envelope:

```json
{ "error": { "code": "TEST_NOT_FOUND", "message": "No test with slug 'foo'", "details": {} } }
```

Services throw domain errors (`NotFoundError`, `ForbiddenError`, etc.). Route handlers have a
single error-handling wrapper that maps `AppError` subclasses to the correct HTTP status code.
Unexpected errors become 500 with a generic message (no stack leak).

### 4.4. Queue-Based Async Processing

The worker process and web app communicate exclusively through BullMQ queues backed by Redis.
The web app enqueues jobs (e.g., "send magic link email", "trigger manual scrape"); the worker
picks them up.

```
apps/web                              apps/worker
   │                                      │
   │  enqueue("email", { to, template })  │
   ├──────────────► Redis ◄───────────────┤
   │                                      │  dequeue + process
   │                                      │  emailProcessor → Brevo API
```

Job payloads are typed using interfaces from `packages/shared/src/types/events.ts`, so both
sides agree on the shape.

### 4.5. Cache Strategy

Redis cache-aside is implemented in `packages/shared/src/cache/`. Services call `cache.get()`
before querying Postgres, and `cache.set()` after. Invalidation uses tag-based clearing:
publishing a price change invalidates all cache entries tagged with `test:{slug}` and
`vendor:{slug}`.

### 4.6. Design Token Pipeline

The prototype (`project/`) is the visual source of truth. Its accent themes (Indigo, Emerald,
Sky) and best-price highlight styles (Green, Gold, Accent) are encoded as TypeScript constants
in `packages/ui/src/tokens/`. The Tailwind preset in `packages/config/tailwind/preset.js`
imports these tokens so that all apps share the same design language without duplicating values.

---

## 5. Test Organization

Tests are colocated with their source files:

```
packages/shared/src/services/catalog.service.ts
packages/shared/src/services/catalog.service.test.ts    # Unit test (mocked Prisma)

packages/shared/src/rules/change-detection.ts
packages/shared/src/rules/change-detection.test.ts      # Pure function tests

packages/scrapers/src/normalize/price-parser.ts
packages/scrapers/src/normalize/price-parser.test.ts    # Parser edge cases

apps/web/e2e/                                           # Playwright E2E tests
apps/web/e2e/home.spec.ts
apps/web/e2e/test-detail.spec.ts
apps/web/e2e/admin-changes.spec.ts
```

**Why colocated?** Finding the test for a module is trivial (same directory, `.test.ts` suffix).
When a module is deleted, its test is naturally deleted too. The alternative (a parallel `__tests__`
tree) creates drift and makes refactoring harder.

Integration tests that need a real database use a Docker-based test Postgres spun up by
`docker-compose.dev.yml`. E2E tests live in `apps/web/e2e/` and run via Playwright against the
full running application.

---

## 6. Configuration Files at Root

| File | Purpose |
|---|---|
| `turbo.json` | Task pipeline: `build` depends on `^build` (build deps first), `lint` and `test` run in parallel, outputs are cached. |
| `pnpm-workspace.yaml` | Declares workspace packages: `apps/*` and `packages/*`. |
| `package.json` | Root scripts (`dev`, `build`, `lint`, `test`, `db:migrate`, `db:seed`, `db:studio`); devDependencies for Turbo and TypeScript. |
| `tsconfig.base.json` | Shared TypeScript compiler options: `strict: true`, `esModuleInterop`, `resolveJsonModule`, `declaration`. |
| `.env.example` | Template for all environment variables needed across the monorepo: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, SMTP credentials, proxy pool config, S3/R2 credentials, Sentry DSN. |
| `.gitignore` | Standard ignores: `node_modules`, `.next`, `.env` (not `.env.example`), `dist`, `coverage`, `.turbo`, `prisma/*.db`. |

---

## 7. Development Workflow

```bash
# 1. Clone + install
git clone <repo> && cd labprice
cp .env.example .env          # fill in local values
pnpm install                  # installs all workspaces

# 2. Start infrastructure
docker compose -f infra/docker-compose.dev.yml up -d   # postgres + redis

# 3. Set up database
pnpm db:migrate               # runs prisma migrate dev
pnpm db:seed                  # seeds development data

# 4. Start development
pnpm dev                      # turbo runs apps/web (next dev) + apps/worker (tsx watch)

# 5. Common tasks
pnpm lint                     # ESLint across all packages
pnpm typecheck                # TypeScript --noEmit across all packages
pnpm test                     # Vitest across all packages
pnpm db:studio                # Opens Prisma Studio for data inspection
```

Turborepo parallelizes `lint`, `typecheck`, and `test` across packages and caches results.
Changing a file in `packages/shared` triggers rebuilds of all downstream consumers
(`apps/web`, `apps/worker`, `packages/scrapers`) but not unrelated packages (`packages/ui`).

---

## 8. Adding a New Package

To add a new internal package (e.g., `packages/email-templates`):

1. Create `packages/email-templates/package.json` with `"name": "@labprice/email-templates"`.
2. Create `packages/email-templates/tsconfig.json` extending `@labprice/config/tsconfig/base.json`.
3. Add `@labprice/email-templates` as a dependency in the consuming app's `package.json`
   using the workspace protocol: `"@labprice/email-templates": "workspace:*"`.
4. Run `pnpm install` to link the new package.
5. Ensure the import direction follows the dependency graph (section 3).

Turborepo automatically discovers the new package via `pnpm-workspace.yaml` globs.
