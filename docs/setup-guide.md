# LabPrice Setup Guide

This guide walks you through getting LabPrice live on the internet, step by step. Each step tells you exactly what to click and what to type. No programming experience needed — just follow along.

**Total time:** About 2-3 hours if this is your first time.
**Total cost:** About $7-24/month (depending on server location) + $12/year for a domain name.

---

## What You're Setting Up

LabPrice needs a few things to work:

- **A server** — a computer in the cloud that runs your website 24/7
- **A database** — where all your test prices, vendor info, and user accounts are stored
- **A domain name** — your website address (like labprice.com)
- **An email service** — so users can sign in with magic links
- **Google sign-in** — so users can sign in with their Google account

Don't worry — most of these are free or very cheap, and this guide covers each one.

---

## Step 1: Get a Server

You need a server (called a "VPS") to run your website. Think of it as renting a computer that's always on and connected to the internet.

### Pick a provider

Here are your best options:

| Provider | Plan | US Servers? | Monthly Cost | Sign Up |
|----------|------|-------------|-------------|---------|
| **Hetzner** (EU only at this price) | CX22 (2 CPU, 4GB) | No — Germany only | ~$7/mo | https://www.hetzner.com/cloud |
| **Hetzner** (US server) | CPX21 (2 CPU, 4GB) | Yes — Ashburn, VA | ~$23/mo | https://www.hetzner.com/cloud |
| **DigitalOcean** | Basic Droplet (2 CPU, 4GB) | Yes — NYC, SF, etc. | $24/mo | https://www.digitalocean.com |
| **Vultr** | Cloud Compute (2 CPU, 4GB) | Yes — multiple US | $18/mo | https://www.vultr.com |

**Which should you pick?**
- If your users are mostly in the **US**, go with **Vultr** ($18/mo) or **DigitalOcean** ($24/mo, most beginner-friendly dashboard)
- If your users are in **Europe** or you want the cheapest option and don't mind EU servers, **Hetzner CX22** at ~$7/mo is great
- A server in Germany still works fine for US users — pages will just load about 100ms slower

### Sign up and create a server

These instructions use DigitalOcean as an example, but the process is similar on any provider:

1. Go to your chosen provider's website and **create an account**
2. You'll need to verify your identity (credit card or PayPal)
3. Create a new server (called a "Droplet" on DigitalOcean, "Instance" on Vultr, "Server" on Hetzner)
4. Choose these settings:
   - **Location:** Pick a US location closest to your users (or EU for Hetzner budget option)
   - **Image:** Ubuntu 24.04
   - **Size:** 2 vCPU, 4 GB RAM (the cheapest plan that meets this is fine)
   - **SSH Keys:** Click "Add SSH Key" (see below if you don't have one)
   - **Hostname/Name:** `labprice`
5. Create the server
6. **Write down the IP address** that appears — you'll need it later (it looks like `123.45.67.89`)

### Don't have an SSH key? Here's how to make one:

An SSH key is like a special password that lets you connect to your server securely.

**On Mac:**
1. Open the **Terminal** app (search for "Terminal" in Spotlight)
2. Paste this and press Enter:
   ```
   ssh-keygen -t ed25519 -C "labprice"
   ```
3. Press Enter three times (to accept the default location and skip the passphrase)
4. Now show your public key:
   ```
   cat ~/.ssh/id_ed25519.pub
   ```
5. Copy everything that appears — that's what you paste into Hetzner

**On Windows:**
1. Open **PowerShell** (search for it in the Start menu)
2. Paste this and press Enter:
   ```
   ssh-keygen -t ed25519 -C "labprice"
   ```
3. Press Enter three times
4. Show your public key:
   ```
   cat $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
5. Copy everything that appears

---

## Step 2: Get a Domain Name

A domain name is your website's address (like `labprice.com`).

1. Go to https://www.cloudflare.com/products/registrar/
2. Create a free Cloudflare account if you don't have one
3. Search for a domain name you want (e.g., `labprice.com`, `labpricecompare.com`)
4. Pick one and purchase it (usually $10-15/year for a `.com`)
5. **Write down your domain name** — you'll need it in later steps

> **Tip:** If `labprice.com` is taken, try variations like `labprices.com`, `labpriceguide.com`, or use a different extension like `.io` or `.co`.

> **Already have a domain elsewhere?** That works too. You'll just need to change your domain's nameservers to Cloudflare's in Step 3.

---

## Step 3: Set Up Cloudflare (Free)

Cloudflare protects your site from attacks, makes it faster, and handles your SSL certificate (the padlock icon in browsers). It's free.

### If you bought your domain from Cloudflare:
It's already there! Skip to "Add DNS Records" below.

### If your domain is elsewhere:
1. Log into https://dash.cloudflare.com
2. Click **"Add a Site"**
3. Type your domain name and click **"Add Site"**
4. Choose the **Free** plan and click **"Continue"**
5. Cloudflare will show you two nameservers (they look like `ada.ns.cloudflare.com`)
6. Go to wherever you bought your domain (GoDaddy, Namecheap, etc.)
7. Find the "Nameservers" or "DNS" setting
8. Replace the existing nameservers with the two Cloudflare gave you
9. Save and wait — this can take up to 24 hours, but usually works in about 30 minutes

### Add DNS Records

This tells the internet that your domain should point to your server.

1. In Cloudflare, click on your domain
2. Click **"DNS"** in the left sidebar
3. Click **"Add Record"** and fill in:
   - **Type:** A
   - **Name:** `@`
   - **IPv4 address:** Your server's IP address (from Step 1)
   - **Proxy status:** Orange cloud (Proxied) — this is important!
4. Click **"Save"**
5. Add one more record:
   - **Type:** A
   - **Name:** `www`
   - **IPv4 address:** Same IP address
   - **Proxy status:** Orange cloud (Proxied)
6. Click **"Save"**

### Turn on SSL

1. Click **"SSL/TLS"** in the left sidebar
2. Set encryption mode to **"Full (strict)"**
3. Click **"Edge Certificates"** in the sub-menu
4. Turn on **"Always Use HTTPS"**

---

## Step 4: Set Up Email (Resend — Free)

Resend sends the magic link emails that let users sign in without a password.

1. Go to https://resend.com and click **"Sign Up"**
2. Create an account with your email
3. Once logged in, click **"Domains"** in the left sidebar
4. Click **"Add Domain"** and type your domain (e.g., `labprice.com`)
5. Resend will show you DNS records you need to add. For each one:
   - Go back to **Cloudflare > DNS**
   - Click **"Add Record"**
   - Copy the type, name, and value from Resend
   - **Important:** Set Proxy status to **"DNS only"** (grey cloud) for these records
6. Back in Resend, click **"Verify"** — it may take a few minutes
7. Once verified, click **"API Keys"** in the left sidebar
8. Click **"Create API Key"**
   - Name it "LabPrice"
   - Leave permissions as "Full Access"
9. **Copy the API key** (starts with `re_`) — you'll need it later. You can only see it once!

---

## Step 5: Set Up Google Sign-In (Free)

This lets users sign in with their Google account.

1. Go to https://console.cloud.google.com
2. Sign in with any Google account
3. Click the project dropdown at the top and click **"New Project"**
   - Name: `LabPrice`
   - Click **"Create"**
4. Make sure your new project is selected in the dropdown
5. In the search bar at the top, type **"OAuth consent screen"** and click it
6. Click **"Get Started"**
   - App name: `LabPrice`
   - User support email: your email
   - Audience: **External**
   - Contact information: your email
   - Click through and **"Save"**
7. In the search bar, type **"Credentials"** and click **"Credentials"** under "APIs & Services"
8. Click **"Create Credentials"** at the top, then **"OAuth client ID"**
   - Application type: **"Web application"**
   - Name: `LabPrice`
   - Under **"Authorized redirect URIs"**, click **"Add URI"** and add:
     ```
     https://YOUR-DOMAIN.com/api/auth/callback/google
     ```
     (Replace `YOUR-DOMAIN.com` with your actual domain)
   - Click **"Create"**
9. A popup appears with your **Client ID** and **Client Secret**
10. **Copy both** — you'll need them in the next step

---

## Step 6: Connect to Your Server and Deploy

Now you'll connect to your server and set everything up. This is the biggest step, but just follow along command by command.

### Connect to your server

**On Mac:** Open Terminal
**On Windows:** Open PowerShell

Type this (replace with your actual IP):
```
ssh root@YOUR_SERVER_IP
```

If it asks "Are you sure you want to continue connecting?", type `yes` and press Enter.

You're now controlling your server! Everything you type runs on that remote computer.

### Install Docker

Docker is the tool that runs all the pieces of LabPrice. Copy and paste these commands one at a time:

```
curl -fsSL https://get.docker.com | sh
```

Wait for it to finish (about 1-2 minutes), then:

```
docker --version
```

You should see something like `Docker version 27.x.x`. If you do, it worked!

### Install Git and clone the code

```
apt update && apt install -y git
```

```
git clone https://github.com/TampaDave73/labprice.git /opt/labprice
```

```
cd /opt/labprice
```

### Create your settings file

This is where you put all your passwords and API keys:

```
cp .env.example .env
```

Now open the file for editing:

```
nano .env
```

You'll see a file with settings. Use your arrow keys to move around. Update these values:

```
# Replace the items in quotes with your actual values

DATABASE_URL="postgresql://labprice:PICK_A_STRONG_PASSWORD@postgres:5432/labprice?schema=public"
REDIS_URL="redis://redis:6379"

AUTH_URL="https://YOUR-DOMAIN.com"
NEXT_PUBLIC_APP_URL="https://YOUR-DOMAIN.com"
NODE_ENV="production"

GOOGLE_CLIENT_ID="paste-your-google-client-id-here"
GOOGLE_CLIENT_SECRET="paste-your-google-client-secret-here"

RESEND_API_KEY="re_paste_your_resend_key_here"
EMAIL_FROM="LabPrice <noreply@YOUR-DOMAIN.com>"

SEED_ADMIN_EMAIL="your-personal-email@gmail.com"
```

For `AUTH_SECRET`, you need a random string. Press Ctrl+Z to pause the editor, then run:

```
openssl rand -base64 32
```

Copy the output, then type `fg` to go back to the editor. Paste it as the value:

```
AUTH_SECRET="paste-the-random-string-here"
```

**Also update docker-compose.yml** if you changed the database password:

Press Ctrl+X, then Y, then Enter to save and exit nano.

```
nano docker-compose.yml
```

Find the line that says `POSTGRES_PASSWORD: labprice` and change `labprice` to match the password you used in DATABASE_URL above. Save and exit (Ctrl+X, Y, Enter).

### Build and start everything

This will take about 3-5 minutes the first time:

```
docker compose build
```

Set up the database:

```
docker compose run --rm migrate
```

Start the website:

```
docker compose up -d
```

### Check if it's working

```
curl http://localhost:3000/api/health
```

You should see something like: `{"status":"ok","timestamp":"...","version":"1.0.0"}`

If you do — congratulations! Your site is running!

### Set up the firewall

This protects your server by only allowing web traffic and SSH:

```
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Type `y` when it asks to confirm.

### Install Caddy (handles HTTPS)

Caddy is a simple web server that sits in front of LabPrice and handles the secure HTTPS connection:

```
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

Now configure it:

```
nano /etc/caddy/Caddyfile
```

Delete everything in the file and replace it with (use your actual domain):

```
YOUR-DOMAIN.com {
    reverse_proxy localhost:3000
}
```

Save (Ctrl+X, Y, Enter), then restart Caddy:

```
systemctl reload caddy
```

### Visit your site!

Open your browser and go to `https://YOUR-DOMAIN.com` — you should see the LabPrice homepage!

---

## Step 7: Set Up Your Admin Account

1. Go to your site and click **"Free Account"**
2. Sign in with the email you put in `SEED_ADMIN_EMAIL` — this account was created as a Super Admin during the database setup
3. Go to `https://YOUR-DOMAIN.com/admin` — you should see the admin dashboard

---

## Step 8: Keeping Your Site Updated

When there are code updates, connect to your server and run:

```
ssh root@YOUR_SERVER_IP
cd /opt/labprice
./scripts/deploy.sh
```

This pulls the latest code, rebuilds, runs any new database migrations, and restarts the site. It takes about 2-3 minutes.

---

## Optional: Set Up Automatic Deployments

If you want the site to automatically update when code is pushed to GitHub:

### Create a deploy SSH key

On your local computer (not the server):

```
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/labprice_deploy
```

Press Enter twice (no passphrase).

Copy the public key to your server:

```
ssh-copy-id -i ~/.ssh/labprice_deploy.pub root@YOUR_SERVER_IP
```

Now copy the private key:

**Mac:**
```
cat ~/.ssh/labprice_deploy
```

**Windows:**
```
cat $env:USERPROFILE\.ssh\labprice_deploy
```

### Add secrets to GitHub

1. Go to your GitHub repository
2. Click **"Settings"** > **"Secrets and variables"** > **"Actions"**
3. Click **"New repository secret"** and add these three:

| Name | Value |
|------|-------|
| `DEPLOY_HOST` | Your server IP address |
| `DEPLOY_USER` | `root` |
| `DEPLOY_KEY` | The entire private key you copied (including the BEGIN and END lines) |

Now whenever you push code to the `main` branch, it will automatically deploy!

---

## Optional: Error Monitoring with Sentry (Free)

Sentry tells you when something breaks on your site, so you can fix it before users complain.

1. Go to https://sentry.io and create a free account
2. Create a new project:
   - Platform: **Next.js**
   - Name: `labprice`
3. Copy the **DSN** (it looks like `https://xxx@xxx.ingest.sentry.io/xxx`)
4. SSH into your server and add it to your `.env`:
   ```
   ssh root@YOUR_SERVER_IP
   cd /opt/labprice
   nano .env
   ```
   Add this line:
   ```
   SENTRY_DSN="paste-your-dsn-here"
   ```
   Save and restart:
   ```
   docker compose up -d
   ```

---

## Optional: Uptime Monitoring (Free)

Get a text or email if your site goes down.

1. Go to https://uptimerobot.com and create a free account
2. Click **"Add New Monitor"**
   - Monitor Type: HTTP(s)
   - Friendly Name: LabPrice
   - URL: `https://YOUR-DOMAIN.com/api/health`
   - Monitoring Interval: 5 minutes
3. Set up alert contacts (your email and/or phone number)
4. Click **"Create Monitor"**

---

## Optional: Database Backups

It's a good idea to automatically back up your database every night.

SSH into your server:

```
ssh root@YOUR_SERVER_IP
```

Create a backups folder:

```
mkdir -p /opt/labprice/backups
```

Set up a daily automatic backup:

```
crontab -e
```

If asked which editor, choose `1` (nano). Add this line at the bottom:

```
0 3 * * * docker compose -f /opt/labprice/docker-compose.yml exec -T postgres pg_dump -U labprice labprice | gzip > /opt/labprice/backups/backup_$(date +\%Y\%m\%d).sql.gz && find /opt/labprice/backups -name "*.sql.gz" -mtime +30 -delete
```

Save and exit (Ctrl+X, Y, Enter). This backs up your database every night at 3 AM and keeps the last 30 days.

---

## Troubleshooting

### "I can't connect to my server"
- Double-check the IP address
- Make sure you're using the right SSH key
- Try: `ssh -v root@YOUR_SERVER_IP` (the `-v` flag shows what's happening)

### "The site shows an error page"
Check the logs:
```
ssh root@YOUR_SERVER_IP
cd /opt/labprice
docker compose logs web --tail 50
```
This shows the last 50 lines of output from the web server.

### "The database won't start"
```
docker compose logs postgres --tail 50
```
Common fix: make sure the password in `.env` matches what's in `docker-compose.yml`.

### "I changed my .env but nothing happened"
You need to restart after changing settings:
```
docker compose down
docker compose up -d
```

### "Docker build is failing"
Try a clean build:
```
docker compose build --no-cache
```

If you're running out of disk space:
```
docker system prune -a
```
(This deletes old unused images to free up space)

### "I forgot my admin email"
Check your `.env` file:
```
grep SEED_ADMIN_EMAIL /opt/labprice/.env
```

---

## Cost Summary

Here's what you'll actually pay:

| Service | What it does | Cost |
|---------|-------------|------|
| **Server (VPS)** | Runs your website | ~$7/mo (EU) or ~$18-24/mo (US) |
| **Domain name** | Your web address | ~$12/year |
| **Cloudflare** | Security & speed | Free |
| **Resend** | Sign-in emails | Free (up to 3,000 emails/month) |
| **Google OAuth** | Google sign-in | Free |
| **UptimeRobot** | Alerts if site is down | Free |
| **Sentry** | Error tracking | Free (up to 5,000 errors/month) |

**Total: About $7-24/month + $12/year** (depending on server provider and location)

---

## Quick Reference

| Task | Command |
|------|---------|
| Connect to server | `ssh root@YOUR_SERVER_IP` |
| Go to project folder | `cd /opt/labprice` |
| Deploy updates | `./scripts/deploy.sh` |
| View web logs | `docker compose logs web --tail 50` |
| View worker logs | `docker compose logs worker --tail 50` |
| View database logs | `docker compose logs postgres --tail 50` |
| Restart everything | `docker compose down && docker compose up -d` |
| Check site health | `curl http://localhost:3000/api/health` |
| Edit settings | `nano .env` (then restart) |
| Manual backup | `docker compose exec postgres pg_dump -U labprice labprice > backup.sql` |
