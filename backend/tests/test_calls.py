from .conftest import wait_for


def _call_status(client, call_id):
    return client.get(f"/api/calls/{call_id}").json()["call"]["status"]


def test_consent_blocks_call_for_vikram(client):
    r = client.post("/api/tasks/task_demo_009/start-call")
    assert r.status_code == 409
    assert r.json()["detail"] == {"code": "call_not_eligible", "message": "Patient has not given call consent", "retry_allowed": False}
    task = client.get("/api/tasks/task_demo_009").json()["task"]
    assert task["call_eligible"] is False
    assert task["call_ineligible_reason"] == "Patient has not given call consent"
    assert task["attempt_count"] == 0


def test_awaiting_task_not_eligible(client):
    r = client.post("/api/tasks/task_demo_002/start-call")
    assert r.status_code == 409
    assert r.json()["detail"]["message"] == "Task is awaiting staff action"


def test_unknown_task_404(client):
    r = client.post("/api/tasks/nope/start-call")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "not_found"


def test_second_start_while_call_in_progress_is_409(slow_client):
    r = slow_client.post("/api/tasks/task_demo_001/start-call")
    assert r.status_code == 202
    r2 = slow_client.post("/api/tasks/task_demo_001/start-call")
    assert r2.status_code == 409
    assert r2.json()["detail"]["message"] == "A call is already in progress for this task"
    assert slow_client.post("/api/demo/reset").json() == {"ok": True}
    task = slow_client.get("/api/tasks/task_demo_001").json()["task"]
    assert task["status"] == "pending" and task["call_eligible"] is True


def test_simulated_rescheduling_flow_never_touches_booking(client):
    appt_before = next(a for a in client.get("/api/appointments").json()["items"] if a["appointment_id"] == "appt_demo_001")
    assert client.get("/api/tasks/task_demo_001").json()["task"]["call_eligible"] is True

    r = client.post("/api/tasks/task_demo_001/start-call")
    assert r.status_code == 202
    body = r.json()
    call, task = body["call"], body["task"]
    assert call["is_live"] is False
    assert call["status"] == "initiating"
    assert call["workflow"] == "appointment_confirmation"
    assert call["purpose"] == "Confirm cardiology appointment"
    assert task["status"] == "in_progress"
    assert task["attempt_count"] == 1
    assert task["call_eligible"] is False

    wait_for(lambda: _call_status(client, call["call_id"]) == "completed")

    detail = client.get("/api/tasks/task_demo_001").json()
    task = detail["task"]
    assert task["status"] == "awaiting_staff_action"
    assert task["latest_outcome"] == "rescheduling_requested"
    assert "day after tomorrow, after 4 PM" in task["next_action"]
    appt = detail["appointment"]
    assert appt["booking_status"] == "scheduled"
    assert appt["scheduled_at"] == appt_before["scheduled_at"]
    assert appt["confirmation_state"] == "rescheduling_requested"

    c = client.get(f"/api/calls/{call['call_id']}").json()["call"]
    assert c["outcome"] == "rescheduling_requested"
    assert c["transcript_is_example"] is True
    assert c["transcript"] and {t["role"] for t in c["transcript"]} <= {"agent", "patient"}
    assert c["summary"]
    assert "unchanged" in c["processing_result"]
    assert c["completed_at"]

    types = [e["event_type"] for e in detail["events"]]
    for expected in ("call_started", "call_completed", "outcome_extracted", "task_status_changed"):
        assert expected in types
    messages = [e["message"] for e in detail["events"]]
    assert "Call completed — rescheduling requested" in messages
    assert "Task moved to Awaiting staff action" in messages


def test_simulated_no_answer_retry_and_max_attempts(client):
    # task_demo_006 has 2 attempts already; scripted outcome is confirmed -> task completes
    r = client.post("/api/tasks/task_demo_006/start-call")
    assert r.status_code == 202
    cid = r.json()["call"]["call_id"]
    wait_for(lambda: _call_status(client, cid) == "completed")
    t = client.get("/api/tasks/task_demo_006").json()
    assert t["task"]["status"] == "completed"
    assert t["task"]["attempt_count"] == 3
    assert t["appointment"]["confirmation_state"] == "confirmed"


def test_reset_restores_seed(client):
    r = client.post("/api/tasks/task_demo_001/start-call")
    cid = r.json()["call"]["call_id"]
    wait_for(lambda: _call_status(client, cid) == "completed")
    assert client.post("/api/demo/reset").json() == {"ok": True}
    assert client.get(f"/api/calls/{cid}").status_code == 404
    assert client.get("/api/tasks/task_demo_001").json()["task"]["status"] == "pending"
