import json
from pathlib import Path

from app.bolna import normalise_extracted
from app.bolna_mapper import JiyaExtractionMapper, prepare_extracted_for_task

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "bolna" / "extracted_data_sample.json"


def test_normalise_jiya_nested_dispositions():
    raw = json.loads(SAMPLE.read_text())["extracted_data"]
    flat = normalise_extracted(raw)
    assert flat["call_outcome"] == "callback_requested"
    assert flat["patient_feeling"] == "worse"
    assert flat["callback_requested"] is True


def test_mapper_appointment_reschedule():
    jiya = {
        "call_outcome": "reschedule_requested",
        "preferred_callback_time": "Friday morning",
        "callback_requested": "no",
    }
    contract, directives = JiyaExtractionMapper.map("appointment_confirmation", jiya)
    assert contract["appointment_outcome"] == "rescheduling_requested"
    assert contract.get("preferred_reschedule_window") == "Friday morning"
    assert not directives.opt_out


def test_mapper_post_procedure_concern():
    jiya = {
        "call_outcome": "concern_or_question_reported",
        "patient_concern": "Swelling increased",
        "patient_feeling": "worse",
        "follow_up_required": "yes",
    }
    contract, _ = JiyaExtractionMapper.map("post_procedure_checkin", jiya)
    assert contract["checkin_result"] == "concern_reported"
    assert "Swelling" in (contract.get("concern_summary") or "")


def test_mapper_opt_out_directive():
    jiya = {"opt_out_requested": "yes", "call_outcome": "inconclusive"}
    _, directives = JiyaExtractionMapper.map("appointment_confirmation", jiya)
    assert directives.opt_out is True


def test_prepare_keeps_contract_webhook_shape():
    flat = {"appointment_outcome": "confirmed", "callback_requested": False}
    prepared, _ = prepare_extracted_for_task("appointment_confirmation", flat)
    assert prepared["appointment_outcome"] == "confirmed"


def test_transcript_overrides_wrong_test_completed():
    transcript = [
        {"role": "agent", "text": "Have you done the lipid test?"},
        {"role": "patient", "text": "sorry i haven't done the test yet"},
    ]
    flat = {"test_completed": True, "call_outcome": "inconclusive"}
    prepared, _ = prepare_extracted_for_task("test_report_reminder", flat, transcript=transcript)
    assert prepared["test_completed"] is False


def test_jiya_reminder_acknowledged_does_not_mean_test_done():
    jiya = {"call_outcome": "reminder_acknowledged", "follow_up_required": "no", "patient_feeling": "same"}
    contract, _ = JiyaExtractionMapper.map("test_report_reminder", jiya)
    assert contract.get("test_completed") is not True


def test_jiya_reminder_ack_plus_transcript_not_done():
    jiya = {"call_outcome": "reminder_acknowledged", "callback_requested": "no"}
    transcript = [
        {"role": "agent", "text": "Have you completed the lipid profile?"},
        {"role": "patient", "text": "Not yet, I haven't had time."},
    ]
    prepared, _ = prepare_extracted_for_task("test_report_reminder", jiya, transcript=transcript)
    assert prepared["test_completed"] is False


def test_prepare_jiya_merges_storage_keys():
    jiya = {"call_outcome": "appointment_confirmed", "callback_requested": "no"}
    prepared, _ = prepare_extracted_for_task("appointment_confirmation", jiya)
    assert prepared["appointment_outcome"] == "confirmed"
    assert prepared["jiya_call_outcome"] == "appointment_confirmed"
