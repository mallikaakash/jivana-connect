#!/usr/bin/env bash
# Verified E2E: local workflow tests + live API demo checks + Bolna alignment audit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API:-https://jivana-clinic-api-2lcs3sivbq-el.a.run.app}"
KEY="${KEY:-jivana-hackathon-demo}"
PATIENT_ID="${AUDIT_PATIENT_ID:-}"

echo "=== 1/3 Backend patient journey (simulated Bolna) ==="
(cd "$ROOT/backend" && .venv/bin/python -m pytest tests/test_patient_journey.py tests/test_transcript_inference.py -q)

echo ""
echo "=== 2/3 Demo guide API checks ==="
API="$API" KEY="$KEY" "$ROOT/scripts/verify-demo-guide-e2e.sh"

echo ""
echo "=== 3/3 Bolna vs clinic call audit ==="
AUDIT_ARGS=(--api "$API" --key "$KEY")
[[ -n "$PATIENT_ID" ]] && AUDIT_ARGS+=(--patient-id "$PATIENT_ID")
"$ROOT/backend/.venv/bin/python" "$ROOT/scripts/audit_calls_vs_bolna.py" "${AUDIT_ARGS[@]}"

echo ""
echo "All verified E2E checks passed."
