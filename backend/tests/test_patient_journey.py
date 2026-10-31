"""End-to-end patient journey: one synthetic patient, all workflow types (simulated Bolna webhooks)."""

import json

import pytest

from app.config import Settings
from tests.conftest import FakeBolna, _client


def _start(client, task_id):
    r = client.post(f"/api/tasks/{task_id}/start-call")
    assert r.status_code == 202, r.json()
    return r.json()["call"]


def _webhook(client, call, *, status="completed", extracted=None, transcript=None, summary=None):
    payload = {"id": call["provider_call_id"], "status": status}
    if summary:
        payload["summary"] = summary
    if transcript:
        payload["transcript"] = transcript
    if extracted is not None:
        payload["extracted_data"] = extracted if isinstance(extracted, str) else json.dumps(extracted)
    r = client.post("/api/webhooks/bolna", json=payload)
    assert r.status_code == 200, r.json()
    return r.json()


@pytest.fixture
def journey_client():
    settings = Settings(
        jivana_mode="clinic",
        clinic_allow_workspace_reset=True,
        clinic_demo_seed_enabled=False,
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    with _client(settings) as client:
        fake = FakeBolna()
        svc = client.app.state.service
        svc.bolna.start_call = fake.start_call
        svc.bolna.get_execution = fake.get_execution
        yield client


def test_full_patient_journey_all_workflows(journey_client):
    client = journey_client
    assert client.post("/api/clinic/reset-workspace").status_code == 200
    assert client.get("/api/patients").json()["items"] == []

    pid = client.post(
        "/api/patients",
        json={"display_name": "Riya Sharma", "phone_e164": "+919999990201", "language": "en"},
    ).json()["patient"]["patient_id"]

    appt = client.post(
        "/api/appointments",
        json={
            "patient_id": pid,
            "scheduled_at": "2026-11-02T16:00:00+05:30",
            "department": "General OPD",
            "clinician": "Dr. Sharma",
        },
    ).json()
    conf_task = appt["task"]["task_id"]
    appt_id = appt["appointment"]["appointment_id"]
    booking_at = appt["appointment"]["scheduled_at"]

    call = _start(client, conf_task)
    _webhook(
        client,
        call,
        summary="Reschedule requested.",
        transcript="assistant: Can you make it?\nuser: No I need to reschedule for Monday morning.",
        extracted={"appointment_outcome": "rescheduling_requested", "preferred_reschedule_window": "Monday morning"},
    )
    detail = client.get(f"/api/tasks/{conf_task}").json()
    assert detail["task"]["status"] == "awaiting_staff_action"
    assert detail["task"]["latest_outcome"] == "rescheduling_requested"
    appt_row = client.get("/api/appointments").json()["items"]
    row = next(a for a in appt_row if a["appointment_id"] == appt_id)
    assert row["confirmation_state"] == "rescheduling_requested"
    assert row["booking_status"] == "scheduled"
    assert row["scheduled_at"] == booking_at

    appt2 = client.post(
        "/api/appointments",
        json={
            "patient_id": pid,
            "scheduled_at": "2026-11-01T16:00:00+05:30",
            "department": "General OPD",
            "clinician": "Dr. Sharma",
        },
    ).json()
    conf2 = appt2["task"]["task_id"]
    appt2_id = appt2["appointment"]["appointment_id"]
    call2 = _start(client, conf2)
    _webhook(
        client,
        call2,
        extracted={
            "appointment_outcome": "rescheduling_requested",
            "preferred_reschedule_window": "2 November",
        },
    )
    detail2 = client.get(f"/api/tasks/{conf2}").json()
    assert detail2["task"]["status"] == "pending"
    assert detail2["appointment"]["appointment_id"] != appt2_id
    assert detail2["appointment"]["scheduled_at"] == "2026-11-02T16:00:00+05:30"
    assert detail2["appointment"]["booking_status"] == "scheduled"
    all_appts = client.get("/api/appointments").json()["items"]
    old2 = next(a for a in all_appts if a["appointment_id"] == appt2_id)
    assert old2["scheduled_at"] == "2026-11-01T16:00:00+05:30"
    assert old2["booking_status"] == "cancelled"

    svc = client.app.state.service
    task_row = svc.store.get("tasks", conf_task)
    task_row["extracted_fields"] = {
        **(task_row.get("extracted_fields") or {}),
        "preferred_reschedule_window": "3 November",
    }
    svc.store.save("tasks", task_row)
    retro = client.get(f"/api/tasks/{conf_task}").json()
    assert retro["appointment"]["scheduled_at"] == "2026-11-03T16:00:00+05:30"
    assert retro["task"]["status"] == "pending"
    retro_appts = client.get("/api/appointments").json()["items"]
    assert any(a["appointment_id"] == appt_id and a["booking_status"] == "cancelled" for a in retro_appts)

    test_task = client.post(
        "/api/tasks",
        json={
            "patient_id": pid,
            "task_type": "test_report_reminder",
            "title": "Lipid profile reminder",
            "purpose": "Remind about lipid test",
            "call_context": "Fasting lipid profile before cardiology review.",
            "due_at": "2026-11-01T10:00:00+05:30",
        },
    ).json()["task"]["task_id"]
    call = _start(client, test_task)
    _webhook(
        client,
        call,
        transcript="assistant: Done the test?\nuser: Not yet I haven't had time.",
        extracted={"test_completed": False},
    )
    detail = client.get(f"/api/tasks/{test_task}").json()
    t = detail["task"]
    assert detail["calls"][0]["outcome"] == "test_not_done"
    assert t["latest_outcome"] == "test_not_done"
    assert t["status"] == "pending"
    assert t["test_tracking"]["test_completion_reported"] is False

    post_task = client.post(
        "/api/tasks",
        json={
            "patient_id": pid,
            "task_type": "post_procedure_checkin",
            "title": "Post-visit check-in",
            "purpose": "Check recovery",
            "call_context": "Follow-up after minor procedure.",
            "due_at": "2026-11-01T11:00:00+05:30",
        },
    ).json()["task"]["task_id"]
    call = _start(client, post_task)
    _webhook(
        client,
        call,
        extracted={"checkin_result": "concern_reported", "concern_summary": "Pain and swelling worse"},
    )
    post_detail = client.get(f"/api/tasks/{post_task}").json()
    assert post_detail["task"]["latest_outcome"] == "concern_reported"
    esc_id = post_detail["task"]["escalation_id"]
    assert esc_id
    esc = client.get(f"/api/escalations/{esc_id}").json()["escalation"]
    assert esc["status"] == "open"

    clin_task = client.post(
        "/api/tasks",
        json={
            "patient_id": pid,
            "task_type": "clinician_task_reminder",
            "title": "Bring prescriptions",
            "purpose": "Reminder",
            "call_context": "Bring previous prescriptions to next visit.",
            "due_at": "2026-11-01T12:00:00+05:30",
        },
    ).json()["task"]["task_id"]
    call = _start(client, clin_task)
    _webhook(client, call, extracted={"task_acknowledged": True})
    assert client.get(f"/api/tasks/{clin_task}").json()["task"]["status"] == "completed"

    cb_task = client.post(
        "/api/tasks",
        json={
            "patient_id": pid,
            "task_type": "callback_request",
            "title": "Patient callback",
            "purpose": "Return call",
            "call_context": "Patient asked clinic to call back.",
            "due_at": "2026-11-01T13:00:00+05:30",
        },
    ).json()["task"]["task_id"]
    call = _start(client, cb_task)
    _webhook(client, call, status="completed", summary="Callback completed.")
    assert client.get(f"/api/tasks/{cb_task}").json()["task"]["status"] == "completed"

    dash = client.get("/api/dashboard/summary").json()
    assert dash["patients_count"] == 1
    assert dash["open_escalations_count"] >= 1
