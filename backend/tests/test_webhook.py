import json

from app.bolna import BolnaError, normalise_extracted, parse_transcript


def _start_live(client, task_id="task_demo_001"):
    r = client.post(f"/api/tasks/{task_id}/start-call")
    assert r.status_code == 202, r.json()
    call = r.json()["call"]
    assert call["is_live"] is True
    assert call["provider_call_id"]
    return call


def _events_for_call(client, task_id):
    return client.get(f"/api/tasks/{task_id}").json()["events"]


def test_live_start_passes_user_data(live_client):
    call = _start_live(live_client)
    ud = live_client.fake_bolna.started[0]["user_data"]
    assert ud["call_ref"] == call["call_id"]
    assert ud["patient_name"] == "Asha Verma"
    assert ud["task_type"] == "appointment_confirmation"
    assert ud["clinician"] == "Dr. A. Rao"
    assert all(isinstance(v, str) for v in ud.values())
    meta = live_client.get("/api/meta").json()
    assert meta["voice_mode"] == "live"


def test_webhook_completed_is_idempotent(live_client):
    call = _start_live(live_client)
    payload = {
        "id": call["provider_call_id"],
        "status": "completed",
        "summary": "Patient wants to reschedule to next week.",
        "transcript": "assistant: Namaste, main Jiya.\nuser: Haan ji.\nassistant: Kya aap aa payenge?\nuser: Nahi, next week ho sakta hai?",
        "extracted_data": json.dumps({
            "appointment_outcome": "Rescheduling Requested",
            "preferred_reschedule_window": "Next week mornings",
            "patient_note": None,
            "callback_requested": "false",
            "callback_window": "NA",
        }),
        "telephony_data": {"duration": "42", "recording_url": "https://example.invalid/rec.mp3"},
    }
    r1 = live_client.post("/api/webhooks/bolna", json=payload)
    assert r1.status_code == 200 and r1.json()["ok"] is True and not r1.json().get("duplicate")
    events_after_first = _events_for_call(live_client, "task_demo_001")

    r2 = live_client.post("/api/webhooks/bolna", json=payload)
    assert r2.status_code == 200
    assert r2.json()["ok"] is True and r2.json()["duplicate"] is True
    assert _events_for_call(live_client, "task_demo_001") == events_after_first

    c = live_client.get(f"/api/calls/{call['call_id']}").json()["call"]
    assert c["status"] == "completed"
    assert c["outcome"] == "rescheduling_requested"
    assert c["transcript_is_example"] is False
    assert [t["role"] for t in c["transcript"]] == ["agent", "patient", "agent", "patient"]
    assert c["extracted_fields"]["callback_requested"] is False
    assert c["extracted_fields"]["callback_window"] is None
    assert c["summary"] == "Patient wants to reschedule to next week."
    detail = live_client.get("/api/tasks/task_demo_001").json()
    assert detail["task"]["status"] == "awaiting_staff_action"
    assert detail["appointment"]["booking_status"] == "scheduled"
    assert detail["appointment"]["confirmation_state"] == "rescheduling_requested"
    assert sum(1 for e in events_after_first if e["event_type"] == "call_completed") == 1


def test_webhook_intermediate_statuses_and_lookup_by_call_ref(live_client):
    call = _start_live(live_client)
    r = live_client.post("/api/webhooks/bolna", json={"execution_id": "other-id", "status": "in-progress",
                                                      "context_details": {"recipient_data": {"call_ref": call["call_id"]}}})
    assert r.json()["status"] == "in_progress"
    r = live_client.post("/api/webhooks/bolna", json={"id": call["provider_call_id"], "status": "call-disconnected"})
    assert r.json()["ignored"] is True
    assert live_client.get(f"/api/calls/{call['call_id']}").json()["call"]["status"] == "in_progress"


def test_webhook_disconnect_with_transcript_infers_reschedule(live_client):
    call = _start_live(live_client)
    transcript = (
        "assistant: Can you make it?\n"
        "user: no i won't be able to make it\n"
        "assistant: Would you like to reschedule?\n"
        "user: fifth november please\n"
        "assistant: Noted for 5th November.\n"
    )
    r = live_client.post(
        "/api/webhooks/bolna",
        json={"id": call["provider_call_id"], "status": "call-disconnected", "transcript": transcript},
    )
    assert r.status_code == 200 and r.json().get("ok") is True
    assert not r.json().get("ignored")
    c = live_client.get(f"/api/calls/{call['call_id']}").json()["call"]
    assert c["status"] == "completed"
    assert c["outcome"] == "rescheduling_requested"
    detail = live_client.get("/api/tasks/task_demo_001").json()
    assert detail["appointment"]["confirmation_state"] == "rescheduling_requested"
    assert detail["task"]["status"] == "awaiting_staff_action"
    assert "5" in detail["task"]["next_action"] or "November" in detail["task"]["next_action"]


def test_webhook_no_answer_sets_task_due(live_client):
    call = _start_live(live_client)
    r = live_client.post("/api/webhooks/bolna", json={"id": call["provider_call_id"], "status": "no-answer"})
    assert r.status_code == 200
    detail = live_client.get("/api/tasks/task_demo_001").json()
    assert detail["task"]["status"] == "due"
    assert detail["task"]["next_action"] == "Retry call"
    assert detail["task"]["attempt_count"] == 1
    assert detail["appointment"]["confirmation_state"] == "no_answer"
    assert live_client.get(f"/api/calls/{call['call_id']}").json()["call"]["status"] == "no_answer"


def test_invalid_outcome_becomes_unable_to_confirm(live_client):
    call = _start_live(live_client)
    live_client.post("/api/webhooks/bolna", json={"id": call["provider_call_id"], "status": "completed",
                                                  "extracted_data": {"appointment_outcome": "maybe later"}})
    c = live_client.get(f"/api/calls/{call['call_id']}").json()["call"]
    assert c["outcome"] == "unable_to_confirm"
    assert "validation failed" in c["processing_result"]
    task = live_client.get("/api/tasks/task_demo_001").json()["task"]
    assert task["status"] == "awaiting_staff_action"


def test_provider_error_restores_task(live_client):
    live_client.fake_bolna.fail_with = BolnaError("Bolna rejected the call (HTTP 400).")
    r = live_client.post("/api/tasks/task_demo_001/start-call")
    assert r.status_code == 502
    assert r.json()["detail"]["code"] == "provider_error"
    assert r.json()["detail"]["retry_allowed"] is True
    task = live_client.get("/api/tasks/task_demo_001").json()["task"]
    assert task["status"] == "pending"
    assert task["attempt_count"] == 0
    assert task["call_eligible"] is True
    calls = live_client.get("/api/calls", params={"task_id": "task_demo_001"}).json()["items"]
    assert calls[0]["status"] == "failed"


def test_test_reminder_not_done_keeps_task_pending(live_client):
    """Demo guide Scene 6 — patient says test not complete; task stays pending with new due date."""
    svc = live_client.app.state.service
    svc.settings.jivana_mode = "clinic"
    task = svc.store.get("tasks", "task_demo_011")
    if task is None:
        return  # optional seed row
    task.update(status="pending", attempt_count=0, latest_outcome=None)
    svc.store.save("tasks", task)
    patient = svc.store.get("patients", task["patient_id"])
    patient["phone_e164"] = "+919999990101"
    svc.store.save("patients", patient)
    call = _start_live(live_client, "task_demo_011")
    r = live_client.post(
        "/api/webhooks/bolna",
        json={
            "id": call["provider_call_id"],
            "status": "completed",
            "summary": "Patient has not completed the test yet.",
            "transcript": "assistant: Have you completed the lipid profile?\nuser: Not yet, I haven't had time.",
            "extracted_data": {"test_completed": False},
        },
    )
    assert r.status_code == 200
    detail = live_client.get(f"/api/calls/{call['call_id']}").json()
    assert detail["call"]["outcome"] == "test_not_done"
    assert detail["task"]["status"] == "pending"
    assert "Remind again" in detail["task"]["next_action"]
    tt = detail["task"].get("test_tracking") or {}
    assert tt.get("test_completion_reported") is not True


def test_test_reminder_inferred_from_short_transcript_without_extraction(live_client):
    """Poller active on live start-call must not defer when a 2-turn transcript is enough to infer."""
    svc = live_client.app.state.service
    svc.settings.jivana_mode = "clinic"
    task = svc.store.get("tasks", "task_demo_011")
    if task is None:
        return
    task.update(status="pending", attempt_count=0, latest_outcome=None, extracted_fields=None)
    svc.store.save("tasks", task)
    patient = svc.store.get("patients", task["patient_id"])
    patient["phone_e164"] = "+919999990101"
    svc.store.save("patients", patient)
    call = _start_live(live_client, "task_demo_011")
    r = live_client.post(
        "/api/webhooks/bolna",
        json={
            "id": call["provider_call_id"],
            "status": "completed",
            "transcript": "assistant: Have you done the lipid test?\nuser: Sorry I have not done the test yet",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("deferred") is not True
    detail = live_client.get(f"/api/calls/{call['call_id']}").json()
    assert detail["call"]["outcome"] == "test_not_done"
    assert detail["task"]["status"] == "pending"


def test_concern_creates_escalation_and_callback(live_client):
    svc = live_client.app.state.service
    task = svc.store.get("tasks", "task_demo_004")
    task.update(status="pending", escalation_id=None, attempt_count=0)
    call = _start_live(live_client, "task_demo_004")
    r = live_client.post("/api/webhooks/bolna", json={
        "id": call["provider_call_id"],
        "status": "completed",
        "extracted_data": {"checkin_result": "Concern Reported", "concern_summary": "Knee pain is worse since morning.",
                           "callback_requested": True, "callback_window": "Tomorrow 10 AM"},
    })
    assert r.status_code == 200
    detail = live_client.get(f"/api/calls/{call['call_id']}").json()
    esc = detail["escalation"]
    assert esc is not None
    assert esc["status"] == "open" and esc["priority"] == "high"
    assert "Orthopaedics" in esc["routing_destination"]
    assert esc["call_id"] == call["call_id"] and esc["task_id"] == "task_demo_004"
    assert esc["concern_summary"] == "Knee pain is worse since morning."
    assert detail["call"]["outcome"] == "concern_reported"
    assert detail["call"]["escalation_id"] == esc["escalation_id"]
    assert detail["task"]["status"] == "awaiting_staff_action"
    assert detail["task"]["next_action"] == "Review escalated concern"
    assert detail["task"]["escalation_id"] == esc["escalation_id"]
    assert detail["patient"]["attention_status"] == "urgent"

    callbacks = [t for t in live_client.get("/api/tasks", params={"task_type": "callback_request",
                                                                   "patient_id": "patient_demo_004"}).json()["items"]]
    assert len(callbacks) == 1 and callbacks[0]["callback_window"] == "Tomorrow 10 AM"
    types = [e["event_type"] for e in live_client.get("/api/patients/patient_demo_004").json()["events"]]
    assert "escalation_created" in types and "callback_task_created" in types


def test_webhook_token_required_when_secret_set(live_client):
    live_client.app.state.service.settings.bolna_webhook_secret = "s3cret"
    r = live_client.post("/api/webhooks/bolna", json={"id": "x", "status": "completed"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "unauthorized"
    r = live_client.post("/api/webhooks/bolna?token=s3cret", json={"id": "unknown", "status": "completed"})
    assert r.status_code == 200 and r.json()["ignored"] is True


def test_normalisers():
    assert normalise_extracted('{"Appointment Outcome": "Rescheduling Requested"}') == {"appointment_outcome": "rescheduling_requested"}
    assert normalise_extracted({"Call Outcome": {"objective": "callback_requested"}}) == {"call_outcome": "callback_requested"}
    assert normalise_extracted({"Appointment": {"appointment_outcome": {"value": "Confirmed"}}}) == {"appointment_outcome": "confirmed"}
    assert normalise_extracted({"test_completed": "Yes", "test_date": "N/A"}) == {"test_completed": True, "test_date": None}
    assert parse_transcript([{"role": "assistant", "content": "Hi"}, {"role": "user", "content": "Hello"}]) == [
        {"role": "agent", "text": "Hi"}, {"role": "patient", "text": "Hello"}]
    assert parse_transcript("assistant: Hi\ncontinued\nuser: Yes") == [
        {"role": "agent", "text": "Hi continued"}, {"role": "patient", "text": "Yes"}]
