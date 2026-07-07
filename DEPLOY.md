# Deploying LabTestCompare (Railway + Cloudflare)

This is the **accurate, repo-specific** runbook (the older `docs/08-deployment.md` is an aspirational
design doc and does not match the actual code — ignore its `prisma migrate deploy`, separate
Dockerfiles, and Sentry/proxy env vars).

## Architecture

```
User ──► Cloudflare (DNS, TLS, CDN, WAF/rate-limit)  ──►  Railway
                                                          ├─ web     (Next.js, Dockerfile target `web`)
                                                          ├─ worker  (BullMQ scraper, target `worker`) — optional at launch
                                                          ├─ Postgres plugin
                                                          └─ Redis plugin
```

Cloudflare is the **front door only** — the app can't run on Cloudflare's edge compute (it needs a
Node runtime, Prisma's query engine, an always-on worker, Postgres, and Redis; none map to
Workers/Pages). Railway runs everything; Cloudflare proxies `labtestcompare.com` → Railway.

**Users never log in** — the public site (search / compare / browse) is fully anonymous. The only
login is **admin**, so "lock down the backend login" = "secure `/admin`" (see the Security Checklist).

---

## 📚 Official step-by-step docs (bookmark these)

- **Railway — deploy from a GitHub repo:** https://docs.railway.com/guides/github-autodeploys
- **Railway — deploy a Dockerfile:** https://docs.railway.com/guides/dockerfiles
- **Railway — add PostgreSQL:** https://docs.railway.com/guides/postgresql
- **Railway — add Redis:** https://docs.railway.com/guides/redis
- **Railway — variables & references:** https://docs.railway.com/guides/variables
- **Railway — custom domains:** https://docs.railway.com/guides/public-networking#custom-domains
- **Railway — config as code (`railway.json`):** https://docs.railway.com/reference/config-as-code
- **Cloudflare — add a site / DNS:** https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
- **Cloudflare — SSL Full (Strict):** https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
- **Cloudflare — rate limiting rules:** https://developers.cloudflare.com/waf/rate-limiting-rules/

This repo is pre-configured for Railway: **`railway.json`** sets the Dockerfile build + the
`/api/health` healthcheck, and the `Dockerfile`'s **default stage is the web app** — so the web
service needs *zero* build config.

> ### ⚠️ If Railway uses "Railpack" and the install fails
> Railway's default builder (Railpack/Nixpacks) can't build this pnpm monorepo — you must use the
> **Dockerfile**. `railway.json` requests it, but if the service was created before that file landed
> (or Railway ignores it), force it manually:
>
> **Service → Settings → Build → Builder → select `Dockerfile`.** (Leave "Dockerfile Path" as
> `Dockerfile`.) Then **Deploy** again. That single toggle fixes the Railpack install errors.
>
> Also make sure the service is deployed from the **latest commit** — the build was only made
> DB-independent recently; older commits fail at `next build` with `Environment variable not found:
> DATABASE_URL`.

## ⚡ Fast path (web + database, ~15 minutes)

Do just this to get users testing. The scrape worker is optional (add it later, Step 4).

1. **Railway → New Project → Deploy from GitHub repo** → pick this repo. (Railway reads `railway.json`
   and builds the web image from the Dockerfile automatically.)
2. In the project: **New → Database → PostgreSQL**. Then **New → Database → Redis**.
3. Open the **web service → Variables** and add the vars in Step 5. For `DATABASE_URL` and `REDIS_URL`,
   use Railway's **reference** picker (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`) so they
   wire automatically. Set `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_BASE_URL`,
   `EMAIL_FROM`, `RESEND_API_KEY`.
4. **Bootstrap the DB once** (Step 2 below) — run the three commands against the Railway Postgres.
5. **Custom domain:** web service → Settings → Networking → add `labtestcompare.com`; Railway gives you
   a DNS target. In **Cloudflare → DNS**, add a **proxied CNAME** for the apex (and `www`) to that
   target (Step 6).
6. Redeploy. Visit `https://labtestcompare.com/api/health` → `{"status":"ok"}`. Do the Security
   Checklist. Done.

---

## What was already fixed to make this deployable

- **Worker runs via `tsx`** (no compile). Its `tsc` build has pre-existing `ioredis` dual-version type
  errors; compiling was blocking the whole `pnpm build`. `apps/worker` `start`/Docker CMD now use tsx.
- **`NODE_ENV` removed from `.env`.** Pinning `NODE_ENV=development` there made `next build` fail
  (`<Html> should not be imported…` on `/404`). Next sets `NODE_ENV` itself; Railway sets it to
  `production`. `pnpm build` now passes end-to-end.
- **`docs/database/ddl-core.sql`** added — the launch subset of `ddl.sql` (extensions + citext + FTS)
  that's safe to apply after `prisma db push`.

---

## Prerequisites (you provide these)

- A Railway account, and the GitHub repo connected to it.
- Cloudflare (you already have `labtestcompare.com` there).
- `AUTH_SECRET` → `openssl rand -base64 32`.
- **Resend** API key + a verified sending domain (for admin magic-link login + alert emails).
- **Google OAuth** client (ID + secret) with redirect `https://labtestcompare.com/api/auth/callback/google` — optional if you only use magic-link.
- A **fresh** `ANTHROPIC_API_KEY` (rotate the old one — it was shared in chat).

---

## Step 1 — Railway project + data stores

1. Create a Railway project from the GitHub repo.
2. Add the **PostgreSQL** plugin and the **Redis** plugin. Railway exposes `DATABASE_URL` and
   `REDIS_URL` as referenceable variables.

## Step 2 — Bootstrap the database (the one non-turnkey step)

There are no Prisma migrations; the schema is `prisma db push` + the raw `ddl-core.sql`. Run this once
against the Railway Postgres (locally with `DATABASE_URL` pointed at Railway, or via a Railway shell):

```bash
cd packages/database
DATABASE_URL="<railway postgres url>" pnpm exec prisma db push --skip-generate
DATABASE_URL="<railway postgres url>" pnpm exec prisma db execute \
  --schema prisma/schema.prisma --file ../../docs/database/ddl-core.sql
# Optional seed (categories, an initial admin, etc.) — review prisma/seed.ts first:
DATABASE_URL="<railway postgres url>" pnpm exec tsx prisma/seed.ts
```

> `ddl-core.sql` gives you case-insensitive email + working `/search` full-text. It intentionally
> skips the analytics-table RANGE partitioning (a scale optimization) — the app works with plain
> tables. **Re-run `ddl-core.sql` after any future `prisma db push`** (push drops `search_vector`).

## Step 3 — Web service (zero build config)

Handled for you by `railway.json` + the Dockerfile:

- **Build:** the Dockerfile's default (final) stage is `web`, so Railway builds the web image with no
  target setting. Nothing to configure.
- **Healthcheck:** `railway.json` points Railway at `/api/health` (checks the DB); a bad deploy fails
  the check instead of serving errors.
- **Port:** the image listens on `3000` (set in the Dockerfile). Railway detects it.
- Just set the **Variables** (Step 5). The build prerenders a few pages from the DB, so make sure the
  Postgres service exists first and `DATABASE_URL` is referenced.

## Step 4 — Worker service (optional; add when you want automated scraping)

Not needed for users to browse/search/compare — it only runs scheduled price scraping. When you want it:

1. In the same project, **New → GitHub Repo → (this repo)** to create a second service.
2. Service **Settings → Build**: set the **Docker target** (a.k.a. build stage) to **`worker`** (the
   web is the default stage, so the worker must be selected explicitly). If your Railway plan doesn't
   expose a target field, set the service's config path to a small `railway.worker.json` with
   `"build": { "target": "worker" }`, or split out `apps/worker/Dockerfile`.
3. Service **Settings → Deploy**: clear the healthcheck path (the worker has no HTTP server).
4. **Variables:** `DATABASE_URL`, `REDIS_URL` (references), and `ANTHROPIC_API_KEY` if used. No domain.

## Step 5 — Environment variables (Railway service vars)

See `.env.example` for the annotated list. For production set:

| Variable | Value |
|---|---|
| `DATABASE_URL` | reference the Railway Postgres plugin |
| `REDIS_URL` | reference the Railway Redis plugin |
| `AUTH_SECRET` | `openssl rand -base64 32` (strong, unique) |
| `AUTH_URL` | `https://labtestcompare.com` |
| `AUTH_TRUST_HOST` | `true` (required behind the Cloudflare→Railway proxy) |
| `NEXT_PUBLIC_BASE_URL` | `https://labtestcompare.com` |
| `EMAIL_FROM` | `LabTestCompare <noreply@labtestcompare.com>` |
| `RESEND_API_KEY` | your Resend key |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | your OAuth client (optional) |
| `ANTHROPIC_API_KEY` | fresh key (optional; admin auto-fill) |

Do **not** set `NODE_ENV` (Railway sets `production`) — pinning it breaks the build and would
re-enable the dev login.

## Step 6 — Cloudflare

1. **DNS:** point the apex `labtestcompare.com` (and `www`) at Railway's web service. Railway gives you
   a target domain; add it as a **CNAME** (Cloudflare flattens the apex CNAME), **proxied** (orange
   cloud). Add the domain as a custom domain on the Railway web service so it issues its cert.
2. **SSL/TLS mode: Full (Strict).** Railway terminates TLS with a valid cert, so Strict works.
3. **Always Use HTTPS: on.** **HSTS:** on (`max-age` 6–12 months once you've confirmed HTTPS is stable).
4. **WAF / rate limiting:** add rules limiting `/api/*`, `/auth/*`, and `/admin` (the app also has its
   own per-IP limits + honeypots, but Cloudflare in front is the cheap first line). Enable Bot Fight Mode.

## Step 7 — Verify

- `https://labtestcompare.com/api/health` if present, else the homepage → 200.
- Search a test, open a test page, click an "Order" link (redirects out).
- `GET /api/dev-login` returns **404** (proves the dev backdoor is off in prod).
- Sign into `/admin` with your real account (magic link or Google).

---

## Pre-launch SECURITY CHECKLIST ("locked down + safe for users")

- [ ] **`NODE_ENV=production`** (Railway default) — this disables `/api/dev-login` and the dev sign-in box (both return 404 / hidden in prod).
- [ ] **Strong `AUTH_SECRET`** (not the `.env.example` placeholder).
- [ ] **`AUTH_TRUST_HOST=true`** set, `AUTH_URL=https://labtestcompare.com`.
- [ ] **Retire the seed admin `admin@labprice.com`** — still an active SUPER_ADMIN. Sign in as your real
      account (`davidsabot@gmail.com`, already SUPER_ADMIN) and demote/deactivate it at `/admin/users`.
- [ ] **Rotate `ANTHROPIC_API_KEY`** (treat the old one as compromised — it was shared in chat).
- [ ] **Real Resend + Google creds** so admin login works in prod (the dev shortcut won't exist there).
- [ ] **Cloudflare Full (Strict) TLS + Always HTTPS + HSTS + WAF rate-limits** on `/api`, `/auth`, `/admin`.
- [ ] Admin is role-gated (ADMIN/SUPER_ADMIN), sessions are DB-backed (revocable), CSP + per-IP
      rate-limiting + form honeypots are already in the app — no action needed, just confirming.
- [ ] The app's rate-limiter is **in-memory (per instance)**. Fine on 1 web instance; if you scale to
      2+, move it to Redis (`lib/rate-limit.ts`) or rely on Cloudflare's rate limiting.

## Things to validate on the first deploy (I couldn't test these without your Railway env)

- **Prisma engine in the standalone build.** `output: standalone` sometimes doesn't trace Prisma's
  query-engine binary. If the web service boots but every DB call errors, copy the engine into the
  image (`node_modules/.prisma/client/*.node` → the standalone output) or set
  `PRISMA_QUERY_ENGINE_LIBRARY`. Verify on first boot.
- **pnpm workspace symlinks in the worker image.** The worker image copies root `node_modules` +
  `apps/worker` + `packages`; confirm `@labprice/*` resolve at runtime (they're symlinks). If not,
  the alternative is a Railway Nixpacks build with start command `pnpm --filter @labprice/worker start`.
- **Build reaching Postgres.** A few pages prerender from the DB at build time. Ensure Postgres exists
  and `DATABASE_URL` is in the web **build** env, or the build errors on those pages.
