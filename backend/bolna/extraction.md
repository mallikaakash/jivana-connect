# Jiya — post-call extraction (DRAFT)

Configure these as Bolna extraction fields / dispositions on the Jiya agent so every
execution's `extracted_data` carries them. Field names and values come from
`docs/CONTRACT.md` → "Extraction fields". The backend (`app/bolna.py::normalise_extracted`) is
lenient — it accepts a dict or JSON string, snake_cases keys, flattens `{"value": ...}` /
category grouping, maps labels like `"Rescheduling Requested"` → `rescheduling_requested`,
`"Yes"/"No"` → booleans, and `NA` / `Not_Specified` / `Unclear` → `null` — but emitting the
exact values below avoids surprises.

Only fill fields for the workflow in `{task_type}`; leave the others `null`/`NA`. Every
categorical field has a "could not determine" bucket so the extractor never has to guess.

## appointment_confirmation

| Field | Type | Values / meaning |
|---|---|---|
| `appointment_outcome` | enum | `confirmed` — patient clearly said they will attend. `rescheduling_requested` — cannot attend at that time and wants another slot (even if no time was given). `declined` — does not want the appointment at all / asks to cancel. `unable_to_confirm` — call connected but attendance stayed unclear (wrong person, patient unsure, call cut). `no_answer` — never spoke with the patient. Tie-breaker: any request for another time → `rescheduling_requested`. Politeness ("okay", "theek hai") alone is not confirmation. Default: `unable_to_confirm`. |
| `preferred_reschedule_window` | string \| null | Patient's own words for the preferred time, e.g. "Day after tomorrow, after 4 PM". Null unless rescheduling was requested. |
| `patient_note` | string \| null | One short neutral line of anything else relevant (e.g. "Has a family function tomorrow morning"). No clinical interpretation. |

## test_report_reminder

| Field | Type | Values / meaning |
|---|---|---|
| `test_completed` | boolean \| null | `true` only if the patient says the test has been done. `false` if they say not yet. `null` if never discussed. This is patient-reported only — it does NOT mean the clinic has the report. |
| `test_date` | string \| null | When the patient says the test was done, in their words ("2 days ago", "Yesterday"). |
| `patient_note` | string \| null | Short neutral note (e.g. "Went to the lab near her home"). Never record result values. |

## post_procedure_checkin

| Field | Type | Values / meaning |
|---|---|---|
| `checkin_result` | enum | `routine_ok` — patient reports feeling fine with no concerns or questions. `concern_reported` — patient mentions ANY symptom, problem, worry or medication question. Tie-breaker: anything other than a clear "all fine" → `concern_reported` (safety default). If the check-in was never reached → `NA`. |
| `concern_summary` | string \| null | Neutral one-sentence description of what the patient reported, in plain words, e.g. "Patient reports the swelling around the knee has increased since yesterday evening." No diagnosis, no severity judgement. |

The backend creates an Escalation (open, high priority, routed to "<Department> nurse desk")
whenever `checkin_result = concern_reported` — or when `checkin_result` is missing but a
`concern_summary` is present.

## clinician_task_reminder

| Field | Type | Values / meaning |
|---|---|---|
| `task_acknowledged` | boolean \| null | `true` if the patient understood and agreed to do what the clinician asked. `false` if they refused or said they cannot. `null` if unclear / not reached. |
| `patient_note` | string \| null | Short note, e.g. "Will send the readings on WhatsApp tonight". |

## Any workflow

| Field | Type | Values / meaning |
|---|---|---|
| `callback_requested` | boolean | `true` only if the patient explicitly asked to be called back later (or said now is a bad time and asked for a call). Default `false`. |
| `callback_window` | string \| null | The time they asked to be called, in their words ("Tomorrow, 4–6 PM"). |

`callback_requested = true` makes the backend create a new `callback_request` task for staff.

## Example `extracted_data`

```json
{
  "appointment_outcome": "rescheduling_requested",
  "preferred_reschedule_window": "Day after tomorrow, after 4 PM",
  "patient_note": "Has a family function tomorrow morning",
  "callback_requested": false,
  "callback_window": null
}
```

## Backend validation
- Appointment workflow: a missing or unknown `appointment_outcome` on a completed call is
  recorded as `unable_to_confirm`, the task goes to `awaiting_staff_action`, and
  `processing_result` says validation failed.
- Other workflows: a missing/unknown primary field moves the task to `awaiting_staff_action`
  for review (never silently completed).
- No outcome ever changes an appointment's `booking_status` or `scheduled_at`.
