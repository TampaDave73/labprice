# Railway setup — step by step, from scratch (novice-friendly)

This is the **click-by-click** guide to get LabTestCompare live on Railway with your Cloudflare domain,
starting from an empty Railway account. Every step links the exact Railway doc it's based on.

It specifically fixes the three things that bit you last time:
- **Railpack/Nixpacks instead of the Dockerfile** (the install errors) → Part 2.
- **Internal vs external URLs** → Part 4.
- **Old seed data** → Part 5 (you copy your *real* local catalog up; you do **not** run the old seed).

**Mental model:** Cloudflare = your domain + TLS + firewall in front. Railway = runs the app + database
+ Redis. You need three Railway services: **web** (the site), **Postgres**, **Redis**. The scrape
**worker** is optional and comes last (Part 8) — the site works for users without it.

> Railway docs home (bookmark): https://docs.railway.com  ·  Monorepo guide:
> https://docs.railway.com/guides/monorepo

---

## Part 0 — Before you touch Railway (5 min)

Have these ready:

1. **A Railway account** with your **GitHub** connected (Railway → account settings → connect GitHub,
   and grant access to the `TampaDave73/labprice` repo).
2. **Docker Desktop running** on your PC (you'll use it to copy your data up — Part 5).
3. **A strong `AUTH_SECRET`.** In a terminal run: `openssl rand -base64 32` and copy the output. (On
   Windows without openssl, use any 40+ char random string, e.g. from https://1password.com/password-generator.)
4. **Resend** account → an API key (`re_...`) and a verified sending domain, for admin login emails +
   alerts. (Optional to start, but admin magic-link login needs it in production.)
5. (Optional) **Google OAuth** client id/secret, and a fresh **Anthropic** API key.

Your code is on branch **`claude/github-write-access-3v9dld`** — that's the branch Railway must deploy.

---

## Part 1 — Create the project and the web service

Doc: https://docs.railway.com/guides/monorepo (see "Deploying a Monorepo")

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → choose `TampaDave73/labprice`.
2. Railway will detect the pnpm monorepo and may try to **auto-create several services** (one per app)
   with its own build commands. **This is the trap that caused your Railpack errors.** If it offers to
   add multiple services, cancel/close that and instead create **one** service (or delete the extras
   and keep a single one). You want **one web service that builds from the Dockerfile at the repo root.**
3. Open that service. Go to **Settings → Source** and confirm:
   - **Repo:** `TampaDave73/labprice`
   - **Branch:** **`claude/github-write-access-3v9dld`** ← set this explicitly so it never builds an old
     branch. (This is part of your "old data from GitHub" problem — it also covers old *code*.)
   - **Root Directory:** leave **empty / `/`** (the repo root). Do **not** set it to `apps/web` — the
     Dockerfile builds from the root.

---

## Part 2 — Force the Dockerfile builder (fixes the Railpack install errors)

Doc: https://docs.railway.com/builds/dockerfiles  ·  https://docs.railway.com/builds/build-configuration

Railway will use a Dockerfile if it finds one, **but** the monorepo auto-detect may have set a
Nixpacks/Railpack **Build Command** that overrides it. Clear that:

1. Service → **Settings → Build**.
2. **Builder:** select **Dockerfile**.
3. **Dockerfile Path:** `Dockerfile` (the one at the repo root).
4. **Build Command / Start Command / Install Command:** make sure these are **empty** (blank). If the
   monorepo auto-detect filled them with `pnpm ...` commands, delete them — the Dockerfile handles
   everything. Leftover commands here are what re-trigger Railpack-style installs.
5. The repo's `railway.json` already sets the Dockerfile builder + the `/api/health` healthcheck, so
   once the dashboard isn't overriding it, this is consistent.

Trigger a deploy (Deployments tab → **Deploy**). The build should now run the Dockerfile: you'll see
`pnpm install`, `prisma generate`, `pnpm build`, then the web image. It will **build successfully even
before Postgres exists** (the build no longer needs a database). It won't fully *serve* until Part 3–4.

> If the build still fails with `Environment variable not found: DATABASE_URL`, you're on an **old
> commit** — confirm the branch is `claude/github-write-access-3v9dld` and redeploy the latest.

---

## Part 3 — Add Postgres and Redis

Docs: https://docs.railway.com/databases/postgresql  ·  https://docs.railway.com/databases

1. In the project canvas: **New → Database → Add PostgreSQL**. Wait for it to provision.
2. **New → Database → Add Redis.** Wait for it to provision.

You now have three services: your web service, **Postgres**, **Redis**, all in the same project and
environment (this matters — private networking only works within the same project + environment).

---

## Part 4 — Environment variables (INTERNAL vs EXTERNAL — the part that confused you)

Docs: https://docs.railway.com/variables  ·  https://docs.railway.com/variables/reference  ·
https://docs.railway.com/private-networking

**The rule:** the app runs *inside* Railway, so it talks to Postgres/Redis over Railway's **private
network** (hostnames ending in `.railway.internal`). You wire this with **reference variables**, and
Railway fills in the private URL automatically. You do **not** paste the public `...proxy.rlwy.net` URL
into the app — that's only for connecting from *outside* Railway (your laptop, Part 5).

Open your **web service → Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference variable → the **private** Postgres URL. Type `${{` and Railway autocompletes. |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Reference variable → the **private** Redis URL. |
| `AUTH_SECRET` | *(your `openssl rand` value)* | |
| `AUTH_URL` | `https://labtestcompare.com` | Your final public URL. |
| `AUTH_TRUST_HOST` | `true` | Required because Cloudflare/Railway proxy in front. |
| `NEXT_PUBLIC_BASE_URL` | `https://labtestcompare.com` | |
| `EMAIL_FROM` | `LabTestCompare <noreply@labtestcompare.com>` | Must match your Resend verified domain. |
| `RESEND_API_KEY` | `re_...` | For admin login emails. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(optional)* | Google login. |
| `ANTHROPIC_API_KEY` | *(optional, fresh key)* | Admin auto-fill. |

**Do NOT add `NODE_ENV`.** Railway sets it to `production` automatically — and pinning it breaks the
build *and* would re-enable the local dev login. (`.env` values are for your laptop only; they are not
used by Railway.)

> Why private, not public: private networking is faster, free (no egress fees), and always on between
> your services. The public URL exists for external tools. Railway's own guidance: *"when configuring
> variables to reference other services, use the private versions such as `DATABASE_URL`."*
> ⚠️ Private networking is **runtime-only** — it is not available during the build. That's fine here
> because the build needs no database.

---

## Part 5 — Load YOUR data into Railway (do this, not the seed)

**Why:** the repo's seed script (`prisma/seed.ts`) is the *original* catalog — old codes/prices and the
`admin@labprice.com` seed user. Your real, curated **35 tests / 17 vendors / all the offerings and
corrected LabCorp codes** live only in your **local** database. So you copy your local DB up — you do
**not** run the seed. This is a one-time exact copy (schema + extensions + full-text index + all data).

You'll use your **local Postgres Docker container** for the tools, so there's nothing to install. The
container is named **`labprice-postgres-1`**.

**Step 5a — get Railway's PUBLIC Postgres URL** (this IS the external one — correct here because you're
connecting from your laptop): Railway → **Postgres service → Variables** → copy **`DATABASE_PUBLIC_URL`**
(looks like `postgresql://postgres:PASSWORD@somehost.proxy.rlwy.net:12345/railway`). Doc:
https://docs.railway.com/databases/postgresql

**Step 5b — start your local DB** (if not running):

```bash
cd "C:/Users/david/Desktop/Price Tool/labprice"
pnpm docker:dev
```

**Step 5c — dump your local database** (writes a dump file inside the container):

```bash
docker exec labprice-postgres-1 pg_dump -U labprice -d labprice -Fc --no-owner --no-acl -f /tmp/labprice.dump
```

**Step 5d — restore it into Railway** (paste your `DATABASE_PUBLIC_URL` in the quotes). Run this as
**one single line** — do not break it with a `\` (on Windows/PowerShell the backslash isn't a line
continuation and `pg_restore` errors with "too many command-line arguments"):

```bash
docker exec labprice-postgres-1 pg_restore --no-owner --no-acl --clean --if-exists -d "postgresql://postgres:PASSWORD@somehost.proxy.rlwy.net:12345/railway" /tmp/labprice.dump
```

That's it — Railway Postgres now has an exact copy of your dev database, including your curated catalog
and your admin account (`davidsabot@gmail.com`, already SUPER_ADMIN, so you can log in). You can ignore
any harmless "already exists" notices for extensions.

> Prefer a clean/empty start instead (accepting the OLD seed catalog)? Then skip 5c–5d and follow
> `DEPLOY.md` → "Bootstrap the database": `prisma db push` + `ddl-core.sql` + optional seed. Not
> recommended — you'd lose your curated data.

---

## Part 6 — Custom domain + Cloudflare

Docs: https://docs.railway.com/networking/domains/working-with-domains  ·
https://docs.railway.com/networking/troubleshooting/ssl

1. Web service → **Settings → Networking → Public Networking → + Custom Domain** → enter
   `labtestcompare.com`. Railway shows you **two** DNS records: a **CNAME** *and* a **TXT** record.
   **You need BOTH** — with only the CNAME, the domain returns 404 until the TXT verifies ownership.
2. In **Cloudflare → your domain → DNS → Records**, add exactly what Railway showed:
   - **CNAME**: name `@` (apex) → the Railway target (`...up.railway.app`). Repeat for `www` if you want it.
   - **TXT**: the verification record Railway gave you (name + value copied exactly).
3. Set the CNAME's proxy status. Start with the **grey cloud (DNS only)** so Railway can issue its TLS
   certificate without Cloudflare in the path (see the SSL tip below). Once Railway shows the domain as
   **Active / certificate issued**, switch it back to the **orange cloud (Proxied)**.
4. **Cloudflare → SSL/TLS → Overview → set mode to `Full (Strict)`.** Then SSL/TLS → Edge Certificates
   → turn on **Always Use HTTPS** and (once stable) **HSTS**.

> Certificate stuck on "Validating challenges"? That's the classic Cloudflare-proxy-in-the-way problem.
> Set the record to grey cloud (DNS only), wait for Railway to issue the cert, then re-enable orange.

---

## Part 7 — Verify + lock it down before sharing with users

1. Redeploy the web service if you changed variables. Confirm the deployment is **green/healthy**
   (Railway pings `/api/health`).
2. Visit **`https://labtestcompare.com/api/health`** → you should see
   `{"status":"ok","checks":{"database":"up"}}`. If `database` is `down`, your `DATABASE_URL` isn't
   referencing the Postgres plugin correctly (Part 4).
3. Browse the site: search a test, open a test page, click an "Order" link.
4. **Security checklist (from `DEPLOY.md`) — do these before inviting users:**
   - [ ] Confirm `GET https://labtestcompare.com/api/dev-login` returns **404** (proves the dev
         backdoor is off — it is, because `NODE_ENV=production`).
   - [ ] Log into `/admin` with **your** account (`davidsabot@gmail.com`) via Google/magic-link, then
         **retire the seed admin `admin@labprice.com`** at `/admin/users` (demote/deactivate it).
   - [ ] Rotate the **Anthropic** key if you set one (the old one was shared in chat).
   - [ ] Cloudflare: add **WAF rate-limiting** rules on `/api/*`, `/auth/*`, `/admin`, and enable Bot
         Fight Mode.

---

## Part 8 — The scrape worker (automated weekly scraping + email reports)

The worker is what makes scraping **automatic**: it runs a daily tick that scrapes each vendor on its
own schedule (set per vendor on the admin Vendors page — default weekly), emails you an immediate
alert when a scheduled scrape fails, and sends a **weekly digest every Monday** summarizing every
scraper's health. No worker = manual "Scrape now" only, and no report emails.

You should already have **Redis** from Part 3. If not, do that first (**New → Database → Add Redis**).

1. **Add the service:** project canvas → **New → GitHub Repo** → pick the same `labprice` repo again.
   Yes — the same repo twice; the two services just start different processes from it.
2. **Rename it** (Settings → the name field) to `worker` so the canvas isn't two identical boxes.
3. **Settings → Build:** **Builder = Dockerfile** (same fix as Part 2), Build/Start commands empty.
4. **Point it at the worker Dockerfile** ← this is the whole trick. On the worker service's
   **Variables** tab add `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.worker`. The repo ships a dedicated
   `Dockerfile.worker` that starts the scrape worker instead of the web app (Railway can't target a
   stage of the main Dockerfile, so the worker gets its own file).
   *(Alternative that also works: leave the Dockerfile alone and set Settings → Deploy → Custom
   Start Command to `sh -c "cd /app && node_modules/.bin/tsx apps/worker/src/index.ts"`.)*
5. Healthcheck needs no config — the worker answers `/api/health` on Railway's `$PORT` (3001
   locally), matching the repo's `railway.json`.
   **Settings → Networking:** do NOT add a public domain — the worker needs no public traffic.
6. **Variables** (worker service → Variables → Raw editor):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `RESEND_API_KEY` | same `re_...` key as the web service — this is what sends the report emails |
   | `EMAIL_FROM` | `LabTestCompare <noreply@labtestcompare.com>` |

   Also confirm the **web** service has `REDIS_URL = ${{Redis.REDIS_URL}}` (Part 4) — the admin
   "Scrape now" button queues browser-based vendors through Redis to this worker.
7. **Deploy.** The logs should show `Registered 6 workers` and
   `Schedulers: daily scrape tick @ 06:00 UTC, weekly digest Mondays @ 12:00 UTC`.

**What you'll see once it's live:**
- Every day at 06:00 UTC the tick checks which vendors are due (per-vendor **Scrape frequency** on
  the admin vendor page; default **Weekly**, `Manual only` opts a vendor out) and scrapes them.
- Every Monday at 12:00 UTC you get the **scrape report** email: one line per vendor
  (✅ ok / 🟡 some tests not priced / ❌ failed / ⚠ overdue / ⏸ disabled), which linked tests could
  not be priced, pending changes to review, and error counts.
- If a **scheduled** scrape fails, you get an immediate ⚠ email (max one per vendor per day).
- The master kill switch is **admin → Settings → Scraping enabled**.

---

## Troubleshooting quick reference

| Symptom | Cause | Fix |
|---|---|---|
| Build fails installing deps (Railpack/Nixpacks) | Not using the Dockerfile | Part 2 — Builder = Dockerfile, clear Build/Start commands |
| Build fails: `Environment variable not found: DATABASE_URL` | Deploying an old commit | Set branch to `claude/github-write-access-3v9dld`, redeploy latest |
| App up but `/api/health` shows `database: down` | Wrong/missing `DATABASE_URL` | Use `${{Postgres.DATABASE_URL}}` (private), not the public URL |
| `pg_restore` can't connect from your laptop | Used the private `.railway.internal` URL | Use `DATABASE_PUBLIC_URL` (the `proxy.rlwy.net` one) for Part 5 |
| Site shows old/demo tests | You ran the seed | Copy your local DB instead (Part 5) |
| Domain returns 404 after CNAME resolves | Missing TXT record | Add the TXT record Railway gave you (Part 6) |
| TLS stuck "Validating challenges" | Cloudflare proxy in the path | Grey-cloud the record, wait for cert, then orange-cloud (Part 6) |

**Railway doc index:** [Monorepo](https://docs.railway.com/guides/monorepo) ·
[Dockerfiles](https://docs.railway.com/builds/dockerfiles) ·
[Build config](https://docs.railway.com/builds/build-configuration) ·
[PostgreSQL](https://docs.railway.com/databases/postgresql) ·
[Private networking](https://docs.railway.com/private-networking) ·
[Variables](https://docs.railway.com/variables) · [Variables reference](https://docs.railway.com/variables/reference) ·
[Domains](https://docs.railway.com/networking/domains/working-with-domains) ·
[SSL troubleshooting](https://docs.railway.com/networking/troubleshooting/ssl) ·
[CLI connect](https://docs.railway.com/cli/connect)
