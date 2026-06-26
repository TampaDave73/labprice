# Deliverable #9 — Repository Structure

A **pnpm + Turborepo** monorepo. One app (`web`) serves pages + `/api/v1`; one process app
(`worker`) runs background jobs; shared logic lives in `packages/*` so web and worker never
duplicate business rules.

```
labprice/
├─ apps/
│  ├─ web/                         # Next.js 15 (App Router): public site + admin + /api/v1
│  │  ├─ app/
│  │  │  ├─ (public)/
│  │  │  │  ├─ page.tsx            # Home (hero, search, popular, all-tests list)
│  │  │  │  ├─ tests/[slug]/page.tsx   # Results: accordion + price table (SSR/ISR)
│  │  │  │  ├─ categories/[slug]/page.tsx
│  │  │  │  ├─ compare/page.tsx
│  │  │  │  └─ l/[slug]/page.tsx   # SEO landing pages (seo_pages)
│  │  │  ├─ (auth)/sign-in/…
│  │  │  ├─ dashboard/             # saved tests, alerts (user)
│  │  │  ├─ admin/                 # all admin screens (Deliverable #6), role-gated
│  │  │  ├─ api/
│  │  │  │  ├─ v1/                 # route handlers grouped by resource
│  │  │  │  │  ├─ tests/… search/… me/… admin/… go/[offeringId]/…
│  │  │  │  ├─ auth/[...nextauth]/route.ts
│  │  │  │  └─ health/route.ts
│  │  │  ├─ sitemap.ts  robots.ts  layout.tsx
│  │  ├─ components/               # UI (Tailwind): SearchBar, PriceTable, Accordion, TrendChart…
│  │  ├─ lib/                      # client helpers, api client, hooks
│  │  ├─ middleware.ts             # CSP/headers, origin checks, rate-limit hooks
│  │  ├─ next.config.ts  tailwind.config.ts  Dockerfile
│  │
│  └─ worker/                      # standalone Node process
│     ├─ src/
│     │  ├─ main.ts                # boots BullMQ workers
│     │  ├─ queues/                # queue + worker defs: scrape, change-detect, alerts, email,
│     │  │                         #   analytics-rollup, partition-maintenance, cache-warm
│     │  ├─ scheduler.ts           # repeatable jobs (daily scrape fan-out, nightly rollups)
│     │  └─ processors/            # one file per job processor
│     └─ Dockerfile               # includes Playwright Chromium
│
├─ packages/
│  ├─ database/                    # @labprice/database
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma          # (docs/database/schema.prisma promoted here)
│  │  │  ├─ migrations/            # prisma migrate + manual SQL (ddl.sql steps)
│  │  │  └─ seed.ts                # prototype data: 5 cats, 12 tests, 10 vendors, 120 offerings
│  │  └─ src/index.ts              # singleton PrismaClient export
│  │
│  ├─ shared/                      # @labprice/shared — the domain core
│  │  ├─ schemas/                  # zod schemas (shared by API + client + OpenAPI)
│  │  ├─ services/                 # business logic: catalog, pricing, search, alerts, changes,
│  │  │                            #   affiliate, analytics (the only place that touches Prisma)
│  │  ├─ rules/                    # business rules + tunables (BR-*), pure functions
│  │  ├─ cache/                    # Redis cache-aside helpers + tags
│  │  ├─ auth/                     # RBAC: can(), requireRole(), policy
│  │  ├─ errors/                   # AppError + JSON envelope
│  │  └─ types/                    # shared TS types/DTOs
│  │
│  ├─ scrapers/                    # @labprice/scrapers
│  │  ├─ src/
│  │  │  ├─ engine/                # Playwright/Selenium/HTTP runners
│  │  │  ├─ adapters/              # default config-driven adapter + per-vendor hooks
│  │  │  ├─ proxy/                 # ProxyManager
│  │  │  ├─ normalize/             # price parsing, stock inference
│  │  │  └─ detect/                # change detection (uses shared/rules)
│  │  └─ index.ts
│  │
│  ├─ ui/                          # @labprice/ui — shared design system + accent/best-price tokens
│  │  ├─ tokens/                   # the prototype's accent themes + best-price styles as tokens
│  │  └─ components/
│  │
│  └─ config/                      # @labprice/config — eslint, tsconfig, tailwind preset shared
│
├─ docs/                           # THIS deliverable set (#1–#10) + ERD/OpenAPI/DDL
├─ project/                        # original Claude Design prototype (source of truth) + chats/
├─ infra/
│  ├─ docker-compose.yml  docker-compose.dev.yml
│  ├─ terraform/                   # optional IaC for the VPS/AWS target
│  └─ grafana/                     # dashboards
├─ .github/workflows/              # ci.yml, deploy.yml
├─ .env.example
├─ turbo.json  pnpm-workspace.yaml  package.json  tsconfig.base.json
└─ README.md
```

## Conventions
- **Imports flow one way:** `web`/`worker` → `packages/*`; packages never import apps.
  `shared/services` is the **only** layer that uses Prisma — route handlers and components call
  services, keeping business logic testable and reusable across web + worker.
- **Validation at the edge:** every API/server-action input parsed by a `packages/shared/schemas`
  zod schema.
- **Tests colocated:** `*.test.ts` next to source; e2e in `apps/web/e2e`.
- **The prototype stays in `project/`** as the visual source of truth; `packages/ui/tokens` encodes
  its accent themes (Indigo/Emerald/Sky) and best-price styles (Green/Gold/Accent) as design tokens.
