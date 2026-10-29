# Jivana Connect — backend

FastAPI service behind the Jivana Connect staff console. It implements `docs/CONTRACT.md`
exactly (the frontend's `frontend/src/api/types.ts` mirrors it). Synthetic data only.

## Run

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000/api (health: `/api/health`, OpenAPI docs: `/docs`)
- The Vite dev server proxies `/api` → `http://localhost:8000`, so the frontend needs no config.
- Run a **single** worker: the in-memory store and background call jobs live in-process.

Tests:

```bash
uv run pytest -q
```

## Configuration (`backend/.env`, see `.env.example`)

| Var | Purpose |
|---|---|
| `BOLNA_API_KEY`, `BOLNA_AGENT_ID` | Bolna credentials + the Jiya agent id |
| `DEMO_CALL_RECIPIENT` | E.164 phone of the team member who plays the patient. **Every live call goes to this number**; patient records stay synthetic. |
| `BOLNA_FROM_NUMBER` | Optional caller ID |
| `PUBLIC_BASE_URL` | Public URL of this API (tunnel), used to build the webhook URL |
| `BOLNA_WEBHOOK_SECRET` | Optional; required as `?token=` on the webhook (Bolna does not sign webhooks) |
| `MONGO_URL` | Optional MongoDB (db `jivana`). Unset → in-memory store |
| `CORS_ORIGINS` | Comma-separated, default `http://localhost:5173` |
| `SIMULATED_CALL_SECONDS` | Duration of a simulated call, default `8` |

Secrets are never logged.

## Voice modes

**Simulated** (default — any of `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `DEMO_CALL_RECIPIENT` missing):
`POST /api/tasks/{id}/start-call` creates a call with `is_live: false`; a background job moves it
`initiating → in_progress (~2 s) → completed` after `SIMULATED_CALL_SECONDS`, then applies the
task's scripted `demo_outcome` / `demo_extracted_fields` from the seed (or a per-workflow default),
with a generated summary and an example transcript (`transcript_is_example: true`).

**Live** (all three set): the backend calls Bolna `POST /call` with
`recipient_phone_number = DEMO_CALL_RECIPIENT` and `user_data` = `patient_name`, `call_ref` (our
`call_id`), `task_type`, `purpose`, `call_context`, `department`, `appointment_time`,
`appointment_department`, `clinician`, `test_name`, `callback_window`, `language`, `clinic_name`
(`bypass_call_guardrails: true`). The Bolna `execution_id` is stored as `provider_call_id`.
Results arrive via the webhook; a background poller also checks `GET /executions/{id}` every ~5 s
for up to 10 min, in case the webhook can't reach you. Both feed the same idempotent
`process_call_result`. If Bolna rejects the call, the call is marked `failed`, the task is restored
(attempt not counted) and the API returns `502 provider_error` with `retry_allowed: true`.

The Jiya agent itself is **not** created by this repo. Drafts to paste into Bolna:
`bolna/jiya_prompt.md` (system prompt) and `bolna/extraction.md` (extraction fields).

## Exposing the webhook (live mode)

```bash
# terminal 1
uv run uvicorn app.main:app --port 8000
# terminal 2 — either
ngrok http 8000
cloudflared tunnel --url http://localhost:8000
```

Set `PUBLIC_BASE_URL=https://<tunnel-host>` (and optionally `BOLNA_WEBHOOK_SECRET`), restart, then
set the Jiya agent's webhook URL in Bolna to:

```
https://<tunnel-host>/api/webhooks/bolna?token=<BOLNA_WEBHOOK_SECRET>
```

Without a tunnel, live calls still complete through the poller.

## Simulating a Bolna webhook

Start a call first (live mode gives a `provider_call_id`; in any mode you can address the call by
`call_ref`), then:

```bash
curl -s -X POST 'http://localhost:8000/api/webhooks/bolna?token=YOUR_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "<provider_call_id>",
    "status": "completed",
    "context_details": {"recipient_data": {"call_ref": "<call_id>"}},
    "summary": "Patient asked to reschedule to next week.",
    "transcript": "assistant: Namaste, main Jiya bol rahi hoon.\nuser: Haan ji.\nassistant: Kya aap kal aa payenge?\nuser: Nahi, next week mornings better hai.",
    "extracted_data": {"appointment_outcome": "Rescheduling Requested", "preferred_reschedule_window": "Next week mornings", "callback_requested": false}
  }'
```

Repeat the same request → `{"ok": true, "duplicate": true}` and nothing changes.

Status mapping: `queued/initiated/ringing → initiating`, `in-progress → in_progress`,
`completed → completed`, `no-answer/busy → no_answer`, `failed/error/balance-low → failed`,
`canceled/stopped → cancelled`, `call-disconnected` → ignored (non-final). If a `completed` event
arrives without `extracted_data` while the poller is watching, finalisation waits up to 3 more
polls for extraction before validating.

## Endpoints

All under `/api` (see `docs/CONTRACT.md` for shapes): `GET /health`, `GET /meta`,
`GET /dashboard/summary`, `GET /patients`, `GET /patients/{id}`, `GET /appointments`, `GET /tasks`,
`GET /tasks/{id}`, `POST /tasks/{id}/start-call`, `GET /calls`, `GET /calls/{id}`,
`GET /escalations`, `GET /escalations/{id}`, `PATCH /escalations/{id}`, `POST /webhooks/bolna`,
`POST /demo/reset`. Errors: `{"detail": {"code", "message", "retry_allowed"}}`.

## MongoDB (optional)

```bash
docker compose up -d          # mongo:7 on localhost:27017
echo 'MONGO_URL=mongodb://localhost:27017' >> .env
```

The working set stays in memory and every write goes through to Mongo; on startup the store loads
from Mongo (seeding on first run). `POST /api/demo/reset` reseeds both. If Mongo is unreachable the
API falls back to in-memory and `/api/meta` says so.

## Layout

```
app/main.py        app factory, CORS, lifespan
app/routes.py      HTTP routes
app/service.py     derived fields, dashboard, workflow rules (process_call_result), start-call, escalations
app/simulation.py  simulated outcomes + example transcripts
app/bolna.py       Bolna client, status mapping, extracted_data / transcript normalisation
app/store.py       in-memory repository with optional Mongo write-through
app/seed.py        shared/seed.json loader (rel: timestamps → IST)
app/errors.py      error envelope handlers
bolna/             Jiya prompt + extraction drafts
```
