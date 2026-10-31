"""HTTP routes. All under /api; lists return {"items": [...]}."""

from __future__ import annotations

import json
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .clinic_auth import authorize_clinic_request
from .config import Settings
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


ResolutionType = Literal["called_patient", "advised_come_in", "not_clinical", "referred_elsewhere", "admin_handled"]


class EscalationPatch(BaseModel):
    action: Literal["acknowledge", "assign", "add_note", "resolve"]
    assigned_to: Optional[str] = None
    note: Optional[str] = None
    author: Optional[str] = None
    resolution_type: Optional[ResolutionType] = None


class CreateAppointmentBody(BaseModel):
    patient_id: str
    scheduled_at: str
    department: Optional[str] = None
    clinician: Optional[str] = None
    spawn_confirmation_task: bool = True


class BatchPreviewBody(BaseModel):
    task_ids: list[str]


class BatchCreateBody(BaseModel):
    task_ids: list[str]
    title: Optional[str] = None


class BatchScheduleBody(BaseModel):
    scheduled_at: str


class CreatePatientBody(BaseModel):
    display_name: str
    phone_e164: str
    language: Optional[Literal["hi", "en", "hinglish"]] = "hinglish"
    contact_permitted: bool = True
    chart_number: Optional[str] = None
    age: Optional[int] = None


class UpdatePatientBody(BaseModel):
    display_name: Optional[str] = None
    phone_e164: Optional[str] = None
    language: Optional[Literal["hi", "en", "hinglish"]] = None
    contact_permitted: Optional[bool] = None
    chart_number: Optional[str] = None
    age: Optional[int] = None


class UpdateAppointmentBody(BaseModel):
    scheduled_at: Optional[str] = None
    department: Optional[str] = None
    clinician: Optional[str] = None
    booking_status: Optional[Literal["scheduled", "cancelled", "completed"]] = None


class StaffCallPatchBody(BaseModel):
    action: Literal["staff_complete"]
    outcome: Optional[str] = None
    summary: Optional[str] = None
    note: Optional[str] = None
    author: Optional[str] = None


class CreateTaskBody(BaseModel):
    patient_id: str
    task_type: TaskType
    title: str
    purpose: str
    call_context: str
    due_at: str
    department: Optional[str] = None
    priority: Optional[Priority] = "normal"
    appointment_scheduled_at: Optional[str] = None
    appointment_clinician: Optional[str] = None


def svc(request: Request) -> Service:
    return request.app.state.service


def settings(request: Request) -> Settings:
    return request.app.state.settings


def require_clinic_write(request: Request) -> None:
    authorize_clinic_request(request, request.app.state.settings)


ClinicWrite = Depends(require_clinic_write)


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


@router.post("/patients", status_code=201)
def create_patient(request: Request, body: CreatePatientBody, _: None = ClinicWrite):
    return svc(request).create_patient(
        body.display_name,
        body.phone_e164,
        body.language or "hinglish",
        body.contact_permitted,
        body.chart_number,
        body.age,
    )


@router.get("/patients/{patient_id}")
def get_patient(request: Request, patient_id: str):
    return svc(request).patient_detail(patient_id)


@router.patch("/patients/{patient_id}")
def update_patient(request: Request, patient_id: str, body: UpdatePatientBody, _: None = ClinicWrite):
    return svc(request).update_patient(patient_id, body.model_dump(exclude_unset=True))


@router.get("/appointments")
def list_appointments(request: Request):
    return {"items": svc(request).list_appointments()}


@router.post("/appointments", status_code=201)
def create_appointment(request: Request, body: CreateAppointmentBody, _: None = ClinicWrite):
    return svc(request).create_appointment(
        body.patient_id,
        body.scheduled_at,
        body.department,
        body.clinician,
        spawn_confirmation_task=body.spawn_confirmation_task,
    )


@router.patch("/appointments/{appointment_id}")
def update_appointment(request: Request, appointment_id: str, body: UpdateAppointmentBody, _: None = ClinicWrite):
    return svc(request).update_appointment(appointment_id, body.model_dump(exclude_unset=True))


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


@router.post("/tasks", status_code=201)
def create_task(request: Request, body: CreateTaskBody, _: None = ClinicWrite):
    return svc(request).create_task(
        body.patient_id,
        body.task_type,
        body.title,
        body.purpose,
        body.call_context,
        body.due_at,
        department=body.department,
        priority=body.priority or "normal",
        appointment_scheduled_at=body.appointment_scheduled_at,
        appointment_clinician=body.appointment_clinician,
    )


@router.post("/tasks/{task_id}/start-call", status_code=202)
async def start_call(request: Request, task_id: str):
    return await svc(request).start_call(task_id)


@router.post("/tasks/{task_id}/cancel")
def cancel_task(request: Request, task_id: str, _: None = ClinicWrite):
    return svc(request).cancel_task(task_id)


@router.get("/calls")
def list_calls(
    request: Request,
    status: Optional[CallStatus | Literal[""]] = None,
    task_id: Optional[str] = None,
    flagged: Optional[Literal["clinical"]] = None,
):
    return {"items": svc(request).list_calls(_blank(status), _blank(task_id), flagged)}


@router.get("/calls/{call_id}")
def get_call(request: Request, call_id: str):
    return svc(request).call_detail(call_id)


@router.patch("/calls/{call_id}")
def patch_call(request: Request, call_id: str, body: StaffCallPatchBody, _: None = ClinicWrite):
    if body.action != "staff_complete":
        raise ApiError(400, "bad_request", "Unsupported call action.", False)
    return svc(request).staff_complete_call(
        call_id, body.outcome, body.summary, body.note, body.author,
    )


@router.post("/calls/{call_id}/reinfer-outcome")
def reinfer_call_outcome(request: Request, call_id: str, _: None = ClinicWrite):
    return svc(request).reinfer_call_outcome(call_id)


@router.post("/calls/{call_id}/resync-bolna")
async def resync_call_from_bolna(
    request: Request,
    call_id: str,
    execution_id: Optional[str] = Query(default=None),
    _: None = ClinicWrite,
):
    return await svc(request).resync_call_from_bolna(call_id, execution_id=execution_id)


@router.get("/escalations")
def list_escalations(request: Request, status: Optional[EscalationStatus | Literal[""]] = None):
    return {"items": svc(request).list_escalations(_blank(status))}


@router.get("/escalations/{escalation_id}")
def get_escalation(request: Request, escalation_id: str):
    return svc(request).escalation_detail(escalation_id)


@router.patch("/escalations/{escalation_id}")
def patch_escalation(request: Request, escalation_id: str, body: EscalationPatch):
    return svc(request).update_escalation(
        escalation_id, body.action, body.assigned_to, body.note, body.author, body.resolution_type,
    )


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


@router.post("/clinic/reset-workspace")
def clinic_reset_workspace(request: Request, _: None = ClinicWrite):
    return svc(request).clear_clinic_workspace()


@router.post("/clinic/demo-seed")
def clinic_demo_seed(request: Request):
    counts = svc(request).seed_clinic_demo()
    return {"ok": True, "counts": counts}


@router.get("/clinic/daily-confirmation-batch/preview")
def preview_daily_confirmation_batch(request: Request):
    return svc(request).preview_daily_confirmation_batch()


@router.post("/clinic/daily-confirmation-batch/run")
async def run_daily_confirmation_batch(request: Request):
    return await svc(request).run_daily_confirmation_batch(trigger="manual")


@router.post("/clinic/cron/daily-confirmation-batch")
async def cron_daily_confirmation_batch(
    request: Request,
    x_clinic_cron_secret: str | None = Header(default=None, alias="X-Clinic-Cron-Secret"),
):
    settings: Settings = request.app.state.settings
    secret = settings.clinic_cron_secret
    if not secret or not x_clinic_cron_secret or not secrets.compare_digest(x_clinic_cron_secret, secret):
        raise ApiError(401, "unauthorized", "Invalid cron secret.", False)
    return await svc(request).run_daily_confirmation_batch(trigger="cron")


@router.post("/batches/preview")
def batch_preview(request: Request, body: BatchPreviewBody):
    return svc(request).batch_preview(body.task_ids)


@router.post("/batches")
async def create_batch(request: Request, body: BatchCreateBody):
    return await svc(request).create_batch_from_tasks(body.task_ids, body.title)


@router.post("/batches/{batch_id}/schedule")
async def schedule_batch(request: Request, batch_id: str, body: BatchScheduleBody):
    return await svc(request).schedule_app_batch(batch_id, body.scheduled_at)


@router.post("/batches/{batch_id}/stop")
async def stop_batch(request: Request, batch_id: str):
    return await svc(request).stop_app_batch(batch_id)


@router.get("/batches")
def list_batches(request: Request):
    return {"items": svc(request).list_batches()}


@router.get("/batches/{batch_id}")
def get_batch(request: Request, batch_id: str):
    return svc(request).batch_detail(batch_id)


@router.get("/reports/{report_kind}")
def export_report(request: Request, report_kind: Literal["patients", "calls", "tasks"]):
    from fastapi.responses import PlainTextResponse

    csv_body = svc(request).export_csv(report_kind)
    filename = f"jivana-{report_kind}.csv"
    return PlainTextResponse(
        csv_body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
