# Live Bolna + Jivana — runbook

Use this checklist for a **single authorized test call** before batches or demos.

## 1. Preflight

```bash
cd backend && uv run python scripts/check_live_ready.py
```

Fix anything marked `FAIL` before dialing.

## 2. Start stack

```bash
# Terminal A — API
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal B — tunnel (ngrok 3.x+)
ngrok http 8000
```

Set in `backend/.env` (then restart API):

- `PUBLIC_BASE_URL=https://<your-ngrok-host>` (no trailing slash)
- `BOLNA_WEBHOOK_SECRET=<random>`
- `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `DEMO_CALL_RECIPIENT` (E.164, verified on trial)

In Bolna → Jiya agent → webhook (headers **off**):

```
https://<your-ngrok-host>/api/webhooks/bolna?token=<BOLNA_WEBHOOK_SECRET>
```

Reference: [jiya-live-config.md](./jiya-live-config.md).

## 3. Frontend

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 → **Tasks** → pick an eligible task:

- Good live fits: appointment confirmation, post-procedure check-in, callback, clinician reminder.
- `test_report_reminder` is **not** live-eligible (dental Jiya mismatch by design).

**Start Jiya call** → answer on `DEMO_CALL_RECIPIENT`.

## 4. Verify outcome

- **Calls** → open the call: status `completed`, summary/transcript if Bolna sent them.
- **Extracted fields:** expect CONTRACT keys plus `jiya_*` when Bolna sends the nested category shape (see [extracted_data_sample.json](./extracted_data_sample.json)).
- If status is `completed` but extractions are empty, wait ~15–30 s (poller retries) or check Bolna execution in dashboard — post-call extraction can lag behind `status: completed`.

## 5. Simulate Jiya extraction locally (no dial)

```bash
curl -s -X POST "http://localhost:8000/api/webhooks/bolna?token=$BOLNA_WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d @- <<'EOF'
{
  "id": "<provider_call_id from start-call>",
  "status": "completed",
  "extracted_data": {
    "Dental Follow-up Outcome": {
      "Call Outcome": {"objective": "reschedule_requested"},
      "Preferred Callback Time": {"subjective": "Next week mornings"},
      "Callback Requested": {"objective": "no"}
    }
  }
}
EOF
```

Task should move to awaiting staff action with `rescheduling_requested` (appointment workflow).

## 6. Batches (optional, spends credits)

**Batches** in the UI → preview task IDs → create → schedule at least **2 minutes** ahead.

All recipients use `DEMO_CALL_RECIPIENT` until per-patient numbers are approved.

## 7. After demo

- Rotate API keys if exposed in chat or screen shares.
- ngrok URL changes on restart — update `PUBLIC_BASE_URL` and Bolna webhook together.
