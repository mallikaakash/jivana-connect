from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_clinic_create_patient_and_task():
    settings = Settings(
        jivana_mode="clinic",
        clinic_name="Test Dental",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    with TestClient(create_app(settings)) as client:
        r = client.post("/api/patients", json={"display_name": "Priya Singh", "phone_e164": "+919999999901"})
        assert r.status_code == 201, r.json()
        pid = r.json()["patient"]["patient_id"]
        r2 = client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "post_procedure_checkin",
                "title": "Post-visit check",
                "purpose": "Follow up after visit",
                "call_context": "Dental post-visit follow-up.",
                "due_at": "2026-11-01T10:00:00+05:30",
            },
        )
        assert r2.status_code == 201
        meta = client.get("/api/meta").json()
        assert meta["app_mode"] == "clinic"
        assert meta["environment"] == "clinic"


def test_clinic_reset_workspace_when_enabled():
    settings = Settings(
        jivana_mode="clinic",
        clinic_allow_workspace_reset=True,
        clinic_demo_seed_enabled=False,
        bolna_api_key="k",
        bolna_agent_id="a",
    )
    with TestClient(create_app(settings)) as client:
        client.post("/api/patients", json={"display_name": "Temp", "phone_e164": "+919999990299"})
        assert len(client.get("/api/patients").json()["items"]) == 1
        r = client.post("/api/clinic/reset-workspace")
        assert r.status_code == 200
        assert r.json()["cleared"] is True
        assert client.get("/api/patients").json()["items"] == []


def test_clinic_cancel_task():
    settings = Settings(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    with TestClient(create_app(settings)) as client:
        pid = client.post("/api/patients", json={"display_name": "Cancel Me", "phone_e164": "+919999999902"}).json()[
            "patient"
        ]["patient_id"]
        tid = client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "callback_request",
                "title": "Callback",
                "purpose": "Return call",
                "call_context": "Patient asked for callback.",
                "due_at": "2026-11-01T10:00:00+05:30",
            },
        ).json()["task"]["task_id"]
        r = client.post(f"/api/tasks/{tid}/cancel")
        assert r.status_code == 200
        assert r.json()["task"]["status"] == "cancelled"


def test_clinic_blocks_demo_reset():
    settings = Settings(jivana_mode="clinic", bolna_api_key="k", bolna_agent_id="a")
    with TestClient(create_app(settings)) as client:
        r = client.post("/api/demo/reset")
        assert r.status_code == 403
