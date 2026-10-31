# Jivana Connect — shared frontend/backend contract

Source of truth for field names, enums and response shapes. Derived from
`docs/Jivana_Connect_UI_Frontend_Specification.pdf`. Frontend (`frontend/`) and
backend (`backend/`) both implement exactly this. Do not invent status strings.

All JSON is snake_case. All timestamps are ISO 8601 with offset, IST (`+05:30`).
IDs are strings like `patient_demo_001`, `task_demo_001`.

## Enums

| Name | Values |
|---|---|
| `CallStatus` | `queued`, `initiating`, `in_progress`, `completed`, `no_answer`, `failed`, `cancelled` |
| `TaskStatus` | `pending`, `due`, `in_progress`, `awaiting_staff_action`, `completed`, `cancelled`, `failed` |
| `TaskType` | `appointment_confirmation`, `test_report_reminder`, `post_procedure_checkin`, `clinician_task_reminder`, `callback_request` |
| `Priority` | `low`, `normal`, `high`, `urgent` |
| `AppointmentOutcome` | `confirmed`, `rescheduling_requested`, `declined`, `no_answer`, `unable_to_confirm` |
| `ConfirmationState` | `pending` + every `AppointmentOutcome` value |
| `BookingStatus` | `scheduled`, `cancelled`, `completed` — the booking system's state. A call NEVER changes this. |
| `EscalationStatus` | `open`, `acknowledged`, `assigned`, `resolved` |
| `EscalationAction` | `acknowledge`, `assign`, `add_note`, `resolve` |
| `EscalationResolutionType` | `called_patient`, `advised_come_in`, `not_clinical`, `referred_elsewhere`, `admin_handled` |
| `CallOutcome` | every `AppointmentOutcome` value, plus `test_completion_reported`, `test_not_done`, `routine_ok`, `concern_reported`, `task_acknowledged`, `callback_requested` |
| `AttentionStatus` (patient, derived) | `ok`, `needs_attention`, `urgent` — UI labels: *No follow-up flags*, *Follow-up required*, *Priority review* |
| `EventType` | `task_created`, `call_started`, `call_completed`, `call_no_answer`, `call_failed`, `outcome_extracted`, `task_status_changed`, `escalation_created`, `escalation_updated`, `staff_action_recorded`, `callback_task_created` |
| `Actor` | `system`, `jiya`, `staff`, `bolna_webhook`, `simulator` |

Display labels (frontend): snake_case → sentence case, e.g. `awaiting_staff_action` →
"Awaiting staff action", `rescheduling_requested` → "Rescheduling requested".

Status colours: green = `completed`, `confirmed`, `resolved`, `routine_ok`;
amber = `pending`, `due`, `in_progress`, `queued`, `initiating`, `awaiting_staff_action`,
`rescheduling_requested`, `acknowledged`, `assigned`, `no_answer`;
red = `urgent`, `open` (escalation), `failed`, `concern_reported`, `declined`;
grey = `cancelled`, `unable_to_confirm`, unknown.

## Records

```ts
Patient {
  patient_id: string
  display_name: string          // synthetic name, e.g. "Asha Verma"
  demo_id: string               // e.g. "JC-1001"
  age: number | null
  gender: "female" | "male" | "other" | "prefer_not_to_say" | null
  language: "hi" | "en" | "hinglish"
  contact_ref: string           // safe reference, e.g. "demo-contact-01" — never a real number
  phone_masked: string          // e.g. "+91 98xxx xx101"
  contact_permitted: boolean    // consent to be called
  opt_out_at: string | null     // set when patient opts out via Jiya extraction or staff
  wrong_number_at: string | null // set when wrong number confirmed on a call
  attention_status: AttentionStatus   // derived by backend
  created_at: string
}

Appointment {
  appointment_id: string
  patient_id: string
  scheduled_at: string
  department: string
  clinician: string             // fictitious
  booking_status: BookingStatus
  confirmation_state: ConfirmationState
  task_id: string | null        // related confirmation task
  confirmation_note: string | null  // e.g. reschedule preference from linked task; optional on list/detail
}

TestTracking {                  // three separate facts, never one boolean
  test_name: string
  test_completion_reported: boolean   // patient SAYS test is done
  report_received: boolean            // clinic actually has the report
  clinician_reviewed: boolean
}

Task {
  task_id: string
  patient_id: string
  appointment_id: string | null
  task_type: TaskType
  title: string                 // "Confirm cardiology appointment"
  purpose: string               // why Jiya is calling, shown to staff
  call_context: string          // safe, non-clinical context passed to Jiya
  department: string
  due_at: string
  status: TaskStatus
  priority: Priority
  attempt_count: number
  last_attempt_at: string | null
  next_action: string           // always present, human-readable
  latest_outcome: CallOutcome | null
  extracted_fields: Record<string, string | boolean | null> | null
  test_tracking: TestTracking | null      // test_report_reminder only
  callback_window: string | null          // callback_request only
  escalation_id: string | null
  call_eligible: boolean                  // backend decides
  call_ineligible_reason: string | null   // shown when button disabled
  created_at: string
  updated_at: string
}

TranscriptTurn { role: "agent" | "patient", text: string }

Call {
  call_id: string
  task_id: string
  patient_id: string
  provider_call_id: string | null   // Bolna execution_id
  workflow: TaskType
  purpose: string
  status: CallStatus
  outcome: CallOutcome | null
  summary: string | null
  transcript: TranscriptTurn[] | null
  transcript_is_example: boolean    // true → UI labels "Prototype example"
  extracted_fields: Record<string, string | boolean | null> | null
  processing_result: string | null  // what the backend did, e.g. "Task moved to awaiting_staff_action; appointment unchanged"
  is_live: boolean                  // true = real Bolna call, false = simulated/seeded
  escalation_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

EscalationNote { note_id: string, text: string, author: string, created_at: string }

Escalation {
  escalation_id: string
  patient_id: string
  call_id: string | null
  task_id: string | null
  reason: string                // short, e.g. "Patient-reported concern after procedure"
  concern_summary: string       // neutral language, what the patient reported
  priority: Priority
  status: EscalationStatus
  routing_destination: string   // e.g. "Orthopaedics nurse desk"
  assigned_to: string | null
  resolution_type: EscalationResolutionType | null
  notes: EscalationNote[]
  created_at: string
  updated_at: string
}

Event {
  event_id: string
  entity_type: "patient" | "appointment" | "task" | "call" | "escalation"
  entity_id: string
  patient_id: string | null
  event_type: EventType
  message: string               // "Call completed — rescheduling requested"
  actor: Actor
  timestamp: string
}
```

List endpoints add `patient_name: string` to each Task, Call, Appointment and Escalation item
(denormalised for tables).

## Extraction fields (Bolna `extracted_data` → `extracted_fields`)

| Workflow | Fields |
|---|---|
| appointment_confirmation | `appointment_outcome` (AppointmentOutcome), `preferred_reschedule_window` (string\|null), `patient_note` (string\|null) |
| test_report_reminder | `test_completed` (bool), `test_date` (string\|null), `patient_note` |
| post_procedure_checkin | `checkin_result` (`routine_ok` \| `concern_reported`), `concern_summary` (string\|null) |
| clinician_task_reminder | `task_acknowledged` (bool), `patient_note` |
| any | `callback_requested` (bool), `callback_window` (string\|null) |

## Workflow rules (backend owns these)

| Workflow / result | Call | Task | Other effects |
|---|---|---|---|
| appt `confirmed` | completed | `completed`, next_action "No action needed" | appointment.confirmation_state = confirmed; booking_status unchanged |
| appt `rescheduling_requested` | completed | If a concrete new day is parsed from `preferred_reschedule_window`, `callback_window`, or linked callback task: **original appointment** `booking_status = cancelled` (same `scheduled_at`, kept on calendar); **new appointment** created on the new day with confirmation pending; confirmation task repointed and re-queued. Otherwise: `awaiting_staff_action`; booking unchanged |
| appt `declined` | completed | `awaiting_staff_action`, "Review cancellation with patient" | confirmation_state = declined |
| appt `unable_to_confirm` | completed | `awaiting_staff_action` | confirmation_state = unable_to_confirm |
| no answer (any workflow) | no_answer | attempt_count+1; `due` with "Retry call" if attempts < 3, else `awaiting_staff_action` | appt confirmation_state = no_answer |
| test `test_completed=true` | completed | `awaiting_staff_action`, book follow-up visit (`callback_window` on same task when given on call) | test_completion_reported = true; no report collected; no separate scheduling call |
| test `test_completed=false` | completed | `pending`, "Remind again in 2 days" | — |
| post-procedure `routine_ok` | completed | `completed` | — |
| post-procedure `concern_reported` | completed | `awaiting_staff_action`, "Review escalated concern" | create Escalation (open, high), link to call + task |
| clinician reminder acknowledged | completed | `completed` | — |
| `callback_requested=true` | completed | (current task as above) | create new `callback_request` task with callback_window, `callback_task_created` event |

Every change appends an Event. Webhook processing is idempotent: once a call is in a
terminal status (`completed`, `no_answer`, `failed`, `cancelled`) and processed, repeat
events are ignored.

Call eligibility (`call_eligible`): status in `pending | due` AND patient.contact_permitted
AND no `opt_out_at` / `wrong_number_at` AND (live voice: task_type in dental-eligible set)
AND no call for this task in `queued | initiating | in_progress` AND attempt_count < 3.
Otherwise false with a plain-language `call_ineligible_reason`.

## Batches (Bolna M4)

App batch status (`Batch.status`): `draft`, `validated`, `scheduled`, `running`, `completed`, `stopped`, `failed`.
Bolna platform status is stored separately as `bolna_status` when known (VERIFY enum from API).

```ts
Batch {
  batch_id: string
  bolna_batch_id: string | null
  title: string
  status: BatchStatus
  bolna_status: string | null
  scheduled_at: string | null
  recipient_count: number
  completed_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

BatchMember {
  member_id: string
  batch_id: string
  task_id: string
  patient_id: string
  call_id: string | null
  execution_id: string | null
  status: "pending" | "queued" | "in_progress" | "completed" | "failed" | "skipped"
  created_at: string
}
```

| Method + path | Response |
|---|---|
| `POST /api/batches/preview` | body `{ task_ids: string[] }` → `{ included[], skipped[], recipient_count, trial_note? }` |
| `POST /api/batches` | body `{ task_ids, title? }` → `{ batch, members[], skipped[], trial_note? }` · requires live Bolna |
| `POST /api/batches/{id}/schedule` | body `{ scheduled_at }` → `{ batch }` |
| `POST /api/batches/{id}/stop` | → `{ batch }` |
| `GET /api/batches` | `{ items: Batch[] }` |
| `GET /api/batches/{id}` | `{ batch, members[] }` |

## API

Base `/api`. Errors: HTTP 4xx/5xx with `{ "detail": { "code": string, "message": string, "retry_allowed": boolean } }`.
Lists return `{ "items": [...] }`.

| Method + path | Response |
|---|---|
| `GET /api/meta` | `{ environment, app_mode, clinic_name?, staff_role_default?, clinical_lead_label?, features: { appointments: boolean }, data_mode, voice_mode, workflows, integrations }` |
| `GET /api/dashboard/summary` | `{ patients_count, followups_due_count, calls_completed_count, open_escalations_count, needs_attention, clinical_inbox, operations_inbox, recent_calls, followup_queue, recent_activity }` — `clinical_inbox` / `operations_inbox` are subsets of `needs_attention` by `audience` |
| `GET /api/patients?q=&attention_status=` | `{ items: (Patient & { next_appointment_at: string\|null, open_followups: number, last_contact_at: string\|null })[] }` |
| `GET /api/patients/{id}` | `{ patient, appointments, tasks, calls, escalations, events }` |
| `GET /api/appointments` | `{ items: Appointment&{patient_name}[] }` |
| `GET /api/tasks?status=&task_type=&priority=&patient_id=&due=overdue\|today\|upcoming&queue=operations\|clinical\|followups_due\|open\|history` | `{ items: Task&{patient_name}[] }` — `queue` matches dashboard inbox / `followups_due_count`; `open` = non-terminal tasks |
| `GET /api/tasks/{id}` | `{ task, patient, appointment: Appointment\|null, calls: Call[], events: Event[] }` |
| `POST /api/tasks/{id}/start-call` | `202 { call, task }` · `409` not eligible · `502` provider error (task preserved) |
| `POST /api/tasks/{id}/cancel` | `{ task }` · `409` if terminal or call in progress |
| `GET /api/calls?status=&task_id=&flagged=clinical` | `{ items: Call&{patient_name}[] }` · `flagged=clinical` = open escalation or clinical-question task linked to the call |
| `GET /api/calls/{id}` | `{ call, patient, task, escalation: Escalation\|null }` |
| `GET /api/escalations?status=` | `{ items: Escalation&{patient_name}[] }` (default: all non-resolved first) |
| `GET /api/escalations/{id}` | `{ escalation, patient, call: Call\|null, task: Task\|null, events }` |
| `PATCH /api/escalations/{id}` | body `{ action, assigned_to?, note?, author?, resolution_type? }` — `resolution_type` required when `action=resolve` in clinic mode → `{ escalation }` |
| `POST /api/appointments` | body `{ patient_id, scheduled_at, department?, clinician?, spawn_confirmation_task?: boolean }` → `{ appointment, task }` |
| `PATCH /api/appointments/{id}` | partial update; `booking_status: cancelled` cancels linked confirmation task |
| `PATCH /api/patients/{id}` | partial patient update (clinic) |
| `PATCH /api/calls/{id}` | `{ action: staff_complete, summary?, note?, author? }` when Bolna did not finalize |
| `GET /api/reports/{patients\|calls\|tasks}` | CSV download |
| `POST /api/webhooks/bolna` | backend only (Bolna → us). Never called by the browser. |
| `POST /api/demo/reset` | re-seed data → `{ ok: true }` |

`NeedsAttentionItem { kind, audience: "clinical" | "operations", task_id, patient_id, patient_name, title, reason, clinical_snippet: string|null, priority, due_at, escalation_id: string|null, task_type: TaskType }`
`needs_attention` = union sorted urgent/high first, then oldest due. `clinical_inbox` = items where `audience === "clinical"`; `operations_inbox` = `audience === "operations"`.

`followups_due_count` = tasks with status `pending | due` and `due_at <= end of today (IST)`.
`calls_completed_count` = calls with status `completed` in the last 7 days (no_answer/failed excluded).

## Simulated voice mode

When `BOLNA_API_KEY` / `BOLNA_AGENT_ID` are not set, `start-call` creates the call with
`is_live: false`, moves it `initiating → in_progress → completed` over ~8 s in a background
task, and applies the task's scripted `demo_outcome` from seed (default: `confirmed`). The
UI labels these calls "Simulated". When Bolna is configured, `is_live: true` and the result
arrives via webhook (with a poll of `GET /executions/{id}` as fallback).

## Seed data

`shared/seed.json`. Timestamps in seed use a relative form resolved at load time in IST:

- `"rel:<±days>d@HH:MM"` → that day (relative to today) at HH:MM IST
- `"rel:<±minutes>m"` → now ± minutes

Both loaders (backend seed + frontend mock) must resolve these identically.
Seed-only fields `demo_outcome` and `demo_extracted_fields` (on tasks) script simulated calls; strip them from API responses.
