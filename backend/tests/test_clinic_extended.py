"""Patient/appointment updates, staff call complete, dial override, CSV export."""

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def _clinic_client(**overrides):
    settings = Settings.from_env()
    for k, v in overrides.items():
        object.__setattr__(settings, k, v)
    settings.jivana_mode = "clinic"
    app = create_app(settings)
    return TestClient(app)


def test_update_patient_and_appointment():
    c = _clinic_client(clinic_api_key=None, mongo_url=None)
    p = c.post("/api/patients", json={"display_name": "A", "phone_e164": "+919900000001"}).json()["patient"]
    appt = c.post(
        "/api/appointments",
        json={"patient_id": p["patient_id"], "scheduled_at": "2026-11-01T10:00:00+05:30", "spawn_confirmation_task": False},
    ).json()["appointment"]
    c.patch(f"/api/patients/{p['patient_id']}", json={"display_name": "Asha Verma"})
    c.patch(f"/api/appointments/{appt['appointment_id']}", json={"booking_status": "cancelled"})
    detail = c.get(f"/api/patients/{p['patient_id']}").json()
    assert detail["patient"]["display_name"] == "Asha Verma"
    assert detail["appointments"][0]["booking_status"] == "cancelled"


def test_dial_override_used(monkeypatch):
    c = _clinic_client(clinic_api_key=None, mongo_url=None, clinic_dial_override_e164="+919911111111")
    svc = c.app.state.service
    p = svc.create_patient("B", "+919900000002")["patient"]
    assert svc._patient_dial_phone(p["patient_id"]) == "+919911111111"


def test_export_csv():
    c = _clinic_client(clinic_api_key=None, mongo_url=None)
    c.post("/api/patients", json={"display_name": "C", "phone_e164": "+919900000003"})
    body = c.get("/api/reports/patients").text
    assert "patient_id" in body
    assert "+919900000003" in body


def test_staff_complete_call():
    c = _clinic_client(clinic_api_key=None, mongo_url=None)
    p = c.post("/api/patients", json={"display_name": "D", "phone_e164": "+919900000004", "contact_permitted": True}).json()["patient"]
    task = c.post(
        "/api/tasks",
        json={
            "patient_id": p["patient_id"],
            "task_type": "callback_request",
            "title": "Callback",
            "purpose": "Test",
            "call_context": "Test call",
            "due_at": "2026-11-01T09:00:00+05:30",
        },
    ).json()["task"]
    # Simulate stuck call without Bolna
    svc = c.app.state.service
    call = {
        "call_id": "call_test_staff",
        "task_id": task["task_id"],
        "patient_id": p["patient_id"],
        "provider_call_id": None,
        "workflow": "callback_request",
        "purpose": "Callback",
        "status": "in_progress",
        "outcome": None,
        "summary": None,
        "transcript": None,
        "transcript_is_example": False,
        "extracted_fields": None,
        "processing_result": None,
        "is_live": False,
        "escalation_id": None,
        "started_at": "2026-11-01T09:00:00+05:30",
        "completed_at": None,
        "created_at": "2026-11-01T09:00:00+05:30",
    }
    svc.store.save("calls", call)
    res = c.patch(
        "/api/calls/call_test_staff",
        json={"action": "staff_complete", "summary": "Spoke on phone", "author": "Desk"},
    )
    assert res.status_code == 200
    assert res.json()["call"]["status"] == "completed"
