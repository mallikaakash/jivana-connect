#!/usr/bin/env bash
# Build clinic frontend and deploy to Firebase Hosting (see firebase.json).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE_NAME="${SERVICE_NAME:-jivana-clinic-api}"
GCP_REGION="${GCP_REGION:-asia-south1}"

die() { echo "deploy-firebase-clinic: $*" >&2; exit 1; }

API_BASE="${VITE_API_BASE:-}"
if [[ -z "$API_BASE" ]]; then
  command -v gcloud >/dev/null || die "Set VITE_API_BASE or install gcloud to resolve Cloud Run URL"
  API_BASE="$(gcloud run services describe "$SERVICE_NAME" \
    --project="${GCP_PROJECT:-project-bf77a013-c0b3-413c-a75}" \
    --region="$GCP_REGION" \
    --format='value(status.url)' 2>/dev/null)" || true
fi
[[ -n "$API_BASE" ]] || die "Cloud Run service $SERVICE_NAME not found. Deploy API first: npm run deploy:gcp"

echo "Building frontend (clinic) → API $API_BASE"
cd "$REPO_ROOT/frontend"
if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi
export VITE_JIVANA_MODE=clinic
export VITE_API_MODE=http
export VITE_API_BASE="$API_BASE"
npm run build

cd "$REPO_ROOT"
FB_PROJECT="$(grep -o '"default"[[:space:]]*:[[:space:]]*"[^"]*"' "$REPO_ROOT/.firebaserc" | sed 's/.*"\([^"]*\)"$/\1/')"
echo "Deploying Firebase Hosting (project ${FB_PROJECT:-unknown})..."
FB="${REPO_ROOT}/node_modules/.bin/firebase"
[[ -x "$FB" ]] || die "Run npm install at repo root (firebase-tools devDependency)"
"$FB" deploy --only hosting --non-interactive

HOST="https://${GCP_PROJECT:-project-bf77a013-c0b3-413c-a75}.web.app"
echo ""
echo "Hosting: $HOST"
echo "Also:    https://${GCP_PROJECT:-project-bf77a013-c0b3-413c-a75}.firebaseapp.com"
