"""Infer workflow extraction from live transcript when Bolna post-call extraction is missing."""

from __future__ import annotations

import re
from typing import Any

_CANNOT_ATTEND = (
    "won't be able",
    "wont be able",
    "cannot make",
    "can't make",
    "unable to make",
    "not be able to make",
    "not coming",
    "can't come",
    "cannot come",
)
_RESCHEDULE = (
    "reschedule",
    "another day",
    "different day",
    "different time",
    "another time",
    "move it",
    "postpone",
)
_CONFIRM = (
    "yes i can",
    "yes i'll",
    "yes i will",
    "i can make it",
    "i'll be there",
    "i will come",
    "see you then",
    "confirmed",
)
_MONTHS = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)
_ORDINAL_DAY = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b",
    re.I,
)
_ORDINAL_DAY_REV = re.compile(
    r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b",
    re.I,
)
_WORD_DAY = re.compile(
    r"\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b",
    re.I,
)
_ORDINAL_OF_MONTH = re.compile(
    r"\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d{1,2}(?:st|nd|rd|th)?)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b",
    re.I,
)
_CANNOT_RE = re.compile(
    r"(won't|wont|can't|cannot)\s+be(\s+\w+){0,3}\s*make|not\s+be(\s+\w+){0,3}\s*make|won't\s+make|can't\s+make",
    re.I,
)


def conversation_substantive(transcript: list[dict] | None, *, min_turns: int = 4) -> bool:
    return bool(transcript and len(transcript) >= min_turns)


def _full_text(transcript: list[dict]) -> str:
    return " ".join(str(t.get("text") or "") for t in transcript).lower()


def _patient_text(transcript: list[dict]) -> str:
    return " ".join(str(t.get("text") or "") for t in transcript if t.get("role") == "patient").lower()


def _reschedule_window(text: str, *, patient_only: str | None = None) -> str | None:
    for blob in (patient_only, text):
        if not blob:
            continue
        m = _ORDINAL_OF_MONTH.search(blob)
        if m:
            return f"{m.group(1).title()} {m.group(2).title()}"
        m = _WORD_DAY.search(blob)
        if m:
            return f"{m.group(1).title()} {m.group(2).title()}"
        m = _ORDINAL_DAY.search(blob)
        if m:
            return f"{m.group(1)} {m.group(2).title()}"
        m = _ORDINAL_DAY_REV.search(blob)
        if m:
            return f"{m.group(2)} {m.group(1).title()}"
    m = _ORDINAL_DAY.search(text)
    if m:
        return f"{m.group(1)} {m.group(2).title()}"
    m = _ORDINAL_DAY_REV.search(text)
    if m:
        return f"{m.group(2)} {m.group(1).title()}"
    m = _WORD_DAY.search(text)
    if m:
        return f"{m.group(1).title()} {m.group(2).title()}"
    m = _ORDINAL_OF_MONTH.search(text)
    if m:
        return f"{m.group(1).title()} {m.group(2).title()}"
    if "anytime" in text or "any time" in text:
        for month in _MONTHS:
            if month in text:
                return f"Flexible time in {month.title()}"
        return "Flexible time"
    return None


def infer_appointment_from_transcript(
    transcript: list[dict] | None,
    summary: str | None = None,
) -> dict[str, str] | None:
    if not transcript:
        return None
    full = _full_text(transcript)
    if summary:
        full = f"{full} {summary.lower()}"
    patient = _patient_text(transcript)

    cannot = any(p in patient for p in _CANNOT_ATTEND) or bool(_CANNOT_RE.search(patient))
    if cannot:
        if any(p in full for p in _RESCHEDULE) or "noted your preference" in full:
            out: dict[str, str] = {"appointment_outcome": "rescheduling_requested"}
            window = _reschedule_window(full, patient_only=patient)
            if window:
                out["preferred_reschedule_window"] = window
            return out
        return {"appointment_outcome": "declined"}

    if any(p in patient for p in _CONFIRM) and not any(p in patient for p in _CANNOT_ATTEND):
        return {"appointment_outcome": "confirmed"}

    return None


_CONCERN = (
    "pain",
    "bleeding",
    "fever",
    "swelling",
    "worse",
    "worried",
    "concern",
    "problem",
    "infection",
    "dizzy",
    "nausea",
)
_OK = (
    "feeling fine",
    "feeling good",
    "much better",
    "no pain",
    "all good",
    "doing well",
    "better now",
    "no issues",
    "no problem",
)
_TEST_DONE = (
    "done the test",
    "test is done",
    "test done",
    "got the test",
    "completed the test",
    "had the test",
    "report is ready",
    "got my report",
    "have completed",
    "i have completed",
    "have the report",
    "have report",
)
_TEST_NOT = (
    "not done",
    "haven't done",
    "havent done",
    "will do later",
    "not yet",
)
_ACK = (
    "got it",
    "understood",
    "will do",
    "thank you",
    "noted",
    "okay",
    "ok ",
    "yes i will",
    "i'll remember",
)
_CALLBACK = (
    "call me back",
    "call back",
    "ring me",
    "phone me",
)


def infer_post_procedure_from_transcript(transcript: list[dict] | None, summary: str | None = None) -> dict[str, str] | None:
    if not transcript:
        return None
    patient = _patient_text(transcript)
    full = _full_text(transcript)
    if summary:
        full = f"{full} {summary.lower()}"
    if any(c in patient for c in _CONCERN) or "concern" in full and "noted" in full:
        snippet = patient[:200].strip() or "Patient reported a concern on the call."
        return {"checkin_result": "concern_reported", "concern_summary": snippet}
    if any(o in patient for o in _OK) or "how are you" in full and any(w in patient for w in ("fine", "good", "better")):
        return {"checkin_result": "routine_ok"}
    return None


def infer_test_report_from_transcript(transcript: list[dict] | None, summary: str | None = None) -> dict[str, str | bool] | None:
    if not transcript:
        return None
    patient = _patient_text(transcript)
    if any(p in patient for p in _TEST_NOT):
        return {"test_completed": False}
    if any(p in patient for p in _TEST_DONE):
        return {"test_completed": True}
    return None


def infer_clinician_task_from_transcript(transcript: list[dict] | None, summary: str | None = None) -> dict[str, bool] | None:
    if not transcript:
        return None
    patient = _patient_text(transcript)
    if any(a in patient for a in _ACK):
        return {"task_acknowledged": True}
    return None


def infer_callback_from_transcript(transcript: list[dict] | None, summary: str | None = None) -> dict[str, str | bool] | None:
    if not transcript:
        return None
    patient = _patient_text(transcript)
    full = _full_text(transcript)
    if summary:
        full = f"{full} {summary.lower()}"
    window = _reschedule_window(full, patient_only=patient)
    schedule_intent = any(
        phrase in patient or phrase in full
        for phrase in (
            "schedule",
            "book an appointment",
            "book appointment",
            "appointment for",
            "like to schedule",
        )
    )
    if schedule_intent and window:
        return {"callback_requested": True, "callback_window": window}
    if any(c in patient for c in _CALLBACK) or "callback" in full:
        out: dict[str, str | bool] = {"callback_requested": True}
        if window:
            out["callback_window"] = window
        return out
    return None


def infer_workflow_from_transcript(
    task_type: str,
    transcript: list[dict] | None,
    summary: str | None = None,
) -> dict[str, str | bool] | None:
    if task_type == "appointment_confirmation":
        return infer_appointment_from_transcript(transcript, summary)
    if task_type == "post_procedure_checkin":
        return infer_post_procedure_from_transcript(transcript, summary)
    if task_type == "test_report_reminder":
        return infer_test_report_from_transcript(transcript, summary)
    if task_type == "clinician_task_reminder":
        return infer_clinician_task_from_transcript(transcript, summary)
    if task_type == "callback_request":
        return infer_callback_from_transcript(transcript, summary)
    return None


def has_inferred_outcome(task_type: str, fields: dict[str, str | bool]) -> bool:
    keys_by_type = {
        "appointment_confirmation": ("appointment_outcome",),
        "post_procedure_checkin": ("checkin_result",),
        "test_report_reminder": ("test_completed",),
        "clinician_task_reminder": ("task_acknowledged",),
        "callback_request": ("callback_requested",),
    }
    for key in keys_by_type.get(task_type, ()):
        if key in fields and fields[key] is not None:
            return True
    return False
