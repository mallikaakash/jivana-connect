"""Clinic auth, appointments, escalation resolution types."""

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def _clinic_settings(**kwargs) -> Settings:
    base = dict(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    base.update(kwargs)
    return Settings(**base)


def test_clinic_api_key_required():
    settings = _clinic_settings(clinic_api_key="secret-key")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/meta").status_code == 200
        assert client.get("/api/patients").status_code == 401
        authed = client.get("/api/patients", headers={"Authorization": "Bearer secret-key"})
        assert authed.status_code == 200


def test_meta_publishes_reviewer_sign_in_when_enabled():
    settings = _clinic_settings(clinic_api_key="demo-review-key", clinic_publish_reviewer_key=True)
    with TestClient(create_app(settings)) as client:
        meta = client.get("/api/meta").json()
        assert meta["reviewer_sign_in"]["access_key"] == "demo-review-key"
        assert "api_key" in meta["auth_methods"]


def test_clinic_demo_seed_endpoint():
    settings = _clinic_settings(clinic_demo_seed_enabled=True, clinic_api_key="x")
    with TestClient(create_app(settings)) as client:
        denied = client.post("/api/clinic/demo-seed")
        assert denied.status_code == 401
        r = client.post("/api/clinic/demo-seed", headers={"Authorization": "Bearer x"})
        assert r.status_code == 200, r.json()
        assert r.json()["counts"]["patients"] >= 8
        assert client.get("/api/patients", headers={"Authorization": "Bearer x"}).json()["items"]


def test_clinic_demo_seed_disabled():
    settings = _clinic_settings(clinic_demo_seed_enabled=False)
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/clinic/demo-seed", headers={"Authorization": "Bearer x"}).status_code == 403


def test_meta_hides_reviewer_key_by_default():
    settings = _clinic_settings(clinic_api_key="secret-key", clinic_publish_reviewer_key=False)
    with TestClient(create_app(settings)) as client:
        meta = client.get("/api/meta").json()
        assert "reviewer_sign_in" not in meta


def test_create_appointment_spawns_confirmation_task():
    settings = _clinic_settings()
    with TestClient(create_app(settings)) as client:
        pid = client.post("/api/patients", json={"display_name": "Appt Pt", "phone_e164": "+919999999904"}).json()["patient"]["patient_id"]
        r = client.post(
            "/api/appointments",
            json={
                "patient_id": pid,
                "scheduled_at": "2026-11-05T10:00:00+05:30",
                "department": "Dental",
                "clinician": "Dr. A",
            },
        )
        assert r.status_code == 201, r.json()
        body = r.json()
        assert body["appointment"]["patient_id"] == pid
        assert body["task"] is not None
        assert body["task"]["task_type"] == "appointment_confirmation"
        assert body["appointment"]["task_id"] == body["task"]["task_id"]


def test_resolve_escalation_requires_resolution_type_in_clinic():
    settings = _clinic_settings()
    with TestClient(create_app(settings)) as client:
        pid = client.post("/api/patients", json={"display_name": "Esc", "phone_e164": "+919999999905"}).json()["patient"]["patient_id"]
        tid = client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "post_procedure_checkin",
                "title": "Check",
                "purpose": "p",
                "call_context": "c",
                "due_at": "2026-11-01T10:00:00+05:30",
            },
        ).json()["task"]["task_id"]
        svc = client.app.state.service
        task = svc.store.get("tasks", tid)
        call = {
            "call_id": "call_test_esc",
            "task_id": tid,
            "patient_id": pid,
            "provider_call_id": None,
            "workflow": task["task_type"],
            "purpose": task["title"],
            "status": "completed",
            "outcome": "concern_reported",
            "summary": "test",
            "transcript": None,
            "transcript_is_example": False,
            "extracted_fields": None,
            "processing_result": None,
            "is_live": True,
            "escalation_id": None,
            "started_at": task["created_at"],
            "completed_at": task["created_at"],
            "created_at": task["created_at"],
        }
        svc.store.save("calls", call)
        esc = svc._create_escalation(call, task, "Pain after visit")
        eid = esc["escalation_id"]
        bad = client.patch(f"/api/escalations/{eid}", json={"action": "resolve", "author": "Dr"})
        assert bad.status_code == 422
        ok = client.patch(
            f"/api/escalations/{eid}",
            json={"action": "resolve", "author": "Dr", "resolution_type": "advised_come_in", "note": "Seen same day"},
        )
        assert ok.status_code == 200
        assert ok.json()["escalation"]["resolution_type"] == "advised_come_in"
