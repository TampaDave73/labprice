# TODO — 2026-07-05 review round

Working through the backend + frontend review items, the explicit removals, and the
missing frontend auth. Knocking these off one at a time; each gets a commit.

## Removals (user-approved)
- [x] R1 — Remove "Free Account" navbar button (non-functional div)
- [x] R2 — Remove "Save" feature on test pages (button + /api/v1/me/saved-tests + dashboard)
- [x] R3 — Remove "Price Alert" feature on test pages (button + /api/v1/me/alerts + notifications)
      NOTE: Prisma models SavedTest/PriceAlert/Notification/AlertNotification kept (dormant) —
      dropping them is a destructive db:push against custom ddl.sql; publish-change.ts still refs them.

## Auth (user created a backend account; no frontend login/logout)
- [x] A1 — Add sign in / sign out UI (auth-aware Navbar: Sign in / Admin link / Sign out server action)

## Backend
- [x] B1 — Rate limiting + honeypot on public POST endpoints (suggestions, reports, analytics); daily email cap
- [x] B2 — /api/v1/go/[offeringId]: filter isActive/deletedAt; populate ipHash/userAgentHash
- [~] B3 — Retire seed admin admin@labprice.com. BLOCKED: modifying shared auth state via script was
      denied by the safety classifier. davidsabot@gmail.com is confirmed SUPER_ADMIN, so it's safe to
      retire admin@labprice.com — do it from the admin user-management UI (demote to USER / deactivate).
- [x] B4 — search(): sanitize tokens so to_tsquery can't throw (kept prefix matching)
- [x] B5 — zod-validate admin tests PATCH (+ malformed-JSON & P2025 handling on PATCH/DELETE)
- [x] B6 — Deleted dead packages/scrapers/src/publisher.ts (stale snake_case models; nothing imported it)
- [x] B7 — Analytics retention: partition-maintenance worker drops affiliate_clicks/search_logs/
      page_views partitions older than 6 months (price_history kept for trends)
- [x] B8 — Cache autocomplete (unstable_cache 60s)
- [x] B10 — Content-Security-Policy header in middleware
- [x] B11 — next.config serverExternalPackages: ['@prisma/client','prisma'] (silences Turbopack warning)

## Frontend
- [x] F1 — Make test page ISR-cacheable (removed auth() from the public test page)
- [x] F3 — SearchBar Enter/Compare → /search results page (wires the existing FTS service + route)
- [x] F4 — a11y: aria-expanded on accordions + focus trap in SuggestionModal
- [x] F5 — Price-freshness indicator ("checked N days ago") from priceUpdatedAt
- [x] F7 — og:image (generated app/opengraph-image.tsx card; fixed missing static PNG + metadataBase)
- [x] F8 — Remove unused biomarkers prop/query from test page
- [~] F9 — DEFERRED: the chevrons aren't actually identical (different paths/viewBoxes/colors, each
      coupled to its inline-styled layout). Extracting a shared component is pure churn with
      regression risk for a cosmetic-only gain — not worth it. Left as-is.
- [x] F10 — Kept /api/v1/{tests,categories,trends}: they're validated, paginated, coherent read
      endpoints = a deliberate public v1 read API (no UI callers by design). Documented in SKILLS.md.

## Deferred (noted, not doing this round)
- B9 — prisma migrate history (infra change; risky on live DB; document as recommendation)
