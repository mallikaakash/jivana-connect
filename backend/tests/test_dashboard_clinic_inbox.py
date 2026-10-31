"""Dashboard clinical vs operations inbox split."""

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_dashboard_inbox_split_and_meta():
    settings = Settings(
        jivana_mode="clinic",
        clinic_name="Test Dental",
        clinic_lead_name="Dr. Test",
        bolna_api_key="k",
        bolna_agent_id="a",
        auto_dial_enabled=False,
    )
    with TestClient(create_app(settings)) as client:
        meta = client.get("/api/meta").json()
        assert meta["staff_role_default"] == "doctor"
        assert meta["clinical_lead_label"] == "Dr. Test"
        assert meta["features"]["appointments"] is True

        pr = client.post(
            "/api/patients",
            json={"display_name": "Inbox Patient", "phone_e164": "+919999999902"},
        )
        pid = pr.json()["patient"]["patient_id"]
        client.post(
            "/api/tasks",
            json={
                "patient_id": pid,
                "task_type": "callback_request",
                "title": "Callback",
                "purpose": "Call back",
                "call_context": "Callback",
                "due_at": "2026-11-01T10:00:00+05:30",
            },
        )

        dash = client.get("/api/dashboard/summary").json()
        assert "clinical_inbox" in dash
        assert "operations_inbox" in dash
        assert len(dash["needs_attention"]) == len(dash["clinical_inbox"]) + len(dash["operations_inbox"])
        assert all(i["audience"] in ("clinical", "operations") for i in dash["needs_attention"])
        assert all("clinical_snippet" in i for i in dash["needs_attention"])
        ops = dash["operations_inbox"]
        assert len(ops) >= 1
        assert ops[0]["kind"] == "callback_request"
        assert ops[0]["audience"] == "operations"
