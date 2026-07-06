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
- [ ] B3 — Retire seed admin admin@labprice.com (needs A1 first: sign in real account, promote, remove seed)
- [x] B4 — search(): sanitize tokens so to_tsquery can't throw (kept prefix matching)
- [x] B5 — zod-validate admin tests PATCH (+ malformed-JSON & P2025 handling on PATCH/DELETE)
- [ ] B6 — Delete/fix worker publisher.ts (stale snake_case models)
- [ ] B7 — Analytics retention job (SearchLog etc. > 180 days)
- [x] B8 — Cache autocomplete (unstable_cache 60s)
- [x] B10 — Content-Security-Policy header in middleware
- [ ] B11 — Clean up @prisma/client Turbopack warnings before prod build

## Frontend
- [x] F1 — Make test page ISR-cacheable (removed auth() from the public test page)
- [x] F3 — SearchBar Enter/Compare → /search results page (wires the existing FTS service + route)
- [x] F4 — a11y: aria-expanded on accordions + focus trap in SuggestionModal
- [x] F5 — Price-freshness indicator ("checked N days ago") from priceUpdatedAt
- [x] F7 — og:image (generated app/opengraph-image.tsx card; fixed missing static PNG + metadataBase)
- [x] F8 — Remove unused biomarkers prop/query from test page
- [ ] F9 — Dedupe Chevron SVGs into @labprice/ui
- [ ] F10 — Prune or document unused API routes (/tests, /categories, /trends)

## Deferred (noted, not doing this round)
- B9 — prisma migrate history (infra change; risky on live DB; document as recommendation)
