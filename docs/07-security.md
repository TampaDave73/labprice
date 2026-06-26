# Deliverable #7 — Security

## Threat Model

The public site is anonymous and read-heavy (low PII). The highest-value targets are:

1. **Admin panel / approval workflow** — data integrity and brand trust
2. **Affiliate click logging** — revenue fraud via fake clicks
3. **Scraper infrastructure / secrets** — proxy credentials, vendor relationships

All controls below are mapped to the OWASP Top 10 (2021) in Section 11.

---

## 1. Authentication

### Passwordless Login

LabPrice uses **Auth.js v5** (NextAuth) with the Prisma adapter. There are no passwords — the two
primary login methods are:

- **Magic-link email** — a single-use, short-TTL token sent via Resend. No password storage
  eliminates credential-stuffing and password-reuse risks entirely.
- **Google OAuth** — delegated authentication via Google's OpenID Connect flow. Auth.js handles the
  PKCE exchange, token validation, and account linking.

### Session Management (Web)

- **Database sessions** — Auth.js stores sessions in the `sessions` table (Prisma adapter), not in
  JWTs. This allows server-side revocation at any time.
- **Cookie attributes:**
  - `httpOnly` — inaccessible to JavaScript (mitigates XSS-based session theft)
  - `Secure` — transmitted only over HTTPS
  - `SameSite=Lax` — blocks cross-origin POST requests (mitigates CSRF)
- **Session lifetime:** 30 days absolute, with rolling renewal on activity. Each authenticated
  request extends the expiry, so active users are never logged out unexpectedly. Idle sessions
  expire naturally.
- **Session rotation:** the session token is rotated on privilege changes (role escalation, linking
  a new OAuth account) to prevent session fixation.

### API / Mobile Authentication (Future)

For headless API consumers and mobile apps:

- **Short-lived access JWTs** — 15-minute expiry, signed with `AUTH_SECRET` (HS256). Contains
  `sub` (userId), `role`, `iat`, `exp`. No sensitive data in the payload.
- **Refresh tokens** — 7-day expiry, stored in the `refresh_tokens` table with a `family` column.
  Issued alongside the access JWT via `/auth/token`.
- **Refresh token rotation** — each refresh exchanges the old token for a new one. The old token is
  invalidated immediately.
- **Reuse detection** — if a previously-invalidated refresh token is presented, the entire token
  family is revoked (all sessions for that user/device). This detects token theft: if an attacker
  and legitimate user both try to use the same refresh token, the second attempt kills the family.
- **Magic-link code exchange** — `/auth/token` accepts a verified magic-link code and returns the
  JWT + refresh token pair. The magic-link code is single-use and has a 10-minute TTL.

### Auth Endpoint Rate Limiting

- Maximum **5 magic-link requests per email per hour** (prevents email bombing and link brute-force).
- Maximum **10 failed OAuth attempts per IP per hour**.
- See Section 7 for the full rate-limiting architecture.

---

## 2. Authorization & RBAC

### Role Hierarchy

Roles are stored as a Prisma enum on the `users` table:

```
USER < EDITOR < ADMIN < SUPER_ADMIN
```

| Role | Capabilities |
|------|-------------|
| `USER` | Browse tests, manage own alerts/saved tests, view own data |
| `EDITOR` | All USER capabilities + create/edit catalog entries, manage SEO pages, moderate content |
| `ADMIN` | All EDITOR capabilities + manage users, approve/reject submissions, configure scrapers, view audit logs, destructive operations (delete offerings, reset data) |
| `SUPER_ADMIN` | All ADMIN capabilities + system configuration, manage roles, manage proxy credentials, access Doppler/secrets, deploy operations |

### Central Policy Function

All authorization decisions flow through a single `can(user, action, resource)` function:

```typescript
// lib/auth/rbac.ts
export function can(
  user: { id: string; role: Role },
  action: Action,
  resource: Resource
): boolean {
  // 1. Check role hierarchy (action minimum role)
  if (roleRank(user.role) < roleRank(action.minRole)) return false;

  // 2. Check resource ownership where applicable
  if (resource.ownerId && action.requiresOwnership) {
    return resource.ownerId === user.id;
  }

  return true;
}
```

### Route-Level Middleware

```typescript
// middleware/requireRole.ts
export function requireRole(minRole: Role) {
  return async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user) return unauthorized();
    if (roleRank(session.user.role) < roleRank(minRole)) return forbidden();
    // attach user to request context
  };
}
```

Every `/admin/**` route handler and server action uses `requireRole()`. The UI also checks roles
for conditional rendering, but this is **cosmetic only** — the server is the source of truth.

### Per-Resource Ownership Checks

- A user may only read/modify **their own** saved tests, alerts, and notification preferences.
- Ownership is asserted in the service layer, not inferred from client-supplied IDs:

```typescript
// services/alerts.ts
async function updateAlert(userId: string, alertId: string, data: UpdateAlertInput) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== userId) throw new ForbiddenError();
  // proceed with update
}
```

### Action → Minimum Role Mapping

| Action Category | Minimum Role |
|----------------|-------------|
| Browse catalog, search, compare | (anonymous) |
| Create/manage own alerts and saved tests | `USER` |
| Create/edit catalog entries, SEO pages | `EDITOR` |
| Approve/reject submissions, manage scrapers | `ADMIN` |
| Delete offerings, bulk operations | `ADMIN` |
| System configuration, role management, proxy credentials | `SUPER_ADMIN` |

---

## 3. Input Validation

### Zod Schema Enforcement

Every API endpoint validates its inputs with **Zod** schemas at the route boundary:

```typescript
// schemas/tests.ts
export const searchTestsSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'price', 'lab']).default('name'),
});
```

### Validation Rules

- **Strict type coercion** — no implicit `string → number` conversions. Use `z.coerce.number()`
  explicitly where numeric query params arrive as strings; all other types must match exactly.
- **Maximum string lengths** on all text fields:
  - Test names: 200 characters
  - Descriptions / SEO body: 10,000 characters
  - URLs: 2,048 characters
  - Email: 254 characters
  - Search queries: 200 characters
- **Unknown field stripping** — `z.object().strict()` or `.strip()` ensures unexpected fields are
  rejected or removed. No mass-assignment vulnerabilities.
- **Enum validation** — sort orders, status values, and role names are validated against explicit
  enums, never treated as free-form strings.

### File Upload Restrictions

File uploads are limited to admin-only operations (e.g., lab logos):

- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`
- **Maximum file size:** 2 MB
- **Server-side MIME validation** — the file's magic bytes are checked, not just the
  `Content-Type` header.
- **Filename sanitization** — uploaded files are renamed to a UUID; the original filename is never
  used in filesystem paths.
- Only `EDITOR+` roles may upload files.

---

## 4. SQL Injection Prevention

### Prisma Parameterized Queries

All database access goes through **Prisma Client**, which parameterizes every query automatically.
There is no hand-written SQL string concatenation anywhere in the codebase.

```typescript
// SAFE — Prisma parameterizes automatically
const test = await prisma.labTest.findMany({
  where: { name: { contains: userInput, mode: 'insensitive' } },
});
```

### Raw Query Safety

The few places that require raw SQL — full-text search (`search_vector`), partition management,
and complex aggregations — use **Prisma.$queryRaw with tagged template literals**:

```typescript
// SAFE — tagged template parameterizes the input
const results = await prisma.$queryRaw`
  SELECT id, name, ts_rank(search_vector, plainto_tsquery('english', ${query})) AS rank
  FROM lab_tests
  WHERE search_vector @@ plainto_tsquery('english', ${query})
  ORDER BY rank DESC
  LIMIT ${limit}
`;
```

**Never** use `Prisma.$queryRawUnsafe()` or string interpolation for user-supplied values.

### Database User Privileges

- The application connects as a **non-superuser** database role limited to `SELECT`, `INSERT`,
  `UPDATE`, `DELETE` on application tables.
- No `DROP`, `CREATE`, `ALTER`, or `TRUNCATE` permissions for the app role.
- Migrations run under a **separate privileged role** in CI/CD only, never from the application at
  runtime.
- The migration role's credentials are not available in the application environment.

---

## 5. XSS Prevention

### React's Built-in Escaping

React escapes all interpolated values by default. LabPrice does **not** use
`dangerouslySetInnerHTML` on any user-supplied or scraped data.

### Content Security Policy

Strict CSP headers are set via Next.js middleware and reinforced at the Cloudflare edge:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

| Directive | Rationale |
|-----------|-----------|
| `script-src 'self'` | No inline scripts in production. All JS is bundled by Next.js. |
| `style-src 'self' 'unsafe-inline'` | Tailwind CSS requires inline styles for utility classes. |
| `img-src 'self' data: https:` | Lab logos may be loaded from external HTTPS sources; `data:` for inline SVGs. |
| `font-src 'self' https://fonts.gstatic.com` | Google Fonts served from gstatic CDN. |
| `frame-ancestors 'none'` | Prevents clickjacking (equivalent to `X-Frame-Options: DENY`). |

### HTML Sanitization

The only place user-generated HTML is rendered is the **SEO page body** (authored by EDITOR+
admins). This content is sanitized server-side with **DOMPurify** before storage:

```typescript
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['h1','h2','h3','p','a','ul','ol','li','strong','em','br','img','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','src','alt','title','class'],
  });
}
```

### Additional Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 6. CSRF Protection

### SameSite Cookie Defense

All session cookies are set with `SameSite=Lax`, which prevents the browser from sending cookies
on cross-origin `POST`, `PUT`, `PATCH`, and `DELETE` requests. This is the primary CSRF defense.

### Origin Header Validation

Next.js middleware validates the `Origin` header on all mutation requests:

```typescript
// middleware.ts
if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }
}
```

### Auth.js CSRF Tokens

Auth.js provides built-in CSRF token protection for all authentication flows (sign-in, sign-out,
callback). These tokens are validated automatically by the Auth.js middleware.

### API Clients

Pure Bearer-token API clients (future mobile/headless) are not cookie-authenticated and therefore
not susceptible to CSRF. No additional CSRF protection is needed for these endpoints.

---

## 7. Rate Limiting

### Architecture

Rate limiting uses a **Redis sliding-window** algorithm, keyed by IP address (anonymous users) or
user ID (authenticated users). Cloudflare WAF + bot management provides L7/DDoS protection in
front.

### Rate Limit Tiers

| Tier | Key | Limit | Window | Use Case |
|------|-----|-------|--------|----------|
| `public-read` | IP | 120 req | 1 min | Search, browse, test detail pages |
| `public-write` | IP | 30 req | 1 min | Contact forms, anonymous feedback |
| `authed-read` | User ID | 300 req | 1 min | Authenticated browsing, alert checks |
| `authed-write` | User ID | 60 req | 1 min | Create/update alerts, saved tests |
| `admin` | User ID | 600 req | 1 min | Admin panel operations |
| `internal` | Service token | 1000 req | 1 min | Scraper → API, worker → API |

### Response Behavior

When a rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1719417600

{ "error": "Rate limit exceeded", "retryAfter": 23 }
```

### Auth-Specific Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Magic-link request | 5 per email | 1 hour |
| OAuth initiation | 10 per IP | 1 hour |
| Token refresh | 30 per user | 1 hour |
| Failed login attempts | 10 per IP | 15 minutes |

---

## 8. Affiliate Click Fraud Prevention

Affiliate click revenue is the primary monetization path. The `/go/{offeringId}` redirect endpoint
has dedicated anti-fraud controls.

### Rate Limiting

- Maximum **10 clicks per offering per IP per hour**. After the limit, the redirect still works
  (user experience is not degraded), but clicks are not logged for affiliate attribution.

### Session Fingerprinting

Each click is fingerprinted using a hash of the client's identifying information:

```typescript
function clickFingerprint(ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .substring(0, 16);
}
```

### Duplicate Detection

Before logging a click, the system checks Redis for a recent identical click:

```typescript
const dedupeKey = `click:${offeringId}:${fingerprint}`;
const exists = await redis.get(dedupeKey);
if (exists) {
  // Skip logging — redirect still works
  return redirect(offering.url);
}
await redis.set(dedupeKey, '1', 'EX', 300); // 5-minute window
```

If the same fingerprint clicked the same offering within **5 minutes**, the duplicate is silently
skipped.

### Admin Analytics & Flagging

- The admin dashboard surfaces IPs with **>50 clicks per day** for manual review.
- Daily aggregation job computes click-through rates by IP/fingerprint and flags statistical
  outliers (>3σ from mean).
- Click → revenue reconciliation against affiliate network reports to detect discrepancies that
  indicate fraud or tracking failures.

---

## 9. Secrets Management

### Development

- All secrets stored in `.env.local` (gitignored).
- `.env.example` contains placeholder values documenting every required variable.
- Developers never share secrets via Slack, email, or commits.

### Production

- **Doppler** (or equivalent secrets manager) is the source of truth for staging and production
  secrets. Secrets are injected as environment variables at deploy time.
- **No secrets baked into Docker images** — images are built without any secrets and are safe to
  push to any registry.
- Secrets are injected at container runtime via the orchestrator's secrets mechanism (e.g.,
  Kubernetes Secrets, Docker Swarm secrets, or cloud-native equivalents).

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | Auth.js session signing key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Transactional email via Resend |
| `SENTRY_DSN` | Error reporting endpoint |
| Proxy credentials | Scraper proxy authentication (per-vendor) |

### Rotation Policy

- **Quarterly rotation** for all secrets (AUTH_SECRET, API keys, proxy credentials).
- Immediate rotation upon any suspected compromise or team member departure.
- AUTH_SECRET rotation uses a **dual-key window**: both old and new keys are valid for 24 hours to
  prevent session disruption during rollover.

### Sensitive Data at Rest

- Proxy credentials stored in the database are **encrypted at the application layer** before
  storage (AES-256-GCM with a key from Doppler).
- OAuth client secrets and API keys exist only in the secrets manager, never in the database.

---

## 10. Logging & Audit Trail

### Structured Logging

All application logging uses **pino** with structured JSON output:

```json
{
  "level": "info",
  "time": 1719417600000,
  "msg": "Request completed",
  "requestId": "req_abc123",
  "method": "GET",
  "path": "/api/tests",
  "statusCode": 200,
  "duration": 45
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Unhandled exceptions, failed external service calls, data integrity issues |
| `warn` | Rate limit hits, validation failures, deprecated endpoint usage, anomalous patterns |
| `info` | Request lifecycle, auth events, admin actions, scraper completions |
| `debug` | Detailed query traces, cache hit/miss — **development only**, never in production |

### PII Protection

Logs **never** contain:

- Raw email addresses (masked as `d***@g***.com` or hashed)
- Passwords (LabPrice has none, but the rule applies universally)
- Session tokens or JWTs
- Full IP addresses in application logs (hashed for fraud detection only)
- Request bodies containing user data

### Audit Log Table

All admin/privileged mutations are recorded in the `audit_logs` table:

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,          -- e.g., 'offering.approve', 'user.role.update'
  entity_type TEXT NOT NULL,          -- e.g., 'offering', 'user', 'scraper_config'
  entity_id   UUID,
  old_values  JSONB,                  -- snapshot before mutation
  new_values  JSONB,                  -- snapshot after mutation
  ip_address  TEXT,                   -- hashed IP
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Audit log rows are **append-only** — the application role does not have `UPDATE` or `DELETE`
permissions on this table.

### Log Retention

| Environment | Retention |
|-------------|-----------|
| Production | 90 days |
| Staging | 30 days |
| Audit logs | 2 years (compliance) |

### Security Alerting

Automated alerts fire on:

- Spikes in 401/403 responses (potential brute-force or credential stuffing)
- Refresh token reuse detection events (token theft)
- Admin role grants or SUPER_ADMIN actions
- Anomalous affiliate click volume (>50 clicks/day from a single IP)
- Scraper failure rate exceeding threshold

---

## 11. OWASP Top 10 (2021) Mapping

| # | OWASP Category | LabPrice Mitigations |
|---|---------------|---------------------|
| **A01** | Broken Access Control | Central `can(user, action, resource)` policy function. `requireRole(minRole)` middleware on all admin routes. Per-resource ownership checks in service layer. `frame-ancestors 'none'` CSP. Audit logging of all privileged actions. |
| **A02** | Cryptographic Failures | TLS everywhere (Cloudflare edge → origin). No passwords stored. Database credentials encrypted at rest. Session tokens are cryptographically random. IPs hashed with SHA-256 before storage. HSTS with preload. |
| **A03** | Injection | Prisma parameterized queries exclusively. `$queryRaw` tagged templates for raw SQL. Zod validation on all inputs. DOMPurify sanitization for admin HTML content. Strict CSP blocks inline script injection. |
| **A04** | Insecure Design | Approval workflow for catalog changes (no direct publish). Immutable audit log. Least-privilege database roles. Rate limiting on all tiers. Affiliate click deduplication by design. Threat model maintained. |
| **A05** | Security Misconfiguration | Hardened HTTP headers (CSP, HSTS, X-Content-Type-Options, Permissions-Policy). Non-root Docker containers. No debug mode in production. Environment-scoped secrets via Doppler. `strict()` Zod schemas strip unknown fields. |
| **A06** | Vulnerable & Outdated Components | Dependabot / Renovate for dependency updates. `npm audit` in CI pipeline. Container image scanning with Trivy. Pinned lockfile (`package-lock.json`). Minimal base images (Alpine/distroless). |
| **A07** | Identification & Authentication Failures | Passwordless authentication (magic-link + OAuth) eliminates credential stuffing. Database-backed sessions with server-side revocation. Refresh token reuse detection invalidates token families. Rate limiting on auth endpoints (5 magic links/email/hour). |
| **A08** | Software & Data Integrity Failures | Signed container images. Immutable audit log for all admin mutations. Idempotent transactional publishes (catalog updates are atomic). CI/CD pipeline with integrity checks. Lockfile pinning prevents supply-chain tampering. |
| **A09** | Security Logging & Monitoring Failures | Structured JSON logging with pino and request correlation IDs. Sentry for error tracking. Audit log table for all privileged actions. Automated alerts on auth anomalies, click fraud, and scraper failures. 90-day log retention. |
| **A10** | Server-Side Request Forgery (SSRF) | Scraper egress is isolated to known vendor domains via allowlist. The application never fetches arbitrary user-supplied URLs. Scraper target URLs are admin-configured and validated against the allowlist. Internal services are not reachable from the scraper network. |

---

## 12. GDPR / CCPA Compliance

### Minimal PII

LabPrice collects minimal personal data. The only PII stored is:

- **Email address** — required for authentication and alerts
- **Hashed IP addresses** — for fraud detection only, not linked to user identity

### Data Export

Users can export all their data via `GET /api/me/export`:

```json
{
  "user": { "id": "...", "email": "...", "role": "USER", "createdAt": "..." },
  "savedTests": [ ... ],
  "alerts": [ ... ],
  "notifications": [ ... ],
  "searchHistory": [ ... ]
}
```

The endpoint returns a complete JSON dump of all data associated with the authenticated user.

### Account Deletion

`DELETE /api/me` triggers the following cascade:

1. **Soft-delete** the user record (`deletedAt` timestamp set).
2. **Hard-delete** all alerts, saved tests, and notification preferences.
3. **Anonymize** audit log entries — replace `actor_id` with a sentinel value and remove any
   identifying information from the JSON payloads.
4. **Invalidate** all active sessions and refresh tokens.
5. A background job **purges** the soft-deleted user record after 30 days (grace period for
   accidental deletion recovery).

### Cookie Consent

- A **cookie consent banner** is displayed to all visitors on first visit.
- **Essential cookies** (session, CSRF) are always set — they are required for the site to
  function.
- **Analytics cookies** (if any) are gated behind explicit consent and are not loaded until the
  user opts in.
- Consent preferences are stored in a first-party cookie and respected on subsequent visits.

### Privacy Policy

A dedicated `/privacy` page describes:

- What data is collected and why
- How data is stored and protected
- Data retention periods
- How to request export or deletion
- Contact information for privacy inquiries

### Data Retention Policy

| Data Type | Retention Period | Purge Method |
|-----------|-----------------|-------------|
| `search_logs` | 90 days | Daily cron job deletes rows older than 90 days |
| `page_views` | 90 days | Daily cron job deletes rows older than 90 days |
| `affiliate_clicks` | 1 year | Monthly cron job deletes rows older than 1 year |
| `audit_logs` | 2 years | Retained for compliance, then archived/purged |
| Soft-deleted users | 30 days | Background job hard-deletes after grace period |

### Additional Compliance

- **Medical disclaimer** on all test comparison pages — LabPrice provides pricing information, not
  medical advice.
- **Affiliate disclosure** on pages containing affiliate links, per FTC guidelines.

---

## 13. Infrastructure Security

### Container Hardening

- **Non-root containers** — all Docker containers run as a non-root user (`node` or a dedicated
  `appuser`):

```dockerfile
FROM node:20-alpine AS runner
RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup
USER appuser
```

- **Read-only filesystem** — the container's root filesystem is mounted read-only where possible.
  Writable volumes are mounted only for `/tmp` and log directories.
- **Minimal base images** — Alpine-based or distroless images to minimize the attack surface.
  No build tools, compilers, or package managers in production images.
- **No secrets in images** — Docker images are built without any environment variables or secret
  files. All secrets are injected at runtime.

### Network Segmentation

```
Internet → Cloudflare (WAF/DDoS) → Web Container (port 3000)
                                        ↓ (internal network only)
                                   PostgreSQL (port 5432)
                                   Redis (port 6379)
                                   Scraper Workers (no inbound)
```

- Only the **web container** is exposed to the internet (via Cloudflare).
- **PostgreSQL and Redis** are on an internal-only network, unreachable from the internet.
- **Scraper workers** have outbound-only access to vendor domains (allowlisted) and the internal
  API. They accept no inbound connections.
- Database connections require TLS (`sslmode=require`).

### TLS

- **Edge TLS** — Cloudflare terminates TLS at the edge with managed certificates (TLS 1.3
  preferred, TLS 1.2 minimum).
- **Origin TLS** — Cloudflare → origin uses Full (Strict) mode with a Cloudflare origin
  certificate.
- **Internal TLS** — database and Redis connections use TLS within the internal network.
- **HSTS** — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ensures
  browsers always use HTTPS.

### Vulnerability Scanning

- **Trivy** scans container images in CI on every build. Builds fail on HIGH or CRITICAL
  vulnerabilities.
- **npm audit** runs in CI and blocks merges if exploitable vulnerabilities are found in
  dependencies.
- **Dependabot / Renovate** opens PRs for dependency updates automatically.
- **Periodic penetration testing** — annual third-party pentest of the application and
  infrastructure.

### Additional Hardening

- **Secrets rotation** is automated where possible (see Section 9).
- **Immutable deployments** — containers are never patched in place; a new image is built and
  deployed for every change.
- **Health checks** — all containers expose `/health` endpoints for orchestrator liveness and
  readiness probes.
- **Resource limits** — CPU and memory limits are set on all containers to prevent resource
  exhaustion attacks.
