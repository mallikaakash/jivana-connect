# Five-Minute Demo Guide — verification (Oct 2026)

Source: `Jivana_Connect_Updated_Five_Minute_Demo_Guide.pdf`  
Live app: https://project-bf77a013-c0b3-413c-a75.web.app · API: https://jivana-clinic-api-2lcs3sivbq-el.a.run.app  
Re-run checks: `./scripts/verify-demo-guide-e2e.sh`

## Must work (guide §7) — status

| Step | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| 1 | Synthetic patient + task in MongoDB | **Pass** | 9+ patients; all 5 `task_type` values on prod |
| 2 | Backend knows due tasks | **Pass** | `task_demo_001`, `task_demo_006` in `due`; daily batch preview lists tomorrow confirmations |
| 3 | Backend initiates call via Bolna | **Pass** | `POST /tasks/{id}/start-call` → live execution; clinic mode rejects simulate |
| 4 | Real call to permitted number | **Pass** | Violina `+918812861947`; use **Start Jiya call** on a **pending/due** task (not `awaiting_staff_action`) |
| 5 | Transcript + outcome | **Pass** | e.g. `call_39e2001e41` — completed, transcript, `rescheduling_requested` |
| 6 | Webhook / poll ingests result | **Pass** | `ingest_execution` + poller; idempotent webhook tests in CI |
| 7 | Backend updates task | **Pass** | `task_2b6abbd3d4` → `awaiting_staff_action`, next action with **tenth November** |
| 8 | Dashboard reflects change | **Pass** | Today queue, Tasks, Calls, Appointments **Patient preference** |

## Dashboard screens (guide §6 / Scene A–E)

| Screen | Feature | Status |
|--------|---------|--------|
| A | Overview counts + queue | **Pass** — patients, follow-ups due, calls completed, escalations, **Today's queue** |
| B | Task detail — purpose, status, attempts, calls | **Pass** |
| C | Call history + transcript | **Pass** |
| D | Live call UI in app | **Pass** — Live call panel while `in_progress` |
| E | Outcome + next action | **Pass** — call outcome badges; task `next_action` |

## Workflows A–E (guide §3)

| Workflow | Backend rules | Live Bolna + dashboard | Demo recording |
|----------|---------------|------------------------|----------------|
| **A** Appointment confirmation | **Pass** | **Pass** (Violina reschedule call) | Use **new pending** appt task or `task_demo_001` + verified dial |
| **B** Test reminder | **Pass** | **Partial** — seed call `test_completion_reported`; **no live `test_not_done` on prod yet** | Scene 6: call **`task_demo_011`** (pending), say "not yet" |
| **C** Post-procedure + escalation | **Pass** | **Pass** (seed + `test_concern_creates_escalation` in CI) | Open **Escalations** / `task_demo_004` story |
| **D** Clinician reminder | **Pass** | **Not live-tested on prod** | **`task_demo_008`** pending, eligible |
| **E** Callback | **Pass** | **Partial** (seed); **`task_demo_007`** pending | Optional second clip |

## Scheduler & batch (guide §4 / Scene 3)

| Item | Status |
|------|--------|
| Cloud Scheduler `jivana-daily-confirmation` `0 10 * * *` Asia/Calcutta | **Pass** |
| In-process scheduler + `CLINIC_CONFIRMATION_BATCH_TIME` | **Pass** (set to **16:00** IST in `.env.gcp`; redeploy to apply) |
| Manual batch create/schedule | **Pass** — Batches UI + API |
| Daily confirmation preview | **Pass** — `GET /api/clinic/daily-confirmation-batch/preview` |

## Gaps / demo script adjustments

1. **Names in PDF vs prod** — Guide uses "Riya Sharma" / "Aarav Mehta". Prod uses seed names (**Asha Verma**, **Rohan Mehta**) plus real test patients. For video: rename via patient edit, or narrate "fictional patient" while showing real UI.
2. **Hero task after a call** — `task_2b6abbd3d4` is **`awaiting_staff_action`** (correct for Scene 5 **after** call). For Scene 3–4 **before** call, create a **new** appointment + confirmation task in **pending**, or use `task_demo_001` (due).
3. **Demo seed phones** — `+919999990101` etc. only work with Bolna if trial allows; use **Violina's number** or `CLINIC_DIAL_OVERRIDE_E164` for recording.
4. **Bolna extractions** — Agent still uses dental-era disposition bundle; backend **transcript inference** + mapper fills CONTRACT fields when extraction is empty (verified on disconnect reschedule).
5. **Booking vs confirmation** — Appointment row may still show original slot; **confirmation_state** and **Patient preference** show call outcome (by design).

## Current demo IDs (Violina / production)

| Scene | Task | Call (if any) |
|-------|------|----------------|
| 3–4 Before appointment call | `task_e1c52390e5` (tomorrow 4 PM) | — |
| 5 After reschedule | `task_2b6abbd3d4` | `call_39e2001e41` |
| 6 Test reminder (“not yet”) | `task_621d8c145d` | `call_2651cb4ab0` → **`test_not_done`**, task **`pending`** |

Refresh setup: `./scripts/setup-five-minute-demo.sh`  
Reuse without duplicating: `CONF_TASK_ID=... TEST_TASK_ID=... ./scripts/setup-five-minute-demo.sh`

## Recommended recording path (one take)

1. Sign in → **Today** (Screen A).
2. **Patients** → Violina → **Book appointment** (tomorrow) → auto confirmation task **pending**.
3. Open task → **Start Jiya call** (Scene 4) → reschedule dialogue.
4. **Calls** → completed call → transcript (Scene C/E).
5. **Tasks** / **Appointments** → rescheduling requested + preference (Scene 5).
6. **Tasks** → `task_demo_011` → live call "test not done yet" (Scene 6).
7. **Escalations** → open clinical review (Scene 7).

## CI coverage

- `tests/test_webhook.py` — idempotency, no-answer, concern → escalation, disconnect inference  
- `tests/test_batch.py` — Bolna batch create  
- `tests/test_daily_confirmation_batch.py` — tomorrow task selection  
