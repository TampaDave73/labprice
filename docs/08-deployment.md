# Deliverable #8 — Deployment & Infrastructure

## 1. Topology

```
User ──► Cloudflare (DNS, CDN, WAF, DDoS, TLS, cache rules)
              │
              ▼
         VPS (Docker Compose)  ← v1 target
         ┌─────────────────────────────────┐
         │  web (Next.js :3000) x2 replicas│
         │  worker (BullMQ + Playwright)   │
         │  postgres:16                    │
         │  redis:7                        │
         └─────────────────────────────────┘
```

**v1 (VPS + Docker Compose):** Single VPS behind Cloudflare. All services run as Docker containers
on one machine. Cloudflare handles DNS, CDN caching, WAF rules, DDoS protection, and TLS
termination at the edge. The origin communicates over an encrypted tunnel using a Cloudflare origin
certificate.

**v2 upgrade path (AWS):** Lift the same Docker images to AWS ECS/Fargate. Replace self-managed
Postgres with RDS (Multi-AZ), Redis with ElastiCache, and object storage with S3. The Dockerfiles
and application code remain identical; only the orchestration layer changes.

| Component | v1 (VPS) | v2 (AWS) |
|-----------|----------|----------|
| Compute | Docker Compose | ECS/Fargate |
| Database | Postgres container + volume | RDS PostgreSQL 16 (Multi-AZ) |
| Cache/Queue | Redis container + volume | ElastiCache Redis 7 |
| Object Storage | Cloudflare R2 | S3 |
| CDN/WAF | Cloudflare | Cloudflare (unchanged) |
| CI/CD | GitHub Actions → SSH deploy | GitHub Actions → ECS deploy |

---

## 2. Docker Configuration

### 2.1 Web Dockerfile (`apps/web/Dockerfile`)

Multi-stage build producing a ~150 MB image with Next.js standalone output.

```dockerfile
# ──────────────────────────────────────────────
# Stage 1: Install dependencies
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --frozen-lockfile --prod=false

# ──────────────────────────────────────────────
# Stage 2: Build application
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .

RUN corepack enable \
    && pnpm --filter @labprice/database prisma generate \
    && pnpm --filter @labprice/web build

# ──────────────────────────────────────────────
# Stage 3: Production runtime
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --ingroup app app

# Copy standalone output
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

CMD ["node", "apps/web/server.js"]
```

### 2.2 Worker Dockerfile (`apps/worker/Dockerfile`)

Includes Playwright Chromium; image is ~800 MB due to browser dependencies.

```dockerfile
# ──────────────────────────────────────────────
# Stage 1: Install dependencies
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --frozen-lockfile --prod=false

# ──────────────────────────────────────────────
# Stage 2: Build application
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages ./packages
COPY . .

RUN corepack enable \
    && pnpm --filter @labprice/database prisma generate \
    && pnpm --filter @labprice/worker build

# ──────────────────────────────────────────────
# Stage 3: Production runtime
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Playwright Chromium and its system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       wget \
       ca-certificates \
       fonts-liberation \
       libasound2 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcups2 \
       libdbus-1-3 \
       libdrm2 \
       libgbm1 \
       libgtk-3-0 \
       libnspr4 \
       libnss3 \
       libx11-xcb1 \
       libxcomposite1 \
       libxdamage1 \
       libxrandr2 \
       xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --ingroup app app

COPY --from=build --chown=app:app /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages ./packages

# Install Playwright browsers as the app user
USER app
RUN npx playwright install chromium

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ["node", "-e", "const r = require('redis'); const c = r.createClient({url: process.env.REDIS_URL}); c.connect().then(() => c.ping()).then(() => process.exit(0)).catch(() => process.exit(1))"]

CMD ["node", "apps/worker/dist/main.js"]
```

---

## 3. Docker Compose

Complete `docker-compose.yml` for single-VPS production deployment:

```yaml
version: "3.9"

x-common: &common
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "50m"
      max-file: "5"

services:
  # ─── Next.js Web Application ───────────────────
  web:
    <<: *common
    image: ghcr.io/labprice/web:${TAG:-latest}
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
    networks:
      - labprice

  # ─── BullMQ Worker + Playwright Scraper ────────
  worker:
    <<: *common
    image: ghcr.io/labprice/worker:${TAG:-latest}
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    shm_size: "1gb"
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
        reservations:
          cpus: "0.5"
          memory: 1G
    networks:
      - labprice

  # ─── PostgreSQL 16 ─────────────────────────────
  postgres:
    <<: *common
    image: postgres:16-bookworm
    environment:
      POSTGRES_DB: labprice
      POSTGRES_USER: labprice
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_INITDB_ARGS: "--data-checksums"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backups:/backups
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U labprice -d labprice"]
      interval: 10s
      timeout: 5s
      start_period: 30s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
        reservations:
          cpus: "0.5"
          memory: 512M
    command:
      - "postgres"
      - "-c" 
      - "shared_buffers=512MB"
      - "-c"
      - "work_mem=16MB"
      - "-c"
      - "effective_cache_size=1536MB"
      - "-c"
      - "max_connections=100"
      - "-c"
      - "wal_level=replica"
      - "-c"
      - "archive_mode=on"
      - "-c"
      - "archive_command=test ! -f /backups/wal/%f && cp %p /backups/wal/%f"
    networks:
      - labprice

  # ─── Redis 7 ───────────────────────────────────
  redis:
    <<: *common
    image: redis:7-bookworm
    command:
      - "redis-server"
      - "--appendonly"
      - "yes"
      - "--requirepass"
      - "${REDIS_PASSWORD}"
      - "--maxmemory"
      - "256mb"
      - "--maxmemory-policy"
      - "allkeys-lru"
    volumes:
      - redisdata:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      start_period: 10s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          cpus: "0.1"
          memory: 128M
    networks:
      - labprice

  # ─── Database Migrations (run once) ────────────
  migrate:
    image: ghcr.io/labprice/web:${TAG:-latest}
    env_file:
      - .env.production
    depends_on:
      postgres:
        condition: service_healthy
    command: ["npx", "prisma", "migrate", "deploy"]
    restart: "no"
    networks:
      - labprice

volumes:
  pgdata:
    driver: local
  redisdata:
    driver: local

networks:
  labprice:
    driver: bridge
```

### Development Compose (`docker-compose.dev.yml`)

Used alongside `pnpm dev` for local development:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-bookworm
    environment:
      POSTGRES_DB: labprice_dev
      POSTGRES_USER: labprice
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - pgdata_dev:/var/lib/postgresql/data

  redis:
    image: redis:7-bookworm
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redisdata_dev:/data

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  pgdata_dev: {}
  redisdata_dev: {}
```

---

## 4. CI/CD Pipeline (GitHub Actions)

### 4.1 PR Pipeline (`.github/workflows/pr.yml`)

```yaml
name: PR Pipeline

on:
  pull_request:
    branches: [main]

concurrency:
  group: pr-${{ github.head_ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9"

jobs:
  # ─── Install & Cache ──────────────────────────
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - uses: actions/cache/save@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ hashFiles('pnpm-lock.yaml') }}

  # ─── Type Check ────────────────────────────────
  typecheck:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm typecheck

  # ─── Lint ──────────────────────────────────────
  lint:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm lint

  # ─── Unit & Integration Tests ──────────────────
  test:
    needs: setup
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: labprice_test
          POSTGRES_USER: labprice
          POSTGRES_PASSWORD: testpassword
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U labprice"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    env:
      DATABASE_URL: postgresql://labprice:testpassword@localhost:5432/labprice_test
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm --filter @labprice/database prisma migrate deploy
      - run: pnpm test

  # ─── Build ─────────────────────────────────────
  build:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm build

  # ─── Container Security Scan ───────────────────
  trivy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build web image for scanning
        run: docker build -f apps/web/Dockerfile -t labprice-web:scan .
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: labprice-web:scan
          format: "table"
          exit-code: "1"
          severity: "CRITICAL,HIGH"
          ignore-unfixed: true

  # ─── E2E Tests ─────────────────────────────────
  e2e:
    needs: build
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: labprice_e2e
          POSTGRES_USER: labprice
          POSTGRES_PASSWORD: testpassword
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U labprice"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    env:
      DATABASE_URL: postgresql://labprice:testpassword@localhost:5432/labprice_e2e
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm --filter @labprice/database prisma migrate deploy
      - run: npx playwright install --with-deps chromium
      - run: pnpm e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7
```

### 4.2 Main Branch Pipeline (`.github/workflows/deploy.yml`)

```yaml
name: Deploy Pipeline

on:
  push:
    branches: [main]

concurrency:
  group: deploy-main
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  NODE_VERSION: "22"
  PNPM_VERSION: "9"

permissions:
  contents: read
  packages: write

jobs:
  # ─── Run all PR checks first ───────────────────
  validate:
    uses: ./.github/workflows/pr.yml

  # ─── Build & Push Docker Images ────────────────
  build-images:
    needs: validate
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - app: web
            dockerfile: apps/web/Dockerfile
          - app: worker
            dockerfile: apps/worker/Dockerfile
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/labprice/${{ matrix.app }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─── Deploy to Staging ─────────────────────────
  deploy-staging:
    needs: build-images
    runs-on: ubuntu-latest
    environment: staging
    env:
      DEPLOY_HOST: ${{ secrets.STAGING_HOST }}
      DEPLOY_USER: ${{ secrets.STAGING_USER }}
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/labprice
            export TAG=${{ github.sha }}
            docker compose pull
            docker compose run --rm migrate
            docker compose up -d --remove-orphans
            docker compose exec web wget -qO- http://localhost:3000/api/health

  # ─── Smoke Tests Against Staging ───────────────
  smoke-test:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Wait for staging readiness
        run: |
          for i in $(seq 1 30); do
            if curl -sf "${{ secrets.STAGING_URL }}/api/health"; then
              echo "Staging is healthy"
              exit 0
            fi
            sleep 5
          done
          echo "Staging health check failed"
          exit 1

      - name: Run smoke tests
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
        run: |
          curl -sf "$BASE_URL/api/health" | jq '.status == "ok"'
          curl -sf "$BASE_URL/" -o /dev/null -w '%{http_code}' | grep -q 200
          echo "Smoke tests passed"

  # ─── Manual Approval Gate ──────────────────────
  approve-production:
    needs: smoke-test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Approval received
        run: echo "Production deployment approved"

  # ─── Deploy to Production ──────────────────────
  deploy-production:
    needs: approve-production
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PRODUCTION_HOST }}
          username: ${{ secrets.PRODUCTION_USER }}
          key: ${{ secrets.PRODUCTION_SSH_KEY }}
          script: |
            cd /opt/labprice
            export TAG=${{ github.sha }}
            docker compose pull
            docker compose run --rm migrate
            docker compose up -d --remove-orphans

  # ─── Post-Deploy Health Check ──────────────────
  post-deploy-check:
    needs: deploy-production
    runs-on: ubuntu-latest
    steps:
      - name: Verify production health
        run: |
          sleep 15
          for i in $(seq 1 12); do
            STATUS=$(curl -sf "${{ secrets.PRODUCTION_URL }}/api/health" | jq -r '.status')
            if [ "$STATUS" = "ok" ]; then
              echo "Production is healthy"
              exit 0
            fi
            echo "Attempt $i: status=$STATUS, retrying..."
            sleep 10
          done
          echo "CRITICAL: Production health check failed after deploy"
          exit 1

      - name: Notify success
        if: success()
        run: echo "Deployment of ${{ github.sha }} to production completed successfully"

      - name: Notify failure
        if: failure()
        run: |
          echo "ALERT: Production deployment may have failed. Investigate immediately."
          echo "Consider rolling back: TAG=<previous-sha> docker compose up -d"
```

### Rollback Procedure

Migrations are written using the expand/contract pattern (backward-compatible), so rolling back
the application never requires a down-migration:

```bash
# Roll back to previous image
ssh deploy@prod "cd /opt/labprice && TAG=<previous-sha> docker compose up -d"
```

---

## 5. Environment Variables

All variables are listed in `.env.example` (committed, no secrets). Real values are injected
from GitHub Secrets (CI) or the host `.env.production` file (VPS).

### Database

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://labprice:***@postgres:5432/labprice?schema=public` | Primary connection string (app role, least privilege) |
| `DATABASE_READ_URL` | No | `postgresql://labprice_read:***@postgres:5432/labprice` | Read replica connection (v2 with RDS read replicas) |
| `DIRECT_DATABASE_URL` | Yes | `postgresql://labprice_admin:***@postgres:5432/labprice` | Direct connection for Prisma migrations (elevated privileges) |

### Redis

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | `redis://:password@redis:6379/0` | Redis connection for cache and BullMQ queues |

### Authentication

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | `openssl rand -base64 32` | Auth.js session/JWT signing secret |
| `AUTH_URL` | Yes | `https://labprice.com` | Canonical auth callback URL |
| `GOOGLE_CLIENT_ID` | Yes | `xxx.apps.googleusercontent.com` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | `GOCSPX-xxx` | Google OAuth client secret |

### Email

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | `re_xxx` | Resend transactional email API key |
| `FROM_EMAIL` | Yes | `noreply@labprice.com` | Sender address for system emails |

### Monitoring & Observability

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | Yes | `https://xxx@o123.ingest.sentry.io/456` | Sentry error tracking DSN |
| `SENTRY_AUTH_TOKEN` | CI only | `sntrys_xxx` | Sentry auth for source map uploads |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | `http://otel-collector:4318` | OpenTelemetry collector endpoint |

### Scraping

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `PROXY_POOL_SECRET` | Yes | `base64-encoded-key` | Encryption key for proxy credentials stored in DB |
| `PROXY_RESIDENTIAL_URL` | No | `http://user:pass@proxy:port` | Default residential proxy endpoint |
| `PROXY_DATACENTER_URL` | No | `http://user:pass@proxy:port` | Default datacenter proxy endpoint |

### Application

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | Yes | `https://labprice.com` | Public-facing canonical URL |
| `NODE_ENV` | Yes | `production` | Runtime environment |
| `SEED_ADMIN_EMAIL` | Seed only | `admin@labprice.com` | Initial super-admin email for database seed |
| `CLOUDFLARE_API_TOKEN` | No | `xxx` | Cloudflare API token for cache purge |

### Storage

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `S3_BUCKET` | No | `labprice-backups` | S3/R2 bucket for backups and snapshots |
| `S3_REGION` | No | `auto` | S3 region (or `auto` for R2) |
| `S3_ACCESS_KEY_ID` | No | `xxx` | S3/R2 access key |
| `S3_SECRET_ACCESS_KEY` | No | `xxx` | S3/R2 secret key |
| `S3_ENDPOINT` | No | `https://xxx.r2.cloudflarestorage.com` | Custom S3 endpoint (for R2) |

---

## 6. Backup Strategy

### Overview

| Data Store | Method | Frequency | Retention | RPO |
|-----------|--------|-----------|-----------|-----|
| PostgreSQL | `pg_dump` (logical) | Nightly at 02:00 UTC | 30 days | 24 hours |
| PostgreSQL | WAL archiving (continuous) | Continuous | 7 days | 5 minutes |
| Redis | AOF persistence | Continuous | N/A (reconstructible) | Acceptable loss |
| Object storage (R2/S3) | Versioning + lifecycle | Automatic | 30 days | None (durable) |
| Config/secrets | Git + secrets manager | On change | Indefinite | None |

### Monthly Restore Drill

A backup that has never been restored is not a backup. On the first Monday of each month, restore
the latest backup to a scratch Postgres instance and verify row counts against production.

### Backup Script (`scripts/backup-postgres.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────
# PostgreSQL Backup Script
# Runs nightly via cron: 0 2 * * * /opt/labprice/scripts/backup-postgres.sh
# ──────────────────────────────────────────────────

BACKUP_DIR="/backups/postgres"
S3_BUCKET="${S3_BUCKET:-labprice-backups}"
S3_PREFIX="postgres"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="labprice_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="labprice-postgres-1"

log() { echo "[$(date -Iseconds)] $1"; }

log "Starting PostgreSQL backup"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Run pg_dump inside the container, compress on the fly
docker exec "${CONTAINER_NAME}" \
  pg_dump -U labprice -d labprice \
    --format=custom \
    --compress=9 \
    --verbose \
  > "${BACKUP_DIR}/${BACKUP_FILE}"

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Verify backup integrity
docker exec -i "${CONTAINER_NAME}" \
  pg_restore --list < "${BACKUP_DIR}/${BACKUP_FILE}" > /dev/null 2>&1
log "Backup integrity verified"

# Upload to S3/R2
if command -v aws &> /dev/null; then
  aws s3 cp \
    "${BACKUP_DIR}/${BACKUP_FILE}" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" \
    --storage-class STANDARD_IA \
    --endpoint-url "${S3_ENDPOINT:-}"
  log "Uploaded to s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"
fi

# Clean up local backups older than retention period
find "${BACKUP_DIR}" -name "labprice_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
log "Cleaned local backups older than ${RETENTION_DAYS} days"

# Clean up remote backups
if command -v aws &> /dev/null; then
  aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" \
    --endpoint-url "${S3_ENDPOINT:-}" \
  | while read -r line; do
    FILE_DATE=$(echo "$line" | awk '{print $1}')
    FILE_NAME=$(echo "$line" | awk '{print $4}')
    if [ -n "$FILE_NAME" ]; then
      AGE_DAYS=$(( ($(date +%s) - $(date -d "$FILE_DATE" +%s)) / 86400 ))
      if [ "$AGE_DAYS" -gt "$RETENTION_DAYS" ]; then
        aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${FILE_NAME}" \
          --endpoint-url "${S3_ENDPOINT:-}"
        log "Removed remote backup: ${FILE_NAME} (${AGE_DAYS} days old)"
      fi
    fi
  done
fi

log "Backup complete"
```

### Restore Procedure

```bash
# Restore from backup file
docker exec -i labprice-postgres-1 \
  pg_restore -U labprice -d labprice --clean --if-exists \
  < /backups/postgres/labprice_20260626_020000.sql.gz

# Point-in-time recovery (WAL-based, RPO: 5 minutes)
# Stop postgres, restore base backup, set recovery_target_time, start
docker exec labprice-postgres-1 \
  pg_restore --target-time="2026-06-26 01:55:00+00" ...
```

---

## 7. Monitoring Strategy

### Application Monitoring

| Layer | Tool | What It Tracks |
|-------|------|----------------|
| Errors | Sentry | Unhandled exceptions, performance transactions, release health |
| Traces | OpenTelemetry | Distributed traces across web + worker, database query spans |
| Metrics | Prometheus | Request rate, error rate, latency percentiles, custom counters |
| Dashboards | Grafana | Visual dashboards with alerting |

### Infrastructure Monitoring

Prometheus scrapes the following exporters:

| Exporter | Metrics |
|----------|---------|
| `node_exporter` | CPU, memory, disk I/O, network, filesystem usage |
| `postgres_exporter` | Active connections, transaction rate, replication lag, table sizes, cache hit ratio |
| `redis_exporter` | Memory usage, connected clients, keyspace hits/misses, evictions |
| Application `/metrics` | BullMQ queue depth, job latency, scrape success/failure rate |

### Grafana Dashboard Panels

- **Request Rate**: HTTP requests per second by status code
- **Error Rate**: 5xx responses per minute with threshold alerts
- **p95 Latency**: 95th percentile response time by endpoint
- **DB Connections**: Active/idle pool connections vs. max
- **Redis Memory**: Used memory vs. maxmemory, eviction rate
- **Queue Depth**: BullMQ waiting/active/completed/failed jobs by queue
- **Scrape Success Rate**: Successful scrapes vs. blocked/failed per supplier
- **Price Freshness**: Percentage of products with prices updated in the last 24 hours

### Uptime Monitoring

External health check (UptimeRobot, Freshping, or similar) polls `GET /api/health` every 60 seconds. The health endpoint checks:

```json
{
  "status": "ok",
  "timestamp": "2026-06-26T12:00:00Z",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "worker": "active"
  }
}
```

Alerts fire to PagerDuty/email if the endpoint is unreachable for two consecutive checks.

### Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| High error rate | 5xx rate > 5% for 5 minutes | Critical |
| Slow responses | p95 > 3s for 10 minutes | Warning |
| DB connection pool exhaustion | Active connections > 80% of max | Warning |
| Queue backlog | Waiting jobs > 1000 for 15 minutes | Warning |
| Scraper failure spike | Success rate < 80% for 30 minutes | Warning |
| Disk usage | Filesystem > 85% full | Warning |
| Health check down | 2 consecutive failures | Critical |

---

## 8. Logging Strategy

### Format

All services emit structured JSON logs via **pino** to stdout. The container runtime (Docker
json-file driver) captures them, and a log aggregator (Loki, CloudWatch Logs, or similar) indexes
them for search and analysis.

```json
{
  "level": "info",
  "time": "2026-06-26T12:00:00.000Z",
  "correlationId": "req_abc123",
  "service": "web",
  "msg": "Price comparison completed",
  "userId": "usr_xxx",
  "productCount": 42,
  "durationMs": 156
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Unhandled exceptions, failed external API calls, data integrity issues |
| `warn` | Degraded functionality, rate limits approached, scrape retries |
| `info` | Request lifecycle, job completion, significant business events |
| `debug` | Detailed scraper progress, query plans, cache hit/miss (disabled in production) |

### Correlation IDs

Every inbound HTTP request receives a unique correlation ID (`correlationId`) generated by
middleware. When the web tier enqueues a BullMQ job, the correlation ID is passed in the job
metadata, ensuring the full request lifecycle (HTTP request to scrape job to database write) can
be traced through logs.

### PII Policy

No personally identifiable information is written to logs. User references use opaque IDs
(`usr_xxx`), never email addresses or names. See Deliverable #7 (Privacy) for the full data
handling policy.

### Retention

| Environment | Hot Retention | Cold Retention |
|-------------|---------------|----------------|
| Production | 90 days | 1 year |
| Staging | 30 days | None |

---

## 9. Disaster Recovery

### Recovery Objectives

| Metric | Target |
|--------|--------|
| **RPO** (Recovery Point Objective) | 5 minutes (WAL archiving) |
| **RTO** (Recovery Time Objective) | 2 hours |

### Failure Scenarios

| Scenario | Impact | Recovery |
|----------|--------|----------|
| Web container crash | Auto-restart (Docker), second replica serves traffic | Automatic |
| Worker crash | Auto-restart, jobs retry from BullMQ queue | Automatic |
| VPS failure | Full outage | Provision new VPS, restore from backup |
| Database corruption | Data loss risk | PITR from WAL archive |
| Redis failure | Cache miss, queue loss | Restart; cache rebuilds, failed jobs re-enqueue |

### Disaster Recovery Runbook

1. **Provision new VPS** from infrastructure-as-code (or manual setup, ~15 min)
2. **Restore PostgreSQL** from the latest WAL archive using PITR to the moment before the incident (~30 min)
3. **Deploy current Docker images** from GHCR (`docker compose pull && docker compose up -d`) (~5 min)
4. **Run migrations** (`docker compose run --rm migrate`) (~2 min)
5. **Warm caches** by running the `cache-warm` BullMQ job (~10 min)
6. **Repoint Cloudflare DNS** to the new VPS IP (~5 min, propagation varies)
7. **Verify health** via `/api/health` and spot-check key pages
8. **Notify stakeholders** that service is restored

### Graceful Degradation

If the worker/scrapers are down, the web tier continues serving last-known prices from the
database and cache. Freshness badges on the UI indicate when prices were last updated, so users
are aware of potential staleness. PostgreSQL is the only stateful single point of truth and is
the priority for HA investment as the system scales.

### DR Testing

Quarterly DR game-day exercises the full runbook end-to-end. Each drill is documented with:
- Time to complete each step
- Issues encountered and resolutions
- Updates to the runbook based on findings

---

## 10. SSL/TLS

### Architecture

```
User ──[TLS 1.3]──► Cloudflare Edge ──[TLS 1.2+]──► VPS Origin
```

### Cloudflare Edge Certificates

Cloudflare automatically provisions and renews free edge certificates for all domains on the
account. No manual certificate management is required.

### Origin Certificate

A Cloudflare Origin CA certificate (up to 15-year validity) is installed on the VPS to encrypt
traffic between Cloudflare and the origin server:

```bash
# Install origin certificate on VPS
sudo mkdir -p /etc/ssl/labprice
sudo cp origin-cert.pem /etc/ssl/labprice/cert.pem
sudo cp origin-key.pem /etc/ssl/labprice/key.pem
sudo chmod 600 /etc/ssl/labprice/key.pem
```

### Cloudflare SSL Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| SSL/TLS mode | **Full (Strict)** | Validates origin certificate against Cloudflare CA |
| Minimum TLS version | TLS 1.2 | Block older, insecure protocols |
| TLS 1.3 | Enabled | Use latest protocol when client supports it |
| Automatic HTTPS Rewrites | Enabled | Upgrade mixed content references |
| Always Use HTTPS | Enabled | 301 redirect all HTTP to HTTPS |
| HSTS | Enabled (max-age: 1 year, includeSubDomains, preload) | Prevent protocol downgrade attacks |

### HSTS Header

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Enabled via Cloudflare dashboard. The domain should be submitted to the [HSTS preload list](https://hstspreload.org/) once the configuration is confirmed stable.

### Certificate Monitoring

The external uptime monitor (Section 7) validates TLS certificate expiry as part of its health
checks. Cloudflare edge certificates renew automatically. The origin certificate has a 15-year
lifetime, but a calendar reminder is set for renewal.
