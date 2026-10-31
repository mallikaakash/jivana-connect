from app import timeutil
from app.config import Settings
from app.service import Service
from app.store import Store


def test_pick_auto_dial_skips_confirmation_when_followups_only():
    store = Store(None, "mem")
    svc = Service(
        Settings(jivana_mode="clinic", clinic_auto_dial_followups_enabled=True),
        store=store,
    )
    store.save(
        "patients",
        {
            "patient_id": "p1",
            "display_name": "A",
            "contact_permitted": True,
            "phone_e164": "+919999990101",
        },
    )
    store.save(
        "tasks",
        {
            "task_id": "t_conf",
            "patient_id": "p1",
            "task_type": "appointment_confirmation",
            "title": "Confirm",
            "purpose": "p",
            "call_context": "c",
            "department": "OPD",
            "due_at": timeutil.iso(timeutil.now()),
            "status": "pending",
            "priority": "normal",
            "attempt_count": 0,
            "next_action": "x",
        },
    )
    store.save(
        "tasks",
        {
            "task_id": "t_cb",
            "patient_id": "p1",
            "task_type": "callback_request",
            "title": "Callback",
            "purpose": "p",
            "call_context": "c",
            "department": "OPD",
            "due_at": timeutil.iso(timeutil.now()),
            "status": "pending",
            "priority": "normal",
            "attempt_count": 0,
            "next_action": "x",
        },
    )
    assert svc._pick_auto_dial_task(followups_only=True) == "t_cb"
    assert svc._pick_auto_dial_task(followups_only=False) == "t_cb"
