# LabPrice Setup & Deployment Guide

This guide takes you from zero to a running LabPrice instance, both locally and in production.

LabPrice is a Turborepo monorepo with:

- **apps/web** -- Next.js frontend (port 3000)
- **apps/worker** -- Background job runner (port 3001)
- **packages/database** -- Prisma schema and migrations
- **packages/scrapers** -- Vendor price scrapers
- **packages/shared, ui, config** -- Shared libraries

---

## 1. Prerequisites

### Software

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x | https://nodejs.org or `nvm install 22` |
| pnpm | 9.x | Enabled automatically via `corepack enable` |
| Docker + Compose | Latest | https://docs.docker.com/get-docker/ |
| Git | Latest | `apt install git` / `brew install git` |

### Accounts (for production)

- **GitHub** -- repository hosting and CI/CD
- **Domain registrar** -- any registrar (Namecheap, Cloudflare Registrar, etc.)
- **Cloudflare** -- DNS and CDN (free plan)
- **Resend** -- transactional email (free tier: 3,000 emails/month)
- **Google Cloud Console** -- OAuth credentials (free)

---

## 2. Local Development Setup

```bash
# Clone the repo
git clone git@github.com:YOUR_ORG/labprice.git
cd labprice

# Enable pnpm via corepack
corepack enable

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
```

### Start infrastructure (Postgres + Redis)

```bash
pnpm docker:dev
# or equivalently:
# docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL 16** on `localhost:5432` (user: `labprice`, password: `labprice`, db: `labprice`)
- **Redis 7** on `localhost:6379`

### Run database migrations and seed

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database (for dev, fast iteration)
pnpm db:push

# Or run migrations (mirrors production)
pnpm --filter @labprice/database exec prisma migrate deploy

# Seed initial data
pnpm db:seed
```

### Start the dev server

```bash
pnpm dev
```

### Verify

- Open http://localhost:3000 -- you should see the LabPrice homepage
- Check http://localhost:3000/api/health -- should return a 200 JSON response

### Useful dev commands

```bash
pnpm lint          # ESLint across all packages
pnpm typecheck     # TypeScript type checking
pnpm test          # Run test suites
pnpm db:studio     # Open Prisma Studio (visual DB browser)
pnpm clean         # Clean all build artifacts
```

---

## 3. Environment Variables

All variables are defined in `.env.example`. Here is every variable with its purpose:

### Database

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string. In Docker Compose production, the hostname is `postgres` (the service name). Locally, use `localhost`. | `postgresql://labprice:labprice@localhost:5432/labprice?schema=public` |

### Redis

| Variable | Description | Example |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string. In Docker Compose production, the hostname is `redis`. | `redis://localhost:6379` |

### Authentication

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `AUTH_SECRET` | Secret used by Auth.js to sign/encrypt tokens. Must be a random 32+ character string. | Run: `openssl rand -base64 32` |
| `AUTH_URL` | The canonical URL of your app. Used for OAuth callback URLs. | `http://localhost:3000` (dev) or `https://labprice.com` (prod) |

### Google OAuth

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud Console. | See [Section 5: Authentication Setup](#5-authentication-setup) |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret. | Same as above |

### Email (Resend)

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `RESEND_API_KEY` | API key from Resend dashboard. | https://resend.com/api-keys |
| `EMAIL_FROM` | The "From" address for outgoing emails. Must use a verified domain. | `LabPrice <noreply@labprice.com>` |

### App Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public-facing URL of the app. Used for links in emails, meta tags, etc. | `http://localhost:3000` (dev) or `https://labprice.com` (prod) |
| `NODE_ENV` | Node environment. | `development` or `production` |

> **Note:** In production Docker Compose, `DATABASE_URL` and `REDIS_URL` are overridden in `docker-compose.yml` to use internal Docker networking hostnames (`postgres` and `redis`). You do NOT need to change these in your `.env` file for Docker deployments.

---

## 4. Database Setup

### Requirements

- PostgreSQL 16 (the Docker image `postgres:16-alpine` handles this)
- Required extensions (installed by migrations): `citext`, `pg_trgm`, `btree_gin`
- Prisma uses the `fullTextSearchPostgres` preview feature

### Migrations

```bash
# Development -- push schema directly (fast, no migration files)
pnpm db:push

# Production -- apply migration files
pnpm --filter @labprice/database exec prisma migrate deploy
```

In Docker Compose production, the `migrate` service runs automatically before the app starts:
```bash
docker compose run --rm migrate
```

### Seeding

```bash
pnpm db:seed
```

### Backup strategy

For production, set up automated backups:

```bash
# Manual backup
docker compose exec postgres pg_dump -U labprice labprice > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker compose exec -T postgres psql -U labprice labprice < backup_20240101_120000.sql
```

Recommended: run `pg_dump` daily via cron and upload to S3 (see [Section 10](#10-s3-storage-optional)).

---

## 5. Authentication Setup

### Resend (Email)

1. Create an account at https://resend.com
2. Add and verify your domain (e.g., `labprice.com`) -- Resend will give you DNS records to add
3. Go to **API Keys** and create a new key
4. Set in `.env`:
   ```
   RESEND_API_KEY="re_xxxxxxxxxxxx"
   EMAIL_FROM="LabPrice <noreply@labprice.com>"
   ```

### Google OAuth

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services > OAuth consent screen**
   - Choose "External" user type
   - Fill in app name ("LabPrice"), user support email, developer email
   - Add scopes: `email`, `profile`, `openid`
   - Add your domain to authorized domains
4. Navigate to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth 2.0 Client ID**
   - Application type: "Web application"
   - Authorized redirect URIs:
     - Development: `http://localhost:3000/api/auth/callback/google`
     - Production: `https://labprice.com/api/auth/callback/google`
5. Copy the Client ID and Client Secret into `.env`:
   ```
   GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-xxxx"
   ```

### AUTH_SECRET

Generate a secure random secret:

```bash
openssl rand -base64 32
```

Copy the output into your `.env`:
```
AUTH_SECRET="your-generated-secret-here"
```

> **Warning:** Never reuse AUTH_SECRET across environments. Generate a unique one for each deployment.

---

## 6. Domain & Cloudflare Setup

### Register a domain

Use any registrar. Cloudflare Registrar offers at-cost pricing.

### Add domain to Cloudflare

1. Create a free Cloudflare account at https://cloudflare.com
2. Add your domain and follow the setup wizard
3. Update your domain's nameservers at your registrar to the ones Cloudflare provides

### Configure DNS

Add an **A record** pointing to your VPS IP:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `YOUR_VPS_IP` | Proxied (orange cloud) |
| A | `www` | `YOUR_VPS_IP` | Proxied (orange cloud) |

### SSL/TLS

- Go to **SSL/TLS** and set encryption mode to **Full (Strict)**
- Under **Edge Certificates**, enable **Always Use HTTPS**

### Recommended settings

- **Caching > Tiered Cache**: Enable
- **Speed > Auto Minify**: Enable for JavaScript, CSS, HTML
- **Security > Security Level**: Medium
- **Security > Bot Fight Mode**: Enable
- **Rules > Page Rules** (optional): Cache static assets aggressively

> **Note:** Since Cloudflare proxies traffic, your VPS only needs to expose ports 80 and 443 to Cloudflare IPs, plus port 22 for SSH.

---

## 7. VPS Deployment

### Recommended specs

| Traffic level | CPU | RAM | Disk | Monthly cost |
|--------------|-----|-----|------|-------------|
| Small (< 1k users) | 2 vCPU | 4 GB | 80 GB SSD | ~$12-24/mo |
| Medium (1k-10k users) | 4 vCPU | 8 GB | 160 GB SSD | ~$24-48/mo |

### Recommended providers

- **Hetzner** (best value, EU/US) -- 2 vCPU / 4 GB from ~EUR 4.50/mo
- **DigitalOcean** -- 2 vCPU / 4 GB from $24/mo
- **Linode (Akamai)** -- 2 vCPU / 4 GB from $24/mo

### Initial server setup

```bash
# SSH into your new server
ssh root@YOUR_VPS_IP

# Create a deploy user
adduser deploy
usermod -aG sudo deploy

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Switch to deploy user
su - deploy

# Clone the repo
git clone git@github.com:YOUR_ORG/labprice.git /opt/labprice
cd /opt/labprice

# Create your production .env
cp .env.example .env
nano .env  # Fill in all production values
```

### Production `.env` checklist

```env
DATABASE_URL="postgresql://labprice:STRONG_PASSWORD_HERE@postgres:5432/labprice?schema=public"
AUTH_SECRET="<output of openssl rand -base64 32>"
AUTH_URL="https://labprice.com"
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
RESEND_API_KEY="re_your_api_key"
EMAIL_FROM="LabPrice <noreply@labprice.com>"
REDIS_URL="redis://redis:6379"
NEXT_PUBLIC_APP_URL="https://labprice.com"
NODE_ENV="production"
```

> **Warning:** If you change the PostgreSQL password from the default `labprice`, also update the `POSTGRES_PASSWORD` environment variable in `docker-compose.yml`.

### Deploy

```bash
# Build and start all services
docker compose build
docker compose run --rm migrate
docker compose up -d web worker

# Verify
curl http://localhost:3000/api/health
```

### Using the deploy script for updates

The included `scripts/deploy.sh` automates pulling, building, migrating, and restarting:

```bash
# Make it executable
chmod +x /opt/labprice/scripts/deploy.sh

# Run a deploy
/opt/labprice/scripts/deploy.sh
```

What it does:
1. `git pull origin main`
2. `docker compose build`
3. `docker compose run --rm migrate` (runs Prisma migrations + seed)
4. `docker compose up -d web worker`
5. Health check via `wget`

### Configure firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Reverse proxy (Caddy -- recommended)

If you are not using Cloudflare's proxy, you need a reverse proxy for HTTPS. Caddy is the simplest option:

```bash
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
labprice.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically provisions and renews Let's Encrypt certificates.

If you ARE using Cloudflare proxy with Full (Strict) SSL, you can use a Cloudflare Origin Certificate instead.

---

## 8. CI/CD Pipeline

### How it works

Two GitHub Actions workflows are included:

1. **CI** (`.github/workflows/ci.yml`) -- Runs on every push/PR to `main`:
   - Lint + type checking
   - Tests (with Postgres 16 and Redis 7 service containers)
   - Build verification

2. **Deploy** (`.github/workflows/deploy.yml`) -- Runs on push to `main` (ignoring docs changes):
   - Runs the full CI pipeline first
   - SSHes into the VPS and runs `scripts/deploy.sh`
   - Performs a health check

### Setting up GitHub Actions secrets

Go to your GitHub repo > **Settings > Secrets and variables > Actions** and add:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | Your VPS IP address or hostname |
| `DEPLOY_USER` | `deploy` (or whichever user) |
| `DEPLOY_KEY` | Private SSH key (see below) |

### SSH key setup

```bash
# On your local machine, generate a deploy key
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/labprice_deploy

# Copy the public key to the server
ssh-copy-id -i ~/.ssh/labprice_deploy.pub deploy@YOUR_VPS_IP

# Copy the PRIVATE key contents -- this goes into the DEPLOY_KEY secret
cat ~/.ssh/labprice_deploy
```

Paste the entire private key (including `-----BEGIN` and `-----END` lines) into the `DEPLOY_KEY` GitHub secret.

---

## 9. Monitoring & Error Tracking (Optional)

### Sentry

1. Create a project at https://sentry.io (free tier: 5k errors/month)
2. Get your DSN from **Settings > Projects > [your project] > Client Keys**
3. Add to `.env`:
   ```
   SENTRY_DSN="https://xxxx@xxx.ingest.sentry.io/xxxx"
   ```

### Uptime monitoring

Free options:
- **UptimeRobot** (https://uptimerobot.com) -- 50 monitors, 5-min interval
- **BetterUptime** (https://betterstack.com/uptime) -- generous free tier

Monitor these endpoints:
- `https://labprice.com/api/health`
- `https://labprice.com`

### Analytics

Self-hosted options (no cookie banners needed):
- **Umami** (https://umami.is) -- self-host alongside LabPrice
- **Plausible** (https://plausible.io) -- hosted ($9/mo) or self-hosted

---

## 10. S3 Storage (Optional)

For partition archives and database backups.

### AWS S3

1. Create an S3 bucket (e.g., `labprice-backups`)
2. Create an IAM user with S3 write access
3. Add credentials to `.env` (if supported by your backup script)

### Backblaze B2 (cheaper alternative)

1. Create a bucket at https://backblaze.com/b2
2. Create an application key
3. Use the S3-compatible API endpoint

### Automated backup cron

```bash
# Add to crontab (crontab -e) on the VPS
0 3 * * * /opt/labprice/scripts/backup-db.sh
```

Example backup script (`scripts/backup-db.sh`):
```bash
#!/usr/bin/env bash
set -euo pipefail
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker compose -f /opt/labprice/docker-compose.yml exec -T postgres \
  pg_dump -U labprice labprice | gzip > /opt/labprice/backups/labprice_${TIMESTAMP}.sql.gz
# Upload to S3 (requires aws cli)
# aws s3 cp /opt/labprice/backups/labprice_${TIMESTAMP}.sql.gz s3://labprice-backups/
# Clean up local backups older than 7 days
find /opt/labprice/backups -name "*.sql.gz" -mtime +7 -delete
```

---

## 11. Scraper Proxies (Optional)

### When you need proxies

Vendor websites may rate-limit or block your server's IP if scrapers run frequently. Proxies distribute requests across multiple IPs.

### Recommended providers

- **BrightData** -- residential and datacenter proxies
- **Oxylabs** -- residential proxies
- **SmartProxy** -- good pricing for smaller volumes
- **Free rotation** -- use rotating datacenter proxies from providers like ProxyScrape for testing

### Configuration

Add proxies through the LabPrice admin panel. The scraper worker will automatically rotate through configured proxies.

---

## 12. Maintenance

### Partition maintenance

The worker service handles partition maintenance automatically (creating new partitions, detaching old ones). No manual intervention needed.

### Database backups

See [Section 10](#10-s3-storage-optional) for automated backup setup.

### Updating dependencies

```bash
# Update all dependencies
pnpm update

# Update a specific package
pnpm update <package-name> --filter <workspace>

# Check for outdated packages
pnpm outdated -r
```

### Monitoring disk space

```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Clean up unused Docker resources
docker system prune -a --volumes
```

> **Warning:** `docker system prune --volumes` will delete unused volumes including data. Only run this if you have backups or are sure the volumes are not needed.

### Checking logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f web
docker compose logs -f worker
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail 100 web
```

---

## 13. Troubleshooting

### Port conflicts

```bash
# Check what's using a port
sudo lsof -i :3000
sudo lsof -i :5432
sudo lsof -i :6379
```

Fix: stop the conflicting process, or change the port mapping in `docker-compose.dev.yml`.

### Database connection errors

- **Locally:** Make sure Docker containers are running: `docker compose -f docker-compose.dev.yml ps`
- **In production:** Check `docker compose logs postgres` for errors
- Verify `DATABASE_URL` matches the credentials in `docker-compose.yml`

### Redis connection errors

- Check Redis is running: `docker compose -f docker-compose.dev.yml ps`
- Test connection: `docker compose exec redis redis-cli ping` (should return `PONG`)

### Prisma migration errors

```bash
# Check migration status
pnpm --filter @labprice/database exec prisma migrate status

# Reset database (DESTROYS ALL DATA)
pnpm --filter @labprice/database exec prisma migrate reset

# Regenerate Prisma client after schema changes
pnpm db:generate
```

### Docker build failures

```bash
# Clean build (no cache)
docker compose build --no-cache

# Check available disk space
df -h
docker system df

# Prune unused images and build cache
docker system prune
docker builder prune
```

### Health check endpoints

- `GET /api/health` -- returns 200 if the web app is running and can reach the database

---

## 14. Cost Summary

| Service | Free tier | Paid option | Monthly cost |
|---------|-----------|-------------|-------------|
| **VPS (Hetzner)** | -- | 2 vCPU / 4 GB | ~$5-6 |
| **VPS (DigitalOcean)** | -- | 2 vCPU / 4 GB | ~$24 |
| **Cloudflare** | DNS, CDN, SSL, DDoS protection | Pro plan | Free |
| **Resend** | 3,000 emails/month | 50k emails/month | Free / $20 |
| **Google OAuth** | Unlimited | -- | Free |
| **GitHub** | Public repos, Actions (2,000 min/mo) | Private repos, more minutes | Free / $4/user |
| **Sentry** | 5,000 errors/month | More volume | Free / $26 |
| **UptimeRobot** | 50 monitors | More monitors, 1-min interval | Free / $7 |
| **Backblaze B2** | 10 GB storage | Per GB | Free / ~$1 |
| **Domain** | -- | .com registration | ~$10/year |

**Minimum production cost: ~$5-6/month** (Hetzner VPS + free tiers for everything else, plus ~$10/year for the domain).
