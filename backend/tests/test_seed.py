import json

from app import timeutil
from app.config import DEFAULT_SEED_PATH
from app.seed import load_seed, resolve_rel

from .conftest import FROZEN


def test_rel_day_and_minute_resolution():
    assert resolve_rel("rel:1d@10:30", FROZEN) == "2026-10-31T10:30:00+05:30"
    assert resolve_rel("rel:-2d@09:00", FROZEN) == "2026-10-28T09:00:00+05:30"
    assert resolve_rel("rel:0d@17:00", FROZEN) == "2026-10-30T17:00:00+05:30"
    assert resolve_rel("rel:45m", FROZEN) == "2026-10-30T11:45:00+05:30"
    assert resolve_rel("rel:-90m", FROZEN) == "2026-10-30T09:30:00+05:30"
    assert resolve_rel("rel:+30m", FROZEN) == "2026-10-30T11:30:00+05:30"


def test_seed_has_no_unresolved_rel_and_uses_ist_offset():
    data = load_seed(DEFAULT_SEED_PATH, FROZEN)
    blob = json.dumps(data)
    assert "rel:" not in blob
    for task in data["tasks"]:
        assert task["due_at"].endswith("+05:30")
        assert timeutil.parse(task["due_at"]) is not None
    assert len(data["patients"]) == 8


def test_api_strips_seed_only_fields(client):
    task = client.get("/api/tasks/task_demo_001").json()["task"]
    assert "demo_outcome" not in task and "demo_extracted_fields" not in task
    items = client.get("/api/tasks").json()["items"]
    assert all("demo_outcome" not in t and "_seq" not in t for t in items)
    events = client.get("/api/dashboard/summary").json()["recent_activity"]
    assert all(not any(k.startswith("_") for k in e) for e in events)


def test_error_envelope_for_unknown_route_and_validation(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert r.json() == {"detail": {"code": "not_found", "message": r.json()["detail"]["message"], "retry_allowed": False}}
    r = client.get("/api/tasks", params={"status": "bogus"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "validation_error"
