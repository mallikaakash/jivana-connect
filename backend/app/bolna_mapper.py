"""Map live Jiya (dental) Bolna extractions to CONTRACT.md workflow fields."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .bolna import snake

# Disposition keys after normalise_extracted (snake_case).
JIYA_MARKERS = frozenset({
    "call_outcome",
    "patient_feeling",
    "opt_out_requested",
    "wrong_number",
    "patient_concern",
    "clinical_question",
    "follow_up_required",
    "preferred_callback_time",
    "patient_identity_confirmed",
})

CONTRACT_MARKERS = frozenset({
    "appointment_outcome",
    "test_completed",
    "checkin_result",
    "task_acknowledged",
})

_TEXT_SENTINELS = frozenset({
    "not_specified",
    "not_applicable",
    "unclear",
    "not_reported",
    "none_reported",
    "not_determined",
    "n/a",
    "na",
})

_CALL_OUTCOME_APPOINTMENT = {
    "appointment_confirmed": "confirmed",
    "reschedule_requested": "rescheduling_requested",
    "voicemail": "no_answer",
    "wrong_person": "no_answer",
    "no_response": "no_answer",
    "inconclusive": "unable_to_confirm",
    "incomplete": "unable_to_confirm",
    "concern_or_question_reported": "unable_to_confirm",
    "callback_requested": "unable_to_confirm",
    "reminder_acknowledged": "confirmed",
    "appointment_declined": "declined",
    "patient_declined": "declined",
}


@dataclass(frozen=True)
class MapperDirectives:
    opt_out: bool = False
    wrong_number: bool = False
    identity_not_confirmed: bool = False
    clinical_question: str | None = None
    needs_clinical_review: bool = False


def is_jiya_extraction(flat: dict[str, Any]) -> bool:
    return bool(JIYA_MARKERS & flat.keys())


def is_contract_extraction(flat: dict[str, Any]) -> bool:
    return bool(CONTRACT_MARKERS & flat.keys())


def _yn(value: Any) -> bool | None:
    if value is None or isinstance(value, bool):
        return value
    key = snake(str(value))
    if key in {"yes", "y", "true", "1", "haan", "han"}:
        return True
    if key in {"no", "n", "false", "0", "nahi", "nahin"}:
        return False
    return None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or snake(text) in _TEXT_SENTINELS:
        return None
    return text


class JiyaExtractionMapper:
    @staticmethod
    def map(task_type: str, jiya: dict[str, Any]) -> tuple[dict[str, str | bool | None], MapperDirectives]:
        clinical_q = _text(jiya.get("clinical_question"))
        call_outcome = jiya.get("call_outcome")
        if isinstance(call_outcome, str):
            call_outcome = snake(call_outcome)
        if task_type == "appointment_confirmation" and call_outcome in ("inconclusive", "incomplete", None):
            summary = (_text(jiya.get("call_summary")) or "").lower()
            decline_phrases = (
                "not be able to make",
                "won't be able",
                "wont be able",
                "cannot make",
                "can't make",
                "unable to make",
                "not coming",
                "cancel the appointment",
                "cancelled the appointment",
            )
            if any(p in summary for p in decline_phrases):
                call_outcome = "appointment_declined"
        needs_review = call_outcome == "concern_or_question_reported" or bool(clinical_q)
        directives = MapperDirectives(
            opt_out=_yn(jiya.get("opt_out_requested")) is True,
            wrong_number=_yn(jiya.get("wrong_number")) is True,
            identity_not_confirmed=_yn(jiya.get("patient_identity_confirmed")) is False,
            clinical_question=clinical_q,
            needs_clinical_review=needs_review,
        )
        contract: dict[str, str | bool | None] = {}

        concern = _text(jiya.get("patient_concern"))
        clinical = _text(jiya.get("clinical_question"))
        notes: list[str] = []
        if concern:
            notes.append(concern)
        if clinical:
            notes.append(clinical)
        if notes:
            contract["patient_note"] = "; ".join(notes)

        callback = _yn(jiya.get("callback_requested"))
        if callback is True:
            contract["callback_requested"] = True
            window = _text(jiya.get("preferred_callback_time"))
            if window:
                contract["callback_window"] = window
        elif callback is False:
            contract["callback_requested"] = False

        if task_type == "appointment_confirmation":
            ao = _CALL_OUTCOME_APPOINTMENT.get(call_outcome or "")
            if call_outcome == "reschedule_requested":
                window = _text(jiya.get("preferred_callback_time"))
                if window:
                    contract["preferred_reschedule_window"] = window
            if ao:
                contract["appointment_outcome"] = ao

        elif task_type == "post_procedure_checkin":
            feeling = jiya.get("patient_feeling")
            if isinstance(feeling, str):
                feeling = snake(feeling)
            follow_up = _yn(jiya.get("follow_up_required"))
            if (
                call_outcome == "concern_or_question_reported"
                or follow_up is True
                or feeling == "worse"
                or concern
            ):
                contract["checkin_result"] = "concern_reported"
                contract["concern_summary"] = concern or clinical or contract.get("patient_note")
            elif call_outcome in ("reminder_acknowledged", "appointment_confirmed") or feeling in ("better", "same", "not_reported"):
                contract["checkin_result"] = "routine_ok"
            elif call_outcome in ("voicemail", "wrong_person", "no_response"):
                contract["checkin_result"] = None
            else:
                contract["checkin_result"] = "routine_ok" if feeling == "better" else None

        elif task_type == "test_report_reminder":
            if call_outcome == "reminder_acknowledged":
                contract["test_completed"] = True
            elif call_outcome in ("inconclusive", "incomplete", "callback_requested"):
                contract["test_completed"] = None
            elif _yn(jiya.get("follow_up_required")) is False:
                feeling = jiya.get("patient_feeling")
                if feeling and snake(str(feeling)) in ("better", "same"):
                    contract["test_completed"] = True

        elif task_type == "clinician_task_reminder":
            if call_outcome == "reminder_acknowledged":
                contract["task_acknowledged"] = True
            elif call_outcome in ("no_response", "voicemail", "wrong_person"):
                contract["task_acknowledged"] = False

        elif task_type == "callback_request":
            if call_outcome in ("callback_requested", "reschedule_requested") or callback is True:
                contract["callback_requested"] = True
            summary_blob = (_text(jiya.get("call_summary")) or "").lower()
            if summary_blob:
                from .transcript_inference import _reschedule_window

                sched = _reschedule_window(summary_blob)
                if sched and not contract.get("callback_window"):
                    contract["callback_window"] = sched

        return contract, directives

    @staticmethod
    def merge_for_storage(contract: dict[str, str | bool | None], jiya: dict[str, Any]) -> dict[str, str | bool | None]:
        out = dict(contract)
        for key, value in jiya.items():
            out[f"jiya_{key}"] = value if isinstance(value, (str, bool)) or value is None else str(value)
        return out


def _transcript_overrides(task_type: str, flat: dict[str, Any] | None, transcript: list[dict] | None, summary: str | None) -> dict[str, Any] | None:
    """Patient utterances in the transcript override wrong Bolna extractions."""
    from .transcript_inference import infer_workflow_from_transcript

    if not transcript:
        return flat
    inferred = infer_workflow_from_transcript(task_type, transcript, summary)
    if not inferred:
        return flat
    merged = dict(flat or {})
    for key, value in inferred.items():
        if task_type == "test_report_reminder" and key == "test_completed":
            merged["test_completed"] = value
        elif task_type == "appointment_confirmation" and key == "appointment_outcome":
            merged["appointment_outcome"] = value
            if inferred.get("preferred_reschedule_window"):
                merged["preferred_reschedule_window"] = inferred["preferred_reschedule_window"]
        elif task_type == "post_procedure_checkin" and key == "checkin_result":
            merged["checkin_result"] = value
            if inferred.get("concern_summary"):
                merged["concern_summary"] = inferred["concern_summary"]
        elif task_type == "clinician_task_reminder" and key == "task_acknowledged":
            merged["task_acknowledged"] = value
        elif task_type == "callback_request" and key == "callback_requested":
            merged[key] = value
    return merged


def prepare_extracted_for_task(
    task_type: str,
    flat: dict[str, Any] | None,
    *,
    transcript: list[dict] | None = None,
    summary: str | None = None,
) -> tuple[dict[str, str | bool | None] | None, MapperDirectives | None]:
    """Return fields for process_call_result and optional patient directives."""
    from .transcript_inference import infer_workflow_from_transcript

    flat = _transcript_overrides(task_type, flat, transcript, summary)

    needs_inference = not flat or not (
        (task_type == "appointment_confirmation" and flat.get("appointment_outcome"))
        or (task_type == "post_procedure_checkin" and flat.get("checkin_result"))
        or (task_type == "test_report_reminder" and flat.get("test_completed") is not None)
        or (task_type == "clinician_task_reminder" and flat.get("task_acknowledged") is not None)
        or (task_type == "callback_request" and flat.get("callback_requested") is not None)
    )
    if needs_inference and transcript:
        inferred = infer_workflow_from_transcript(task_type, transcript, summary)
        if inferred:
            flat = {**(flat or {}), **inferred}
    if not flat:
        return None, None
    if is_contract_extraction(flat):
        directives = MapperDirectives(
            opt_out=_yn(flat.get("opt_out_requested")) is True,
            wrong_number=_yn(flat.get("wrong_number")) is True,
        )
        return flat, directives if (directives.opt_out or directives.wrong_number) else None
    if not is_jiya_extraction(flat):
        return flat, None
    contract, directives = JiyaExtractionMapper.map(task_type, flat)
    storage = JiyaExtractionMapper.merge_for_storage(contract, flat)
    return storage, directives
