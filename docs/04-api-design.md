# Deliverable #4 — API Design

Base URL: `/api/v1`. Machine-readable spec: [`api/openapi.yaml`](./api/openapi.yaml).

## Conventions
- **Format:** JSON. `Content-Type: application/json`. Dates ISO-8601 UTC. Money as string decimals
  (`"29.00"`) to avoid float drift.
- **Auth:** Browser uses Auth.js session cookies. Programmatic/mobile clients use a Bearer token
  (`Authorization: Bearer <jwt>`) issued by the auth endpoints. Public read endpoints need no auth.
- **Versioning:** URI-versioned (`/api/v1`). Breaking changes → `/api/v2`; additive changes stay in v1.
- **Pagination:** cursor-based — `?cursor=&limit=` → `{ data, nextCursor }`. `limit` default 20, max 100.
- **Errors:** envelope `{ "error": { "code": "SNAKE_CASE", "message": "human", "details": {...} } }`.
  Standard statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict,
  422 semantic, 429 rate-limited, 500 internal. Validation `details` lists field errors (from zod).
- **Idempotency:** unsafe POSTs that may be retried (e.g., alert creation) accept `Idempotency-Key`.
- **Rate limiting:** Redis sliding-window; headers `X-RateLimit-Limit/Remaining/Reset`; 429 +
  `Retry-After` on breach. Tiers below.

| Tier | Applies to | Limit |
|---|---|---|
| public-read | search, tests, prices, trends | 120 req / min / IP |
| auth | login/register/magic-link | 10 req / min / IP |
| user-write | saves, alerts | 60 req / min / user |
| redirect | `/go/{offeringId}` | 300 req / min / IP (logs, never blocks UX) |
| admin | `/admin/**` | 600 req / min / user |
| scraper-control | trigger scrape | 30 req / min / user (ADMIN) |

---

## Endpoint catalog

### Authentication APIs
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | none | email (+ name); sends magic link |
| POST | `/auth/magic-link` | none | request sign-in link |
| GET  | `/auth/callback/{provider}` | none | Auth.js OAuth/email callback |
| POST | `/auth/token` | none | exchange a verified magic-link code for a Bearer JWT (mobile/API) |
| POST | `/auth/token/refresh` | refresh token | rotate access token |
| POST | `/auth/logout` | session | invalidate session/token |
| GET  | `/auth/session` | session | current session info |

### User APIs
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/me` | user | profile |
| PATCH | `/me` | user | name, notification prefs |
| DELETE | `/me` | user | GDPR delete (soft → purge job) |
| GET | `/me/export` | user | GDPR data export (async → email link) |
| GET | `/me/saved-tests` | user | list bookmarks w/ current price + delta |
| POST | `/me/saved-tests` | user | `{ testId }` |
| DELETE | `/me/saved-tests/{testId}` | user | |
| GET | `/me/alerts` | user | list price alerts |
| POST | `/me/alerts` | user | create (see schema) |
| PATCH | `/me/alerts/{id}` | user | toggle/threshold |
| DELETE | `/me/alerts/{id}` | user | |
| GET | `/me/notifications` | user | alert delivery log |

### Search APIs
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/search?q=` | none | full results (name/code/category/biomarker), paginated |
| GET | `/search/autocomplete?q=` | none | ≤6 suggestions (name, codeStr, fromPrice) |
| GET | `/search/biomarker?b=` | none | tests measuring a biomarker |

### Data / Catalog APIs
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/tests` | none | list/filter (`category`, `popular`, `sort`, cursor) |
| GET | `/tests/{slug}` | none | full detail: content + codes + offerings (sorted) + best price |
| GET | `/tests/{slug}/offerings` | none | just the price table (`sort=price|alpha`) |
| GET | `/tests/{slug}/trend?range=` | none | per-test cheapest-over-time series |
| GET | `/offerings/{id}/trend?range=` | none | one vendor's price history |
| GET | `/categories` | none | the 5 categories w/ counts |
| GET | `/vendors` | none | public vendor directory |
| GET | `/vendors/{slug}` | none | vendor profile (+ rating when v2 enabled) |
| GET | `/go/{offeringId}` | none | **302** to affiliate URL; logs `affiliate_clicks` (BR-15) |

### Analytics APIs (admin-read; some ingest public)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/events/pageview` | none | beacon ingest (rate-limited, sampled) |
| GET | `/admin/analytics/overview` | admin | KPIs: searches, clicks, top tests/vendors, revenue proxy |
| GET | `/admin/analytics/searches` | admin | top queries + zero-result gaps |
| GET | `/admin/analytics/clicks` | admin | affiliate clicks by vendor/test/date |

### Admin APIs
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/POST | `/admin/tests` ; PATCH/DELETE `/admin/tests/{id}` | EDITOR+ | catalog CRUD (+ codes, biomarkers) |
| GET/POST | `/admin/vendors` ; PATCH/DELETE `/admin/vendors/{id}` | ADMIN | vendor CRUD + affiliate template |
| GET/POST | `/admin/offerings` ; PATCH `/admin/offerings/{id}` | ADMIN | offering CRUD, manual price set |
| GET | `/admin/changes` | EDITOR+ | approval queue (filter by status/vendor) |
| POST | `/admin/changes/{id}/approve` | EDITOR+ | publish change |
| POST | `/admin/changes/{id}/reject` | EDITOR+ | `{ reason }` |
| POST | `/admin/changes/bulk` | ADMIN | `{ ids[], action }` |
| GET/PUT | `/admin/vendors/{id}/scrape-config` | ADMIN | edit selectors/urls (no deploy) |
| GET | `/admin/users` ; PATCH `/admin/users/{id}` | ADMIN | role/status mgmt |
| GET/PUT | `/admin/feature-flags` | ADMIN | |
| GET/PUT | `/admin/settings` | SUPER_ADMIN | tunables |
| GET/POST/PATCH | `/admin/seo-pages` | EDITOR+ | CMS landing pages |
| GET | `/admin/ratings` ; POST `/admin/ratings/{id}/moderate` | ADMIN | v2 moderation |

### Scraper APIs
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/scrape/jobs` | ADMIN | list jobs |
| POST | `/admin/scrape/jobs/{id}/run` | ADMIN | manual run (enqueue) |
| POST | `/admin/scrape/offerings/{id}/run` | ADMIN | re-scrape one offering |
| GET | `/admin/scrape/runs` | ADMIN | run history + status/stats |
| GET | `/admin/scrape/runs/{id}` | ADMIN | run detail: results + errors |
| GET | `/admin/scrape/errors` | ADMIN | error stream (filterable) |
| GET/POST | `/admin/proxies` ; PATCH/DELETE `/admin/proxies/{id}` | SUPER_ADMIN | proxy pool |
| GET | `/admin/scrape/health` | ADMIN | per-vendor freshness/success SLO |

---

## Representative endpoint specs

### GET `/tests/{slug}`  (public)
Returns everything the Results page needs in one call.

**200**
```json
{
  "data": {
    "id": "ckt_vitd",
    "slug": "vitamin-d-25-hydroxy",
    "name": "Vitamin D, 25-Hydroxy",
    "shortName": "Vitamin D",
    "category": { "name": "Vitamins & Minerals", "slug": "vitamins-minerals", "colorHint": "..." },
    "codes": [ { "system": "QUEST", "code": "17306" }, { "system": "LABCORP", "code": "081950" } ],
    "content": {
      "description": "Measures 25-hydroxyvitamin D ...",
      "purpose": "Used to diagnose vitamin D deficiency ...",
      "procedure": "A standard blood draw ...",
      "preparation": "No fasting required ...",
      "normalRange": "20–50 ng/mL (adults)"
    },
    "bestPrice": { "amount": "29.00", "vendor": "Life Extension", "offeringId": "off_le_vitd" },
    "savings": "50.00",
    "offerings": [
      { "offeringId": "off_le_vitd", "vendor": "Life Extension", "vendorSlug": "life-extension",
        "price": "29.00", "currency": "USD", "inStock": true, "isCheapest": true,
        "priceObservedAt": "2026-06-25T08:00:00Z", "stale": false,
        "orderUrl": "/api/v1/go/off_le_vitd" }
      /* ...10 vendors, sorted by price asc by default */
    ],
    "seo": { "title": "...", "description": "..." }
  }
}
```
**Errors:** 404 `test_not_found`. **Auth:** none. **Rate:** public-read. **Cache:**
`s-maxage=600, stale-while-revalidate=86400`, cache-tag `test:{slug}`.

### GET `/search/autocomplete?q=vit`  (public)
**200**
```json
{ "data": [
  { "slug": "vitamin-d-25-hydroxy", "name": "Vitamin D, 25-Hydroxy",
    "codeStr": "Quest 17306 · LabCorp 081950", "fromPrice": "29.00" }
] }
```
Matches name, shortName, synonyms, category, Quest/LabCorp code (trigram + FTS). `q` < 2 chars → `[]`.
**Rate:** public-read (tighter burst). **Cache:** `s-maxage=300`.

### POST `/me/alerts`  (user)
**Request**
```json
{ "kind": "BELOW_THRESHOLD", "testId": "ckt_tsh", "threshold": "25.00" }
```
Rules: exactly one of `testId`/`offeringId`; `threshold` required when `kind=BELOW_THRESHOLD`;
≤ `MAX_ALERTS_PER_USER` active (BR-13). **201** returns the alert. **Errors:** 400
`validation_error`, 409 `alert_limit_reached`. **Auth:** user. **Rate:** user-write. Accepts
`Idempotency-Key`.

### GET `/go/{offeringId}`  (public redirect)
Logs an `affiliate_clicks` row (offering/test/vendor/user?/hashes) then **302** to the vendor's
`affiliate_url_template` with our click id as subID (BR-15/16). Logging is fire-and-forget — a log
failure must not block the redirect. **404** if offering inactive. **Rate:** redirect tier.

### POST `/admin/changes/{id}/approve`  (EDITOR+)
Transactionally: set `offerings.current_price`/`in_stock`, append `price_history`
(`source=SCRAPE`), mark change `APPROVED` + `reviewedBy/At`, write `audit_logs`, enqueue
`alerts:evaluate` + cache purge. **200** returns updated offering. **Errors:** 404, 409
`already_reviewed`. **Auth:** EDITOR+. **Rate:** admin.

### POST `/admin/scrape/jobs/{id}/run`  (ADMIN)
Enqueues a `scrape:vendor` job (`trigger=MANUAL`), returns the created `scrape_runs` id + queue
position. **202 Accepted.** **Errors:** 404, 409 `run_already_active`. **Auth:** ADMIN. **Rate:**
scraper-control.

---

## Standard error responses (all endpoints)
```json
{ "error": { "code": "validation_error", "message": "Invalid request body",
  "details": { "threshold": "Required when kind is BELOW_THRESHOLD" } } }
```
| Status | code (examples) |
|---|---|
| 400 | `validation_error`, `malformed_cursor` |
| 401 | `unauthenticated` |
| 403 | `forbidden`, `insufficient_role` |
| 404 | `test_not_found`, `offering_not_found` |
| 409 | `already_reviewed`, `alert_limit_reached`, `run_already_active` |
| 429 | `rate_limited` (+ `Retry-After`) |
| 500 | `internal_error` (opaque; correlation id in logs/Sentry) |
