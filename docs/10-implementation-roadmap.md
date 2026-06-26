# Deliverable #10 — Implementation Roadmap

Phased, dependency-ordered. Complexity is **T-shirt size (S/M/L/XL)** + rough effort, not a hard
commitment. Each phase ends shippable and testable. **Tests are written within each phase**, not
deferred. We do **not** start a phase until its dependencies are green.

## Phase 0 — Design (this deliverable) — ✅ pending approval
Architecture docs #1–#10. **Gate:** product owner approves before any code. No code is written until
this is signed off.

## Phase 1 — Foundation: DB + Auth + monorepo  ·  Complexity: **L**  ·  ~1–1.5 wks
**Depends on:** Phase 0 approval.
1. Scaffold Turborepo (pnpm), shared tsconfig/eslint/tailwind, `apps/web`, `packages/{database,
   shared,ui,config}`. CI skeleton (typecheck/lint/test).
2. `packages/database`: promote `schema.prisma`; migrations `0001–0004` (incl. extensions, FTS,
   partitioning, constraints); idempotent `seed.ts` (5 categories, 12 tests, 10 vendors, 120
   offerings + baseline `price_history`, biomarkers, super-admin).
3. Auth.js (magic-link + Google), DB sessions, RBAC (`can()`/`requireRole`), `/auth/*` + `/me`.
4. Health check, structured logging, error envelope, Redis client, rate-limit middleware, CSP/headers.
**Exit:** can sign in, seed loads, RBAC enforced, migrations apply forward/back; unit + a couple of
integration tests green in CI.

## Phase 2 — Core product: search, catalog, compare  ·  Complexity: **XL**  ·  ~2–3 wks
**Depends on:** Phase 1.
1. `shared/services`: catalog, pricing (best price/savings BR-1/2/4), search (FTS + trigram +
   biomarker), with Redis cache-aside.
2. Public API: `/search`, `/search/autocomplete`, `/tests`, `/tests/{slug}`, `/categories`,
   `/vendors`, `/go/{offeringId}` (affiliate click logging), trend endpoints (served from seed
   history).
3. Frontend (pixel-match the prototype): Home (hero, autocomplete, popular cards, all-tests list w/
   category filter + A–Z/Price sort + show-more), Results (header + codes, accordion, price table
   with cheapest highlight + savings banner + sort), nav/footer, accent/best-price tokens. SSR/ISR +
   SEO (metadata, structured data, sitemap/robots), mobile-responsive.
4. Accounts surface: saved tests + dashboard.
**Exit:** a visitor can search → compare → click out exactly as in the prototype; Core Web Vitals
green; e2e covers the search→compare→redirect flow.

## Phase 3 — Scrapers + approval workflow  ·  Complexity: **XL**  ·  ~2–3 wks
**Depends on:** Phase 1 (DB) + Phase 2 (offerings/pricing services). **Gated by the per-vendor legal
sign-off (Deliverable #5).**
1. `apps/worker` + BullMQ queues + scheduler (daily fan-out).
2. `packages/scrapers`: engine (Playwright first), config-driven adapter, ProxyManager, normalize.
3. Change detection (BR-6/7/9) → `staged_price_changes`; publish transaction (offering +
   price_history + audit + cache purge + alert enqueue).
4. Admin: Scrape Config editor (+ test-run), Scraper Monitor (jobs/runs/health), Error Logs, Change
   Queue (approve/reject/bulk). Manual + single-offering re-scrape. Failure email alerts.
**Exit:** a daily run on ≥1 legally-cleared vendor stages changes; admin approves → price + history
update live; failures alert and recover.

## Phase 4 — Engagement + admin completeness  ·  Complexity: **L**  ·  ~1.5–2 wks
**Depends on:** Phases 2–3.
1. Price alerts (create/manage; `alerts:evaluate` worker; email; notification log; rate limits).
2. Admin: Users, Vendors, Offerings (manual price), Feature Flags, System Settings, Proxies, SEO
   Pages CMS, Audit Log viewer, Ratings moderation (flag-gated v2).
3. Compare view polish (subset vendor selection behind flag).
**Exit:** users get alert emails on qualifying drops; admins fully self-serve catalog/vendor/content.

## Phase 5 — Analytics, SEO depth, trends  ·  Complexity: **M**  ·  ~1–1.5 wks
**Depends on:** Phases 2–4.
1. Event ingestion (pageviews/searches/clicks), nightly `analytics-rollup`, admin Analytics
   (overview, searches incl. zero-result gaps, affiliate clicks → revenue proxy).
2. Real price-trend charts from accumulated `price_history`; "cheapest over time."
3. SEO landing pages live, structured data, internal linking, performance pass.
**Exit:** admin sees real KPIs + zero-result gaps; trend charts render from real history; landing
pages indexable.

## Phase 6 — Hardening, optimization, deployment  ·  Complexity: **L**  ·  ~1.5–2 wks
**Depends on:** all prior.
1. Security review (Deliverable #7 checklist), load test (read path + scrape concurrency), DB index/
   query tuning, partition maintenance job, cache-warm.
2. Full CI/CD to staging→prod (manual gate), backups + PITR + monthly restore drill, monitoring/
   alerting/dashboards, Sentry/OTel, DR runbook + game-day.
3. Accessibility (WCAG 2.1 AA) + cross-device QA; mobile-readiness validation of `/api/v1` for the
   future app.
**Exit:** production-ready: 99.9% read-path SLO, backups verified, alerts wired, a11y passed.

## Dependency graph
```
P0 ──► P1 ──► P2 ──► P4 ──► P5 ──► P6
              │       ▲
              └► P3 ──┘   (P3 also needs P1; P3 gated by legal sign-off)
```

## Cross-cutting (every phase)
Tests (unit + integration; e2e from P2), `audit_logs` on privileged writes, observability hooks,
docs kept current, feature flags for risky surfaces, accessibility, mobile responsiveness.

## Sequencing notes / risks
- **P3 is the long pole and legally gated** — it can proceed on cleared vendors while others await
  sign-off; until then, seed/`MANUAL`/`FEED` data drives the UI (the app never hard-depends on live
  scraping).
- Keep migrations **expand/contract** so prod deploys/rollbacks never need down-migrations.
- The public read path must stay independent of worker health (serves cached/last-known prices).

> **Next step after approval:** begin **Phase 1**, committing in logical, reviewable chunks
> (scaffold → schema+migrations → seed → auth → guards/middleware), each with tests, per the
> "commit code in logical phases" instruction.
