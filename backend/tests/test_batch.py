import pytest

from app.bolna import BolnaError


class FakeBatchClient:
    def __init__(self):
        self.created = []
        self.scheduled = []
        self.stopped = []

    async def create_batch(self, recipients, *, webhook_url=None):
        self.created.append({"recipients": recipients, "webhook_url": webhook_url})
        return {"batch_id": "bolna-batch-1", "raw": {"status": "idle"}}

    async def schedule_batch(self, batch_id, scheduled_at):
        self.scheduled.append((batch_id, scheduled_at))
        return {"ok": True}

    async def stop_batch(self, batch_id):
        self.stopped.append(batch_id)
        return {"ok": True}


@pytest.fixture
def batch_live_client(live_client):
    fake = FakeBatchClient()
    live_client.app.state.service.bolna_batch = fake
    live_client.fake_batch = fake
    return live_client


def test_batch_preview_skips_ineligible(batch_live_client):
    r = batch_live_client.post("/api/batches/preview", json={"task_ids": ["task_demo_002", "not_a_task"]})
    assert r.status_code == 200
    body = r.json()
    assert body["recipient_count"] == 0
    assert any(s["task_id"] == "task_demo_002" for s in body["skipped"])
    assert any(s["task_id"] == "not_a_task" for s in body["skipped"])


def test_batch_preview_includes_eligible(batch_live_client):
    r = batch_live_client.post("/api/batches/preview", json={"task_ids": ["task_demo_001"]})
    assert r.status_code == 200
    body = r.json()
    assert body["recipient_count"] == 1
    assert body["included"][0]["task_id"] == "task_demo_001"


def test_create_batch_calls_bolna(batch_live_client):
    r = batch_live_client.post("/api/batches", json={"task_ids": ["task_demo_001"], "title": "Test batch"})
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["batch"]["bolna_batch_id"] == "bolna-batch-1"
    assert len(body["members"]) == 1
    assert len(batch_live_client.fake_batch.created) == 1
    ud = batch_live_client.fake_batch.created[0]["recipients"][0]
    assert ud["call_ref"]
    assert ud["patient_name"] == "Asha Verma"


def test_create_batch_empty_rejected(batch_live_client):
    r = batch_live_client.post("/api/batches", json={"task_ids": ["task_demo_002"]})
    assert r.status_code == 422


def test_schedule_batch(batch_live_client):
    create = batch_live_client.post("/api/batches", json={"task_ids": ["task_demo_001"]})
    batch_id = create.json()["batch"]["batch_id"]
    r = batch_live_client.post(
        f"/api/batches/{batch_id}/schedule",
        json={"scheduled_at": "2026-10-31T10:00:00+05:30"},
    )
    assert r.status_code == 200
    assert r.json()["batch"]["status"] == "scheduled"
    assert batch_live_client.fake_batch.scheduled


def test_jiya_webhook_maps_to_contract(live_client):
    call = live_client.post("/api/tasks/task_demo_001/start-call")
    assert call.status_code == 202
    call_id = call.json()["call"]["call_id"]
    provider_id = call.json()["call"]["provider_call_id"]
    payload = {
        "id": provider_id,
        "status": "completed",
        "extracted_data": {
            "Dental Follow-up Outcome": {
                "Call Outcome": {"objective": "reschedule_requested"},
                "Preferred Callback Time": {"subjective": "Next week mornings"},
                "Callback Requested": {"objective": "no"},
            }
        },
    }
    r = live_client.post("/api/webhooks/bolna", json=payload)
    assert r.status_code == 200
    detail = live_client.get(f"/api/calls/{call_id}").json()["call"]
    assert detail["outcome"] == "rescheduling_requested"
    assert detail["extracted_fields"]["jiya_call_outcome"] == "reschedule_requested"
