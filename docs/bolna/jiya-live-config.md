# Jiya — live Bolna agent configuration (no secrets)

Export date: 2026-10-30. Source: Bolna MCP `get_agent`, `list_extraction_categories`. Do not edit the live agent via API without review.

## Identity

| Field | Value |
|--------|--------|
| Agent name | Jiya |
| Agent ID | `bd6dfe3a-1ced-44c9-9470-c2e3043a7080` |
| Agent type | `simple_llm_agent` (Agent Studio) |
| Agent status | `processed` |

## Welcome message

> Hi, I'm Jiya, an AI assistant calling from Jivana Connect on behalf of your dental care team. May I speak with {{patient_name}}?

## Webhook

Pattern (server env, not hardcoded):

`{PUBLIC_BASE_URL}/api/webhooks/bolna?token={BOLNA_WEBHOOK_SECRET}`

Bolna dashboard: **Add headers** should stay **off**; the app validates the shared secret via query token only.

## Voice stack (conversation task)

| Component | Setting |
|-----------|---------|
| Telephony input/output | Vobiz, wav |
| LLM | Azure OpenAI `gpt-4.1-mini`, temperature 0.2, max_tokens 250 |
| Transcriber | Deepgram `nova-3` |
| Synthesizer | Sarvam `bulbul:v4-flash`, voice Neha (Customer) |
| Call terminate | 300 s |
| Hangup after silence | 20 s |
| Voicemail | disabled |
| **auto_reschedule** | **false** (verified in live export) |
| Call summary | enabled at agent level (`call_summary_enabled: true`) |

## Extraction category: Dental Follow-up Outcome

Model: `gpt-4.1-mini`. Ten dispositions (display names as configured in Bolna):

| Disposition | Objective / subjective enums (verified) |
|-------------|----------------------------------------|
| Patient Feeling | `better`, `same`, `worse`, `unclear`, `not_reported` |
| Patient Concern | free text |
| Clinical Question | free text / `not_reported` |
| Follow-up Required | `yes`, `no`, `unclear`, `not_determined` |
| Callback Requested | `yes`, `no`, `unclear`, `not_determined` |
| Preferred Callback Time | free text; sentinels include `not_specified`, `not_applicable`, `unclear` |
| Patient Identity Confirmed | `yes`, `no`, `unclear`, `not_determined` |
| Wrong Number | `yes`, `no`, `unclear`, `not_determined` |
| Opt-out Requested | `yes`, `no`, `unclear`, `not_determined` |
| Call Outcome | `appointment_confirmed`, `callback_requested`, `reschedule_requested`, `concern_or_question_reported`, `reminder_acknowledged`, `inconclusive`, `voicemail`, `wrong_person`, `no_response`, `incomplete` |

Webhook / Get Execution shape: nested under the category name; each disposition is an object with `objective` and/or `subjective` string fields. See [extracted_data_sample.json](./extracted_data_sample.json).

## Prompt variables (from app `user_data`)

`patient_name`, `call_ref`, `task_type`, `purpose`, `call_context`, `department`, `appointment_time`, `appointment_department`, `clinician`, `test_name`, `callback_window`, `language`, `clinic_name`.

## Account constraints (read-only MCP)

- Wallet credits and max concurrency apply to all outbound calls.
- Trial: outbound often limited to **verified numbers**; demo dials use `DEMO_CALL_RECIPIENT` until per-patient numbers are approved.
- Batches: MCP tools `create_batch`, `schedule_batch`, `stop_batch`, `get_batch`, `list_batch_executions`; no `pause_batch` in catalog.

## Application mapping

Jiya disposition values are mapped to [CONTRACT.md](../CONTRACT.md) workflow fields in `backend/app/bolna_mapper.py` before `process_call_result`.
