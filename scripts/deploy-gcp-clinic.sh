#!/usr/bin/env bash
# Deploy Jivana clinic API to Cloud Run from repo root Dockerfile.
# Requires backend/.env.gcp (see backend/.env.gcp.example and docs/DEPLOY_GCP.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/backend/.env.gcp}"
GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
GCP_REGION="${GCP_REGION:-asia-south1}"
SERVICE_NAME="${SERVICE_NAME:-jivana-clinic-api}"

die() { echo "deploy-gcp-clinic: $*" >&2; exit 1; }

if [[ "${1:-}" == "--check" ]]; then
  command -v gcloud >/dev/null || die "gcloud not found"
  [[ -n "$GCP_PROJECT" ]] || die "Set GCP_PROJECT or gcloud config set project"
  echo "OK project=$GCP_PROJECT region=$GCP_REGION service=$SERVICE_NAME"
  exit 0
fi

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy backend/.env.gcp.example and fill Atlas + Bolna vars"

mongo_line="$(grep -E '^MONGO_URL=' "$ENV_FILE" | tail -1 || true)"
mongo_val="${mongo_line#MONGO_URL=}"
mongo_val="${mongo_val//\"/}"
mongo_val="${mongo_val//$'\r'/}"
mongo_val="${mongo_val#"${mongo_val%%[![:space:]]*}"}"
mongo_val="${mongo_val%"${mongo_val##*[![:space:]]}"}"
if [[ -z "$mongo_val" ]]; then
  die "Set MONGO_URL in $ENV_FILE to a hosted MongoDB URI (Atlas). See docs/DEPLOY_GCP.md."
fi
if echo "$mongo_val" | grep -qE '127\.0\.0\.1|localhost'; then
  die "MONGO_URL in $ENV_FILE points at localhost. Use MongoDB Atlas (docs/DEPLOY_GCP.md)."
fi

command -v gcloud >/dev/null || die "gcloud not found"
[[ -n "$GCP_PROJECT" ]] || die "Set GCP_PROJECT or run: gcloud config set project YOUR_PROJECT"

echo "Enabling required APIs (idempotent)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project="$GCP_PROJECT" >/dev/null

ENV_YAML="$(mktemp)"
trap 'rm -f "$ENV_YAML"' EXIT

"$REPO_ROOT/backend/.venv/bin/python" 2>/dev/null || true
PYTHON="${REPO_ROOT}/backend/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi

"$PYTHON" - "$ENV_FILE" "$ENV_YAML" <<'PY'
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
out: dict[str, str] = {}
for raw in src.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        continue
    key, _, val = line.partition("=")
    key = key.strip()
    val = val.strip().strip('"').strip("'")
    if key:
        out[key] = val

# First pass: omit empty PUBLIC_BASE_URL so Cloud Run can assign URL before we set it
if not out.get("PUBLIC_BASE_URL"):
    out.pop("PUBLIC_BASE_URL", None)

def yaml_val(v: str) -> str:
    # Cloud Run requires string env vars; unquoted true/false/numbers become non-strings in YAML.
    esc = v.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{esc}"'

lines = [f"{k}: {yaml_val(v)}" for k, v in sorted(out.items())]
dst.write_text("\n".join(lines) + "\n")
PY

echo "Deploying $SERVICE_NAME to $GCP_REGION (project $GCP_PROJECT)..."
gcloud run deploy "$SERVICE_NAME" \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --source="$REPO_ROOT" \
  --quiet \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --min-instances=1 \
  --max-instances=1 \
  --memory=512Mi \
  --timeout=300 \
  --env-vars-file="$ENV_YAML"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --format='value(status.url)')"

CURRENT_PUBLIC="$(grep -E '^PUBLIC_BASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
if [[ -z "${CURRENT_PUBLIC// }" ]]; then
  echo "Setting PUBLIC_BASE_URL=$SERVICE_URL and redeploying..."
  gcloud run services update "$SERVICE_NAME" \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --update-env-vars="PUBLIC_BASE_URL=${SERVICE_URL}"
fi

echo ""
echo "Deployed: $SERVICE_URL"
echo "Health:   ${SERVICE_URL}/api/health"
echo "Meta:     ${SERVICE_URL}/api/meta"
echo "Webhook:  ${SERVICE_URL}/api/webhooks/bolna?token=<BOLNA_WEBHOOK_SECRET>"
echo ""
echo "Next: point Bolna webhook, set VITE_API_BASE=$SERVICE_URL, add frontend URL to CORS_ORIGINS in $ENV_FILE, redeploy if CORS changed."
