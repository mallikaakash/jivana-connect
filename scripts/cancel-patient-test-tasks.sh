#!/usr/bin/env bash
# Cancel open follow-ups for one patient (e.g. duplicate hackathon test tasks).
# Usage: API=https://... KEY=jivana-hackathon-demo PATIENT_ID=patient_xxx ./scripts/cancel-patient-test-tasks.sh
set -euo pipefail
API="${API:-https://jivana-clinic-api-156663966842.asia-south1.run.app}"
KEY="${KEY:-jivana-hackathon-demo}"
AUTH_HEADER="${AUTH_HEADER:-Authorization: Bearer $KEY}"
PATIENT_ID="${PATIENT_ID:?Set PATIENT_ID}"
# Space-separated task IDs to keep open, e.g. KEEP_TASK_IDS="task_2b6abbd3d4 task_7b6b30a9af"
KEEP_TASK_IDS="${KEEP_TASK_IDS:-}"

tasks=$(curl -sS -H "$AUTH_HEADER" "$API/api/tasks?patient_id=$PATIENT_ID" | python3 -c "
import json,sys
items=json.load(sys.stdin).get('items',[])
for t in items:
    if t['status'] not in ('completed','cancelled','failed'):
        print(t['task_id'])
")

if [[ -z "${tasks// /}" ]]; then
  echo "No open tasks for $PATIENT_ID"
  exit 0
fi

while IFS= read -r tid; do
  [[ -z "$tid" ]] && continue
  if [[ " $KEEP_TASK_IDS " == *" $tid "* ]]; then
    echo "Keeping $tid"
    continue
  fi
  echo "Cancelling $tid"
  curl -sS -X POST -H "$AUTH_HEADER" "$API/api/tasks/$tid/cancel" | python3 -m json.tool | head -5
done <<< "$tasks"
