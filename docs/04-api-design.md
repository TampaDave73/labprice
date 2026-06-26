# Deliverable #4 — API Design

Base URL: `/api/v1`. All endpoints are Next.js API routes.

---

## 1. Conventions

| Concern | Convention |
|---|---|
| **Format** | JSON. `Content-Type: application/json`. |
| **Auth** | Browser sessions via Auth.js v5 cookies. Programmatic clients use `Authorization: Bearer <jwt>` from auth endpoints. Public read endpoints need no auth. |
| **Versioning** | URI-versioned (`/api/v1`). Breaking changes get `/api/v2`; additive changes stay in v1. |
| **Pagination** | Cursor-based: `?cursor=<opaque>&limit=<n>`. Default limit 25, max 100. Response: `{ data: [...], nextCursor: string | null }`. |
| **Money** | String decimals (`"29.00"`) to avoid float drift. Always USD in v1. |
| **Timestamps** | ISO 8601 UTC (e.g. `"2026-06-25T08:00:00Z"`). |
| **Validation** | Zod schemas on all inputs. Validation errors return field-level details. |
| **Idempotency** | Unsafe POST mutations accept `Idempotency-Key` header (UUID v4). Server stores result for 24h; replays return cached response. |
| **Errors** | Standard envelope (see section 3). |

---

## 2. Rate Limit Tiers

All rate limits use Redis sliding-window counters. Every response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers. Breaches return 429 with `Retry-After`.

| Tier | Scope | Limit | Applies to |
|---|---|---|---|
| `public-read` | IP | 120 req/min | Search, catalog, trends, categories, vendors |
| `public-write` | IP | 30 req/min | Analytics beacons, auth endpoints |
| `authed-read` | User | 300 req/min | `/me/*` reads, notifications |
| `authed-write` | User | 60 req/min | Saved tests, alerts, profile updates |
| `admin` | User | 600 req/min | All `/admin/**` endpoints |
| `scraper-internal` | Service token | 1000 req/min | Internal scraper callbacks |

---

## 3. Standard Error Envelope

All error responses use this shape:

```json
{
  "error": {
    "code": "SNAKE_CASE_ERROR",
    "message": "Human-readable description",
    "details": {}
  }
}
```

`details` is optional. For validation errors, it maps field names to error messages.

### Standard Error Codes

| Status | Code | When |
|---|---|---|
| 400 | `validation_error` | Zod validation failure |
| 400 | `malformed_cursor` | Invalid pagination cursor |
| 400 | `invalid_request` | Malformed JSON, missing content-type |
| 401 | `unauthenticated` | No valid session or token |
| 401 | `token_expired` | JWT expired |
| 403 | `forbidden` | Valid auth but insufficient role |
| 404 | `not_found` | Resource does not exist (or soft-deleted for non-admins) |
| 409 | `conflict` | Duplicate or state conflict (specifics vary) |
| 422 | `unprocessable_entity` | Semantically invalid (e.g. alert on nonexistent test) |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Opaque; correlation id in server logs |

---

## 4. Authentication & Roles

Auth.js v5 handles session management. Roles are hierarchical:

| Role | Level | Capabilities |
|---|---|---|
| `USER` | 1 | Read public data, save tests, create alerts |
| `EDITOR` | 2 | Manage catalog (tests, SEO pages), approve changes |
| `ADMIN` | 3 | Full catalog + vendors + offerings + users + scraper |
| `SUPER_ADMIN` | 4 | System settings, proxy management, all admin |

Notation: `EDITOR+` means EDITOR, ADMIN, or SUPER_ADMIN.

---

## 5. Endpoint Specifications

---

### 5.1 Auth Endpoints

---

#### POST `/auth/register`

Register a new user account. Sends a magic link to the provided email.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-write` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "email": "string — required, valid email",
  "name": "string — optional, 1-100 chars"
}
```

**Response 201**
```json
{
  "data": {
    "message": "Magic link sent to your email"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid email format, name too long |
| 409 | `email_already_registered` | Email already has an account |
| 429 | `rate_limited` | Too many requests |

---

#### POST `/auth/magic-link`

Send a magic link sign-in email to an existing user.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-write` |

**Request Body**
```json
{
  "email": "string — required, valid email"
}
```

**Response 200**
```json
{
  "data": {
    "message": "If an account exists, a magic link has been sent"
  }
}
```

Note: Always returns 200 to prevent email enumeration.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid email format |
| 429 | `rate_limited` | Too many requests |

---

#### POST `/auth/token`

Exchange a magic link token for a Bearer JWT (for API/mobile clients).

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-write` |

**Request Body**
```json
{
  "token": "string — required, the magic link token",
  "provider": "string — optional, 'email' | 'google', default 'email'"
}
```

**Response 200**
```json
{
  "data": {
    "accessToken": "string — JWT, 15min TTL",
    "refreshToken": "string — opaque, 30d TTL",
    "expiresAt": "2026-06-25T08:15:00Z",
    "user": {
      "id": "string",
      "email": "string",
      "name": "string | null",
      "role": "USER | EDITOR | ADMIN | SUPER_ADMIN"
    }
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing token |
| 401 | `invalid_token` | Token invalid, expired, or already used |
| 429 | `rate_limited` | Too many requests |

---

#### POST `/auth/refresh`

Rotate access token using a refresh token.

| | |
|---|---|
| **Auth** | None (refresh token in body) |
| **Rate Limit** | `public-write` |

**Request Body**
```json
{
  "refreshToken": "string — required"
}
```

**Response 200**
```json
{
  "data": {
    "accessToken": "string — new JWT",
    "refreshToken": "string — rotated refresh token",
    "expiresAt": "2026-06-25T08:30:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing refresh token |
| 401 | `invalid_refresh_token` | Token invalid or revoked |
| 429 | `rate_limited` | Too many requests |

---

#### POST `/auth/logout`

End the current session and invalidate tokens.

| | |
|---|---|
| **Auth** | Session cookie or Bearer token |
| **Rate Limit** | `authed-write` |

**Request Body**
```json
{
  "refreshToken": "string — optional, revoke specific refresh token"
}
```

**Response 200**
```json
{
  "data": {
    "message": "Logged out"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |

---

#### GET `/auth/session`

Return current session information.

| | |
|---|---|
| **Auth** | Session cookie or Bearer token |
| **Rate Limit** | `authed-read` |

**Response 200**
```json
{
  "data": {
    "user": {
      "id": "string",
      "email": "string",
      "name": "string | null",
      "role": "USER | EDITOR | ADMIN | SUPER_ADMIN",
      "image": "string | null"
    },
    "expiresAt": "2026-07-25T08:00:00Z"
  }
}
```

**Response 200 (unauthenticated)**
```json
{
  "data": null
}
```

---

### 5.2 User Endpoints

---

#### GET `/me`

Return current user profile.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-read` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "email": "string",
    "name": "string | null",
    "role": "USER | EDITOR | ADMIN | SUPER_ADMIN",
    "image": "string | null",
    "notificationPrefs": {
      "emailAlerts": "boolean",
      "marketingEmails": "boolean"
    },
    "createdAt": "2026-01-15T10:00:00Z",
    "savedTestCount": "number",
    "activeAlertCount": "number"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |

---

#### PATCH `/me`

Update current user profile.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |

**Request Body**
```json
{
  "name": "string — optional, 1-100 chars",
  "notificationPrefs": {
    "emailAlerts": "boolean — optional",
    "marketingEmails": "boolean — optional"
  }
}
```

**Response 200**
```json
{
  "data": {
    "id": "string",
    "email": "string",
    "name": "string | null",
    "role": "string",
    "notificationPrefs": {
      "emailAlerts": "boolean",
      "marketingEmails": "boolean"
    },
    "updatedAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid fields |
| 401 | `unauthenticated` | No valid session |

---

#### GET `/me/saved-tests`

List the current user's saved tests with current pricing.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-read` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Items per page (max 100) |

**Response 200**
```json
{
  "data": [
    {
      "testId": "string",
      "slug": "string",
      "name": "string",
      "category": "string",
      "bestPrice": "29.00",
      "priceChange": "-2.00",
      "vendorCount": 8,
      "savedAt": "2026-06-20T10:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |

---

#### POST `/me/saved-tests`

Save a test to the user's list.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "testId": "string — required"
}
```

**Response 201**
```json
{
  "data": {
    "testId": "string",
    "savedAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing testId |
| 401 | `unauthenticated` | No valid session |
| 404 | `test_not_found` | Test does not exist |
| 409 | `already_saved` | Test already saved |

---

#### DELETE `/me/saved-tests/:testId`

Remove a test from the user's saved list.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |

**Response 204** — No content.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 404 | `saved_test_not_found` | Test not in saved list |

---

#### GET `/me/alerts`

List the current user's price alerts.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-read` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Items per page (max 100) |
| `status` | string | — | Filter: `active`, `paused`, `triggered` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "kind": "BELOW_THRESHOLD | ANY_DROP | BACK_IN_STOCK",
      "testId": "string",
      "testName": "string",
      "testSlug": "string",
      "threshold": "25.00 | null",
      "status": "active | paused | triggered",
      "currentPrice": "29.00",
      "lastTriggeredAt": "2026-06-20T10:00:00Z | null",
      "createdAt": "2026-06-15T10:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |

---

#### POST `/me/alerts`

Create a new price alert.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "kind": "BELOW_THRESHOLD | ANY_DROP | BACK_IN_STOCK — required",
  "testId": "string — required",
  "offeringId": "string — optional, scope to specific vendor offering",
  "threshold": "string decimal — required when kind=BELOW_THRESHOLD"
}
```

**Response 201**
```json
{
  "data": {
    "id": "string",
    "kind": "BELOW_THRESHOLD",
    "testId": "string",
    "offeringId": "string | null",
    "threshold": "25.00",
    "status": "active",
    "createdAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing fields, threshold required for BELOW_THRESHOLD |
| 401 | `unauthenticated` | No valid session |
| 404 | `test_not_found` | Test does not exist |
| 409 | `alert_limit_reached` | User has hit max alerts (configurable, default 20) |
| 409 | `duplicate_alert` | Alert for same test/kind already exists |
| 422 | `unprocessable_entity` | Offering does not belong to test |

---

#### PATCH `/me/alerts/:id`

Update an existing price alert (toggle status or change threshold).

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |

**Request Body**
```json
{
  "status": "active | paused — optional",
  "threshold": "string decimal — optional"
}
```

**Response 200**
```json
{
  "data": {
    "id": "string",
    "kind": "BELOW_THRESHOLD",
    "testId": "string",
    "threshold": "20.00",
    "status": "active",
    "updatedAt": "2026-06-25T09:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid fields |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Alert belongs to another user |
| 404 | `alert_not_found` | Alert does not exist |

---

#### DELETE `/me/alerts/:id`

Delete a price alert.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |

**Response 204** — No content.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Alert belongs to another user |
| 404 | `alert_not_found` | Alert does not exist |

---

#### GET `/me/notifications`

List alert notifications (delivery log).

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-read` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Items per page (max 100) |
| `unreadOnly` | boolean | false | Filter to unread only |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "alertId": "string",
      "type": "price_drop | threshold_reached | back_in_stock",
      "testName": "string",
      "testSlug": "string",
      "message": "Vitamin D dropped to $25.00 at Life Extension",
      "oldPrice": "29.00",
      "newPrice": "25.00",
      "vendorName": "string",
      "read": false,
      "createdAt": "2026-06-25T08:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |

---

#### POST `/me/export`

Request a GDPR data export. Generates a ZIP archive and emails a download link.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |

**Response 202**
```json
{
  "data": {
    "message": "Export started. You will receive an email with a download link.",
    "estimatedMinutes": 5
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 409 | `export_in_progress` | An export is already being generated |
| 429 | `rate_limited` | Max 1 export per 24h |

---

#### DELETE `/me`

GDPR account deletion. Soft-deletes immediately; purge job runs after 30-day grace period.

| | |
|---|---|
| **Auth** | USER+ |
| **Rate Limit** | `authed-write` |

**Request Body**
```json
{
  "confirmation": "DELETE — required, must be literal string 'DELETE'"
}
```

**Response 200**
```json
{
  "data": {
    "message": "Account scheduled for deletion",
    "deletionDate": "2026-07-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing or incorrect confirmation string |
| 401 | `unauthenticated` | No valid session |

---

### 5.3 Search Endpoints

---

#### GET `/search`

Full-text search across tests with filters. Matches on name, short name, synonyms, Quest/LabCorp codes, biomarkers, and category.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Search query (min 2 chars) |
| `category` | string | — | Filter by category slug |
| `minPrice` | string | — | Min best price filter |
| `maxPrice` | string | — | Max best price filter |
| `vendor` | string | — | Filter by vendor slug |
| `sort` | string | `relevance` | `relevance`, `price_asc`, `price_desc`, `name_asc` |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Items per page (max 100) |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "slug": "string",
      "name": "string",
      "shortName": "string | null",
      "category": {
        "name": "string",
        "slug": "string"
      },
      "codes": [
        { "system": "QUEST", "code": "17306" },
        { "system": "LABCORP", "code": "081950" }
      ],
      "bestPrice": "29.00",
      "vendorCount": 8,
      "savings": "50.00"
    }
  ],
  "nextCursor": "string | null",
  "totalEstimate": "number — approximate total matches"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Query too short, invalid sort, invalid price range |

---

#### GET `/search/autocomplete`

Typeahead suggestions. Returns at most 6 results.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=300` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Search prefix (min 2 chars, returns `[]` if shorter) |

**Response 200**
```json
{
  "data": [
    {
      "slug": "string",
      "name": "string",
      "codeStr": "Quest 17306 · LabCorp 081950",
      "fromPrice": "29.00"
    }
  ]
}
```

Matches name, shortName, synonyms, category, Quest/LabCorp codes via trigram + full-text search.

---

#### GET `/search/biomarkers`

Search for tests that measure a specific biomarker.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `b` | string | — | Biomarker name or partial match (min 2 chars) |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Items per page (max 100) |

**Response 200**
```json
{
  "data": [
    {
      "biomarker": "25-Hydroxyvitamin D",
      "tests": [
        {
          "slug": "string",
          "name": "string",
          "bestPrice": "29.00",
          "vendorCount": 8
        }
      ]
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Query too short |

---

### 5.4 Catalog Endpoints

---

#### GET `/tests`

List tests with optional filtering and sorting.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=600, stale-while-revalidate=86400` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `category` | string | — | Filter by category slug |
| `popular` | boolean | — | Filter to popular tests |
| `sort` | string | `name_asc` | `name_asc`, `name_desc`, `price_asc`, `price_desc`, `popular` |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Items per page (max 100) |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "slug": "string",
      "name": "string",
      "shortName": "string | null",
      "category": {
        "name": "string",
        "slug": "string",
        "colorHint": "string"
      },
      "bestPrice": "29.00",
      "vendorCount": 8,
      "savings": "50.00"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid category slug, invalid sort value |
| 400 | `malformed_cursor` | Invalid pagination cursor |

---

#### GET `/tests/:slug`

Full test detail including content, codes, and all vendor offerings sorted by price.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=600, stale-while-revalidate=86400`, cache-tag `test:{slug}` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "name": "string",
    "shortName": "string | null",
    "category": {
      "name": "string",
      "slug": "string",
      "colorHint": "string"
    },
    "codes": [
      { "system": "QUEST", "code": "17306" },
      { "system": "LABCORP", "code": "081950" }
    ],
    "content": {
      "description": "string",
      "purpose": "string",
      "procedure": "string",
      "preparation": "string",
      "normalRange": "string"
    },
    "biomarkers": ["25-Hydroxyvitamin D"],
    "bestPrice": {
      "amount": "29.00",
      "vendor": "Life Extension",
      "offeringId": "string"
    },
    "savings": "50.00",
    "offerings": [
      {
        "offeringId": "string",
        "vendor": "string",
        "vendorSlug": "string",
        "price": "29.00",
        "currency": "USD",
        "inStock": true,
        "isCheapest": true,
        "priceObservedAt": "2026-06-25T08:00:00Z",
        "stale": false,
        "orderUrl": "/api/v1/go/{offeringId}"
      }
    ],
    "seo": {
      "title": "string",
      "description": "string"
    }
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 404 | `test_not_found` | No test with that slug |

---

#### GET `/tests/:slug/trend`

Price trend data for a test over time. Returns the lowest price across all vendors at each data point.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=3600` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `range` | string | `90d` | `30d`, `90d`, `180d`, `1y`, `all` |
| `vendorSlug` | string | — | Optional: scope to one vendor |

**Response 200**
```json
{
  "data": {
    "testSlug": "string",
    "range": "90d",
    "points": [
      {
        "date": "2026-04-01",
        "minPrice": "29.00",
        "maxPrice": "79.00",
        "avgPrice": "45.50",
        "vendorCount": 8
      }
    ],
    "currentBest": "29.00",
    "periodLow": "27.00",
    "periodHigh": "32.00"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid range value |
| 404 | `test_not_found` | No test with that slug |

---

#### GET `/categories`

List all test categories with test counts.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=3600` |

**Response 200**
```json
{
  "data": [
    {
      "slug": "string",
      "name": "string",
      "colorHint": "string",
      "testCount": 42,
      "description": "string"
    }
  ]
}
```

---

#### GET `/vendors`

List active ordering services.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=3600` |

**Response 200**
```json
{
  "data": [
    {
      "slug": "string",
      "name": "string",
      "logoUrl": "string | null",
      "testCount": 150,
      "priceRange": {
        "min": "15.00",
        "max": "499.00"
      }
    }
  ]
}
```

---

#### GET `/vendors/:slug`

Vendor detail page data.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-read` |
| **Cache** | `s-maxage=3600` |

**Response 200**
```json
{
  "data": {
    "slug": "string",
    "name": "string",
    "logoUrl": "string | null",
    "website": "string",
    "description": "string | null",
    "testCount": 150,
    "cheapestCount": 42,
    "priceRange": {
      "min": "15.00",
      "max": "499.00"
    },
    "seo": {
      "title": "string",
      "description": "string"
    }
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 404 | `vendor_not_found` | No vendor with that slug |

---

#### GET `/go/:offeringId`

Affiliate redirect. Logs an affiliate click, then 302 redirects to the vendor's order URL. Logging is fire-and-forget; a log failure never blocks the redirect.

| | |
|---|---|
| **Auth** | None (optional session for attribution) |
| **Rate Limit** | `public-read` (generous — never blocks the UX redirect) |

**Response 302** — Redirect to vendor order URL with affiliate sub-ID.

**Response Headers**
```
Location: https://vendor.example.com/order?test=123&subId=click_abc
Cache-Control: no-store
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 404 | `offering_not_found` | Offering does not exist or is inactive |

---

### 5.5 Analytics Endpoints

---

#### POST `/analytics/pageview`

Log a page view. Used by the client-side analytics beacon. Sampled and rate-limited.

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-write` |

**Request Body**
```json
{
  "path": "string — required, URL path",
  "referrer": "string — optional",
  "sessionId": "string — optional, anonymous session ID",
  "viewport": "string — optional, e.g. '1920x1080'"
}
```

**Response 204** — No content.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing path |
| 429 | `rate_limited` | Too many requests |

---

#### POST `/analytics/event`

Log a custom analytics event (e.g. search performed, test viewed, compare opened).

| | |
|---|---|
| **Auth** | None |
| **Rate Limit** | `public-write` |

**Request Body**
```json
{
  "event": "string — required, event name (e.g. 'search', 'test_view', 'compare')",
  "properties": "object — optional, arbitrary key-value pairs",
  "sessionId": "string — optional"
}
```

**Response 204** — No content.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing event name |
| 429 | `rate_limited` | Too many requests |

---

### 5.6 Admin — Catalog Management

All admin endpoints require authentication and the appropriate role. All responses include `updatedBy` and audit log entries.

---

#### GET `/admin/tests`

List all tests including soft-deleted ones.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `category` | string | — | Filter by category slug |
| `status` | string | `active` | `active`, `deleted`, `all` |
| `q` | string | — | Search by name or code |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "slug": "string",
      "name": "string",
      "shortName": "string | null",
      "category": "string",
      "status": "active | deleted",
      "offeringCount": 10,
      "bestPrice": "29.00 | null",
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-06-25T00:00:00Z",
      "deletedAt": "string | null"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### POST `/admin/tests`

Create a new test.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "name": "string — required, 1-200 chars",
  "shortName": "string — optional, 1-80 chars",
  "slug": "string — optional, auto-generated from name if omitted",
  "categorySlug": "string — required",
  "codes": [
    { "system": "QUEST | LABCORP", "code": "string" }
  ],
  "content": {
    "description": "string — required",
    "purpose": "string — optional",
    "procedure": "string — optional",
    "preparation": "string — optional",
    "normalRange": "string — optional"
  },
  "biomarkers": ["string"],
  "seo": {
    "title": "string — optional",
    "description": "string — optional"
  }
}
```

**Response 201**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "name": "string",
    "createdAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing required fields, invalid code system |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 409 | `slug_conflict` | Slug already in use |

---

#### PATCH `/admin/tests/:id`

Update an existing test.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Request Body** — Same fields as POST, all optional. Partial update.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "name": "string",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string — user ID"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid fields |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `test_not_found` | Test does not exist |
| 409 | `slug_conflict` | New slug conflicts with existing test |

---

#### DELETE `/admin/tests/:id`

Soft-delete a test. Hides from public but preserves data.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "deletedAt": "2026-06-25T08:00:00Z",
    "deletedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `test_not_found` | Test does not exist |
| 409 | `already_deleted` | Test already soft-deleted |

---

#### GET `/admin/vendors`

List all vendors including soft-deleted.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `status` | string | `active` | `active`, `deleted`, `all` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "slug": "string",
      "name": "string",
      "status": "active | deleted",
      "offeringCount": 150,
      "affiliateUrlTemplate": "string",
      "scrapeEnabled": true,
      "lastScrapedAt": "2026-06-25T06:00:00Z | null",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### POST `/admin/vendors`

Create a new vendor (ordering service).

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "name": "string — required",
  "slug": "string — optional, auto-generated",
  "website": "string — required, valid URL",
  "logoUrl": "string — optional, valid URL",
  "description": "string — optional",
  "affiliateUrlTemplate": "string — required, must contain {subId} placeholder",
  "scrapeEnabled": "boolean — default true"
}
```

**Response 201**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "name": "string",
    "createdAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing fields, invalid URL, template missing {subId} |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 409 | `slug_conflict` | Slug already in use |

---

#### PATCH `/admin/vendors/:id`

Update a vendor.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body** — Same fields as POST, all optional.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "name": "string",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid fields |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `vendor_not_found` | Vendor does not exist |
| 409 | `slug_conflict` | Slug conflict |

---

#### DELETE `/admin/vendors/:id`

Soft-delete a vendor.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "deletedAt": "2026-06-25T08:00:00Z",
    "deletedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `vendor_not_found` | Vendor does not exist |

---

#### GET `/admin/offerings`

List offerings (price listings) with filters.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `testId` | string | — | Filter by test |
| `vendorId` | string | — | Filter by vendor |
| `status` | string | `active` | `active`, `deleted`, `all` |
| `stale` | boolean | — | Filter stale offerings |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "testId": "string",
      "testName": "string",
      "vendorId": "string",
      "vendorName": "string",
      "currentPrice": "29.00",
      "previousPrice": "32.00 | null",
      "inStock": true,
      "stale": false,
      "priceObservedAt": "2026-06-25T08:00:00Z",
      "priceSource": "SCRAPE | MANUAL",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### POST `/admin/offerings`

Create a new offering (link a test to a vendor with a price).

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "testId": "string — required",
  "vendorId": "string — required",
  "price": "string decimal — required, e.g. '29.00'",
  "inStock": "boolean — default true",
  "vendorTestUrl": "string — optional, direct URL to this test on vendor site"
}
```

**Response 201**
```json
{
  "data": {
    "id": "string",
    "testId": "string",
    "vendorId": "string",
    "currentPrice": "29.00",
    "inStock": true,
    "createdAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing fields, invalid price format |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `test_not_found` | Test does not exist |
| 404 | `vendor_not_found` | Vendor does not exist |
| 409 | `offering_exists` | This test+vendor combination already has an offering |

---

#### PATCH `/admin/offerings/:id`

Update an offering. Used for manual price corrections.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "price": "string decimal — optional, sets manual price override",
  "inStock": "boolean — optional",
  "vendorTestUrl": "string — optional"
}
```

When `price` is set, a `price_history` entry is created with `source=MANUAL`.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "currentPrice": "25.00",
    "previousPrice": "29.00",
    "priceSource": "MANUAL",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid price format |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `offering_not_found` | Offering does not exist |

---

#### DELETE `/admin/offerings/:id`

Soft-delete an offering.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "deletedAt": "2026-06-25T08:00:00Z",
    "deletedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `offering_not_found` | Offering does not exist |

---

### 5.7 Admin — Change Queue

Scraped price changes are staged for review before going live.

---

#### GET `/admin/changes`

List staged price changes.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `status` | string | `pending` | `pending`, `approved`, `rejected`, `all` |
| `vendorId` | string | — | Filter by vendor |
| `testId` | string | — | Filter by test |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "offeringId": "string",
      "testName": "string",
      "vendorName": "string",
      "oldPrice": "32.00",
      "newPrice": "29.00",
      "oldInStock": true,
      "newInStock": true,
      "changeType": "PRICE_DROP | PRICE_INCREASE | STOCK_CHANGE | NEW_OFFERING",
      "percentChange": "-9.38",
      "status": "pending | approved | rejected",
      "scrapeRunId": "string",
      "detectedAt": "2026-06-25T06:00:00Z",
      "reviewedBy": "string | null",
      "reviewedAt": "string | null",
      "rejectionReason": "string | null"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### POST `/admin/changes/:id/approve`

Approve a staged change. Transactionally updates the offering price, appends price history, writes audit log, and enqueues alert evaluation + cache purge.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Request Body** — None required.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "status": "approved",
    "offeringId": "string",
    "newPrice": "29.00",
    "reviewedBy": "string",
    "reviewedAt": "2026-06-25T09:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `change_not_found` | Change does not exist |
| 409 | `already_reviewed` | Change already approved or rejected |

---

#### POST `/admin/changes/:id/reject`

Reject a staged change with a reason.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "reason": "string — required, 1-500 chars"
}
```

**Response 200**
```json
{
  "data": {
    "id": "string",
    "status": "rejected",
    "rejectionReason": "string",
    "reviewedBy": "string",
    "reviewedAt": "2026-06-25T09:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing reason |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `change_not_found` | Change does not exist |
| 409 | `already_reviewed` | Change already approved or rejected |

---

#### POST `/admin/changes/bulk`

Bulk approve or reject multiple changes.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "ids": ["string — required, 1-100 change IDs"],
  "action": "approve | reject — required",
  "reason": "string — required when action=reject"
}
```

**Response 200**
```json
{
  "data": {
    "processed": 15,
    "succeeded": 14,
    "failed": 1,
    "failures": [
      {
        "id": "string",
        "error": "already_reviewed"
      }
    ]
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing ids/action, too many ids (>100), reason required for reject |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

### 5.8 Admin — Scraper Management

---

#### GET `/admin/scrape/configs`

List scrape configurations for all vendors.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": [
    {
      "vendorId": "string",
      "vendorName": "string",
      "enabled": true,
      "strategy": "HTML_PARSE | API | HEADLESS",
      "baseUrl": "string",
      "scheduleExpression": "string — cron expression",
      "selectors": {
        "priceSelector": "string",
        "nameSelector": "string",
        "stockSelector": "string | null"
      },
      "headers": "object — custom headers",
      "rateLimit": {
        "requestsPerSecond": 2,
        "concurrency": 1
      },
      "lastTestedAt": "2026-06-20T00:00:00Z | null",
      "lastTestStatus": "success | failure | null",
      "updatedAt": "2026-06-15T00:00:00Z"
    }
  ]
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### PUT `/admin/scrape/configs/:vendorId`

Update scrape configuration for a vendor.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "enabled": "boolean — optional",
  "strategy": "HTML_PARSE | API | HEADLESS — optional",
  "baseUrl": "string — optional, valid URL",
  "scheduleExpression": "string — optional, valid cron",
  "selectors": {
    "priceSelector": "string",
    "nameSelector": "string",
    "stockSelector": "string | null"
  },
  "headers": "object — optional",
  "rateLimit": {
    "requestsPerSecond": "number — optional, 0.1-10",
    "concurrency": "number — optional, 1-5"
  }
}
```

**Response 200**
```json
{
  "data": {
    "vendorId": "string",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid selectors, cron, URL |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `vendor_not_found` | Vendor does not exist |

---

#### POST `/admin/scrape/configs/:vendorId/test-run`

Execute a test scrape for a single vendor. Scrapes a small sample without persisting changes.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "maxPages": "number — optional, default 3, max 10",
  "dryRun": "boolean — default true"
}
```

**Response 200**
```json
{
  "data": {
    "vendorId": "string",
    "status": "success | partial | failure",
    "sampledCount": 3,
    "results": [
      {
        "offeringId": "string | null",
        "testName": "string",
        "scrapedPrice": "29.00",
        "currentPrice": "32.00 | null",
        "matched": true
      }
    ],
    "errors": ["string"],
    "durationMs": 2500
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid maxPages |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `vendor_not_found` | Vendor does not exist |
| 409 | `test_run_active` | A test run is already in progress for this vendor |

---

#### GET `/admin/scrape/jobs`

List scrape jobs.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `vendorId` | string | — | Filter by vendor |
| `status` | string | — | `queued`, `running`, `completed`, `failed` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "vendorId": "string",
      "vendorName": "string",
      "trigger": "SCHEDULED | MANUAL",
      "status": "queued | running | completed | failed",
      "startedAt": "2026-06-25T06:00:00Z | null",
      "completedAt": "2026-06-25T06:15:00Z | null",
      "runCount": 3,
      "createdAt": "2026-06-25T05:59:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### POST `/admin/scrape/jobs`

Trigger a manual scrape job for one or more vendors.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "vendorIds": ["string — required, 1+ vendor IDs"],
  "priority": "normal | high — optional, default normal"
}
```

**Response 202**
```json
{
  "data": {
    "jobs": [
      {
        "id": "string",
        "vendorId": "string",
        "status": "queued",
        "queuePosition": 3
      }
    ]
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Empty vendorIds |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `vendor_not_found` | One or more vendors do not exist |
| 409 | `job_already_active` | Active job exists for one or more vendors |

---

#### GET `/admin/scrape/jobs/:id`

Job detail with associated runs.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "vendorId": "string",
    "vendorName": "string",
    "trigger": "SCHEDULED | MANUAL",
    "triggeredBy": "string | null — user ID for manual",
    "status": "completed",
    "startedAt": "2026-06-25T06:00:00Z",
    "completedAt": "2026-06-25T06:15:00Z",
    "runs": [
      {
        "id": "string",
        "status": "completed | failed",
        "itemsScraped": 150,
        "changesDetected": 12,
        "errorsCount": 0,
        "durationMs": 45000,
        "startedAt": "2026-06-25T06:00:00Z",
        "completedAt": "2026-06-25T06:05:00Z"
      }
    ]
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `job_not_found` | Job does not exist |

---

#### GET `/admin/scrape/runs/:id`

Run detail with individual scrape results.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "jobId": "string",
    "vendorName": "string",
    "status": "completed",
    "itemsScraped": 150,
    "changesDetected": 12,
    "errorsCount": 2,
    "durationMs": 45000,
    "results": [
      {
        "offeringId": "string",
        "testName": "string",
        "oldPrice": "32.00",
        "newPrice": "29.00",
        "changeType": "PRICE_DROP",
        "changeId": "string — staged change ID"
      }
    ],
    "startedAt": "2026-06-25T06:00:00Z",
    "completedAt": "2026-06-25T06:05:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `run_not_found` | Run does not exist |

---

#### GET `/admin/scrape/errors`

List recent scrape errors across all vendors.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `vendorId` | string | — | Filter by vendor |
| `severity` | string | — | `warning`, `error`, `critical` |
| `since` | string | — | ISO 8601 timestamp, errors after this time |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "runId": "string",
      "vendorId": "string",
      "vendorName": "string",
      "severity": "warning | error | critical",
      "errorCode": "TIMEOUT | PARSE_FAILED | BLOCKED | SELECTOR_MISS | CONNECTION_ERROR",
      "message": "string",
      "url": "string — the URL that failed",
      "offeringId": "string | null",
      "createdAt": "2026-06-25T06:03:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

### 5.9 Admin — Users & System

---

#### GET `/admin/users`

List all users with role and status info.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `role` | string | — | Filter by role |
| `q` | string | — | Search by name or email |
| `status` | string | `active` | `active`, `deactivated`, `all` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "email": "string",
      "name": "string | null",
      "role": "USER | EDITOR | ADMIN | SUPER_ADMIN",
      "status": "active | deactivated",
      "savedTestCount": 5,
      "alertCount": 3,
      "lastLoginAt": "2026-06-24T10:00:00Z | null",
      "createdAt": "2026-01-15T00:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### PATCH `/admin/users/:id`

Update a user's role. Cannot escalate beyond own role.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "role": "USER | EDITOR | ADMIN — required"
}
```

SUPER_ADMIN role can only be granted by another SUPER_ADMIN.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "role": "EDITOR",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid role |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Cannot escalate beyond own role |
| 403 | `cannot_modify_self` | Cannot change own role |
| 404 | `user_not_found` | User does not exist |

---

#### DELETE `/admin/users/:id`

Deactivate a user account. Revokes sessions and disables login.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": {
    "id": "string",
    "status": "deactivated",
    "deactivatedAt": "2026-06-25T08:00:00Z",
    "deactivatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 403 | `cannot_deactivate_self` | Cannot deactivate own account |
| 404 | `user_not_found` | User does not exist |

---

#### GET `/admin/analytics/overview`

Dashboard KPIs for the admin panel.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `range` | string | `30d` | `7d`, `30d`, `90d` |

**Response 200**
```json
{
  "data": {
    "range": "30d",
    "searches": {
      "total": 45000,
      "trend": "+12.5%"
    },
    "affiliateClicks": {
      "total": 8500,
      "trend": "+8.2%"
    },
    "users": {
      "total": 2500,
      "newInPeriod": 350
    },
    "tests": {
      "total": 400,
      "withOfferings": 380
    },
    "priceChanges": {
      "pendingReview": 25,
      "approvedInPeriod": 180
    },
    "topTests": [
      { "slug": "string", "name": "string", "views": 1200 }
    ],
    "topVendors": [
      { "slug": "string", "name": "string", "clicks": 800 }
    ]
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### GET `/admin/analytics/searches`

Top search queries and zero-result queries.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `range` | string | `30d` | `7d`, `30d`, `90d` |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `type` | string | `top` | `top`, `zero_results` |

**Response 200**
```json
{
  "data": [
    {
      "query": "string",
      "count": 450,
      "resultCount": 12,
      "clickThroughRate": "0.35"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### GET `/admin/analytics/clicks`

Affiliate click analytics by vendor, test, and date.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `range` | string | `30d` | `7d`, `30d`, `90d` |
| `vendorId` | string | — | Filter by vendor |
| `testId` | string | — | Filter by test |
| `groupBy` | string | `date` | `date`, `vendor`, `test` |

**Response 200**
```json
{
  "data": [
    {
      "date": "2026-06-25",
      "vendorName": "string | null",
      "testName": "string | null",
      "clicks": 120,
      "uniqueUsers": 95
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### GET `/admin/flags`

List all feature flags.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "key": "string — e.g. 'enable_biomarker_search'",
      "enabled": true,
      "description": "string",
      "updatedAt": "2026-06-20T00:00:00Z",
      "updatedBy": "string | null"
    }
  ]
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### PATCH `/admin/flags/:id`

Toggle a feature flag.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "enabled": "boolean — required"
}
```

**Response 200**
```json
{
  "data": {
    "id": "string",
    "key": "string",
    "enabled": false,
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing enabled field |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `flag_not_found` | Flag does not exist |

---

#### GET `/admin/settings`

List all system settings.

| | |
|---|---|
| **Auth** | SUPER_ADMIN |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": [
    {
      "key": "string — e.g. 'max_alerts_per_user'",
      "value": "string — JSON-encoded value",
      "type": "number | string | boolean | json",
      "description": "string",
      "updatedAt": "2026-06-15T00:00:00Z",
      "updatedBy": "string | null"
    }
  ]
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Must be SUPER_ADMIN |

---

#### PATCH `/admin/settings/:key`

Update a system setting.

| | |
|---|---|
| **Auth** | SUPER_ADMIN |
| **Rate Limit** | `admin` |

**Request Body**
```json
{
  "value": "string — required, JSON-encoded value matching the setting's type"
}
```

**Response 200**
```json
{
  "data": {
    "key": "string",
    "value": "string",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Value does not match expected type |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Must be SUPER_ADMIN |
| 404 | `setting_not_found` | Setting key does not exist |

---

#### GET `/admin/seo-pages`

List SEO landing pages.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `status` | string | `published` | `published`, `draft`, `all` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "slug": "string",
      "title": "string",
      "status": "published | draft",
      "path": "string — URL path",
      "updatedAt": "2026-06-20T00:00:00Z",
      "updatedBy": "string"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### POST `/admin/seo-pages`

Create an SEO landing page.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "slug": "string — required",
  "title": "string — required",
  "path": "string — required, URL path",
  "metaDescription": "string — optional",
  "heading": "string — optional",
  "body": "string — optional, HTML or markdown",
  "testIds": ["string — optional, featured tests"],
  "status": "published | draft — default draft"
}
```

**Response 201**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "path": "string",
    "status": "draft",
    "createdAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Missing required fields |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 409 | `slug_conflict` | Slug or path already in use |

---

#### PATCH `/admin/seo-pages/:id`

Update an SEO page.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Request Body** — Same fields as POST, all optional.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "slug": "string",
    "updatedAt": "2026-06-25T08:00:00Z",
    "updatedBy": "string"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid fields |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `seo_page_not_found` | Page does not exist |
| 409 | `slug_conflict` | Slug or path conflict |

---

#### DELETE `/admin/seo-pages/:id`

Delete an SEO page.

| | |
|---|---|
| **Auth** | EDITOR+ |
| **Rate Limit** | `admin` |

**Response 204** — No content.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |
| 404 | `seo_page_not_found` | Page does not exist |

---

#### GET `/admin/audit-logs`

Read-only audit log. Every admin mutation is logged.

| | |
|---|---|
| **Auth** | ADMIN+ |
| **Rate Limit** | `admin` |

**Query Parameters**
| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 25 | Max 100 |
| `userId` | string | — | Filter by acting user |
| `action` | string | — | Filter by action type |
| `resource` | string | — | Filter by resource type (test, vendor, offering, user, etc.) |
| `since` | string | — | ISO 8601 timestamp |
| `until` | string | — | ISO 8601 timestamp |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "userId": "string",
      "userName": "string",
      "action": "create | update | delete | approve | reject",
      "resource": "test | vendor | offering | user | flag | setting | seo_page | proxy",
      "resourceId": "string",
      "changes": {
        "before": {},
        "after": {}
      },
      "ipAddress": "string",
      "createdAt": "2026-06-25T08:00:00Z"
    }
  ],
  "nextCursor": "string | null"
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Insufficient role |

---

#### GET `/admin/proxies`

List proxy pool entries used by the scraper.

| | |
|---|---|
| **Auth** | SUPER_ADMIN |
| **Rate Limit** | `admin` |

**Response 200**
```json
{
  "data": [
    {
      "id": "string",
      "host": "string",
      "port": "number",
      "protocol": "http | https | socks5",
      "username": "string | null",
      "enabled": true,
      "region": "string | null",
      "successRate": "0.95",
      "lastUsedAt": "2026-06-25T06:00:00Z | null",
      "createdAt": "2026-06-01T00:00:00Z"
    }
  ]
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Must be SUPER_ADMIN |

---

#### POST `/admin/proxies`

Add a proxy to the pool.

| | |
|---|---|
| **Auth** | SUPER_ADMIN |
| **Rate Limit** | `admin` |
| **Idempotency** | `Idempotency-Key` supported |

**Request Body**
```json
{
  "host": "string — required",
  "port": "number — required, 1-65535",
  "protocol": "http | https | socks5 — required",
  "username": "string — optional",
  "password": "string — optional",
  "region": "string — optional, e.g. 'us-east-1'",
  "enabled": "boolean — default true"
}
```

**Response 201**
```json
{
  "data": {
    "id": "string",
    "host": "string",
    "port": "number",
    "protocol": "string",
    "createdAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid host, port, protocol |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Must be SUPER_ADMIN |
| 409 | `proxy_exists` | Host+port combination already in pool |

---

#### PATCH `/admin/proxies/:id`

Update a proxy entry.

| | |
|---|---|
| **Auth** | SUPER_ADMIN |
| **Rate Limit** | `admin` |

**Request Body** — Same fields as POST, all optional.

**Response 200**
```json
{
  "data": {
    "id": "string",
    "host": "string",
    "port": "number",
    "enabled": true,
    "updatedAt": "2026-06-25T08:00:00Z"
  }
}
```

**Errors**
| Status | Code | Condition |
|---|---|---|
| 400 | `validation_error` | Invalid fields |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Must be SUPER_ADMIN |
| 404 | `proxy_not_found` | Proxy does not exist |

---

#### DELETE `/admin/proxies/:id`

Remove a proxy from the pool.

| | |
|---|---|
| **Auth** | SUPER_ADMIN |
| **Rate Limit** | `admin` |

**Response 204** — No content.

**Errors**
| Status | Code | Condition |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Must be SUPER_ADMIN |
| 404 | `proxy_not_found` | Proxy does not exist |

---

## 6. Common Response Headers

All responses include:

| Header | Description |
|---|---|
| `X-Request-Id` | Unique request correlation ID (UUID) |
| `X-RateLimit-Limit` | Max requests for the current tier window |
| `X-RateLimit-Remaining` | Requests remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait (only on 429 responses) |

---

## 7. Webhook Events (Internal)

The system emits internal events (not exposed as API) for async processing:

| Event | Trigger | Consumer |
|---|---|---|
| `scrape:vendor` | Scheduled cron or manual trigger | Scraper worker |
| `alerts:evaluate` | Price change approved | Alert evaluation worker |
| `cache:purge` | Price change approved, catalog edit | CDN/cache invalidation |
| `export:generate` | User requests GDPR export | Export worker |
| `user:purge` | 30 days after account deletion | Data purge worker |

---

## 8. Versioning & Deprecation Policy

- All endpoints are under `/api/v1`.
- Additive, non-breaking changes (new fields, new endpoints) ship in v1 without version bump.
- Breaking changes (field removal, type changes, semantic changes) require `/api/v2`.
- Deprecated endpoints return `Sunset` and `Deprecation` headers with dates.
- Minimum 90-day deprecation window before removal.
