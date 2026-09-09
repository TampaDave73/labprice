@echo off
REM Double-click (or Windows Task Scheduler) entry point: prices every pinned Request A Test URL and
REM exits. Needs .env.production next to this file (see scrape-pinned.ts's top comment) with
REM DATABASE_URL pointed at a REACHABLE production Postgres — the default DATABASE_URL only resolves
REM inside Railway's network.
cd /d "%~dp0.."
set DOTENV_CONFIG_PATH=%~dp0..\.env.production
call npx tsx -r dotenv/config scripts\scrape-pinned.ts request-a-test
echo.
pause
