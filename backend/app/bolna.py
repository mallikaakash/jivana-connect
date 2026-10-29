"""Bolna integration: REST client plus liberal parsing of execution payloads (webhook or poll)."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from .config import Settings

log = logging.getLogger("jivana.bolna")

# Bolna lifecycle status -> our CallStatus. None = non-final, ignore.
STATUS_MAP: dict[str, str | None] = {
    "queued": "initiating",
    "initiated": "initiating",
    "initiate": "initiating",
    "ringing": "initiating",
    "in-progress": "in_progress",
    "in_progress": "in_progress",
    "inprogress": "in_progress",
    "answered": "in_progress",
    "completed": "completed",
    "complete": "completed",
    "no-answer": "no_answer",
    "no_answer": "no_answer",
    "busy": "no_answer",
    "failed": "failed",
    "error": "failed",
    "balance-low": "failed",
    "balance_low": "failed",
    "canceled": "cancelled",
    "cancelled": "cancelled",
    "stopped": "cancelled",
    "call-disconnected": None,
    "call_disconnected": None,
}

TERMINAL = {"completed", "no_answer", "failed", "cancelled"}


def map_status(raw: Any) -> tuple[bool, str | None]:
    """Return (known, mapped). known=False for statuses we have never seen."""
    if not isinstance(raw, str):
        return False, None
    key = raw.strip().lower()
    if key in STATUS_MAP:
        return True, STATUS_MAP[key]
    return False, None


# ---- extracted_data normalisation ------------------------------------------------

BOOL_FIELDS = {"test_completed", "task_acknowledged", "callback_requested"}
ENUM_FIELDS = {"appointment_outcome", "checkin_result"}
_NULLISH = {"", "null", "none", "n/a", "na", "nil", "not_specified", "not specified", "unclear", "unknown", "-"}
_TRUE = {"true", "yes", "y", "1", "haan", "han", "ha", "done", "acknowledged"}
_FALSE = {"false", "no", "n", "0", "nahi", "nahin", "not_done", "not done"}
_VALUE_KEYS = ("value", "answer", "output", "result", "extracted_value")

_ENUM_SYNONYMS = {
    "appointment_outcome": {
        "confirm": "confirmed",
        "confirmed": "confirmed",
        "will_attend": "confirmed",
        "attending": "confirmed",
        "reschedule": "rescheduling_requested",
        "rescheduled": "rescheduling_requested",
        "reschedule_requested": "rescheduling_requested",
        "rescheduling": "rescheduling_requested",
        "rescheduling_requested": "rescheduling_requested",
        "decline": "declined",
        "declined": "declined",
        "cancel": "declined",
        "cancelled": "declined",
        "canceled": "declined",
        "no_answer": "no_answer",
        "unable_to_confirm": "unable_to_confirm",
        "unclear": "unable_to_confirm",
    },
    "checkin_result": {
        "routine_ok": "routine_ok",
        "routine": "routine_ok",
        "ok": "routine_ok",
        "fine": "routine_ok",
        "concern_reported": "concern_reported",
        "concern": "concern_reported",
        "concerned": "concern_reported",
    },
}


def snake(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _flatten(data: dict, out: dict, depth: int = 0) -> None:
    for key, value in data.items():
        if isinstance(value, dict):
            inner = next((value[k] for k in _VALUE_KEYS if k in value), _MISSING)
            if inner is not _MISSING:
                out[snake(str(key))] = inner
            elif depth < 2:
                _flatten(value, out, depth + 1)  # category grouping, e.g. {"Appointment": {...}}
        else:
            out[snake(str(key))] = value


_MISSING = object()


def _scalar(value: Any) -> str | bool | None:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return ", ".join(str(v) for v in value) or None
    text = str(value).strip()
    return None if text.lower() in _NULLISH else text


def normalise_extracted(raw: Any) -> dict[str, str | bool | None] | None:
    """Accept a dict or JSON string; return snake_case keys with str|bool|None values."""
    if raw is None:
        return None
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        try:
            raw = json.loads(text)
        except ValueError:
            return {}
        if isinstance(raw, str):  # double-encoded
            try:
                raw = json.loads(raw)
            except ValueError:
                return {}
    if not isinstance(raw, dict):
        return {}
    flat: dict[str, Any] = {}
    _flatten(raw, flat)
    result: dict[str, str | bool | None] = {}
    for key, value in flat.items():
        value = _scalar(value)
        if key in BOOL_FIELDS:
            if isinstance(value, str):
                low = snake(value)
                value = True if low in _TRUE else False if low in _FALSE else None
        elif key in ENUM_FIELDS and isinstance(value, str):
            value = _ENUM_SYNONYMS[key].get(snake(value), snake(value))
        result[key] = value
    return result


# ---- transcript parsing ----------------------------------------------------------

_AGENT_ROLES = {"assistant", "agent", "bot", "jiya", "ai", "system_agent"}
_PATIENT_ROLES = {"user", "human", "patient", "customer", "caller", "callee"}
_LINE = re.compile(r"^\s*([A-Za-z_ -]{2,20})\s*:\s*(.*)$")


def _role(raw: str) -> str | None:
    key = raw.strip().lower()
    if key in _AGENT_ROLES:
        return "agent"
    if key in _PATIENT_ROLES:
        return "patient"
    return None


def parse_transcript(raw: Any) -> list[dict] | None:
    if raw is None:
        return None
    turns: list[dict] = []
    if isinstance(raw, str):
        for line in raw.splitlines():
            if not line.strip():
                continue
            m = _LINE.match(line)
            role = _role(m.group(1)) if m else None
            if role:
                turns.append({"role": role, "text": m.group(2).strip()})
            elif turns:
                turns[-1]["text"] = f"{turns[-1]['text']} {line.strip()}".strip()
            else:
                turns.append({"role": "agent", "text": line.strip()})
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                role = _role(str(item.get("role") or item.get("speaker") or "")) or "agent"
                text = item.get("text") or item.get("content") or item.get("message") or ""
                if str(text).strip():
                    turns.append({"role": role, "text": str(text).strip()})
            elif isinstance(item, str):
                parsed = parse_transcript(item) or []
                turns.extend(parsed)
    turns = [t for t in turns if t["text"]]
    return turns or None


# ---- payload extraction ----------------------------------------------------------


@dataclass
class ExecutionUpdate:
    execution_id: str | None
    call_ref: str | None
    raw_status: Any
    extracted_present: bool
    extracted: dict | None
    summary: str | None
    transcript: list[dict] | None


def parse_payload(payload: dict) -> ExecutionUpdate:
    execution_id = payload.get("id") or payload.get("execution_id")
    call_ref = None
    user_data = payload.get("user_data")
    if isinstance(user_data, dict):
        call_ref = user_data.get("call_ref")
    ctx = payload.get("context_details")
    if not call_ref and isinstance(ctx, dict):
        recipient = ctx.get("recipient_data")
        if isinstance(recipient, dict):
            call_ref = recipient.get("call_ref")
    extracted_raw = payload.get("extracted_data")
    extracted = normalise_extracted(extracted_raw)
    summary = payload.get("summary")
    summary = summary.strip() if isinstance(summary, str) and summary.strip() else None
    return ExecutionUpdate(
        execution_id=str(execution_id) if execution_id else None,
        call_ref=str(call_ref) if call_ref else None,
        raw_status=payload.get("status"),
        extracted_present=bool(extracted),
        extracted=extracted,
        summary=summary,
        transcript=parse_transcript(payload.get("transcript")),
    )


# ---- REST client -----------------------------------------------------------------


class BolnaError(Exception):
    """Raised when Bolna rejects or cannot be reached. Message is safe to show (no secrets)."""


class BolnaClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.settings.bolna_api_key}", "Content-Type": "application/json"}

    async def start_call(self, user_data: dict[str, str]) -> str:
        body: dict[str, Any] = {
            "agent_id": self.settings.bolna_agent_id,
            "recipient_phone_number": self.settings.demo_call_recipient,
            "user_data": user_data,
            "bypass_call_guardrails": True,
        }
        if self.settings.bolna_from_number:
            body["from_phone_number"] = self.settings.bolna_from_number
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(f"{self.settings.bolna_base_url}/call", json=body, headers=self._headers())
        except httpx.HTTPError as exc:
            raise BolnaError(f"Could not reach Bolna ({type(exc).__name__}).") from exc
        if res.status_code >= 400:
            detail = ""
            try:
                data = res.json()
                detail = str(data.get("message") or data.get("detail") or data.get("error") or "")[:200]
            except ValueError:
                pass
            log.warning("Bolna /call returned HTTP %s", res.status_code)
            raise BolnaError(f"Bolna rejected the call (HTTP {res.status_code}){': ' + detail if detail else ''}.")
        try:
            data = res.json()
        except ValueError as exc:
            raise BolnaError("Bolna returned an unreadable response.") from exc
        execution_id = data.get("execution_id") or data.get("id")
        if not execution_id:
            raise BolnaError("Bolna did not return an execution id.")
        return str(execution_id)

    async def get_execution(self, execution_id: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(f"{self.settings.bolna_base_url}/executions/{execution_id}", headers=self._headers())
        except httpx.HTTPError:
            return None
        if res.status_code >= 400:
            return None
        try:
            data = res.json()
        except ValueError:
            return None
        return data if isinstance(data, dict) else None
