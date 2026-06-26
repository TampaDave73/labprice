# Deliverable #3 — Backend Architecture

## Topology (confirmed: Next.js full-stack + standalone worker)

```
                         ┌─────────────────────────────────────────────┐
            Cloudflare   │              VPS / AWS (Docker)              │
  Users ──► CDN + WAF ──►│                                             │
            + cache      │  ┌────────────────────┐   ┌──────────────┐ │
                         │  │  web  (Next.js)    │   │   worker     │ │
                         │  │  - App Router SSR  │   │  (Node/tsx)  │ │
                         │  │  - /api/v1 routes  │   │  BullMQ      │ │
                         │  │  - Auth.js         │   │  consumers   │ │
                         │  └─────────┬──────────┘   └──────┬───────┘ │
                         │            │                     │         │
                         │      ┌─────┴─────┐   ┌───────────┴──────┐  │
                         │      │ PostgreSQL│   │     Redis        │  │
                         │      │ (Prisma)  │   │ cache+queue+rate │  │
                         │      └───────────┘   └──────────────────┘  │
                         │            ▲                     ▲         │
                         │            │      ┌──────────────┴───────┐ │
                         │            └──────│ scheduler (cron→queue)│ │
                         │                   └──────────────────────┘ │
                         │   Object store (S3/R2): HTML snapshots,     │
                         │   screenshots, backups                      │
                         └─────────────────────────────────────────────┘
                                   Proxy pool ─► vendor sites (scraping)
```

Three deployable processes, one codebase (Turborepo):
1. **`web`** — Next.js (App Router). Serves SSR/ISR public pages, the admin SPA-ish pages, and the
   versioned `/api/v1` REST API (also consumed by the future mobile app). Stateless → scale
   horizontally behind Cloudflare.
2. **`worker`** — long-running Node process hosting BullMQ consumers: scraping, change detection,
   alert evaluation, email sending, analytics rollups, partition maintenance. Scales independently
   of web; never serves HTTP user traffic.
3. **`scheduler`** — tiny process (or BullMQ repeatable jobs) that enqueues cron work (daily scrape
   fan-out, nightly rollups). Can run inside the worker; kept conceptually separate.

The web tier and worker share `packages/database` (Prisma), `packages/shared` (types, zod schemas,
business rules), and `packages/scrapers` (adapters) — so business logic isn't duplicated.

### Why this over NestJS-as-separate-API
For a **read-heavy** comparison site whose writes are batch (scraping) rather than interactive, a
single Next.js app that renders pages *and* exposes JSON removes a network hop, a second deploy
target, and a duplicate auth layer. Background work — the only part that genuinely wants a separate
runtime — is already split into the worker. The public API is still first-class and versioned
(`/api/v1`) so a mobile app or partners can consume it without touching the web pages. We keep the
option to extract a NestJS service later behind the stable API contract if a domain outgrows route
handlers.

## Request flow (read path)
1. Cloudflare serves a cached HTML/JSON response when fresh (most test pages are ISR + edge cached).
2. On miss, Next.js renders. Data access goes through a thin **service layer** in
   `packages/shared/services` (not raw Prisma in components) → Prisma → Postgres, with Redis caching
   hot queries (popular tests, a test's offerings, search autocomplete).
3. Responses set `Cache-Control: s-maxage, stale-while-revalidate` so Cloudflare can revalidate in
   the background.

## Write path (scraping → publish)
1. `scheduler` enqueues `scrape:vendor` jobs (one per active vendor) into Redis/BullMQ.
2. `worker` consumes: loads `scrape_vendor_configs`, drives Playwright via a proxy, writes
   `scrape_runs` / `scrape_results` / `scrape_errors`.
3. **Change detection** compares parsed price vs `offerings.current_price`, applies business rules
   (BR-6/7/9), and writes `staged_price_changes` (PENDING / AUTO_APPROVED / ANOMALY).
4. Admin approves (or auto-approve fires) → a **transaction** updates `offerings.current_price`,
   appends `price_history`, and enqueues `alerts:evaluate`.
5. `alerts:evaluate` finds matching `price_alerts`, writes `alert_notifications`, enqueues `email:send`.
6. Cache for affected tests is invalidated (Redis tag + Cloudflare cache-tag purge).

## Layering & code organization (inside web)
```
service layer  (packages/shared/services/*)  ← business rules, transactions, cache
      ▲
route handlers (apps/web/app/api/v1/**)      ← validation (zod), authz, shaping → JSON
server components (apps/web/app/**)           ← SSR pages call services directly
```
- **Validation:** every input parsed with a shared **zod** schema (also reused by the API docs and
  the client). No unvalidated body reaches a service.
- **AuthZ:** a `requireRole()` guard wraps admin/user routes; a `can(user, action, resource)` policy
  helper centralizes RBAC (Deliverable #7).
- **Errors:** a typed `AppError` → consistent JSON envelope `{ error: { code, message, details } }`
  and correct HTTP status.

## Caching strategy (Redis)
| Cache | Key | TTL | Invalidation |
|---|---|---|---|
| Test detail (offerings + content) | `test:{slug}` | 10 min | on publish of any offering for that test |
| Search autocomplete | `ac:{normalizedQuery}` | 5 min | time-based |
| Popular/home payload | `home:v1` | 10 min | on catalog/offering publish |
| Trend series | `trend:{offeringId}:{range}` | 1 h | on publish |
| Rate-limit counters | `rl:{ip|user}:{route}` | sliding | n/a |
Cache-aside pattern; a publish writes through and purges tags. Cloudflare sits above Redis for
anonymous traffic.

## Background jobs (BullMQ queues)
`scrape`, `change-detect`, `alerts`, `email`, `analytics-rollup`, `partition-maintenance`,
`cache-warm`. Each has concurrency limits, exponential backoff, dead-letter handling, and metrics.
Repeatable jobs implement the daily cadence. (Detail in Deliverable #5.)

## Stack rationale

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | SSR/ISR for SEO (core to the business), one codebase for pages + API, edge-cache friendly, huge ecosystem. |
| Language | **TypeScript** | End-to-end type safety from DB (Prisma) → service → API (zod) → React. |
| Styling | **Tailwind CSS** | Matches the prototype's utility-dense styling; fast, consistent, themeable (the accent/best-price tweaks become design tokens). |
| DB | **PostgreSQL 16** | Relational integrity for catalog/pricing, native partitioning for the time-series tables, full-text + trigram search (no separate search engine in v1), JSONB for scraper configs. |
| ORM | **Prisma** | Type-safe queries, first-class migrations, readable schema; raw SQL escape hatch for partitioning/FTS. |
| Cache/Queue | **Redis + BullMQ** | One dependency covers caching, rate-limit counters, and a reliable job queue with retries/backoff/repeatable jobs. |
| Auth | **Auth.js (NextAuth v5)** | Native Next integration, Prisma adapter, magic-link + OAuth, DB sessions; we layer RBAC on top. |
| Scraping | **Playwright** (Selenium adapter available) | Modern, fast, reliable headless automation, good anti-bot ergonomics, first-class TypeScript. |
| Email | **Resend / Postmark (SMTP)** | Transactional magic-links + alerts; high deliverability; swappable behind an interface. |
| Object store | **S3 / Cloudflare R2** | HTML snapshots + screenshots for scrape debugging; DB backups. |
| Errors/metrics | **Sentry + OpenTelemetry** | Error tracking + tracing across web and worker. |
| Infra | **Docker + Cloudflare + VPS/AWS** | Portable images; Cloudflare gives CDN/WAF/cache/DDoS cheaply in front of a modest VPS, scaling to AWS later. |

## Scaling path
- **Now:** 1× web, 1× worker, managed Postgres, managed Redis, Cloudflare in front.
- **Growth:** add web replicas (stateless), a Postgres read replica for analytics/admin reads, more
  worker concurrency, partition pruning. Search stays in Postgres (FTS+trgm) until query volume
  justifies OpenSearch.
- **Later:** extract heavy domains (scraping, analytics) into dedicated services behind `/api/v1`;
  move object storage and image CDN fully to R2.
