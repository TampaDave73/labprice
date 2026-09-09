@echo off
REM Double-click (or Windows Task Scheduler) entry point: prices every pinned Request A Test URL and
REM exits. Needs apps\worker\.env.scrape-prod (gitignored — holds the production DB password, never
REM commit it) with DATABASE_URL pointed at a REACHABLE production Postgres — the default DATABASE_URL
REM only resolves inside Railway's network.
cd /d "%~dp0.."
set DOTENV_CONFIG_PATH=%~dp0..\.env.scrape-prod
call npx tsx -r dotenv/config scripts\scrape-pinned.ts request-a-test
echo.
pause
