#!/usr/bin/env bash
set -euo pipefail

cd /opt/labprice
git pull origin main
docker compose build
docker compose run --rm migrate
docker compose up -d web worker
docker compose exec web wget -q --spider http://localhost:3000/api/health
echo "Deploy complete"
