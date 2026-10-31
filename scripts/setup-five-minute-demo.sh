#!/usr/bin/env bash
# Prepare production (or staging) for the Five-Minute Demo Guide recording.
# Creates: tomorrow 4 PM appointment + pending confirmation; pending lipid test reminder.
set -euo pipefail
API="${API:-https://jivana-clinic-api-2lcs3sivbq-el.a.run.app}"
KEY="${KEY:-jivana-hackathon-demo}"
AUTH="Authorization: Bearer $KEY"
UI="${UI:-https://project-bf77a013-c0b3-413c-a75.web.app}"
PATIENT_ID="${PATIENT_ID:-patient_99b8c130b6}"

if [[ -n "${CONF_TASK_ID:-}" && -n "${TEST_TASK_ID:-}" ]]; then
  echo "Using existing tasks CONF=$CONF_TASK_ID TEST=$TEST_TASK_ID"
  CONF_TASK="$CONF_TASK_ID"
  TEST_TASK="$TEST_TASK_ID"
  echo "Scene 3–4 URL: $UI/tasks/$CONF_TASK"
  echo "Scene 6 URL: $UI/tasks/$TEST_TASK"
  [[ "${START_TEST_CALL:-0}" == "1" ]] && curl -sS -X POST -H "$AUTH" "$API/api/tasks/$TEST_TASK/start-call" | python3 -m json.tool | head -15
  exit 0
fi

# Tomorrow 4:00 PM IST (matches demo script)
APPT_ISO="${APPT_ISO:-$(python3 -c "
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
ist = ZoneInfo('Asia/Kolkata')
tomorrow = (datetime.now(ist) + timedelta(days=1)).replace(hour=16, minute=0, second=0, microsecond=0)
print(tomorrow.isoformat())
")}"

echo "API: $API"
echo "Patient: $PATIENT_ID"
echo "Appointment: $APPT_ISO"

appt_resp=$(curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$API/api/appointments" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"scheduled_at\":\"$APPT_ISO\",\"department\":\"General OPD\",\"clinician\":\"Dr. Sharma\",\"spawn_confirmation_task\":true}")
CONF_TASK=$(echo "$appt_resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('task',{}).get('task_id',''))")
APPT_ID=$(echo "$appt_resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('appointment',{}).get('appointment_id',''))")

due_test=$(python3 -c "from datetime import datetime; from zoneinfo import ZoneInfo; print(datetime.now(ZoneInfo('Asia/Kolkata')).isoformat())")
test_resp=$(curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$API/api/tasks" \
  -d "$(python3 <<PY
import json
print(json.dumps({
  "patient_id": "$PATIENT_ID",
  "task_type": "test_report_reminder",
  "title": "Fasting lipid profile reminder",
  "purpose": "Check whether the patient completed the lipid profile their clinician requested.",
  "call_context": "Patient was asked to get a fasting lipid profile before cardiology review. Ask if they completed the test. Do not interpret results.",
  "due_at": "$due_test",
  "department": "Cardiology",
  "priority": "normal",
}))
PY
)")
TEST_TASK=$(echo "$test_resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('task',{}).get('task_id',''))")

echo ""
echo "=== Demo recording setup ==="
echo "Sign in: $UI  (key: $KEY)"
echo ""
echo "Scene 3–4 (before call) — appointment confirmation:"
echo "  Task:  $CONF_TASK"
echo "  Appt:  $APPT_ID"
echo "  URL:   $UI/tasks/$CONF_TASK"
echo ""
echo "Scene 6 — test reminder (say: not yet / haven't had time):"
echo "  Task:  $TEST_TASK"
echo "  URL:   $UI/tasks/$TEST_TASK"
echo ""
echo "Scene 5 (after call) — existing reschedule example:"
echo "  Task:  task_2b6abbd3d4"
echo "  Call:  call_39e2001e41"
echo ""
echo "Start Scene 6 call now? Set START_TEST_CALL=1"
if [[ "${START_TEST_CALL:-0}" == "1" && -n "$TEST_TASK" ]]; then
  echo "Placing Bolna call for $TEST_TASK ..."
  curl -sS -X POST -H "$AUTH" "$API/api/tasks/$TEST_TASK/start-call" | python3 -m json.tool | head -20
fi
