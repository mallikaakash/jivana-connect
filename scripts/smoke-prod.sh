#!/usr/bin/env bash
# Post-deploy smoke check. Usage: API_BASE=https://.../api ./scripts/smoke-prod.sh
set -euo pipefail
BASE="${API_BASE:-https://jivana-clinic-api-156663966842.asia-south1.run.app}"
BASE="${BASE%/}"
echo "Smoke: $BASE"
curl -sf "$BASE/api/health" | grep -q '"ok":true'
curl -sf "$BASE/api/meta" | grep -q '"app_mode":"clinic"'
echo "OK health + meta (clinic)"
