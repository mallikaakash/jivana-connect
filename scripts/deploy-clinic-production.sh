#!/usr/bin/env bash
# Full clinic prod: Cloud Run API + Firebase Hosting UI.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$REPO_ROOT/scripts/deploy-gcp-clinic.sh"
"$REPO_ROOT/scripts/deploy-firebase-clinic.sh"
