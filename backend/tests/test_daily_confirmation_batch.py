from datetime import datetime, timedelta

from app.config import Settings
from app.daily_confirmation import confirmation_call_moment, parse_batch_time, tomorrow_date
from app.main import create_app
from app import timeutil
from fastapi.testclient import TestClient


def _settings(**kwargs) -> Settings:
    base = dict(
        jivana_mode="clinic",
        bolna_api_key="k",
        bolna_agent_id="a",
        clinic_daily_confirmation_batch_enabled=True,
        clinic_confirmation_batch_time="16:00",
        auto_dial_enabled=False,
    )
    base.update(kwargs)
    return Settings(**base)


def test_confirmation_due_at_day_before_at_batch_time():
    appt = datetime(2026, 11, 7, 10, 0, tzinfo=timeutil.IST)
    moment = confirmation_call_moment(appt, parse_batch_time("10:00"))
    assert moment.day == 6
    assert moment.hour == 10


def test_pending_confirmation_task_resyncs_to_current_batch_time():
    timeutil.set_now_override(datetime(2026, 10, 31, 12, 0, tzinfo=timeutil.IST))
    try:
        settings = _settings(clinic_confirmation_batch_time="16:00")
        with TestClient(create_app(settings)) as client:
            pid = client.post(
                "/api/patients",
                json={"display_name": "Resync Pt", "phone_e164": "+919999990222", "contact_permitted": True},
            ).json()["patient"]["patient_id"]
            appt = client.post(
                "/api/appointments",
                json={
                    "patient_id": pid,
                    "scheduled_at": "2026-11-01T16:00:00+05:30",
                },
            ).json()
            task_id = appt["task"]["task_id"]
            svc = client.app.state.service
            task = svc.store.get("tasks", task_id)
            task["due_at"] = "2026-10-31T10:00:00+05:30"
            task["next_action"] = "Automatic confirmation call on 31 Oct at 10:00 AM (day before visit)"
            svc.store.save("tasks", task)
            detail = client.get(f"/api/tasks/{task_id}").json()["task"]
            assert detail["due_at"] == "2026-10-31T16:00:00+05:30"
            assert "4:00 PM" in detail["next_action"]
    finally:
        timeutil.set_now_override(None)


def test_collect_tomorrow_confirmation_tasks():
    now = datetime(2026, 11, 6, 9, 0, tzinfo=timeutil.IST)
    timeutil.set_now_override(now)
    try:
        settings = _settings()
        with TestClient(create_app(settings)) as client:
            pid = client.post(
                "/api/patients",
                json={
                    "display_name": "Batch Pt",
                    "phone_e164": "+919999990111",
                    "contact_permitted": True,
                },
            ).json()["patient"]["patient_id"]
            tomorrow = (now + timedelta(days=1)).replace(hour=10, minute=0)
            client.post(
                "/api/appointments",
                json={
                    "patient_id": pid,
                    "scheduled_at": tomorrow.isoformat(),
                    "department": "Dental",
                },
            )
            preview = client.get("/api/clinic/daily-confirmation-batch/preview").json()
            assert preview["recipient_count"] == 1
            assert tomorrow_date(now) == tomorrow.date()
    finally:
        timeutil.set_now_override(None)
