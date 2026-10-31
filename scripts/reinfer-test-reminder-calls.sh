#!/usr/bin/env bash
# Re-apply transcript + mapper rules to completed test-reminder calls (fixes bad test_completion_reported).
set -euo pipefail
API="${API:-https://jivana-clinic-api-2lcs3sivbq-el.a.run.app}"
KEY="${KEY:-jivana-hackathon-demo}"
AUTH="Authorization: Bearer $KEY"

echo "Finding test_report_reminder tasks with outcome test_completion_reported..."
task_ids="$(curl -sS -H "$AUTH" "$API/api/tasks?queue=open" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for t in d.get('items', []):
    if t.get('task_type') == 'test_report_reminder' and t.get('latest_outcome') == 'test_completion_reported':
        print(t['task_id'])
")"

if [[ -z "${task_ids// }" ]]; then
  echo "No matching open tasks."
  exit 0
fi

while read -r tid; do
  [[ -n "$tid" ]] || continue
  call_id="$(curl -sS -H "$AUTH" "$API/api/tasks/$tid" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d.get('calls', []):
    if c.get('status') == 'completed' and c.get('outcome') == 'test_completion_reported':
        print(c['call_id'])
        break
")"
  if [[ -z "${call_id// }" ]]; then
    echo "Skip $tid — no completed call with test_completion_reported"
    continue
  fi
  echo "Reinfer $call_id (task $tid)..."
  curl -sS -X POST -H "$AUTH" "$API/api/calls/$call_id/reinfer-outcome" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('error') or d.get('detail'):
    print('  FAILED', d)
else:
    t=d.get('task') or {}
    c=d.get('call') or {}
    print('  -> call', c.get('outcome'), '| task', t.get('status'), '|', t.get('next_action'))
"
done <<< "$task_ids"
