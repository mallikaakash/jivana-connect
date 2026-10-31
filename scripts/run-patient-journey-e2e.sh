#!/usr/bin/env bash
# Full patient journey on live clinic API with JSON proofs per step.
# Each workflow calls POST .../start-call → real Bolna outbound (5 rings per run on production).
# Webhooks can complete calls in our DB before you answer; Bolna may still dial. Set CONFIRM_LIVE_DIAL=1 to proceed on Cloud Run.
# Set LIVE_CALL=1 only when you intend to answer every call (skips scripted webhooks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API:-https://jivana-clinic-api-2lcs3sivbq-el.a.run.app}"
KEY="${KEY:-jivana-hackathon-demo}"
AUTH="Authorization: Bearer $KEY"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env.gcp}"
PROOF_DIR="${PROOF_DIR:-$ROOT/docs/e2e-proofs/$(date +%Y%m%d-%H%M%S)}"
PHONE="${JOURNEY_PHONE:-+918812861947}"
LIVE_CALL="${LIVE_CALL:-0}"
CONFIRM_LIVE_DIAL="${CONFIRM_LIVE_DIAL:-0}"

if [[ "$API" == *"jivana-clinic-api"* ]] && [[ "$CONFIRM_LIVE_DIAL" != "1" ]]; then
  echo "Refusing to run on production without CONFIRM_LIVE_DIAL=1 (each run starts 5 real Bolna calls to JOURNEY_PHONE=$PHONE)." >&2
  echo "For verified E2E without prod dials use: ./scripts/run-e2e-verified.sh" >&2
  echo "To stop stray dials after a run: cancel pending tasks, Bolna stop_agent_queued_calls, opt patient out of calls." >&2
  exit 2
fi

# Scripted webhooks on prod diverge from live Bolna — audit will fail. Require explicit opt-in.
if [[ "$API" == *"jivana-clinic-api"* ]] && [[ "$LIVE_CALL" != "1" ]] && [[ "${ALLOW_SCRIPT_WEBHOOK:-0}" != "1" ]]; then
  echo "Refusing scripted webhooks on production (ALLOW_SCRIPT_WEBHOOK=1 to override — audit will fail)." >&2
  echo "Use LIVE_CALL=1 and answer calls, or ./scripts/run-e2e-verified.sh for automated verification." >&2
  exit 2
fi

mkdir -p "$PROOF_DIR"
WEBHOOK_TOKEN=""
if [[ -f "$ENV_FILE" ]]; then
  WEBHOOK_TOKEN="$(grep -E '^BOLNA_WEBHOOK_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r\"' || true)"
fi

step=0
LAST_PROOF=""
proof() {
  step=$((step + 1))
  local name="$1"
  shift
  echo "[$step] $name"
  LAST_PROOF="$PROOF_DIR/$(printf '%02d' "$step")-${name// /-}.json"
  "$@" | tee "$LAST_PROOF"
}

# Read a dotted path from the last proof JSON (e.g. task.task_id).
jget() {
  python3 - "$1" "$LAST_PROOF" <<'PY'
import json, sys
path, fp = sys.argv[1], sys.argv[2]
d = json.load(open(fp))
for k in path.split("."):
    d = d[k]
print(d)
PY
}

curl_json() {
  curl -sS -H "$AUTH" -H "Content-Type: application/json" "$@"
}

webhook_complete() {
  local exec_id="$1"
  local transcript="$2"
  local extracted="${3:-}"
  local url="$API/api/webhooks/bolna"
  [[ -n "$WEBHOOK_TOKEN" ]] && url="$url?token=$WEBHOOK_TOKEN"
  local body
  if [[ -n "$extracted" ]]; then
    body=$(python3 -c "import json; print(json.dumps({'id':'$exec_id','status':'completed','transcript':'''$transcript''','extracted_data':json.loads('''$extracted''')}))")
  else
    body=$(python3 -c "print(__import__('json').dumps({'id':'$exec_id','status':'completed','transcript':'''$transcript'''}))")
  fi
  curl -sS -X POST -H "Content-Type: application/json" -d "$body" "$url"
}

wait_call() {
  local call_id="$1"
  local max="${2:-36}"
  for _ in $(seq 1 "$max"); do
    sleep 5
    st=$(curl_json "$API/api/calls/$call_id" | python3 -c "import json,sys; print(json.load(sys.stdin)['call']['status'])")
    echo "  call $call_id status=$st"
    [[ "$st" == "completed" || "$st" == "no_answer" || "$st" == "failed" ]] && return 0
  done
  return 1
}

echo "Proof directory: $PROOF_DIR"
echo "=== RESET workspace (removes all seed/demo data) ==="
proof "reset-workspace" curl_json -X POST "$API/api/clinic/reset-workspace"

proof "patients-empty" curl_json "$API/api/patients"

proof "create-patient" curl_json -X POST "$API/api/patients" -d "{
  \"display_name\": \"Riya Sharma\",
  \"phone_e164\": \"$PHONE\",
  \"language\": \"en\",
  \"contact_permitted\": true
}"
PID=$(jget patient.patient_id)

APPT_ISO=$(python3 -c "
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
ist = ZoneInfo('Asia/Kolkata')
print((datetime.now(ist)+timedelta(days=1)).replace(hour=16,minute=0,second=0,microsecond=0).isoformat())
")

proof "book-appointment" curl_json -X POST "$API/api/appointments" -d "{
  \"patient_id\": \"$PID\",
  \"scheduled_at\": \"$APPT_ISO\",
  \"department\": \"General OPD\",
  \"clinician\": \"Dr. Sharma\"
}"
CONF_TASK=$(jget task.task_id)
APPT_ID=$(jget appointment.appointment_id)

echo "=== WORKFLOW A: appointment reschedule (webhook proof) ==="
proof "start-call-appointment" curl_json -X POST "$API/api/tasks/$CONF_TASK/start-call"
CALL1=$(jget call.call_id)
EXEC1=$(jget call.provider_call_id)

if [[ "$LIVE_CALL" == "1" ]]; then
  echo "LIVE: answer phone for appointment call, then waiting..."
  wait_call "$CALL1" || true
else
  proof "webhook-appointment-reschedule" webhook_complete "$EXEC1" \
    "assistant: Confirm tomorrow at 4pm?\nuser: I cannot come. Can we reschedule for Monday morning?" \
    '{"appointment_outcome":"rescheduling_requested","preferred_reschedule_window":"Monday morning"}'
fi

proof "task-after-reschedule" curl_json "$API/api/tasks/$CONF_TASK"
proof "appointments-after-reschedule" curl_json "$API/api/appointments"

echo "=== WORKFLOW B: test not done ==="
DUE=$(python3 -c "from datetime import datetime; from zoneinfo import ZoneInfo; print(datetime.now(ZoneInfo('Asia/Kolkata')).isoformat())")
proof "create-test-task" curl_json -X POST "$API/api/tasks" -d "{
  \"patient_id\": \"$PID\",
  \"task_type\": \"test_report_reminder\",
  \"title\": \"Lipid profile reminder\",
  \"purpose\": \"Remind about fasting lipid profile\",
  \"call_context\": \"Fasting lipid profile before cardiology review.\",
  \"due_at\": \"$DUE\"
}"
TEST1=$(jget task.task_id)
proof "start-call-test-not-done" curl_json -X POST "$API/api/tasks/$TEST1/start-call"
EXEC2=$(jget call.provider_call_id)
CALL2=$(jget call.call_id)
if [[ "$LIVE_CALL" == "1" ]]; then
  echo "LIVE: say you have NOT done the test yet..."
  wait_call "$CALL2" || true
else
  proof "webhook-test-not-done" webhook_complete "$EXEC2" \
    "assistant: Have you done the lipid test?\nuser: Sorry I have not done the test yet"
  python3 -c "import json,sys; d=json.load(open('$LAST_PROOF')); sys.exit(1 if d.get('deferred') else 0)" || {
    echo "ERROR: test webhook was deferred (transcript inference should complete the call)" >&2
    exit 1
  }
fi
proof "task-after-test-not-done" curl_json "$API/api/tasks/$TEST1"
python3 -c "import json,sys; t=json.load(open('$LAST_PROOF'))['task']; assert t['latest_outcome']=='test_not_done', t; assert t['status']=='pending', t"

echo "=== WORKFLOW C: post-procedure concern → escalation ==="
proof "create-post-procedure" curl_json -X POST "$API/api/tasks" -d "{
  \"patient_id\": \"$PID\",
  \"task_type\": \"post_procedure_checkin\",
  \"title\": \"Post-visit check-in\",
  \"purpose\": \"Check recovery after visit\",
  \"call_context\": \"Minor procedure follow-up.\",
  \"due_at\": \"$DUE\"
}"
POST=$(jget task.task_id)
proof "start-call-post" curl_json -X POST "$API/api/tasks/$POST/start-call"
EXEC3=$(jget call.provider_call_id)
proof "webhook-concern" webhook_complete "$EXEC3" "assistant: How are you?\nuser: Still pain and swelling" \
  '{"checkin_result":"concern_reported","concern_summary":"Pain and swelling"}'
proof "task-and-escalation" curl_json "$API/api/tasks/$POST"

echo "=== WORKFLOW D: clinician reminder acknowledged ==="
proof "create-clinician-task" curl_json -X POST "$API/api/tasks" -d "{
  \"patient_id\": \"$PID\",
  \"task_type\": \"clinician_task_reminder\",
  \"title\": \"Bring prescriptions\",
  \"purpose\": \"Clinician instruction\",
  \"call_context\": \"Bring previous prescriptions to next visit.\",
  \"due_at\": \"$DUE\"
}"
CLIN=$(jget task.task_id)
proof "start-call-clinician" curl_json -X POST "$API/api/tasks/$CLIN/start-call"
EXEC4=$(jget call.provider_call_id)
proof "webhook-ack" webhook_complete "$EXEC4" "assistant: Will you bring the prescriptions?\nuser: Yes I will" \
  '{"task_acknowledged":true}'
proof "task-clinician-done" curl_json "$API/api/tasks/$CLIN"

echo "=== WORKFLOW E: callback ==="
proof "create-callback" curl_json -X POST "$API/api/tasks" -d "{
  \"patient_id\": \"$PID\",
  \"task_type\": \"callback_request\",
  \"title\": \"Return patient call\",
  \"purpose\": \"Callback requested\",
  \"call_context\": \"Patient asked clinic to call back.\",
  \"due_at\": \"$DUE\"
}"
CB=$(jget task.task_id)
proof "start-call-callback" curl_json -X POST "$API/api/tasks/$CB/start-call"
EXEC5=$(jget call.provider_call_id)
proof "webhook-callback-done" webhook_complete "$EXEC5" "assistant: Returning your call.\nuser: Thanks"
proof "task-callback-done" curl_json "$API/api/tasks/$CB"

proof "dashboard-summary" curl_json "$API/api/dashboard/summary"
proof "patient-detail" curl_json "$API/api/patients/$PID"

echo "=== Bolna alignment audit (must pass for verified journey) ==="
if ! "$ROOT/backend/.venv/bin/python" "$ROOT/scripts/audit_calls_vs_bolna.py" --api "$API" --key "$KEY" --patient-id "$PID"; then
  echo "ERROR: clinic records do not match Bolna — do not treat this journey as verified." >&2
  exit 1
fi

python3 <<PY > "$PROOF_DIR/00-SUMMARY.md"
import json, glob, os
print("# Patient journey E2E proofs\\n")
print(f"API: $API\\nPhone: $PHONE\\nLive Bolna: $LIVE_CALL\\n")
for path in sorted(glob.glob("$PROOF_DIR/" + "[0-9]*.json")):
    name = os.path.basename(path)
    try:
        d = json.load(open(path))
        if "task" in d and "status" in d.get("task", {}):
            t = d["task"]
            print(f"- **{name}**: task {t.get('task_id')} → {t.get('status')} / {t.get('latest_outcome')}")
        elif "call" in d:
            c = d["call"]
            print(f"- **{name}**: call {c.get('call_id')} → {c.get('status')} / {c.get('outcome')}")
        elif d.get("cleared"):
            print(f"- **{name}**: workspace cleared")
        elif "items" in d:
            print(f"- **{name}**: {len(d['items'])} items")
        elif "patients_count" in d:
            print(f"- **{name}**: patients={d['patients_count']} escalations={d['open_escalations_count']}")
    except Exception as e:
        print(f"- **{name}**: (parse skip {e})")
PY

echo ""
echo "Done. Summary: $PROOF_DIR/00-SUMMARY.md"
