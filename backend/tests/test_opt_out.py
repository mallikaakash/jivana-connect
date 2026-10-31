def test_opt_out_disables_future_calls(live_client):
    call = live_client.post("/api/tasks/task_demo_001/start-call")
    assert call.status_code == 202
    provider_id = call.json()["call"]["provider_call_id"]
    live_client.post(
        "/api/webhooks/bolna",
        json={
            "id": provider_id,
            "status": "completed",
            "extracted_data": {
                "Dental Follow-up Outcome": {
                    "Opt-out Requested": {"objective": "yes"},
                    "Call Outcome": {"objective": "inconclusive"},
                }
            },
        },
    )
    patient = live_client.get("/api/patients/patient_demo_001").json()["patient"]
    assert patient["contact_permitted"] is False
    assert patient.get("opt_out_at")
    task = live_client.get("/api/tasks/task_demo_001").json()["task"]
    assert task["call_eligible"] is False
