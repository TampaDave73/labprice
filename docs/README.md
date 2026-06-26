# LabPrice — Architecture Documentation

> Complete software architecture and implementation plan for a lab test price comparison platform.
>
> **Status:** Phase 0 — Design complete. Awaiting approval to begin Phase 1 implementation.

## Product

LabPrice helps consumers compare self-pay blood test prices across **ordering services** — companies that write requisitions for lab tests. Users search by test name or Quest/LabCorp code, compare prices from 10+ services, and order through affiliate links. Blood draws happen at Quest or LabCorp patient service centers.

**Monetization:** Affiliate commissions from ordering service links.

## Derived From

Claude Design prototype (`project/Lab Test Price Comparison.dc.html`):
- **12 tests** across 5 categories
- **10 ordering services** (Life Extension, Ulta Lab Tests, True Health Labs, DirectLabs, Walk-In Lab, Request A Test, Quest Diagnostics, LabCorp, Health Testing Centers, Any Lab Test Now)
- **Design system:** DM Sans typography, oklch color system, Sky/Indigo/Emerald accent themes
- **Two views:** Home (hero + search + popular cards + all tests list) and Test Detail (accordion + price comparison table)

## Reading Order

| # | Document | Description |
|---|----------|-------------|
| 1 | [Product Requirements](01-prd.md) | Personas, user flows, business rules, functional & non-functional requirements |
| 2 | [Database Design](02-database-design.md) | PostgreSQL schema, ERD, 27 tables, partitioning strategy |
| 3 | [Backend Architecture](03-backend-architecture.md) | Stack justification, service layer, caching, scaling plan |
| 4 | [API Design](04-api-design.md) | ~50 REST endpoints with request/response specs, rate limiting |
| 5 | [Scraper Architecture](05-scraper-architecture.md) | Vendor adapters, engines, proxy management, change detection |
| 6 | [Admin Panel](06-admin-panel.md) | 16 admin screens, workflows, role-based access |
| 7 | [Security](07-security.md) | Auth, RBAC, OWASP Top 10, GDPR/CCPA, secrets management |
| 8 | [Deployment](08-deployment.md) | Docker, CI/CD, monitoring, backups, disaster recovery |
| 9 | [Project Structure](09-project-structure.md) | Monorepo layout, package boundaries, import rules |
| 10 | [Implementation Roadmap](10-implementation-roadmap.md) | 6-phase plan (~10-14 weeks) with estimates and acceptance criteria |

## Supporting Artifacts

| File | Description |
|------|-------------|
| [database/schema.prisma](database/schema.prisma) | Prisma ORM schema (27 models, 13 enums) |
| [database/ddl.sql](database/ddl.sql) | Raw SQL: extensions, partitioning, generated columns, CHECK constraints |
| [database/migrations.md](database/migrations.md) | Migration strategy, seed data, partition maintenance |
| [api/openapi.yaml](api/openapi.yaml) | OpenAPI 3.1 specification |

## Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS | SSR/ISR for SEO, React Server Components |
| Backend | Next.js API Routes (`/api/v1`) | Single deployment, shared types |
| Database | PostgreSQL 16, Prisma ORM | Robust, full-text search, partitioning |
| Cache | Redis 7 | Cache-aside for catalog data, BullMQ backing |
| Background Jobs | BullMQ | Reliable job queue for scraping, alerts, email |
| Auth | Auth.js v5 (magic link + Google OAuth) | Passwordless, low friction |
| Scraping | Playwright (primary), config-driven adapters | Handles JS-rendered vendor sites |
| Email | Resend | Developer-friendly transactional email |
| Monitoring | Sentry, OpenTelemetry, Prometheus, Grafana | Full observability stack |
| Deployment | Docker Compose → AWS ECS/Fargate | Start simple, scale later |
| Monorepo | pnpm + Turborepo | Fast builds, shared packages |

## Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| No CPT codes | Copyrighted by the AMA — removed per product owner directive |
| No ratings in v1 | No user rating mechanism yet — deferred to v2 |
| No bookmarks in v1 | No persistent user features beyond alerts in v1 |
| Ordering services, not labs | These companies write requisitions; blood draws happen at Quest/LabCorp |
| Quest + LabCorp codes only | Vendor-specific codes, not copyrighted |
| Passwordless auth | Lower friction for health-conscious consumers |
| Config-driven scrapers | Add new vendors without code changes |
| Admin approval queue | Human review of scraped price changes protects data integrity |
