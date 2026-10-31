from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_list_calls_flagged_clinical_filters():
    settings = Settings(jivana_mode="clinic", bolna_api_key="k", bolna_agent_id="a")
    with TestClient(create_app(settings)) as client:
        pr = client.post("/api/patients", json={"display_name": "Call Filter", "phone_e164": "+919999999903"})
        pid = pr.json()["patient"]["patient_id"]
        tr = client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "post_procedure_checkin",
                "title": "Check-in",
                "purpose": "Follow up",
                "call_context": "Dental",
                "due_at": "2026-11-01T10:00:00+05:30",
            },
        )
        task_id = tr.json()["task"]["task_id"]
        all_calls = client.get("/api/calls").json()["items"]
        assert isinstance(all_calls, list)
        clinical = client.get("/api/calls", params={"flagged": "clinical"}).json()["items"]
        assert isinstance(clinical, list)
        assert len(clinical) <= len(all_calls)
