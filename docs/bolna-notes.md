# Bolna integration notes

Sources: Bolna docs (checked 2026-10-29). Full index: https://www.bolna.ai/docs/llms.txt · OpenAPI: https://www.bolna.ai/docs/api-reference/openapi.yml

## Access
- REST: `https://api.bolna.ai`, `Authorization: Bearer bn-...`
- MCP: `https://mcp.bolna.ai/api/mcp` (117 tools, incl. `search_docs` / `get_doc`). 43 tools are destructive (calls, purchases, deletes).

## Account snapshot (2026-10-29, via MCP)
- Wallet: 500. Concurrency: max 2 calls at once. No agents, no third-party provider keys.
- `list_phone_numbers` returns **empty**. Calls will use Bolna's default number unless we buy one or connect Plivo/Exotel.
- Pricing: $0.02/min platform fee plus provider costs. Models outside Bolna's "preferred" list are billed separately.

## Voices (Hindi, `list_tts_providers language=hi`)
- **Kalpa** `kalpa-tts-1` (Hindi/English/Hinglish code-switching): Kiara, Sana (female); Arjun, Aman, Nikhil, Dev (male).
- **Sarvam** `bulbul:v3` and `bulbul:v4-flash` (low latency, native code-mixing): 129 voices, e.g. `ishita_enhi_companion`, `simran_enhi_companion`, `shalini_enhi_customer` (code-mixed).
- Also Cartesia sonic-3.x, ElevenLabs, Maya, Smallest, Soniox, Azure.
- **Assamese (`as`): only Sarvam `bulbul:v3` supports it** (v4-flash does not). The Assamese roadmap is feasible on TTS; STT still unchecked.

## Call lifecycle
`queued → initiated → ringing → in-progress → call-disconnected → completed`. Webhook POSTs on **every** status change, so treat the `completed` POST as final and make the handler idempotent. Tool calls add 50–500 ms. Bolna also has built-in tools: [calendar booking](https://www.bolna.ai/docs/tool-calling/book-calendar-slots.md), [transfer](https://www.bolna.ai/docs/tool-calling/transfer-calls.md).
- Agents go through a content compliance check. Medical prompts should stress "no diagnosis, escalate to doctor" so they don't get flagged as harmful advice.

## Custom LLM ("brain") — https://www.bolna.ai/docs/custom-llm-inference.md
- Agent `llm_config.provider: "custom"`, `base_url: https://<host>/v1` → Bolna POSTs `{base_url}/chat/completions` via the OpenAI SDK.
- Must stream OpenAI delta SSE ending in `data: [DONE]`. Optional `GET /v1/models` for key/model validation.
- Only `Authorization: Bearer <key>` is sent. Host must be public. Model id passed through unchanged.
- Bolna owns `model, messages, stream, tools, tool_choice, response_format`; `extra_body` adds extra keys on every request (incl. end-of-call and voicemail checks, so our endpoint must handle those too).
- TTFB > ~1s is noticeable. No reasoning/thinking on the hot path. Keep a warm replica. Suggested `max_tokens` ~150, `temperature` ~0.2.
- Streamed `tool_calls` only needed if the agent uses tools — **test on a web call first**.
- No documented call id / metadata in the request → identify the patient via a `{{call_ref}}` user_data variable rendered into the system prompt, and parse it server-side.

## Outbound call — `POST /call` (https://www.bolna.ai/docs/api-reference/calls/make.md)
- `agent_id`, `recipient_phone_number` (E.164) required; `from_phone_number` optional.
- `scheduled_at` (ISO 8601 with tz) — Bolna can do the scheduling for us.
- `user_data`: arbitrary keys → `{{var}}` substitution in prompt and welcome message.
- `agent_data`: per-call `voice_id` or `language` (multilingual agents only; not both).
- `retry_config`: `enabled`, `max_retries` (1–3), `retry_on_statuses`, `retry_on_voicemail`, `retry_intervals_minutes`.
- `bypass_call_guardrails`: ignore `calling_guardrails` hours (use for demo only).
- Returns `execution_id`. 429 if the from-number is still activating.

## Execution — `GET /executions/{execution_id}`
- `status`, `termination_reason`, `conversation_duration`, `transcript`, `extracted_data`, `summary` (needs `call_summary_enabled`), `telephony_data.recording_url`, `latency_data`, `cost_breakdown`.
- Wait for `completed` or a hard failure (`no-answer, busy, failed, canceled, stopped, error, balance-low`). `call-disconnected` can be partial.

## Agent v2 — `POST /v2/agent` (https://www.bolna.ai/docs/api-reference/agent/v2/create.md)
- `agent_config.tasks[].tools_config`: `llm_agent`, `synthesizer`, `transcriber`, `input/output`, `api_tools`.
- `agent_type`: `simple_llm_agent | knowledgebase_agent | graph_agent | realtime_agent`.
- Synthesizer providers include `sarvam`, `cartesia`, `kalpa`, `elevenlabs`, `deepgram`, `smallest`, `gemini`. `pronunciation_rules` (≤100) — use for drug names.
- Transcriber: ISO-639-1 language (`hi`, not `hi-IN`). `keywords` (comma-separated, boost weights stripped). `context` biases Sarvam/AssemblyAI/Soniox — but both are agent-level, not per-call.
- `api_tools.tools_params[name]`: `method`, `url`, `api_token`, `param` (stringified JSON template). Built-in `transfer_call`.
- `task_config`: voicemail detection, backchanneling, ambient noise, interruption word count, `hangup_after_silence`, `auto_reschedule`, `call_hangup_message`.
- `webhook_url` gets every conversation. Source IPs: `13.203.39.153`, `13.126.9.249`, `13.202.133.53`.
- `calling_guardrails`: `call_start_hour` / `call_end_hour` in recipient tz.

## Open questions
- [ ] Webhook payload schema (no reference page found) — capture one from a test call.
- [ ] Do tool calls work through the custom LLM path? Or rely on our own endpoint executing tools server-side (we control the brain, so we can).
- [ ] Per-call transcriber keywords — not supported in `agent_data`; options: agent-level specialty vocabulary, or the brain corrects drug names using the patient's med list.
- [ ] Kalpa vs Sarvam voice quality for Hinglish; Deepgram vs Sarvam STT on medical Hinglish.
- [ ] Do graph agents / workflows replace our scheduler? (`scheduled_at` + `retry_config` may be enough.)
