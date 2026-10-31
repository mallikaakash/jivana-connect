# Jivana Connect — full clinic completion (all workflows)

This is the complete scope to make **every follow-up type** work end-to-end with a **clear staff UI**. Not a pick-one roadmap — all workstreams ship.

## Workstreams

| # | Area | Done when |
|---|------|-----------|
| 1 | **Voice (Jiya)** | Bolna prompts include full scripts for all five `task_type` values; hangup/end rules consistent |
| 2 | **Post-call** | Bolna extractions emit CONTRACT fields per workflow; transcript inference backs each type if extraction missing |
| 3 | **Backend** | `ingest_execution` finalizes all call types; staff can cancel duplicate tasks |
| 4 | **UI — create** | Follow-up dialog templates for every task type |
| 5 | **UI — Today** | One action queue with type chips; role still filters clinical vs desk emphasis |
| 6 | **UI — appointments** | Shows patient preference when reschedule requested (from linked task) |
| 7 | **UI — nav** | Desk nav grouped; doctor nav unchanged minimal |
| 8 | **Data** | Demo/test duplicates cancellable; Violina test tasks cleaned for hackathon |
| 9 | **Docs** | CLINIC_PRODUCT + HACKATHON reviewers reflect multi-workflow reality |

## Task types (all must work)

- `appointment_confirmation` — batch + manual; booking unchanged until staff reschedules
- `post_procedure_checkin` — concern → escalation / clinical inbox
- `test_report_reminder` — patient-reported completion only
- `clinician_task_reminder` — acknowledgment
- `callback_request` — outbound return call

## Out of scope (unchanged)

- EHR two-way sync, billing, multi-clinic tenancy (see OUT_OF_SCOPE.md)
