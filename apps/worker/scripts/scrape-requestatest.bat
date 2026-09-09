@echo off
REM Double-click (or Windows Task Scheduler) entry point: full Request A Test discovery (all 30 linked
REM tests, narrowed crawl — not the whole 871-product catalog) from home, since Cloudflare blocks this
REM vendor's /tests page from Railway's datacenter IP. Prints "fetching i/N: <slug>" as it goes.
REM Needs apps\worker\.env.scrape-prod (gitignored — holds the production DB password, never commit it)
REM with DATABASE_URL pointed at a REACHABLE production Postgres.
cd /d "%~dp0.."
set DOTENV_CONFIG_PATH=%~dp0..\.env.scrape-prod
call npx tsx -r dotenv/config scripts\discover-requestatest.ts
echo.
pause
