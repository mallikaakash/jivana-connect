"""Appointment requested-slot surfacing and callback spawn linkage."""

from app.config import Settings
from app.main import create_app
from app.service import Service
from fastapi.testclient import TestClient


def test_appointment_out_surfaces_pending_callback_window():
    settings = Settings(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    svc = Service(settings)
    pid = svc.create_patient("Test", "+919999999901")["patient"]["patient_id"]
    appt = svc.create_appointment(
        patient_id=pid,
        scheduled_at="2026-11-01T16:00:00+05:30",
        department="OPD",
        clinician="Dr. X",
    )["appointment"]
    svc.store.save(
        "tasks",
        {
            "task_id": "task_cb_test",
            "patient_id": pid,
            "appointment_id": None,
            "task_type": "callback_request",
            "title": "Schedule appointment — 3 November",
            "purpose": "Schedule",
            "call_context": "ctx",
            "department": "OPD",
            "due_at": "2026-11-03T10:00:00+05:30",
            "status": "pending",
            "priority": "normal",
            "attempt_count": 0,
            "last_attempt_at": None,
            "next_action": "Call patient",
            "latest_outcome": None,
            "extracted_fields": None,
            "test_tracking": None,
            "callback_window": "3 November",
            "escalation_id": None,
            "created_at": "2026-10-31T10:00:00+05:30",
            "updated_at": "2026-10-31T10:00:00+05:30",
        },
    )
    row = svc.appointment_out(svc.store.get("appointments", appt["appointment_id"]))
    assert row["requested_slot"] == "3 November"
    assert row["requested_slot_task_id"] == "task_cb_test"


def test_reschedule_note_when_same_day_as_booking():
    assert Service._reschedule_window_matches_booked_day("1 November", "2026-11-01T16:00:00+05:30")
    assert not Service._reschedule_window_matches_booked_day("3 November", "2026-11-01T16:00:00+05:30")


def test_task_detail_includes_spawned_followup():
    settings = Settings(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    with TestClient(create_app(settings)) as client:
        pid = client.post("/api/patients", json={"display_name": "Spawn", "phone_e164": "+919999999903"}).json()["patient"]["patient_id"]
        src = client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "clinician_task_reminder",
                "title": "Return patient call",
                "purpose": "p",
                "call_context": "c",
                "due_at": "2026-11-01T10:00:00+05:30",
            },
        ).json()["task"]["task_id"]
        cb_id = client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "callback_request",
                "title": "Schedule appointment — 3 November",
                "purpose": "Patient asked the clinic to call back (raised during: Return patient call).",
                "call_context": "c",
                "due_at": "2026-11-03T10:00:00+05:30",
            },
        ).json()["task"]["task_id"]
        svc = client.app.state.service  # type: ignore[attr-defined]
        src_doc = svc.store.get("tasks", src)
        src_doc["latest_outcome"] = "callback_requested"
        src_doc["status"] = "completed"
        src_doc["next_action"] = "No action needed"
        svc.store.save("tasks", src_doc)
        cb = svc.store.get("tasks", cb_id)
        cb["source_task_id"] = src
        cb["callback_window"] = "3 November"
        svc.store.save("tasks", cb)

        detail = client.get(f"/api/tasks/{src}").json()
        assert detail["spawned_followup"]["task_id"] == cb_id
        assert detail["task"]["spawned_followup_task_id"] == cb_id
        assert "Desk follow-up" in detail["task"]["next_action"]
