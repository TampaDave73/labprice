# LabPrice — Local Setup Guide (Windows PC)

Get LabPrice running on your Windows PC for testing. No server needed. About 30-45 minutes.

---

## Step 1: Install Node.js

Node.js is what runs the website code on your computer.

1. Go to https://nodejs.org
2. Click the big green button that says **"22.x.x LTS"** (the exact number doesn't matter, just make sure it starts with 22)
3. Run the downloaded installer
4. Click **Next** through everything, leave all defaults checked
5. Click **Install**, then **Finish**

### Verify it worked

1. Open **PowerShell** (press the Windows key, type `powershell`, click it)
2. Type this and press Enter:
   ```
   node --version
   ```
   You should see something like `v22.x.x`

---

## Step 2: Install pnpm

pnpm is the tool that downloads and manages all the code libraries LabPrice depends on.

In the same PowerShell window, type:

```
corepack enable
```

Then verify:

```
pnpm --version
```

You should see a version number like `9.x.x`. If you get an error, close PowerShell, reopen it, and try again.

---

## Step 3: Install Docker Desktop

Docker runs the database and Redis (a fast data cache) in containers on your computer — like little virtual machines.

1. Go to https://www.docker.com/products/docker-desktop/
2. Click **"Download for Windows"**
3. Run the installer
4. **Important:** When it asks, make sure **"Use WSL 2"** is checked
5. Click **OK** and let it install
6. It will ask you to **restart your computer** — do that
7. After restart, Docker Desktop should open automatically. If not, search for "Docker Desktop" in the Start menu and open it
8. You might see a tutorial — you can skip it
9. Wait until the bottom-left of Docker Desktop shows a **green whale icon** and says **"Engine running"**

### If Docker asks you to install WSL 2

1. Open PowerShell **as Administrator** (right-click PowerShell > "Run as administrator")
2. Type:
   ```
   wsl --install
   ```
3. Restart your computer
4. Open Docker Desktop again

### Verify Docker is working

Open a new PowerShell window and type:

```
docker --version
```

You should see something like `Docker version 27.x.x`

---

## Step 4: Install Git

Git downloads the code from GitHub.

1. Go to https://git-scm.com/download/win
2. Click **"Click here to download"** (the 64-bit version)
3. Run the installer
4. Click **Next** through everything — all the defaults are fine
5. Click **Install**, then **Finish**

### Verify it worked

Open a **new** PowerShell window (close the old one first) and type:

```
git --version
```

You should see something like `git version 2.x.x`

---

## Step 5: Download the LabPrice Code

1. Decide where you want the project. Your Documents folder is fine.
2. In PowerShell, type:

```
cd $env:USERPROFILE\Documents
```

```
git clone https://github.com/TampaDave73/labprice.git
```

```
cd labprice
```

You're now in the LabPrice project folder.

---

## Step 6: Install Dependencies

This downloads all the libraries that LabPrice needs. It takes 2-3 minutes.

```
pnpm install
```

You'll see a lot of text scrolling by — that's normal. Wait until it says "Done" at the end.

---

## Step 7: Start the Database and Redis

Make sure Docker Desktop is running (check for the green whale icon in your system tray near the clock).

```
pnpm docker:dev
```

This starts PostgreSQL (the database) and Redis (the cache) in the background. You should see something like:

```
Container labprice-postgres-1  Started
Container labprice-redis-1     Started
```

### Verify they're running

```
docker ps
```

You should see two containers listed — one for `postgres` and one for `redis`.

---

## Step 8: Set Up the Database

### Create the settings file

```
Copy-Item .env.example .env
```

The defaults in `.env` are already set up for local development — you don't need to change anything to just test the site.

### Generate the Prisma client

```
pnpm db:generate
```

If this fails with a network error, wait a moment and try again.

### Create the database tables

```
pnpm db:push
```

You should see: `Your database is now in sync with your Prisma schema.`

### Load the sample data

```
pnpm db:seed
```

This fills the database with 12 lab tests, 10 vendors, 120 price offerings, and all the other sample data. You should see messages about each thing being created.

---

## Step 9: Start the Website

```
pnpm dev
```

You'll see some output and then something like:

```
  ▲ Next.js 15.x.x
  - Local:   http://localhost:3000
```

**Leave this window open** — it needs to keep running for the site to work.

---

## Step 10: Open the Site!

Open your web browser (Chrome, Edge, Firefox — any will work) and go to:

```
http://localhost:3000
```

You should see the LabPrice homepage with the search bar, popular tests, and pricing!

### Try these things:

- **Search:** Type "Vitamin D" in the search bar — the autocomplete should show results
- **View a test:** Click on any test to see the price comparison table
- **Health check:** Go to http://localhost:3000/api/health — should show `{"status":"ok",...}`
- **Admin panel:** Go to http://localhost:3000/admin (you'll need to sign in first)

---

## Signing In Locally

Magic link emails and Google sign-in won't work locally without setting up Resend and Google OAuth. But you don't need them for testing — the seed data already created an admin account.

If you want to test sign-in, you can set up Google OAuth (it's free):

1. Follow Step 5 in the main `setup-guide.md` to create Google OAuth credentials
2. For the redirect URI, use: `http://localhost:3000/api/auth/callback/google`
3. Open your `.env` file in Notepad:
   ```
   notepad .env
   ```
4. Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with the values from Google
5. Stop the dev server (press `Ctrl+C` in the PowerShell window running it)
6. Start it again:
   ```
   pnpm dev
   ```

---

## Everyday Use

### Starting everything up

Each time you want to work on LabPrice, open PowerShell and run:

```
cd $env:USERPROFILE\Documents\labprice
pnpm docker:dev
pnpm dev
```

Then open http://localhost:3000 in your browser.

### Shutting everything down

1. Press **Ctrl+C** in the PowerShell window running `pnpm dev`
2. Stop the database and Redis:
   ```
   pnpm docker:down
   ```

### Browsing the database

Want to see what's in the database? Run this in a separate PowerShell window:

```
cd $env:USERPROFILE\Documents\labprice
pnpm db:studio
```

This opens a visual database browser at http://localhost:5555 where you can see all the tables and data.

---

## When You're Ready to Go Live

Nothing changes in the code. You just:

1. Get a server (see the main `setup-guide.md`)
2. Copy the code there
3. Fill in the `.env` with real API keys (Resend, Google OAuth, your domain)
4. Run `docker compose up -d`

That's it — same code, just running on a server instead of your PC.

---

## Troubleshooting

### "pnpm: command not found" or "corepack: command not found"
Close PowerShell completely and reopen it. If it still doesn't work, reinstall Node.js and make sure to check "Add to PATH" during installation.

### "docker: command not found"
Make sure Docker Desktop is running. Look for the whale icon in your system tray (bottom-right of the screen, near the clock). If it's not there, open Docker Desktop from the Start menu and wait for it to start.

### "pnpm docker:dev" shows an error about ports
Something else is already using port 5432 or 6379. Either close that program, or stop any other Docker containers:
```
docker stop $(docker ps -q)
```

### "pnpm db:push" fails with connection error
The database container isn't ready yet. Wait 10 seconds and try again. If it keeps failing:
```
docker ps
```
Make sure you see the postgres container listed and its status shows "Up" (not "Restarting").

### "pnpm dev" shows errors about missing modules
Run `pnpm install` again. If that doesn't fix it:
```
pnpm db:generate
```

### The site loads but looks broken (no styles)
Try a hard refresh in your browser: press **Ctrl+Shift+R**

### I want to start over with a fresh database
```
pnpm docker:down
docker volume rm labprice_postgres-data
pnpm docker:dev
```
Wait 5 seconds, then:
```
pnpm db:push
pnpm db:seed
```
