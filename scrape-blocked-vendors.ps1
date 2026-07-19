# Scrapes every "Manual only" vendor (the ones Cloudflare blocks from the cloud) FROM THIS PC,
# writing prices straight into the LIVE database. Double-click "Scrape Blocked Vendors" on the
# Desktop, or run this file directly. Needs `.env.scrape-prod` next to it containing the live
# database's public DATABASE_URL (gitignored — never committed).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$envFile = Join-Path $root ".env.scrape-prod"
if (-not (Test-Path $envFile)) {
    Write-Host "Missing $envFile" -ForegroundColor Red
    Write-Host 'Create it with one line:  DATABASE_URL="postgresql://...the live public URL..."'
    exit 1
}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=\s*"?([^"]*)"?\s*$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2], "Process")
    }
}

Write-Host "Scraping blocked vendors from this PC into the LIVE site..." -ForegroundColor Cyan
Set-Location $root
pnpm --filter @labprice/worker exec tsx scripts/scrape-vendor-local.ts
