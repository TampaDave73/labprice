# Deliverable #3 — Backend Architecture

> **LabPrice** — Lab Test Price Comparison Platform
> Document version: 1.0 | Last updated: 2026-06-26

---

## Table of Contents

1. [System Topology](#1-system-topology)
2. [Technology Justification](#2-technology-justification)
3. [Service Layer Architecture](#3-service-layer-architecture)
4. [Request & Write Flows](#4-request--write-flows)
5. [Caching Strategy](#5-caching-strategy)
6. [Background Job Architecture](#6-background-job-architecture)
7. [Error Handling](#7-error-handling)
8. [Scaling Path](#8-scaling-path)

---

## 1. System Topology

Three long-running processes deployed from a single pnpm + Turborepo monorepo:

```
                         ┌──────────────────────────────────────────────────┐
            Cloudflare   │               VPS / AWS (Docker Compose)         │
  Users ──► CDN + WAF ──►│                                                  │
            + edge cache │  ┌─────────────────────┐   ┌───────────────────┐ │
                         │  │  web (Next.js 15)    │   │  worker           │ │
                         │  │  ─────────────────── │   │  ─────────────── │ │
                         │  │  App Router SSR/ISR  │   │  BullMQ consumers │ │
                         │  │  /api/v1 REST routes │   │  Playwright       │ │
                         │  │  Admin panel         │   │  scraping runtime │ │
                         │  │  Auth.js v5          │   │                   │ │
                         │  └─────────┬────────────┘   └────────┬──────────┘ │
                         │            │                         │            │
                         │      ┌─────┴──────┐     ┌───────────┴─────────┐  │
                         │      │ PostgreSQL │     │       Redis 7       │  │
                         │      │    16      │     │  cache + queues +   │  │
                         │      │  (Prisma)  │     │  rate-limit + locks │  │
                         │      └────────────┘     └─────────────────────┘  │
                         │            ▲                        ▲            │
                         │            │     ┌──────────────────┴──────────┐ │
                         │            └─────│ scheduler (cron fan-out)    │ │
                         │                  └────────────────────────────┘ │
                         │                                                  │
                         │   Object store (S3/R2): HTML snapshots,          │
                         │   screenshots, database backups                  │
                         └──────────────────────────────────────────────────┘
                                    Proxy pool ──► ordering service sites
```

### Process Descriptions

**`web` — Next.js 15 App Router**

The primary HTTP-serving process. Responsibilities:

- **SSR/ISR for public pages**: Test detail pages, comparison tables, search results, and landing pages are server-rendered for SEO and served via Incremental Static Regeneration with Cloudflare edge caching in front.
- **`/api/v1` REST routes**: A versioned JSON API consumed by the frontend (and future mobile apps). Handles search, filtering, user preferences, alert management, and admin operations.
- **Admin panel**: Protected routes under `/admin` for managing ordering services, reviewing staged price changes, monitoring scrape health, and system configuration.
- **Auth.js v5**: Handles authentication (magic link + OAuth), session management with database-backed sessions, and role-based access control.

The web process is stateless — all state lives in PostgreSQL and Redis — so it scales horizontally behind Cloudflare with zero coordination.

**`worker` — BullMQ Consumers**

A long-running Node.js process (started via `tsx`) that processes background jobs from Redis-backed BullMQ queues. Never serves HTTP user traffic. Responsibilities:

- Scraping ordering service websites via Playwright through a proxy pool
- Detecting price changes and applying business rules (anomaly detection, auto-approval thresholds)
- Evaluating triggered price alerts and batching notification sends
- Sending transactional emails via Resend (magic links, alert notifications, admin digests)
- Aggregating analytics data (search logs, page views) into rollup tables
- Database maintenance (partition creation, stale data cleanup)

The worker scales independently of web — add concurrency or additional worker instances without affecting page-serving latency.

**`scheduler` — Cron Fan-Out**

A lightweight process (or BullMQ repeatable jobs registered at startup) that enqueues work on a schedule. It does not execute jobs itself — it only creates them:

- Daily scrape fan-out: enqueues one `scrape` job per active ordering service
- Hourly analytics aggregation: enqueues rollup jobs for search logs and page views
- Nightly maintenance: enqueues partition creation and stale data cleanup
- Periodic cache warming for high-traffic pages

The scheduler can run as a separate Docker container or as a startup routine inside the worker process. Keeping it conceptually separate ensures cron logic is isolated from job execution logic.

### Shared Packages

All three processes share code through Turborepo internal packages:

| Package | Contents | Used By |
|---|---|---|
| `packages/database` | Prisma schema, migrations, client instance | web, worker, scheduler |
| `packages/shared` | Service layer, Zod schemas, types, DTOs, business rules | web, worker |
| `packages/scrapers` | Per-ordering-service scraper adapters, parsing logic | worker |

This prevents business logic duplication while allowing each process to include only the code it needs.

### Why Next.js Full-Stack (Not a Separate API)

For a **read-heavy** comparison site whose writes are batch operations (scraping) rather than interactive user input, a single Next.js application that renders pages *and* exposes a JSON API removes:

- A network hop between frontend and API
- A second deployment target with its own CI/CD
- A duplicate authentication layer

Background work — the only part that genuinely needs a separate runtime — is already cleanly split into the worker. The public API remains first-class and versioned (`/api/v1`) so a mobile app or partners can consume it without touching pages. If a domain outgrows route handlers, we extract it behind the stable API contract into a dedicated service.

---

## 2. Technology Justification

### Next.js 15 (App Router)

**Why**: LabPrice is fundamentally an SEO-driven content site. Every test comparison page must be indexable, fast-loading, and shareable. Next.js provides SSR and ISR out of the box, eliminating the need for a separate SSR layer or a static site generator with a decoupled API.

**Trade-offs considered**:
- *vs. Remix*: Remix has excellent data-loading patterns, but Next.js has a larger ecosystem, better Vercel/Cloudflare deployment story, and more community resources for troubleshooting. ISR (time-based revalidation) is particularly well-suited to price data that updates daily, not on every request.
- *vs. Astro*: Astro excels at static content sites, but LabPrice needs authenticated user features (saved alerts, admin panel) and dynamic search — areas where Astro's island architecture adds complexity.
- *vs. Separate SPA + API*: Adds a network hop, doubles deployment complexity, and splits SSR responsibility. Not justified when the API surface is modest.

**Key features used**: App Router with React Server Components (direct service calls from server components without API round-trips), route handlers for `/api/v1`, middleware for auth guards, ISR with `revalidateTag` for cache-tag-based invalidation.

### TypeScript

**Why**: End-to-end type safety from database schema (Prisma generates types) through service layer (typed DTOs) to API (Zod schemas infer TypeScript types) to React components. In a price comparison platform where data integrity is the product, catching shape mismatches at compile time prevents entire categories of bugs.

**Trade-offs**: Slower initial development vs. plain JavaScript, but the project has 10+ ordering services each returning differently-shaped data — TypeScript catches adapter mismatches that would otherwise surface as silent data corruption in production.

### Tailwind CSS

**Why**: Utility-first CSS that produces consistent, maintainable styling without naming conventions or CSS-in-JS runtime cost. The comparison table UI — LabPrice's core interface — benefits from Tailwind's responsive utilities and design tokens (custom colors for best-price highlights, accent states).

**Trade-offs**:
- *vs. CSS Modules*: CSS Modules provide better isolation but slower iteration on responsive layouts. Tailwind's `@apply` and component extraction handle the few cases where utility classes become unwieldy.
- *vs. Chakra/MUI*: Component libraries accelerate prototyping but add bundle weight and fight customization. LabPrice's UI is bespoke enough (comparison tables, price trend charts) that a component library would be more constraint than accelerant.

### PostgreSQL 16

**Why**: The data model is fundamentally relational — tests have many offerings, offerings belong to ordering services, prices have history. PostgreSQL provides:

- **Referential integrity** for the catalog (foreign keys, constraints, cascades)
- **Native partitioning** for time-series tables (`price_history`, `search_logs`, `page_views`) — partition by month, drop old partitions cheaply
- **Full-text search + trigram index** (`pg_trgm`) for test search and autocomplete — eliminates a separate search engine in v1
- **JSONB columns** for flexible scraper configuration per ordering service
- **Window functions and CTEs** for price trend analytics and comparison queries

**Trade-offs**:
- *vs. MySQL*: PostgreSQL's partitioning, full-text search, and JSONB support are more mature. The trigram extension alone saves adding Elasticsearch/Meilisearch.
- *vs. adding Elasticsearch*: For v1 with ~2,000 tests and ~20,000 offerings, PostgreSQL FTS with trigram handles search latency under 50ms. We avoid the operational burden of a search cluster until query volume demands it.

### Prisma

**Why**: Type-safe ORM that generates TypeScript types from the schema, provides first-class migration tooling, and has a readable schema language. The generated client catches query errors at compile time — critical when 10 different scraper adapters write to the same tables.

**Trade-offs**:
- *vs. Drizzle*: Drizzle is lighter and closer to SQL, but Prisma's migration system and schema-as-documentation are more valuable for a team project. Prisma's `$queryRaw` escape hatch handles the advanced SQL (partitioning DDL, FTS queries) that the ORM doesn't cover.
- *vs. raw SQL*: Raw SQL is faster to write for complex queries but loses type safety and migration management. We use `$queryRaw` selectively for partition management and full-text search while keeping CRUD operations in the type-safe client.

### Redis 7

**Why**: A single Redis instance serves three roles, reducing infrastructure:

1. **Cache**: Cache-aside for hot queries (test details, search results, offering lists)
2. **Job queue backend**: BullMQ stores job state, handles retries, and manages repeatable schedules
3. **Rate limiting**: Sliding-window counters for API rate limits and scrape throttling

**Trade-offs**:
- *vs. Memcached*: Redis provides persistence (AOF), data structures (sorted sets for rate limiting, hashes for structured cache), and BullMQ compatibility. Memcached is simpler but would require a separate queue backend.
- *vs. Upstash*: Upstash serverless Redis works for cache-only use cases but BullMQ needs a persistent connection, making a managed Redis instance (or self-hosted) necessary.

### BullMQ

**Why**: Production-grade job queue built on Redis with retries, exponential backoff, concurrency control, repeatable jobs, rate limiting, and dead-letter queues. Handles all background work without adding infrastructure (uses the same Redis as caching).

**Trade-offs**:
- *vs. RabbitMQ/SQS*: These are more robust at massive scale but add operational overhead (separate service, different protocol). BullMQ's Redis-backed architecture handles LabPrice's job volume (hundreds of jobs/day, not millions) with zero additional infrastructure.
- *vs. pg-boss*: Postgres-backed queues avoid Redis dependency but add write load to the database and lack BullMQ's concurrency controls and dashboard tooling.

### Auth.js v5 (NextAuth)

**Why**: Native Next.js integration with App Router, Prisma adapter for database-backed sessions, built-in magic-link and OAuth provider support. Handles the authentication plumbing (CSRF, session rotation, token refresh) that is dangerous to implement manually.

**Trade-offs**:
- *vs. Clerk/Auth0*: Third-party auth services are faster to set up but add per-MAU cost, vendor lock-in, and an external dependency for every page load (session verification). Auth.js keeps sessions in our database, giving full control over the user model and RBAC layer we build on top.
- *vs. Lucia*: Lucia is lighter but Auth.js v5 has better Next.js App Router integration and a larger community. The Prisma adapter means sessions and accounts are in our database with zero custom code.

### Playwright

**Why**: Modern headless browser automation with first-class TypeScript support, excellent anti-detection ergonomics (stealth plugins), and reliable cross-browser page interaction. Ordering service websites range from simple static pages to heavy SPAs — Playwright handles both.

**Trade-offs**:
- *vs. Puppeteer*: Playwright has better multi-browser support, more reliable auto-waiting, and a more ergonomic API. The stealth ecosystem is comparable.
- *vs. HTTP-only scraping (Cheerio)*: Some ordering services render prices client-side via JavaScript. Playwright handles these universally; we can optimize specific adapters to use HTTP-only fetching where possible for speed.

### Resend

**Why**: Developer-friendly transactional email API with excellent deliverability, React Email template support (consistent with our stack), and simple pricing. Used for magic-link authentication emails, price alert notifications, and admin digest reports.

**Trade-offs**:
- *vs. SendGrid/Postmark*: Resend's React Email integration means email templates are React components in the monorepo, type-checked and version-controlled. SendGrid and Postmark have more features but Resend covers transactional email well at lower complexity.
- *Abstraction*: Email sending is behind an interface (`EmailProvider`) so swapping to Postmark or SES requires changing one adapter, not every call site.

### Sentry

**Why**: Error tracking with source maps, performance monitoring, and distributed tracing across the web and worker processes. Breadcrumbs capture the request/job context leading to an error, critical for debugging scraper failures against third-party sites.

**Trade-offs**:
- *vs. self-hosted logging only*: Sentry provides alerting, deduplication, issue assignment, and release tracking that structured logs alone do not. For a small team, Sentry's free tier covers the error volume while eliminating the need to build alerting infrastructure.

### Docker

**Why**: Reproducible builds across development, CI, and production. All three processes (web, worker, scheduler) share a base image with Playwright browsers pre-installed, ensuring scraper behavior is identical across environments.

**Trade-offs**:
- *vs. bare-metal/PM2*: Docker Compose provides process orchestration, health checks, restart policies, and log aggregation. PM2 handles process management but doesn't provide the isolation, reproducibility, or scaling path to container orchestrators (ECS, Kubernetes).

### Cloudflare

**Why**: CDN, WAF, DDoS protection, and edge caching in a single free/cheap service. For a read-heavy comparison site, Cloudflare's edge cache absorbs the vast majority of traffic, keeping VPS costs low.

**Trade-offs**:
- *vs. AWS CloudFront*: Cloudflare's free tier includes WAF and DDoS protection that CloudFront charges for separately. Cache-tag purging (Enterprise feature or via API) enables targeted invalidation when prices change.
- *vs. no CDN*: Not an option — test comparison pages will be indexed by search engines and linked from health forums. A single VPS without edge caching would buckle under crawl traffic.

---

## 3. Service Layer Architecture

### Design Principles

The service layer in `packages/shared/services/` is the **sole consumer of Prisma** in the application. No route handler, React Server Component, or worker job calls Prisma directly. This provides:

1. **Single point of enforcement** for business rules, validation, and authorization
2. **Testability** — services can be unit-tested with a mock Prisma client
3. **Cache coherence** — all cache reads and invalidations flow through one layer
4. **Portability** — if a domain moves to a separate service, the service class moves with it

### Service Constructor Pattern

Every service follows the same constructor pattern:

```typescript
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

export class TestService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async getBySlug(input: GetTestBySlugInput): Promise<TestDetailDTO> {
    // 1. Validate input with Zod
    const parsed = getTestBySlugSchema.parse(input);

    // 2. Check Redis cache
    const cacheKey = `lp:test:${parsed.slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 3. Query via Prisma
    const test = await this.prisma.test.findUnique({
      where: { slug: parsed.slug },
      include: { offerings: { include: { vendor: true } } },
    });
    if (!test) throw new NotFoundError('Test', parsed.slug);

    // 4. Map to DTO (strip internal fields)
    const dto = mapTestToDetailDTO(test);

    // 5. Cache result
    await this.redis.setex(cacheKey, 600, JSON.stringify(dto));

    return dto;
  }
}
```

Key conventions:
- **Constructor injection** of `prisma` and `redis` (no singletons, enables testing)
- **Zod validation** on every public method input — schemas live in `packages/shared/schemas/`
- **Typed DTO returns** — services never return Prisma model objects; they return plain DTOs defined in `packages/shared/types/`
- **Cache-aside** built into the service, not sprinkled across route handlers

### Service Inventory

| Service | Responsibility | Key Methods |
|---|---|---|
| **TestService** | CRUD for lab tests, slug lookup, search, autocomplete, category browsing | `getBySlug`, `search`, `autocomplete`, `listByCategory`, `listPopular`, `create`, `update` |
| **VendorService** | Ordering service management, status toggling, configuration | `getAll`, `getBySlug`, `create`, `update`, `toggleActive`, `getConfig` |
| **OfferingService** | Price offerings (test × ordering service), comparisons, price history, trend data | `getForTest`, `compare`, `getPriceHistory`, `getTrend`, `upsert`, `publishChange` |
| **SearchService** | Full-text search with trigram matching, faceted filtering, search logging | `search`, `suggest`, `logSearch`, `getPopularSearches` |
| **AlertService** | User price alert CRUD, evaluation against price changes, notification generation | `create`, `getForUser`, `delete`, `evaluateForOffering`, `getTriggeredAlerts` |
| **AffiliateService** | Affiliate link generation, click tracking, revenue attribution | `generateLink`, `trackClick`, `getClickStats`, `getRevenueReport` |
| **ScrapeService** | Scrape run management, result ingestion, change detection, anomaly flagging | `createRun`, `ingestResults`, `detectChanges`, `stageChanges`, `getRunHistory` |
| **AnalyticsService** | Search log aggregation, page view rollups, trend computation, admin dashboards | `aggregateSearches`, `aggregatePageViews`, `getSearchTrends`, `getDashboardStats` |
| **UserService** | User profile management, preferences, session queries | `getProfile`, `updatePreferences`, `deleteAccount`, `getSessionHistory` |
| **AdminService** | Admin operations: staged change review, system health, ordering service monitoring | `getPendingChanges`, `approveChange`, `rejectChange`, `getSystemHealth`, `getScraperStatus` |

### Service Instantiation

Services are instantiated once per process via a factory that injects shared Prisma and Redis clients:

```typescript
// packages/shared/services/index.ts
export function createServices(prisma: PrismaClient, redis: Redis) {
  return {
    tests: new TestService(prisma, redis),
    vendors: new VendorService(prisma, redis),
    offerings: new OfferingService(prisma, redis),
    search: new SearchService(prisma, redis),
    alerts: new AlertService(prisma, redis),
    affiliates: new AffiliateService(prisma, redis),
    scrape: new ScrapeService(prisma, redis),
    analytics: new AnalyticsService(prisma, redis),
    users: new UserService(prisma, redis),
    admin: new AdminService(prisma, redis),
  };
}
```

In the web process, this is called once at startup and the result is available to all route handlers and server components. In the worker process, the same factory creates services scoped to the worker's Prisma/Redis instances.

### Usage in Route Handlers

```typescript
// apps/web/app/api/v1/tests/[slug]/route.ts
import { services } from '@/lib/services';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const dto = await services.tests.getBySlug({ slug: params.slug });
  return Response.json({ data: dto });
}
```

Route handlers are thin: validate auth, call service, shape response. No Prisma, no Redis, no business logic.

### Usage in Server Components

```typescript
// apps/web/app/tests/[slug]/page.tsx
import { services } from '@/lib/services';

export default async function TestPage({ params }: { params: { slug: string } }) {
  const test = await services.tests.getBySlug({ slug: params.slug });
  return <TestDetailView test={test} />;
}
```

Server components call services directly — no API round-trip needed during SSR.

---

## 4. Request & Write Flows

### Read Path (User Views a Test Page)

```
1. Browser requests /tests/cbc
2. Cloudflare checks edge cache
   ├─ HIT  → serve cached HTML (< 10ms TTFB)
   └─ MISS → forward to Next.js origin
3. Next.js App Router renders TestPage (Server Component)
4. TestPage calls services.tests.getBySlug({ slug: 'cbc' })
5. TestService checks Redis cache (key: lp:test:cbc)
   ├─ HIT  → return cached DTO
   └─ MISS → query Prisma → map to DTO → cache in Redis (10min TTL) → return
6. TestPage calls services.offerings.getForTest({ testId })
7. OfferingService checks Redis cache (key: lp:offerings:{testId})
   ├─ HIT  → return cached offerings
   └─ MISS → query Prisma (with vendor join) → sort by price → cache → return
8. Next.js returns HTML with Cache-Control: s-maxage=3600, stale-while-revalidate=600
9. Cloudflare caches the response at the edge for future requests
```

### Write Path (Scraping to Publication)

```
1. scheduler enqueues one scrape job per active ordering service → BullMQ 'scrape' queue
2. worker picks up scrape:{vendor} job (concurrency 3, Redis lock per vendor)
3. Worker loads scrape_vendor_configs, launches Playwright via proxy
4. Playwright navigates ordering service site, extracts prices
5. Worker writes scrape_runs + scrape_results + scrape_errors to PostgreSQL
6. Change detection: compare parsed prices vs offerings.current_price
   ├─ Within threshold → AUTO_APPROVED, write to staged_price_changes
   ├─ Exceeds threshold → ANOMALY, flag for admin review
   └─ No change → skip
7. Admin approves change (or auto-approve fires) → transaction:
   a. UPDATE offerings SET current_price = new_price
   b. INSERT INTO price_history
   c. Enqueue alerts:evaluate job
8. alerts:evaluate finds matching price_alerts → writes alert_notifications → enqueues email:send
9. Cache invalidation:
   a. DELETE Redis keys: lp:test:{slug}, lp:offerings:{testId}
   b. Purge Cloudflare cache tags for affected test pages
```

---

## 5. Caching Strategy

### Three Cache Layers

| Layer | Scope | TTL | Invalidation |
|---|---|---|---|
| **Cloudflare edge** | Anonymous public pages | 1 hour (`s-maxage=3600`) | `stale-while-revalidate=600` + cache-tag purge on price changes |
| **Redis (application)** | Service layer query results | 5–10 minutes | Tag-based purge on price publication |
| **Next.js ISR** | Page-level revalidation | On-demand via `revalidateTag` | Triggered by price publication |

### Redis Cache-Aside Pattern

Every service method that reads frequently-accessed data follows cache-aside:

1. **Read**: Check Redis first. On hit, return parsed JSON. On miss, query Prisma, cache result, return.
2. **Write**: After a mutation, delete affected cache keys (never update in place — avoids stale partial updates).
3. **TTL**: All keys have a TTL as a safety net. Even without explicit invalidation, stale data expires.

### Key Naming Convention

All Redis keys are prefixed with `lp:` (LabPrice) to namespace within a shared Redis instance:

| Key Pattern | Data | TTL | Invalidated By |
|---|---|---|---|
| `lp:tests:list` | Paginated test catalog | 10 min | Test create/update |
| `lp:test:{slug}` | Single test detail DTO | 10 min | Test update, offering price change |
| `lp:offerings:{testId}` | Offerings for a test (sorted by price) | 10 min | Price publication for any offering of this test |
| `lp:search:{hash}` | Search results (hash of query + filters) | 5 min | Time-based expiry only |
| `lp:ac:{normalizedQuery}` | Autocomplete suggestions | 5 min | Time-based expiry only |
| `lp:home:v1` | Homepage payload (popular tests, stats) | 10 min | Any catalog or price change |
| `lp:trend:{offeringId}:{range}` | Price trend data for charts | 1 hour | Price publication |
| `lp:vendor:{slug}` | Ordering service detail | 30 min | Vendor update |
| `lp:rl:{ip\|userId}:{route}` | Rate-limit sliding window counter | Sliding | N/A (auto-expires) |

### Cache Invalidation: Tag-Based Purge

When a price change is published, the `OfferingService.publishChange` method invalidates all affected caches in a single operation:

```typescript
async publishChange(changeId: string): Promise<void> {
  // ... transaction to update offering + price_history ...

  // Invalidate Redis
  const keys = [
    `lp:test:${test.slug}`,
    `lp:offerings:${offering.testId}`,
    `lp:home:v1`,
    `lp:trend:${offering.id}:30d`,
    `lp:trend:${offering.id}:90d`,
  ];
  await this.redis.del(...keys);

  // Invalidate Cloudflare edge cache
  await purgeCloudflareByTag(`test:${test.slug}`);

  // Trigger Next.js ISR revalidation
  revalidateTag(`test:${test.slug}`);
}
```

### Cloudflare Edge Caching

Public pages set response headers that Cloudflare respects:

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=600
Cache-Tag: test:{slug}, tests-list, homepage
```

- `s-maxage=3600`: Cloudflare caches for 1 hour
- `stale-while-revalidate=600`: Cloudflare serves stale content for up to 10 minutes while fetching fresh in the background
- `Cache-Tag`: Enables targeted purging — when a CBC test price changes, purge only pages tagged `test:cbc` instead of the entire cache

Authenticated pages (`/dashboard`, `/admin`) set `Cache-Control: private, no-store` and are never edge-cached.

---

## 6. Background Job Architecture

### BullMQ Queue Overview

All background work runs through BullMQ queues backed by Redis 7. Each queue has defined concurrency, retry behavior, and dead-letter handling.

| Queue | Purpose | Concurrency | Rate Limit | Retry Strategy |
|---|---|---|---|---|
| `scrape` | Scrape ordering service websites | 3 | 1 per vendor (Redis lock) | 3 retries, exponential backoff (30s, 2min, 10min) |
| `alerts` | Evaluate triggered alerts, batch notifications | 5 | — | 3 retries, fixed 30s delay |
| `email` | Send transactional emails via Resend | 10 | 10/sec (Resend API limit) | 5 retries, exponential backoff |
| `analytics` | Aggregate search_logs, page_views hourly | 2 | — | 3 retries, fixed 1min delay |
| `maintenance` | Partition creation, stale data cleanup | 1 | — | 2 retries, fixed 5min delay |

### Queue: `scrape`

**Trigger**: Scheduler enqueues one job per active ordering service daily (configurable per vendor).

**Concurrency & Locking**: Maximum 3 concurrent scrape jobs across all workers. Each vendor has a Redis distributed lock (`lp:lock:scrape:{vendorId}`) with a 30-minute TTL to prevent overlapping scrape runs for the same ordering service — if a job crashes without releasing the lock, it auto-expires.

**Job Flow**:

```
scrape:{vendorId}
  1. Acquire Redis lock (lp:lock:scrape:{vendorId})
  2. Load vendor config from scrape_vendor_configs
  3. Create scrape_run record (status: RUNNING)
  4. Launch Playwright browser with proxy rotation
  5. Navigate to ordering service pages, extract prices
  6. Write scrape_results (raw parsed data)
  7. Run change detection:
     - Compare parsed prices to offerings.current_price
     - Apply anomaly detection (> 50% change = ANOMALY)
     - Write staged_price_changes
  8. Update scrape_run (status: COMPLETED, stats)
  9. Release Redis lock
  On failure:
  - Write scrape_errors with error details + screenshot
  - Update scrape_run (status: FAILED)
  - Release Redis lock
  - Retry with exponential backoff
  After max retries:
  - Move to dead-letter queue
  - Send admin notification
```

**Proxy Rotation**: Each scrape job rotates through a pool of residential proxies. Failed requests trigger proxy rotation before retry. Proxy health is tracked in Redis (`lp:proxy:{proxyId}:failures`).

### Queue: `alerts`

**Trigger**: Enqueued by `OfferingService.publishChange` after a price update is committed.

**Job Flow**:

```
alerts:evaluate:{testId}
  1. Query price_alerts WHERE test_id = testId AND is_active = true
  2. For each alert, check if trigger condition is met:
     - PRICE_DROP: new_price < alert.target_price
     - PRICE_BELOW: new_price < alert.threshold
     - ANY_CHANGE: always triggers
  3. Write alert_notifications for triggered alerts
  4. Batch triggered alerts into email:send jobs (max 50 per batch)
  5. Update alert.last_triggered_at
```

### Queue: `email`

**Trigger**: Enqueued by alert evaluation, auth flows (magic links), and admin digest scheduler.

**Job Flow**:

```
email:send
  1. Load email template (React Email component)
  2. Render to HTML
  3. Send via Resend API
  4. Write delivery status to email_logs
  On failure:
  - Retry with exponential backoff (network errors, rate limits)
  - After max retries, mark as FAILED in email_logs
```

**Rate Limiting**: BullMQ's built-in rate limiter caps sends at 10/second to stay within Resend API limits.

### Queue: `analytics`

**Trigger**: Scheduler enqueues hourly.

**Job Flow**:

```
analytics:aggregate:{type}:{hour}
  1. Read raw events from search_logs / page_views for the hour window
  2. Aggregate into rollup tables:
     - search_logs → search_analytics (query, count, avg_results, ctr)
     - page_views → page_view_rollups (page, count, unique_visitors)
  3. Mark source rows as aggregated (for eventual partition pruning)
```

### Queue: `maintenance`

**Trigger**: Scheduler enqueues nightly.

**Jobs**:

- `maintenance:create-partitions`: Create next month's partitions for `price_history`, `search_logs`, `page_views` tables. Runs on the 25th of each month to create partitions for the following month.
- `maintenance:cleanup`: Drop partitions older than the retention window (e.g., 24 months for price_history, 6 months for search_logs). Detach partition first, then drop asynchronously.
- `maintenance:stale-data`: Clean up orphaned scrape artifacts, expired alert notifications, and abandoned sessions.

### Dead-Letter Queue (DLQ)

Every queue has a DLQ. Jobs that exhaust retries are moved to `{queue}:dlq` with full context (input, error, attempt history). A daily admin digest includes DLQ depth per queue. The admin panel provides a UI to inspect, retry, or discard DLQ jobs.

### Job Observability

Each job records:
- Start time, end time, duration
- Attempt number and failure reasons
- Memory and CPU usage (for scrape jobs)
- Custom metrics (pages scraped, prices extracted, changes detected)

BullMQ's built-in metrics (queue depth, processing rate, wait time) are exposed via a `/api/v1/admin/queues` endpoint for the admin dashboard.

---

## 7. Error Handling

### Custom Error Hierarchy

All application errors extend a base `AppError` class that carries a machine-readable code, HTTP status, and optional structured details:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(
      `${resource} not found: ${identifier}`,
      'NOT_FOUND',
      404,
      { resource, identifier },
    );
  }
}

export class ValidationError extends AppError {
  constructor(errors: ZodError) {
    super(
      'Validation failed',
      'VALIDATION_ERROR',
      400,
      { errors: errors.flatten().fieldErrors },
    );
  }
}

export class ForbiddenError extends AppError {
  constructor(action: string, resource: string) {
    super(
      `Forbidden: cannot ${action} ${resource}`,
      'FORBIDDEN',
      403,
      { action, resource },
    );
  }
}

export class ConflictError extends AppError {
  constructor(resource: string, detail: string) {
    super(
      `Conflict: ${detail}`,
      'CONFLICT',
      409,
      { resource, detail },
    );
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(
      'Rate limit exceeded',
      'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfter },
    );
  }
}
```

### API Error Response Format

All API routes return errors in a consistent JSON envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Test not found: xyz",
    "details": {
      "resource": "Test",
      "identifier": "xyz"
    }
  }
}
```

A global error handler in the API layer catches errors and maps them:

```typescript
export function handleApiError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode },
    );
  }

  // Unexpected errors — log full details, return generic message
  logger.error({ err: error }, 'Unhandled error');
  Sentry.captureException(error);

  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 },
  );
}
```

### Next.js Error Boundaries

- **`app/error.tsx`**: Global error boundary catches rendering errors in the web UI. Displays a user-friendly error page and reports to Sentry.
- **`app/not-found.tsx`**: Custom 404 page with search suggestions.
- **`app/api/v1/[...]/route.ts`**: Each route handler wraps its body in a try/catch that calls `handleApiError`. A higher-order function `withErrorHandler` eliminates boilerplate:

```typescript
export const GET = withErrorHandler(async (req, params) => {
  const dto = await services.tests.getBySlug({ slug: params.slug });
  return Response.json({ data: dto });
});
```

### Sentry Integration

Sentry is initialized in both the web and worker processes:

- **Source maps**: Uploaded during CI build for readable stack traces
- **Breadcrumbs**: Automatic breadcrumbs for HTTP requests, database queries, Redis operations, and BullMQ job lifecycle events
- **Context**: Each error includes user ID (if authenticated), request path, job name/ID (for worker errors), and relevant entity IDs
- **Environments**: Separate Sentry projects for `production`, `staging`
- **Alerts**: Sentry alerts configured for error rate spikes, new error types, and unhandled rejections
- **Performance**: Transaction tracing for API routes and scrape jobs to identify latency regressions

### Structured Logging with Pino

All processes use [pino](https://github.com/pinojs/pino) for structured JSON logging:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'email', 'ip'],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});
```

Key principles:
- **No PII in logs**: Email addresses, IP addresses, and auth tokens are redacted by pino's built-in redaction. Logs may be stored in third-party services (Sentry, log aggregators) and must not contain user-identifiable data.
- **Structured fields**: Every log entry includes `timestamp`, `level`, `msg`, and contextual fields (`requestId`, `jobId`, `vendorSlug`, `testSlug`). No string interpolation of variable data into the message field.
- **Log levels**: `error` for failures requiring attention, `warn` for degraded operations (proxy rotation, cache miss spike), `info` for business events (scrape completed, price changed, alert triggered), `debug` for development tracing.
- **Request ID**: A `requestId` (UUID) is generated in Next.js middleware and threaded through services for request-level correlation.

### Worker Error Handling

BullMQ job failures follow a specific protocol:

1. **Retryable errors** (network timeouts, proxy failures, rate limits): Thrown normally. BullMQ retries with the queue's configured backoff strategy.
2. **Permanent errors** (invalid vendor config, schema mismatch): Wrapped in `UnrecoverableError` from BullMQ to skip retries and move directly to DLQ.
3. **Partial failures** (some prices extracted, some pages failed): The job completes successfully but records partial results in `scrape_errors`. A follow-up job can retry only the failed pages.

---

## 8. Scaling Path

### Phase 1: Single VPS (Launch)

**Infrastructure**: Single VPS (4 vCPU, 8 GB RAM) running Docker Compose.

```yaml
services:
  web:
    build: .
    command: node apps/web/server.js
    ports: ["3000:3000"]
    deploy:
      resources:
        limits: { cpus: "2", memory: "3G" }

  worker:
    build: .
    command: tsx apps/worker/index.ts
    deploy:
      resources:
        limits: { cpus: "1.5", memory: "3G" }

  scheduler:
    build: .
    command: tsx apps/scheduler/index.ts
    deploy:
      resources:
        limits: { cpus: "0.25", memory: "512M" }

  postgres:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    deploy:
      resources:
        limits: { cpus: "1", memory: "2G" }

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
    deploy:
      resources:
        limits: { cpus: "0.25", memory: "512M" }
```

**Capacity**: Handles ~10 ordering services, ~2,000 tests, ~20,000 offerings, and moderate organic search traffic. Cloudflare absorbs most read traffic.

**Monitoring**: Sentry for errors, basic VPS metrics (CPU, RAM, disk) via provider dashboard, BullMQ queue metrics via admin panel.

### Phase 2: Vertical Scaling + Read Replica

**Trigger**: Database CPU consistently above 70%, or admin dashboard queries degrade user-facing latency.

**Changes**:
- Upgrade VPS to 8 vCPU, 16 GB RAM (or split web and worker to separate VPS instances)
- Add **PostgreSQL read replica** — route analytics queries, admin dashboard reads, and search to the replica via Prisma's `$extends` with read/write splitting
- Increase worker concurrency from 3 to 6 concurrent scrape jobs
- Add Redis memory (or move to managed Redis)
- Enable PostgreSQL connection pooling via PgBouncer

**Estimated capacity**: ~50 ordering services, ~10,000 tests, sustained search traffic.

### Phase 3: Container Orchestration

**Trigger**: Need for zero-downtime deployments, auto-scaling, or multi-region presence.

**Changes**:
- Move to **AWS ECS/Fargate** (or equivalent) for web and worker containers
- **RDS PostgreSQL** with Multi-AZ for database (automatic failover, managed backups, read replicas)
- **ElastiCache Redis** for managed Redis with replication
- **Auto-scaling**: Web containers scale on CPU/request count; worker containers scale on queue depth
- **ALB** (Application Load Balancer) behind Cloudflare for health-checked routing
- **S3** for object storage (scrape snapshots, backups) — replacing R2 if needed, or keeping R2 for Cloudflare integration

**Infrastructure-as-code**: Terraform or AWS CDK for reproducible environments (staging mirrors production).

### Phase 4: Service Extraction (If Needed)

**Trigger**: Scraping complexity outgrows the worker (e.g., anti-bot countermeasures require specialized infrastructure, or scraping cadence needs to increase dramatically without affecting alert/email processing).

**Changes**:
- Extract `packages/scrapers` + scrape queue consumers into a **dedicated scraper service** with its own scaling profile, deployed separately
- Scraper service communicates results via the existing BullMQ queue (publishes to `change-detect` queue) — no new protocol needed
- Consider replacing Playwright with a managed browser service (Browserless, Apify) if self-hosted browser management becomes a burden
- If search volume warrants it, add **OpenSearch/Meilisearch** as a dedicated search layer, fed by database change events

### What Does NOT Change Across Phases

- **API contract**: `/api/v1` routes remain stable — consumers never know the backend topology changed
- **Service layer**: `packages/shared/services/` remains the single Prisma consumer regardless of how many processes exist
- **Cache key scheme**: `lp:*` keys and invalidation logic stay the same whether Redis is local or ElastiCache
- **Job queue interface**: BullMQ queues and job schemas remain stable; only concurrency and infrastructure change

---

## Appendix: Code Organization

```
labprice/
├── apps/
│   ├── web/                          # Next.js 15 App Router
│   │   ├── app/
│   │   │   ├── (public)/             # Public pages (tests, search, compare)
│   │   │   ├── (auth)/               # Auth pages (login, register)
│   │   │   ├── (dashboard)/          # Authenticated user pages
│   │   │   ├── admin/                # Admin panel pages
│   │   │   ├── api/v1/               # Versioned REST API
│   │   │   ├── error.tsx             # Global error boundary
│   │   │   └── not-found.tsx         # Custom 404
│   │   ├── lib/
│   │   │   ├── services.ts           # Service factory (singleton per process)
│   │   │   ├── auth.ts               # Auth.js v5 configuration
│   │   │   └── sentry.ts             # Sentry client init
│   │   └── middleware.ts             # Auth guards, rate limiting, request ID
│   ├── worker/                       # BullMQ consumer process
│   │   ├── index.ts                  # Worker entry point
│   │   ├── queues/                   # Queue definitions and consumers
│   │   │   ├── scrape.ts
│   │   │   ├── alerts.ts
│   │   │   ├── email.ts
│   │   │   ├── analytics.ts
│   │   │   └── maintenance.ts
│   │   └── lib/
│   │       └── sentry.ts             # Sentry server init
│   └── scheduler/                    # Cron fan-out process
│       └── index.ts                  # Repeatable job registration
├── packages/
│   ├── database/                     # Prisma schema + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── index.ts                  # PrismaClient export
│   ├── shared/                       # Shared business logic
│   │   ├── services/                 # Service layer (sole Prisma consumer)
│   │   │   ├── index.ts              # createServices factory
│   │   │   ├── test.service.ts
│   │   │   ├── vendor.service.ts
│   │   │   ├── offering.service.ts
│   │   │   ├── search.service.ts
│   │   │   ├── alert.service.ts
│   │   │   ├── affiliate.service.ts
│   │   │   ├── scrape.service.ts
│   │   │   ├── analytics.service.ts
│   │   │   ├── user.service.ts
│   │   │   └── admin.service.ts
│   │   ├── schemas/                  # Zod validation schemas
│   │   ├── types/                    # TypeScript DTOs and interfaces
│   │   ├── errors/                   # AppError hierarchy
│   │   └── utils/                    # Shared utilities (slug, hash, etc.)
│   └── scrapers/                     # Per-ordering-service scraper adapters
│       ├── adapters/
│       │   ├── walkinlab.ts
│       │   ├── requestatest.ts
│       │   └── ...
│       └── base.ts                   # Base scraper class
├── docker-compose.yml
├── Dockerfile
├── turbo.json
└── pnpm-workspace.yaml
```
