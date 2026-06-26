# LabPrice — Architecture & Implementation Docs

> Status: **Phase 0 — Design (awaiting approval).** No application code has been written yet.
> These documents are Deliverables #1–#10 requested in the architecture brief. Once approved,
> implementation proceeds incrementally per the roadmap (Deliverable #10).

LabPrice is a price-comparison platform for self-pay (cash-pay) blood lab tests. Consumers search
for a test, see its clinical explainer, and compare current prices across multiple **online
ordering services** (Quest, LabCorp, Ulta Lab Tests, Life Extension, etc.). The blood draw itself
happens at a Quest or LabCorp patient service center — the platform compares the *requisition*
price, not the draw site.

## How these docs were derived

The source of truth is the exported Claude Design prototype in `project/Lab Test Price
Comparison.dc.html` plus the two design transcripts in `chats/`. The prototype encodes 12 tests, 5
categories, and 10 ordering services with per-vendor pricing. Decisions locked during the design
iterations (and honored here):

- These are **ordering services**, not draw sites.
- **CPT codes removed** (copyright) — only Quest & LabCorp test numbers are shown.
- **Vendor ratings removed** from v1 (deferred to v2; schema is ready for them).
- **Turnaround time** removed from the Normal Ranges section.
- Accent theme + best-price highlight are presentation tweaks (Indigo/Emerald/Sky, Green/Gold/Accent).

## Reading order

| #  | Document | Deliverable |
|----|----------|-------------|
| 1  | [`01-prd.md`](./01-prd.md) | Product Requirements Document |
| 2  | [`02-database-design.md`](./02-database-design.md) | Database design + ERD; schema in [`database/`](./database/) |
| 3  | [`03-backend-architecture.md`](./03-backend-architecture.md) | Backend architecture & stack rationale |
| 4  | [`04-api-design.md`](./04-api-design.md) | REST API design; spec in [`api/openapi.yaml`](./api/openapi.yaml) |
| 5  | [`05-scraper-architecture.md`](./05-scraper-architecture.md) | Scraper framework |
| 6  | [`06-admin-panel.md`](./06-admin-panel.md) | Admin panel screens |
| 7  | [`07-security.md`](./07-security.md) | Security model |
| 8  | [`08-deployment.md`](./08-deployment.md) | Deployment & infrastructure |
| 9  | [`09-project-structure.md`](./09-project-structure.md) | Repository structure |
| 10 | [`10-implementation-roadmap.md`](./10-implementation-roadmap.md) | Phased roadmap |

## Chosen stack (confirmed)

- **Topology:** Next.js full-stack (App Router) with versioned `/api/v1` route handlers; a
  **separate** standalone worker process for scraping and background jobs.
- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS.
- **Data:** PostgreSQL 16 + Prisma ORM; Redis for cache, rate limiting, and the BullMQ queue.
- **Jobs:** BullMQ workers (scraping, change detection, alerts, analytics rollups).
- **Auth:** Auth.js (NextAuth v5) with Prisma adapter, RBAC.
- **Scraping:** Playwright-first, config-driven, per-vendor adapters, proxy pool, admin approval gate.
- **Infra:** Docker + Docker Compose; Cloudflare in front of a VPS (or AWS) for caching/WAF/CDN.

See Deliverable #3 for the rationale behind each choice.
