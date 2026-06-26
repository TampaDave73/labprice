# Deliverable #8 — Deployment & Infrastructure

## Topology
Cloudflare (DNS, CDN, WAF, cache, DDoS, TLS) → VPS (Docker Compose) for v1; lift-and-shift to AWS
(ECS/Fargate + RDS + ElastiCache + S3) when scale demands. Same images either way.

Containers: **web** (Next.js), **worker** (BullMQ consumers), **scheduler** (cron→queue; may run in
worker), **postgres**, **redis**. Object storage = Cloudflare R2/S3 (managed, not a container).

## Images & build

`apps/web/Dockerfile` (multi-stage, Next.js standalone output, non-root):
```dockerfile
# 1) deps
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN corepack enable && pnpm install --frozen-lockfile

# 2) build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm --filter @labprice/database prisma generate \
 && pnpm --filter @labprice/web build   # next build → standalone

# 3) runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

`apps/worker/Dockerfile` uses the same base; the runtime stage installs the **Playwright Chromium**
deps (`npx playwright install --with-deps chromium`) and runs `node apps/worker/dist/main.js`. The
worker image is larger (browser) and deployed separately so the web image stays slim.

## Docker Compose (single-VPS prod)
```yaml
services:
  web:
    image: ghcr.io/acme/labprice-web:${TAG}
    env_file: [.env.production]
    depends_on: [postgres, redis]
    restart: unless-stopped
    healthcheck: { test: ["CMD","wget","-qO-","http://localhost:3000/api/health"], interval: 30s }
    deploy: { replicas: 2 }
  worker:
    image: ghcr.io/acme/labprice-worker:${TAG}
    env_file: [.env.production]
    depends_on: [postgres, redis]
    restart: unless-stopped
    shm_size: "1gb"            # Chromium needs shared memory
  postgres:
    image: postgres:16
    environment: { POSTGRES_DB: labprice, POSTGRES_USER: labprice, POSTGRES_PASSWORD: ${PG_PASS} }
    volumes: ["pgdata:/var/lib/postgresql/data"]
    restart: unless-stopped
  redis:
    image: redis:7
    command: ["redis-server","--appendonly","yes","--requirepass","${REDIS_PASS}"]
    volumes: ["redisdata:/data"]
    restart: unless-stopped
volumes: { pgdata: {}, redisdata: {} }
```
A `docker-compose.dev.yml` runs Postgres + Redis + Mailpit (email capture) only; the app runs via
`pnpm dev` with hot reload. Migrations apply on deploy via a one-shot `prisma migrate deploy` step
(separate from app start so a bad migration fails the deploy, not the runtime).

## CI/CD (GitHub Actions)
**PR pipeline:** install → typecheck → lint → unit + integration tests (Postgres+Redis service
containers) → build → Trivy image scan → Playwright e2e (smoke) → `prisma migrate diff` check.
**main pipeline:** all of the above → build & push `web`/`worker` images to GHCR tagged with SHA →
deploy to **staging** → run `prisma migrate deploy` + smoke tests → **manual approval** → deploy to
**prod** (rolling: new web replicas drain old; worker restarts after migrations). Rollback = redeploy
previous image tag; migrations are written backward-compatible (expand/contract) so a rollback never
needs a down-migration.

## Environments & variables
`.env.example` is committed (no secrets). Real values come from the secrets manager per environment.
| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (app role, least-privilege) |
| `DIRECT_DATABASE_URL` | migrations (elevated role) |
| `REDIS_URL` | cache + BullMQ |
| `AUTH_SECRET` | Auth.js session/JWT signing |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | OAuth |
| `EMAIL_SERVER` / `EMAIL_FROM` | magic-link + alert email (Resend/Postmark) |
| `S3_*` / `R2_*` | snapshots + backups |
| `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` | observability |
| `PROXY_POOL_SECRET` | encryption key for proxy creds |
| `SEED_ADMIN_EMAIL` | initial super-admin |
| `NEXT_PUBLIC_SITE_URL`, `CLOUDFLARE_API_TOKEN` | canonical URL + cache purge |
| feature/tunable defaults | mirrored into `system_settings`/`feature_flags` at seed |

## Backup strategy
- **Postgres:** nightly `pg_dump` (logical) to R2/S3 + **WAL archiving for PITR** (managed RDS
  automates this). 30-day retention; weekly full + continuous WAL. **Monthly restore drills** to a
  scratch instance verify recoverability (a backup you've never restored isn't a backup).
- **Redis:** AOF persistence; it's a cache/queue, so treated as rebuildable, not a system of record.
- **Object storage:** R2/S3 versioning + lifecycle (snapshots expire at 14d, backups at 30d).
- **Config/secrets:** versioned in the secrets manager; IaC (Terraform/compose) in git.

## Monitoring strategy
- **Uptime:** external checks on `/api/health` (web) + a worker heartbeat key in Redis; PagerDuty/
  email alerts.
- **Metrics:** OpenTelemetry → Prometheus/Grafana (or hosted): request latency/error rate, DB pool,
  cache hit rate, queue depth/job latency, scrape success/block rates, partition sizes.
- **Errors:** Sentry (web + worker) with release tracking + source maps.
- **Business SLOs:** price freshness %, daily-scrape completion, approval-queue age, affiliate-click
  volume — surfaced in the admin Dashboard and alerted on breach.

## Logging strategy
Structured JSON (pino) to stdout → collected by the platform (Loki/CloudWatch). Correlation id per
request propagated to the worker via job metadata. PII-free (Deliverable #7). Retention 30d hot /
1y cold (compliance).

## Disaster recovery
- **RPO ≤ 24h** (nightly dump) / **≤ 5 min** with WAL PITR; **RTO ≤ 2h** for full region rebuild.
- Runbook: provision infra (IaC) → restore latest Postgres (PITR to just before incident) → deploy
  current images → `migrate deploy` → warm caches (`cache-warm` job) → repoint Cloudflare DNS.
- The public site degrades gracefully: if the worker/scrapers are down, the web tier still serves
  last-known prices (DB + cache) with freshness badges. Postgres is the only stateful single point
  of truth and is the focus of HA (managed/replicated) as scale grows.
- Quarterly DR game-day exercising the runbook end-to-end.
