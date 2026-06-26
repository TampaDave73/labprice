# Deliverable #7 — Security

Threat model in brief: the public site is anonymous and read-heavy (low PII), so the highest-value
targets are (a) the **admin panel / approval workflow** (data integrity + brand trust), (b)
**affiliate click logging** (revenue fraud), and (c) **scraper infrastructure / secrets** (proxy
creds, vendor relationships). Controls below map to OWASP Top 10.

## Authentication
- **Auth.js (NextAuth v5)** with the Prisma adapter. Primary method: **passwordless email
  magic-link** (no password storage). Optional **Google OAuth**. No passwords in v1 → eliminates a
  whole class of credential risks.
- **Sessions:** database-backed (Auth.js `sessions`), httpOnly + Secure + SameSite=Lax cookies,
  rotating session token, idle + absolute expiry.
- **Mobile/API:** short-lived access JWT (15 min) + rotating refresh token (DB-tracked, revocable);
  `/auth/token` exchanges a verified magic-link code. Refresh-token reuse detection → revoke family.
- Magic-link tokens are single-use, short-TTL, and rate-limited (auth tier).

## Authorization (RBAC)
- Roles: `USER < EDITOR < ADMIN < SUPER_ADMIN` (Prisma enum on `users`).
- Central policy module `can(user, action, resource)` + `requireRole(min)` guard used by every
  `/admin/**` route handler/server action **and** in the UI (defense in depth; server is the
  source of truth — UI hiding is cosmetic).
- Object-level checks: a user may only read/modify **their own** saved tests/alerts/notifications
  (ownership asserted in the service, not inferred from the client).
- Destructive/config actions (settings, proxies, role grants) require SUPER_ADMIN.
- Every privileged mutation writes an `audit_logs` row (actor, before/after).

## Input validation
- **zod** schemas validate every request body/query/param at the route boundary; types flow to the
  service layer. Reject-by-default; unknown fields stripped. Shared schemas (`packages/shared`)
  are reused by the OpenAPI spec and the client for consistency.
- File-free API (no uploads in v1) shrinks the attack surface.

## Injection & data-access
- **SQL injection:** Prisma parameterizes all queries; the few raw SQL spots (FTS, partitioning) use
  `Prisma.sql` tagged templates / parameter binding — never string interpolation of user input.
- **NoSQL/JSONB:** scraper `selectors`/`headers` JSON is admin-only and schema-validated before save.
- Least-privilege DB roles: the app connects as a non-superuser limited to DML on app tables;
  migrations run under a separate role in CI/CD.

## XSS
- React escapes by default. **No `dangerouslySetInnerHTML`** on user/scraped data. SEO/CMS body
  (`seo_pages`) is authored by EDITOR+ and rendered through a **sanitized MDX/HTML pipeline**
  (allowlist) — treated as semi-trusted.
- **Strict CSP** (`default-src 'self'`, explicit allowlist for fonts/analytics, `frame-ancestors
  'none'`, no inline scripts via nonces), plus `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, HSTS. Set via Next
  middleware + Cloudflare.

## CSRF
- Auth.js CSRF tokens on auth forms. State-changing browser routes are POST/PATCH/DELETE with
  SameSite cookies + an origin/`sec-fetch-site` check in middleware. Pure Bearer API clients are not
  cookie-authenticated, so they're not CSRF-exposed.

## Rate limiting & abuse
- Redis sliding-window limiter per tier (Deliverable #4) keyed by IP (anon) or user id; Cloudflare
  WAF + bot management in front for L7/DDoS.
- **Affiliate click fraud:** `/go/{offeringId}` logs hashed IP + UA + session, dedups rapid repeats,
  and is monitored for anomalies; click→revenue reconciliation against network reports flags fraud.
- Bot/scraper protection on our own endpoints (the autocomplete is a common scrape target):
  rate-limit + caching + optional Turnstile on abuse.

## Secrets management
- No secrets in the repo. `.env` for local (gitignored); **Doppler/Vault or the cloud secrets
  manager** in staging/prod, injected as env at deploy. Rotatable.
- Sensitive at-rest values (proxy URLs/credentials, OAuth secrets, SMTP keys) encrypted; DB column
  encryption for proxy credentials. Per-environment isolation; least-privilege service tokens.

## Logging, monitoring, audit trail
- **Structured JSON logs** (pino) with request correlation ids; **no PII or secrets** in logs (email
  hashed/omitted; tokens never logged).
- **Sentry** for errors (web + worker); **OpenTelemetry** traces; uptime + SLO alerts.
- **`audit_logs`** is the immutable trail for every privileged action (catalog/vendor/offering edits,
  approvals, role/settings changes, manual price sets, scrape config edits) with before/after JSON.
- Security alerting: spikes in 401/403, refresh-token reuse, admin role grants, anomalous click
  volume.

## Privacy / compliance
- Minimal PII (email only). GDPR/CCPA **export** + **delete** endpoints; soft-delete then purge job.
- Cookie/consent banner gating non-essential analytics; IPs stored **hashed**, only for fraud/abuse,
  with retention limits.
- Medical disclaimer + affiliate disclosure on every relevant page (compliance, not just legal hygiene).

## Dependency & supply-chain
- `npm audit`/Dependabot/Renovate in CI; pinned lockfile; SRI already used by the prototype runtime
  pattern. Container images scanned (Trivy) in the pipeline; minimal base images; non-root containers.

## OWASP Top 10 coverage map
| OWASP | Control |
|---|---|
| A01 Broken Access Control | central RBAC `can()`/`requireRole`, object-level ownership, audited |
| A02 Cryptographic Failures | TLS everywhere (Cloudflare), encrypted secrets, hashed IPs, no passwords |
| A03 Injection | Prisma params, zod validation, sanitized MDX, strict CSP |
| A04 Insecure Design | approval workflow, immutable history, least privilege, threat model |
| A05 Misconfiguration | hardened headers/CSP, non-root containers, env-scoped secrets, no debug in prod |
| A06 Vulnerable Components | Dependabot/Renovate, image scanning, pinned deps |
| A07 Auth Failures | passwordless + OAuth, session rotation, refresh-reuse detection, rate limits |
| A08 Integrity Failures | signed deploys, SRI, audit log, idempotent transactional publishes |
| A09 Logging/Monitoring | structured logs, Sentry, OTel, audit trail, security alerts |
| A10 SSRF | scraper egress is isolated; app does not fetch arbitrary user-supplied URLs; allowlists |
