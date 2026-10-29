def _patch(client, body, esc="esc_demo_001"):
    return client.patch(f"/api/escalations/{esc}", json=body)


def test_escalation_transitions(client):
    r = _patch(client, {"action": "acknowledge"})
    assert r.status_code == 200
    assert r.json()["escalation"]["status"] == "acknowledged"

    r = _patch(client, {"action": "acknowledge"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "invalid_transition"
    assert r.json()["detail"]["retry_allowed"] is False

    r = _patch(client, {"action": "assign"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "validation_error"

    r = _patch(client, {"action": "assign", "assigned_to": "Nurse Priya (demo)"})
    assert r.json()["escalation"]["status"] == "assigned"
    assert r.json()["escalation"]["assigned_to"] == "Nurse Priya (demo)"

    r = _patch(client, {"action": "add_note", "note": "Called patient, advised visit."})
    notes = r.json()["escalation"]["notes"]
    assert len(notes) == 1 and notes[0]["author"] == "Demo staff" and notes[0]["note_id"]

    r = _patch(client, {"action": "add_note"})
    assert r.status_code == 422

    r = _patch(client, {"action": "resolve", "author": "Dr. Rao"})
    assert r.json()["escalation"]["status"] == "resolved"

    assert _patch(client, {"action": "resolve"}).status_code == 409
    assert _patch(client, {"action": "assign", "assigned_to": "X"}).status_code == 409

    detail = client.get("/api/escalations/esc_demo_001").json()
    types = [e["event_type"] for e in detail["events"]]
    assert types.count("escalation_updated") == 3
    assert "staff_action_recorded" in types
    assert detail["task"]["status"] == "awaiting_staff_action"  # staff resolves tasks separately

    # resolved escalation drops patient out of "urgent"
    p = client.get("/api/patients/patient_demo_004").json()["patient"]
    assert p["attention_status"] == "needs_attention"


def test_invalid_action_and_unknown_escalation(client):
    r = _patch(client, {"action": "delete"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "validation_error"
    r = _patch(client, {"action": "acknowledge"}, esc="esc_nope")
    assert r.status_code == 404


def test_escalation_list_unresolved_first(client):
    _patch(client, {"action": "resolve"}, esc="esc_demo_002")
    items = client.get("/api/escalations").json()["items"]
    assert [e["status"] == "resolved" for e in items] == sorted(e["status"] == "resolved" for e in items)
    assert all("patient_name" in e for e in items)
    only_open = client.get("/api/escalations", params={"status": "open"}).json()["items"]
    assert [e["escalation_id"] for e in only_open] == ["esc_demo_001"]
