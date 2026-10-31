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
    created = svc.create_appointment(
        patient_id=pid,
        scheduled_at="2026-11-01T16:00:00+05:30",
        department="OPD",
        clinician="Dr. X",
    )
    appt = created["appointment"]
    conf_task_id = appt["task_id"]
    svc.store.save(
        "tasks",
        {
            "task_id": "task_cb_test",
            "patient_id": pid,
            "appointment_id": None,
            "source_task_id": conf_task_id,
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


def test_stored_reschedule_uses_callback_when_preferred_same_day():
    """Riya-style: extraction says 1 Nov (same day) but open callback task says 3 Nov."""
    settings = Settings(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    svc = Service(settings)
    pid = svc.create_patient("Riya", "+919999999902")["patient"]["patient_id"]
    created = svc.create_appointment(
        patient_id=pid,
        scheduled_at="2026-11-01T16:00:00+05:30",
        department="General OPD",
        clinician="Dr. Sharma",
    )
    appt_id = created["appointment"]["appointment_id"]
    conf_task = svc.store.get("tasks", created["appointment"]["task_id"])
    conf_task["status"] = "awaiting_staff_action"
    conf_task["latest_outcome"] = "rescheduling_requested"
    conf_task["extracted_fields"] = {
        "appointment_outcome": "rescheduling_requested",
        "preferred_reschedule_window": "1 November",
    }
    svc.store.save("tasks", conf_task)
    appt = svc.store.get("appointments", appt_id)
    appt["confirmation_state"] = "rescheduling_requested"
    svc.store.save("appointments", appt)
    svc.store.save(
        "tasks",
        {
            "task_id": "task_cb_riya",
            "patient_id": pid,
            "appointment_id": None,
            "task_type": "callback_request",
            "title": "Confirm appointment slot — 3 November",
            "purpose": "Schedule",
            "call_context": "ctx",
            "department": "General OPD",
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
    items = svc.list_appointments()
    old = next(a for a in items if a["appointment_id"] == appt_id)
    assert old["booking_status"] == "cancelled"
    assert old["scheduled_at"] == "2026-11-01T16:00:00+05:30"
    new_rows = [a for a in items if a["booking_status"] == "scheduled" and a["patient_id"] == pid]
    assert len(new_rows) == 1
    assert new_rows[0]["scheduled_at"] == "2026-11-03T16:00:00+05:30"


def test_reconcile_confirmation_task_pending_after_reschedule():
    settings = Settings(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    svc = Service(settings)
    pid = svc.create_patient("Priya", "+919999999905")["patient"]["patient_id"]
    created = svc.create_appointment(
        patient_id=pid,
        scheduled_at="2026-11-02T16:00:00+05:30",
        department="General medicine",
        clinician="Dr. Sharma",
    )
    task = svc.store.get("tasks", created["appointment"]["task_id"])
    task["status"] = "awaiting_staff_action"
    task["latest_outcome"] = "rescheduling_requested"
    svc.store.save("tasks", task)
    detail = svc.patient_detail(pid)
    conf = next(t for t in detail["tasks"] if t["task_type"] == "appointment_confirmation")
    assert conf["status"] == "pending"
    assert "Automatic confirmation call" in conf["next_action"]


def test_backfill_cancelled_row_after_inplace_reschedule():
    settings = Settings(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    svc = Service(settings)
    pid = svc.create_patient("Priya", "+919999999904")["patient"]["patient_id"]
    created = svc.create_appointment(
        patient_id=pid,
        scheduled_at="2026-11-01T16:00:00+05:30",
        department="General medicine",
        clinician="Dr. Sharma",
    )
    appt_id = created["appointment"]["appointment_id"]
    conf_task = svc.store.get("tasks", created["appointment"]["task_id"])
    appt = svc.store.get("appointments", appt_id)
    appt["scheduled_at"] = "2026-11-02T16:00:00+05:30"
    appt["confirmation_state"] = "pending"
    svc.store.save("appointments", appt)
    conf_task["status"] = "pending"
    conf_task["latest_outcome"] = "rescheduling_requested"
    conf_task["extracted_fields"] = {
        "appointment_outcome": "rescheduling_requested",
        "preferred_reschedule_window": "2 November",
    }
    svc.store.save("tasks", conf_task)
    items = svc.list_appointments()
    old = next(a for a in items if a["appointment_id"] == appt_id)
    assert old["scheduled_at"] == "2026-11-02T16:00:00+05:30"
    cancelled = [a for a in items if a["patient_id"] == pid and a["booking_status"] == "cancelled"]
    assert len(cancelled) == 1
    assert cancelled[0]["scheduled_at"] == "2026-11-01T16:00:00+05:30"


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
