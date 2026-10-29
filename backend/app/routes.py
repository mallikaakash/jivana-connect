"""HTTP routes. All under /api; lists return {"items": [...]}."""

from __future__ import annotations

import json
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .errors import ApiError
from .service import Service

router = APIRouter(prefix="/api")

TaskStatus = Literal["pending", "due", "in_progress", "awaiting_staff_action", "completed", "cancelled", "failed"]
TaskType = Literal["appointment_confirmation", "test_report_reminder", "post_procedure_checkin",
                   "clinician_task_reminder", "callback_request"]
Priority = Literal["low", "normal", "high", "urgent"]
CallStatus = Literal["queued", "initiating", "in_progress", "completed", "no_answer", "failed", "cancelled"]
EscalationStatus = Literal["open", "acknowledged", "assigned", "resolved"]
AttentionStatus = Literal["ok", "needs_attention", "urgent"]


class EscalationPatch(BaseModel):
    action: Literal["acknowledge", "assign", "add_note", "resolve"]
    assigned_to: Optional[str] = None
    note: Optional[str] = None
    author: Optional[str] = None


def svc(request: Request) -> Service:
    return request.app.state.service


def _blank(value: str | None) -> str | None:
    return value if value else None


@router.get("/health")
def health(request: Request):
    s = svc(request)
    return {"ok": True, "voice_mode": "live" if s.settings.live_voice else "simulated", "storage": s.store.mongo_status}


@router.get("/meta")
def meta(request: Request):
    return svc(request).meta()


@router.get("/dashboard/summary")
def dashboard(request: Request):
    return svc(request).dashboard()


@router.get("/patients")
def list_patients(request: Request, q: Optional[str] = None,
                  attention_status: Optional[AttentionStatus | Literal[""]] = None):
    return {"items": svc(request).list_patients(_blank(q), _blank(attention_status))}


@router.get("/patients/{patient_id}")
def get_patient(request: Request, patient_id: str):
    return svc(request).patient_detail(patient_id)


@router.get("/appointments")
def list_appointments(request: Request):
    return {"items": svc(request).list_appointments()}


@router.get("/tasks")
def list_tasks(
    request: Request,
    status: Optional[TaskStatus | Literal[""]] = None,
    task_type: Optional[TaskType | Literal[""]] = None,
    priority: Optional[Priority | Literal[""]] = None,
    patient_id: Optional[str] = None,
    due: Optional[Literal["overdue", "today", "upcoming", ""]] = None,
):
    return {"items": svc(request).list_tasks(_blank(status), _blank(task_type), _blank(priority),
                                             _blank(patient_id), _blank(due))}


@router.get("/tasks/{task_id}")
def get_task(request: Request, task_id: str):
    return svc(request).task_detail(task_id)


@router.post("/tasks/{task_id}/start-call", status_code=202)
async def start_call(request: Request, task_id: str):
    return await svc(request).start_call(task_id)


@router.get("/calls")
def list_calls(request: Request, status: Optional[CallStatus | Literal[""]] = None, task_id: Optional[str] = None):
    return {"items": svc(request).list_calls(_blank(status), _blank(task_id))}


@router.get("/calls/{call_id}")
def get_call(request: Request, call_id: str):
    return svc(request).call_detail(call_id)


@router.get("/escalations")
def list_escalations(request: Request, status: Optional[EscalationStatus | Literal[""]] = None):
    return {"items": svc(request).list_escalations(_blank(status))}


@router.get("/escalations/{escalation_id}")
def get_escalation(request: Request, escalation_id: str):
    return svc(request).escalation_detail(escalation_id)


@router.patch("/escalations/{escalation_id}")
def patch_escalation(request: Request, escalation_id: str, body: EscalationPatch):
    return svc(request).update_escalation(escalation_id, body.action, body.assigned_to, body.note, body.author)


@router.post("/webhooks/bolna")
async def bolna_webhook(request: Request, token: Optional[str] = Query(default=None)):
    s = svc(request)
    secret = s.settings.bolna_webhook_secret
    if secret and not (token and secrets.compare_digest(token, secret)):
        raise ApiError(401, "unauthorized", "Invalid or missing webhook token.", False)
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        raise ApiError(400, "bad_request", "Webhook body must be JSON.", False)
    if isinstance(payload, list):  # tolerate a batched delivery
        results = [s.ingest_execution(p) for p in payload if isinstance(p, dict)]
        return JSONResponse({"ok": True, "results": results})
    if not isinstance(payload, dict):
        raise ApiError(400, "bad_request", "Webhook body must be a JSON object.", False)
    return s.ingest_execution(payload, actor="bolna_webhook", source="webhook")


@router.post("/demo/reset")
def demo_reset(request: Request):
    svc(request).reseed()
    return {"ok": True}
