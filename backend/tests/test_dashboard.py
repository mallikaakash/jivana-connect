def test_dashboard_counts(client):
    d = client.get("/api/dashboard/summary").json()
    assert d["patients_count"] == 8
    # pending/due with due_at <= end of today: task_001 (+45m), task_006 (yesterday), task_008 (+4h), task_009 (-3h)
    assert d["followups_due_count"] == 4
    # completed calls in the last 7 days (no_answer excluded)
    assert d["calls_completed_count"] == 5
    assert d["open_escalations_count"] == 2
    assert len(d["recent_calls"]) == 6
    assert len(d["recent_activity"]) == 10
    assert all("patient_name" in c for c in d["recent_calls"])


def test_dashboard_needs_attention_kinds_and_order(client):
    items = client.get("/api/dashboard/summary").json()["needs_attention"]
    by_task = {i["task_id"]: i["kind"] for i in items}
    assert by_task["task_demo_002"] == "rescheduling_request"
    assert by_task["task_demo_004"] == "patient_concern"
    assert by_task["task_demo_006"] == "overdue_task"
    assert by_task["task_demo_003"] == "awaiting_staff_action"
    assert by_task["task_demo_007"] == "callback_request"
    assert by_task["task_demo_010"] == "patient_concern"
    assert by_task["task_demo_009"] == "overdue_task"
    assert len(items) == 7  # one entry per open task needing attention
    assert "task_demo_001" not in by_task  # not yet overdue
    ranks = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    assert [ranks[i["priority"]] for i in items] == sorted(ranks[i["priority"]] for i in items)
    assert items[0]["task_id"] == "task_demo_002"
    assert items[0]["escalation_id"] is None
    concern = next(i for i in items if i["task_id"] == "task_demo_004")
    assert concern["escalation_id"] == "esc_demo_001"
    callback = next(i for i in items if i["task_id"] == "task_demo_007")
    assert callback["reason"] == "Callback window: Tomorrow, 4–6 PM"


def test_needs_attention_concern_wins_over_rescheduling_and_drops_when_resolved(client):
    client.patch("/api/escalations/esc_demo_001", json={"action": "resolve"})
    items = {i["task_id"]: i for i in client.get("/api/dashboard/summary").json()["needs_attention"]}
    # resolved escalation -> task_004 falls back to awaiting_staff_action, no escalation link
    assert items["task_demo_004"]["kind"] == "awaiting_staff_action"
    assert items["task_demo_004"]["escalation_id"] is None


def test_seed_adds_task_created_events(client):
    events = client.get("/api/tasks/task_demo_001").json()["events"]
    created = [e for e in events if e["event_type"] == "task_created"]
    assert len(created) == 1
    assert created[0]["message"] == "Task created — Confirm cardiology appointment"
    assert created[0]["actor"] == "system"
    assert created[0]["timestamp"] == client.get("/api/tasks/task_demo_001").json()["task"]["created_at"]
    # task_demo_007's creation is already recorded as callback_task_created
    types = [e["event_type"] for e in client.get("/api/tasks/task_demo_007").json()["events"]]
    assert "task_created" not in types and "callback_task_created" in types


def test_followup_queue_sorted(client):
    queue = client.get("/api/dashboard/summary").json()["followup_queue"]
    assert len(queue) <= 6
    assert all(t["status"] in ("pending", "due") for t in queue)
    dues = [t["due_at"] for t in queue]
    assert dues == sorted(dues)


def test_patient_attention_status(client):
    items = {p["patient_id"]: p for p in client.get("/api/patients").json()["items"]}
    assert items["patient_demo_004"]["attention_status"] == "urgent"  # open high escalation
    assert items["patient_demo_002"]["attention_status"] == "needs_attention"
    assert items["patient_demo_005"]["attention_status"] == "ok"
    assert items["patient_demo_007"]["attention_status"] == "needs_attention"  # open callback_request task
    assert "next_appointment_at" in items["patient_demo_001"]
    assert items["patient_demo_001"]["open_followups"] == 2
    q = client.get("/api/patients", params={"q": "asha"}).json()["items"]
    assert [p["patient_id"] for p in q] == ["patient_demo_001"]
    urgent = client.get("/api/patients", params={"attention_status": "urgent"}).json()["items"]
    assert {p["patient_id"] for p in urgent} == {"patient_demo_004"}


def test_task_filters(client):
    overdue = client.get("/api/tasks", params={"due": "overdue"}).json()["items"]
    assert {t["task_id"] for t in overdue} == {"task_demo_006", "task_demo_009"}
    awaiting = client.get("/api/tasks", params={"status": "awaiting_staff_action"}).json()["items"]
    assert all(t["status"] == "awaiting_staff_action" for t in awaiting)
    mine = client.get("/api/tasks", params={"patient_id": "patient_demo_007"}).json()["items"]
    assert {t["task_id"] for t in mine} == {"task_demo_007", "task_demo_008"}
