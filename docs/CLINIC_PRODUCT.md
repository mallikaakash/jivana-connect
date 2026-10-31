# Jivana Connect — clinic product (real use)

This document defines how the app behaves when **`JIVANA_MODE=clinic`**: intended for a real clinic and doctor/staff, not hackathon demo data.

## Who uses it

| Role | Primary need |
|------|----------------|
| **Doctor / clinical lead** | See what needs a human decision today (questions, concerns, reschedules), not raw extraction JSON |
| **Front desk / care coordinator** | Register patients, schedule follow-up calls, place calls, read outcomes |
| **System (Bolna + backend)** | Dial the **patient's number**, extract outcomes, never change bookings or give medical advice |

## Non-negotiables (vs demo)

| Demo (old) | Clinic (new) |
|------------|----------------|
| `shared/seed.json` synthetic patients | **MongoDB required**; patients created in UI/API |
| All live calls → `DEMO_CALL_RECIPIENT` | Calls → **`patient.phone_e164`** (verified in Bolna trial) |
| Simulated voice fallback | **No simulation** in clinic mode — Bolna must be configured |
| `VITE_API_MODE=mock` | Production UI uses **HTTP API only** |
| Cardiology tasks + dental Jiya | Staff create tasks with **call context** that matches the configured Jiya agent |
| `POST /demo/reset` | **Disabled** in clinic mode |

## Workspace roles (UI)

Use the header toggle **Doctor | Front desk** (`localStorage`: `jivana_staff_role`). Same backend; different nav and Today queues.

| Role | Nav (clinic) | Primary work |
|------|----------------|--------------|
| **Doctor** | Today, Clinical review, Patients, Calls | `clinical_inbox` on Today; resolve escalations with a note |
| **Front desk** | Today, Patients, Tasks, Batches, Calls, Escalations, Settings | Register patients, create follow-ups, start Jiya calls, batches |

API: `GET /api/dashboard/summary` returns `clinical_inbox`, `operations_inbox`, and `system_alerts`. `GET /api/meta` includes `clinical_lead_label`, `auth_methods`, `dial_override_active`, `features.appointments: true`.

**Appointments:** `POST /api/appointments`, `PATCH /api/appointments/{id}` (cancel/reschedule fields). Nav on front desk and read-only for doctors. EHR sync: see [OUT_OF_SCOPE.md](./OUT_OF_SCOPE.md).

**Patients:** `PATCH /api/patients/{id}` for desk edits.

**Calls:** `PATCH /api/calls/{id}` with `action: staff_complete` when Bolna did not finalize.

**Reports:** `GET /api/reports/{patients|calls|tasks}` → CSV.

**Auth:** optional `CLINIC_API_KEY` and/or `FIREBASE_PROJECT_ID` (Google ID tokens). **Hackathon:** `CLINIC_DIAL_OVERRIDE_E164` rings one verified Bolna number for every patient.

**Calls:** `GET /api/calls?flagged=clinical` lists calls tied to an open escalation or a clinical-question task. Doctors default to this filter in the UI.

**Acknowledge escalation:** In clinic mode, acknowledging assigns `CLINIC_LEAD_NAME` when `assigned_to` was empty.

## Doctor's daily flow

1. Open **Today** — **Clinical inbox** (questions, concerns).
2. Open **Clinical review** — read `concern_summary`, source call; acknowledge and resolve with a resolution note.
3. **Patients / Calls** — read-only context; no “Start Jiya call” on tasks.

## Front desk daily flow

1. **Register patient** (name, mobile, consent).
2. **Create follow-up** (templates match dental Jiya).
3. **Start call** or **batch** — rings `patient.phone_e164`.
4. **Today → Operations inbox** — reschedules, callbacks, overdue dials.

## Data model (clinic)

- **Patient:** `display_name`, `phone_e164`, `language`, `contact_permitted`, optional `chart_number`, `opt_out_at`, `wrong_number_at`.
- **Task:** same CONTRACT types; `purpose` + `call_context` are what Jiya receives (staff-authored).
- **Call / escalation / events:** unchanged; audit trail for staff.

## Safety & compliance (MVP)

- Consent flag before calling; opt-out and wrong-number from Jiya extractions disable further calls.
- No diagnosis in app; clinical questions → **staff review** (escalation or explicit next action).
- API optional **`CLINIC_API_KEY`** (Bearer) on write endpoints for a minimal access gate.
- PHI stays on your MongoDB + Bolna account; no mock data in clinic builds.

## Bolna alignment

One agent (Jiya) per clinic is OK if **tasks** carry the right `call_context`. For multi-specialty later: multiple agents or generalized extractions (see demo guide).

## Environment

```bash
JIVANA_MODE=clinic
MONGO_URL=mongodb://...
CLINIC_NAME="Dr. Sharma Dental Clinic"
CLINIC_LEAD_NAME="Dr. Sharma"   # optional; header + escalation author default
CLINIC_API_KEY=...          # when set, all /api routes except /meta and /health require Bearer token
AUTO_DIAL_ENABLED=true      # default on in clinic; set false to disable scheduler
AUTO_DIAL_INTERVAL_SECONDS=120
STUCK_CALL_MINUTES=25
BOLNA_API_KEY=...
BOLNA_AGENT_ID=...
PUBLIC_BASE_URL=...
BOLNA_WEBHOOK_SECRET=...
# DEMO_CALL_RECIPIENT not used in clinic mode
```

Frontend build:

```bash
VITE_JIVANA_MODE=clinic npm run build
```
