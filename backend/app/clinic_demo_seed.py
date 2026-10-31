"""Load shared/seed.json into clinic Mongo as synthetic-but-realistic demo records."""

from __future__ import annotations

from pathlib import Path

from .seed import load_seed

# Fictitious E.164 numbers — do not dial in production without override; seed calls are historical (is_live=false).
_DEMO_PHONES: dict[str, str] = {
    "patient_demo_001": "+919999990101",
    "patient_demo_002": "+919999990102",
    "patient_demo_003": "+919999990103",
    "patient_demo_004": "+919999990104",
    "patient_demo_005": "+919999990105",
    "patient_demo_006": "+919999990106",
    "patient_demo_007": "+919999990107",
    "patient_demo_008": "+919999990108",
}


def build_clinic_demo_seed(seed_path: Path) -> dict[str, list[dict]]:
    seed = load_seed(seed_path)
    has_cb = {e["entity_id"] for e in seed["events"] if e["event_type"] == "callback_task_created"}
    created = [
        {
            "event_id": f"evt_seed_created_{i + 1:03d}",
            "entity_type": "task",
            "entity_id": t["task_id"],
            "patient_id": t["patient_id"],
            "event_type": "task_created",
            "message": f"Task created — {t['title']}",
            "actor": "system",
            "timestamp": t["created_at"],
        }
        for i, t in enumerate(x for x in seed["tasks"] if x["task_id"] not in has_cb)
    ]
    seed["events"] = created + seed["events"]

    for patient in seed["patients"]:
        pid = patient["patient_id"]
        patient["phone_e164"] = _DEMO_PHONES.get(pid, "+919999990199")
        patient.pop("contact_ref", None)

    return seed
