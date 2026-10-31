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
        clinic_confirmation_batch_time="10:00",
        auto_dial_enabled=False,
    )
    base.update(kwargs)
    return Settings(**base)


def test_confirmation_due_at_day_before_at_batch_time():
    appt = datetime(2026, 11, 7, 10, 0, tzinfo=timeutil.IST)
    moment = confirmation_call_moment(appt, parse_batch_time("10:00"))
    assert moment.day == 6
    assert moment.hour == 10


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
