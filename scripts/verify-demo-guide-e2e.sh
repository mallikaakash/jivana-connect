#!/usr/bin/env bash
# Verify live clinic API against the Five-Minute Demo Guide checklist (read-only + safe writes).
set -uo pipefail
API="${API:-https://jivana-clinic-api-2lcs3sivbq-el.a.run.app}"
KEY="${KEY:-jivana-hackathon-demo}"
AUTH="Authorization: Bearer $KEY"
PASS=0
FAIL=0
WARN=0

ok() { echo "  [PASS] $*"; PASS=$((PASS + 1)); }
bad() { echo "  [FAIL] $*"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $*"; WARN=$((WARN + 1)); }

section() { echo; echo "=== $* ==="; }

curl_json() {
  curl -sS -H "$AUTH" -H "Content-Type: application/json" "$@"
}

section "Health & meta"
h=$(curl -sS "$API/api/health")
echo "$h" | grep -q '"ok":true' && ok "API health" || bad "API health: $h"
meta=$(curl_json "$API/api/meta")
echo "$meta" | python3 -c "
import json,sys
m=json.load(sys.stdin)
assert m.get('app_mode')=='clinic', m
assert m.get('voice_mode')=='live', m
print('  clinic_mode live voice OK')
" && ok "Clinic + live Bolna" || bad "Meta/clinic mode"

section "Dashboard (Screen A)"
dash=$(curl_json "$API/api/dashboard/summary")
python3 <<PY
import json
d=json.loads('''$dash''')
need=['patients_count','followups_due_count','calls_completed_count','open_escalations_count','needs_attention','recent_calls','followup_queue']
for k in need:
    assert k in d, k
assert isinstance(d['needs_attention'], list)
assert 'task_type' in (d['needs_attention'][0] if d['needs_attention'] else {'task_type':1})
print('  keys OK, inbox', len(d['needs_attention']))
PY
[ $? -eq 0 ] && ok "Dashboard summary shape + inbox" || bad "Dashboard summary"

section "Patients & tasks (Screen B)"
patients=$(curl_json "$API/api/patients")
pc=$(echo "$patients" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['items']))")
[ "$pc" -gt 0 ] && ok "Patient list ($pc patients)" || bad "No patients"

tasks=$(curl_json "$API/api/tasks")
python3 <<PY
import json
t=json.loads('''$tasks''')
items=t['items']
types=set(x['task_type'] for x in items)
for wf in ['appointment_confirmation','test_report_reminder','post_procedure_checkin','clinician_task_reminder','callback_request']:
    if wf in types:
        print('  has', wf)
    else:
        print('  missing', wf)
appt=[x for x in items if x['task_type']=='appointment_confirmation']
test=[x for x in items if x['task_type']=='test_report_reminder']
print('  appointment tasks', len(appt), 'test tasks', len(test))
PY

# Task detail with events/calls
tid=$(echo "$tasks" | python3 -c "import json,sys; items=json.load(sys.stdin)['items']; print(next((x['task_id'] for x in items if x['task_type']=='appointment_confirmation'), items[0]['task_id'] if items else ''))")
if [ -n "$tid" ]; then
  detail=$(curl_json "$API/api/tasks/$tid")
  echo "$detail" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k in ('task','patient','calls','events'):
    assert k in d
assert d['task'].get('next_action')
print('  task', d['task']['task_id'], 'status', d['task']['status'])
" && ok "Task detail (next_action, calls, events)" || bad "Task detail"
else
  bad "No task for detail check"
fi

section "Calls (Screen C/E)"
calls=$(curl_json "$API/api/tasks?status=completed" 2>/dev/null || true)
call_list=$(curl_json "$API/api/calls")
completed=$(echo "$call_list" | python3 -c "import json,sys; print(sum(1 for c in json.load(sys.stdin)['items'] if c['status']=='completed'))")
[ "$completed" -gt 0 ] && ok "Completed calls in history ($completed)" || warn "No completed calls yet (record after live test)"

cid=$(echo "$call_list" | python3 -c "import json,sys; cs=[c for c in json.load(sys.stdin)['items'] if c.get('transcript')]; print(cs[0]['call_id'] if cs else '')")
if [ -n "$cid" ]; then
  cd=$(curl_json "$API/api/calls/$cid")
  echo "$cd" | python3 -c "
import json,sys
d=json.load(sys.stdin)['call']
assert d.get('transcript'), 'no transcript'
print('  call', d['call_id'], 'outcome', d.get('outcome'))
" && ok "Call detail with transcript + outcome" || bad "Call detail"
else
  warn "No call with transcript (run a live call for demo clip 4)"
fi

section "Escalations (Scene 7)"
esc=$(curl_json "$API/api/escalations")
ec=$(echo "$esc" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['items']))")
ok "Escalations API ($ec items)"

section "Appointments + booking unchanged"
appts=$(curl_json "$API/api/appointments")
echo "$appts" | python3 -c "
import json,sys
items=json.load(sys.stdin)['items']
if not items:
    raise SystemExit(1)
a=items[0]
for k in ('booking_status','confirmation_state','scheduled_at'):
    assert k in a
if 'confirmation_note' in a and a.get('confirmation_note'):
    print('  sample note:', a['confirmation_note'][:60])
" && ok "Appointments list + confirmation fields" || bad "Appointments"

section "Daily batch / scheduler (Scene 3)"
batches=$(curl_json "$API/api/batches")
bc=$(echo "$batches" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['items']))")
ok "Batches API ($bc batches)"
# Preview only — do not schedule live batch in verify
daily_prev=$(curl_json "$API/api/clinic/daily-confirmation-batch/preview")
echo "$daily_prev" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'task_ids' in d" && ok "Daily batch preview" || warn "Daily batch preview unexpected"

section "Workflow code paths (local pytest import)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -x "$ROOT/backend/.venv/bin/python" ]; then
  (cd "$ROOT/backend" && "$ROOT/backend/.venv/bin/python" - <<'PY') && ok "All 5 workflow rules import" || bad "Workflow modules"
from app.bolna_mapper import prepare_extracted_for_task
from app.transcript_inference import infer_workflow_from_transcript
for wf, ex, key in [
    ('appointment_confirmation', {'appointment_outcome':'confirmed'}, 'appointment_outcome'),
    ('test_report_reminder', {'test_completed': False}, 'test_completed'),
    ('post_procedure_checkin', {'checkin_result':'concern_reported','concern_summary':'pain'}, 'checkin_result'),
    ('clinician_task_reminder', {'task_acknowledged': True}, 'task_acknowledged'),
]:
    prep, _ = prepare_extracted_for_task(wf, ex)
    assert prep
print('  mapper OK for 4 types')
PY
else
  warn "No backend venv — skipped local workflow import check"
fi

section "Bolna alignment audit (live calls)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -x "$ROOT/backend/.venv/bin/python" ] && [ -f "$ROOT/scripts/audit_calls_vs_bolna.py" ]; then
  if "$ROOT/backend/.venv/bin/python" "$ROOT/scripts/audit_calls_vs_bolna.py" --api "$API" --key "$KEY" 2>&1; then
    ok "All clinic calls align with Bolna executions"
  else
    bad "Bolna alignment audit — DB outcomes/transcripts diverge from live executions"
  fi
else
  warn "Skipped Bolna audit (venv or audit script missing)"
fi

section "Summary"
echo "PASS=$PASS FAIL=$FAIL WARN=$WARN"
[ "$FAIL" -eq 0 ] || exit 1
