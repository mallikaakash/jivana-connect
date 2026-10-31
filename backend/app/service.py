"""Domain logic: derived fields, serialisation, workflow rules, calls (live + simulated), escalations."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import date, timedelta
from typing import Any

from . import timeutil
from .bolna import TERMINAL, BolnaClient, BolnaError, map_status, normalise_extracted, parse_payload
from .bolna_batch import BolnaBatchClient
from .bolna_mapper import MapperDirectives, prepare_extracted_for_task
from .transcript_inference import conversation_substantive
from .config import Settings
from .errors import ApiError, not_found
from .clinic_demo_seed import build_clinic_demo_seed
from .daily_confirmation import (
    appointment_on_date,
    batch_run_window,
    confirmation_call_moment,
    daily_batch_title,
    parse_batch_time,
    tomorrow_date,
)
from .seed import COLLECTIONS, load_seed
from .simulation import example_transcript, simulated_result
from .store import Store

log = logging.getLogger("jivana.service")

TASK_TYPES = [
    "appointment_confirmation",
    "test_report_reminder",
    "post_procedure_checkin",
    "clinician_task_reminder",
    "callback_request",
]
APPOINTMENT_OUTCOMES = {"confirmed", "rescheduling_requested", "declined", "no_answer", "unable_to_confirm"}
ACTIVE_CALL = {"queued", "initiating", "in_progress"}
TERMINAL_TASK = {"completed", "cancelled", "failed"}
PRIORITY_RANK = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
MAX_ATTEMPTS = 3
SEED_ONLY = {"demo_outcome", "demo_extracted_fields"}
RESOLUTION_TYPES = frozenset({
    "called_patient",
    "advised_come_in",
    "not_clinical",
    "referred_elsewhere",
    "admin_handled",
})
_E164 = re.compile(r"^\+[1-9]\d{1,14}$")
# Live Jiya prompt is dental post-visit; other task types may not extract reliably.
LIVE_JIYA_TASK_TYPES = frozenset({
    "appointment_confirmation",
    "post_procedure_checkin",
    "callback_request",
    "clinician_task_reminder",
})


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def label(value: str | None) -> str:
    """snake_case -> sentence case ('awaiting_staff_action' -> 'Awaiting staff action')."""
    return (value or "").replace("_", " ").capitalize()


def public(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    return {k: v for k, v in doc.items() if not k.startswith("_") and k not in SEED_ONLY}


def _ts(value: str | None):
    return timeutil.parse(value) or timeutil.parse("1970-01-01T00:00:00+05:30")


class Service:
    def __init__(self, settings: Settings, store: Store | None = None):
        self.settings = settings
        self.store = store or Store(settings.mongo_url, settings.mongo_db)
        self.bolna = BolnaClient(settings)
        self.bolna_batch = BolnaBatchClient(settings)
        self._bg: dict[str, asyncio.Task] = {}  # call_id -> simulator / poller task
        self._pollers: set[str] = set()
        self._scheduler: asyncio.Task | None = None

    # ------------------------------------------------------------------ lifecycle
    def startup(self) -> None:
        if self.settings.clinic_mode:
            if not self.settings.mongo_url:
                log.error("JIVANA_MODE=clinic requires MONGO_URL — persistence and real patients are mandatory")
            elif not self.store.load_from_mongo():
                if self.settings.clinic_demo_seed_enabled:
                    log.info("Clinic mode: empty database — loading demo seed for reviewers")
                    self.seed_clinic_demo()
                else:
                    log.info("Clinic mode: empty database (add patients via the app)")
            return
        if not self.store.load_from_mongo():
            self.reseed()

    def seed_clinic_demo(self) -> dict[str, int]:
        if not self.settings.clinic_mode:
            raise ApiError(403, "forbidden", "Clinic demo seed is only available in clinic mode.", False)
        if not self.settings.clinic_demo_seed_enabled:
            raise ApiError(403, "forbidden", "Clinic demo seed is disabled on this server.", False)
        self.cancel_background()
        seed = build_clinic_demo_seed(self.settings.seed_path)
        self.store.replace_all(seed)
        counts = {name: len(seed.get(name, [])) for name in ("patients", "tasks", "calls", "escalations")}
        log.info("Clinic demo seed loaded: %s", counts)
        return counts

    def clear_clinic_workspace(self) -> dict:
        """Remove all patients, tasks, calls, and related records (clinic QA only)."""
        if not self.settings.clinic_mode:
            raise ApiError(403, "forbidden", "Workspace reset is only available in clinic mode.", False)
        if not self.settings.clinic_allow_workspace_reset:
            raise ApiError(
                403,
                "forbidden",
                "Workspace reset is disabled. Set CLINIC_ALLOW_WORKSPACE_RESET=true on the server.",
                False,
            )
        self.cancel_background()
        empty = {name: [] for name in COLLECTIONS}
        self.store.replace_all(empty)
        log.warning("Clinic workspace cleared (all Mongo collections emptied)")
        return {"ok": True, "cleared": True, "patients": 0, "tasks": 0, "calls": 0}

    def reseed(self) -> None:
        if self.settings.clinic_mode:
            raise ApiError(403, "forbidden", "Demo reset is disabled in clinic mode.", False)
        self.cancel_background()
        seed = load_seed(self.settings.seed_path)
        # Seed has no task_created events; add one per task (except tasks whose creation is already
        # recorded as callback_task_created) so every task's history has a starting point.
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
        self.store.replace_all(seed)

    def cancel_background(self) -> None:
        for task in list(self._bg.values()):
            task.cancel()
        self._bg.clear()
        self._pollers.clear()
        if self._scheduler is not None:
            self._scheduler.cancel()
            self._scheduler = None

    def start_clinic_scheduler(self) -> None:
        if not self.settings.clinic_mode:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._scheduler is not None:
            return
        self._scheduler = loop.create_task(self._clinic_scheduler_loop())

    async def _clinic_scheduler_loop(self) -> None:
        interval = 60.0 if self.settings.clinic_daily_confirmation_batch_enabled else max(
            30.0, float(self.settings.auto_dial_interval_seconds)
        )
        batch_time = parse_batch_time(self.settings.clinic_confirmation_batch_time)
        try:
            while True:
                await asyncio.sleep(interval)
                self.recover_stuck_calls()
                if self.settings.clinic_daily_confirmation_batch_enabled and self.settings.live_voice:
                    if batch_run_window(timeutil.now(), batch_time):
                        try:
                            await self.run_daily_confirmation_batch(trigger="scheduler")
                        except ApiError as exc:
                            log.info("Daily confirmation batch skipped: %s", exc.message)
                        except Exception as exc:  # pragma: no cover
                            log.warning("Daily confirmation batch error: %s", exc)
                elif self.settings.auto_dial_enabled and self.settings.live_voice:
                    if not any(c["status"] in ACTIVE_CALL for c in self.store.all("calls")):
                        task_id = self._pick_auto_dial_task()
                        if task_id:
                            try:
                                await self.start_call(task_id)
                                log.info("Auto-dial started call for task %s", task_id)
                            except ApiError as exc:
                                log.info("Auto-dial skipped task %s: %s", task_id, exc.message)
                            except Exception as exc:  # pragma: no cover
                                log.warning("Auto-dial error for task %s: %s", task_id, exc)
        except asyncio.CancelledError:
            return

    def _pick_auto_dial_task(self) -> str | None:
        now = timeutil.now()
        eod = timeutil.end_of_today()
        candidates = []
        for t in self.store.all("tasks"):
            if t["status"] not in ("pending", "due"):
                continue
            due_at = _ts(t["due_at"])
            if due_at > eod:
                continue
            eligible, _ = self.eligibility(t)
            if eligible:
                candidates.append(t)
        if not candidates:
            return None
        candidates.sort(key=lambda t: (_ts(t["due_at"]), t["task_id"]))
        return candidates[0]["task_id"]

    def recover_stuck_calls(self) -> int:
        """Mark long-running calls failed and restore tasks; returns count recovered."""
        threshold = timedelta(minutes=float(self.settings.stuck_call_minutes))
        now = timeutil.now()
        count = 0
        for call in list(self.store.all("calls")):
            if call["status"] not in ACTIVE_CALL or call.get("_processed"):
                continue
            started = _ts(call.get("started_at") or call.get("created_at"))
            if now - started < threshold:
                continue
            self._timeout_stuck_call(
                call,
                "Call timed out without a final outcome — check Bolna and webhook connectivity.",
            )
            count += 1
        return count

    def _timeout_stuck_call(self, call: dict, message: str) -> None:
        if call.get("_processed"):
            return
        task = self.store.get("tasks", call.get("task_id"))
        call["status"] = "failed"
        call["completed_at"] = timeutil.now_iso()
        call["processing_result"] = message
        call["_processed"] = True
        self.store.save("calls", call)
        pid = call.get("patient_id")
        self.add_event("call", call["call_id"], pid, "call_failed", message, "system")
        if task:
            task["attempt_count"] = max(0, task.get("attempt_count", 1) - 1)
            if task["attempt_count"] < MAX_ATTEMPTS:
                task["status"] = "due"
                task["next_action"] = "Retry call — previous attempt timed out"
            else:
                task["status"] = "awaiting_staff_action"
                task["next_action"] = "Call failed repeatedly — contact patient manually"
            task["updated_at"] = timeutil.now_iso()
            self.store.save("tasks", task)
            self.add_event("task", task["task_id"], pid, "task_status_changed", task["next_action"], "system")

    def system_alerts(self) -> list[dict]:
        alerts: list[dict] = []
        # Clinic staff dashboard: no internal ops banners (stuck call IDs, webhook config hints).
        if self.settings.clinic_mode:
            return alerts
        threshold = timedelta(minutes=float(self.settings.stuck_call_minutes))
        now = timeutil.now()
        for call in self.store.all("calls"):
            if call["status"] not in ACTIVE_CALL:
                continue
            started = _ts(call.get("started_at") or call.get("created_at"))
            if now - started >= threshold:
                alerts.append({
                    "severity": "high",
                    "kind": "stuck_call",
                    "message": f"Call {call['call_id']} has been {label(call['status'])} for over {int(self.settings.stuck_call_minutes)} minutes.",
                    "entity_type": "call",
                    "entity_id": call["call_id"],
                })
        return alerts

    def _spawn(self, call_id: str, coro) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._bg[call_id] = task

        def _done(t: asyncio.Task, cid=call_id):
            if self._bg.get(cid) is t:
                self._bg.pop(cid, None)
            self._pollers.discard(cid)
            if not t.cancelled() and t.exception():
                log.error("Background job for %s failed: %r", cid, t.exception())

        task.add_done_callback(_done)

    # ------------------------------------------------------------------ lookups
    def _get(self, collection: str, ident: str, kind: str) -> dict:
        doc = self.store.get(collection, ident)
        if doc is None:
            raise not_found(kind, ident)
        return doc

    def patient_name(self, patient_id: str | None) -> str:
        p = self.store.get("patients", patient_id)
        return p["display_name"] if p else "Unknown patient"

    # ------------------------------------------------------------------ derived fields
    @staticmethod
    def is_overdue(t: dict, now=None) -> bool:
        return t["status"] in ("pending", "due") and _ts(t["due_at"]) < (now or timeutil.now())

    def attention_status(self, patient_id: str) -> str:
        escalations = [e for e in self.store.find("escalations", patient_id=patient_id) if e["status"] != "resolved"]
        tasks = [t for t in self.store.find("tasks", patient_id=patient_id) if t["status"] not in TERMINAL_TASK]
        if any(e["priority"] in ("high", "urgent") for e in escalations) or any(t["priority"] == "urgent" for t in tasks):
            return "urgent"
        now = timeutil.now()
        if escalations or any(
            t["status"] == "awaiting_staff_action" or self.is_overdue(t, now) or t["task_type"] == "callback_request"
            for t in tasks
        ):
            return "needs_attention"
        return "ok"

    def eligibility(self, task: dict) -> tuple[bool, str | None]:
        active = any(c["status"] in ACTIVE_CALL for c in self.store.find("calls", task_id=task["task_id"]))
        status = task["status"]
        if active or status == "in_progress":
            return False, "A call is already in progress for this task"
        if status not in ("pending", "due"):
            return False, {
                "awaiting_staff_action": "Task is awaiting staff action",
                "completed": "Task is already completed",
                "cancelled": "Task has been cancelled",
                "failed": "Task has failed and needs staff review",
            }.get(status, "Task is not ready for a call")
        patient = self.store.get("patients", task["patient_id"])
        if not patient or not patient.get("contact_permitted"):
            return False, "Patient has not given call consent"
        if patient.get("opt_out_at"):
            return False, "Patient has opted out of voice contact"
        if patient.get("wrong_number_at"):
            return False, "Marked as wrong number — do not call"
        if not self.settings.clinic_mode and self.settings.live_voice and task["task_type"] not in LIVE_JIYA_TASK_TYPES:
            return False, (
                "Live Jiya is configured for dental follow-up; this task type is not live-eligible "
                "(use simulated voice or a matching task)."
            )
        if self.settings.clinic_mode:
            phone = (patient or {}).get("phone_e164")
            if not phone or not _E164.match(str(phone)):
                return False, "Patient needs a valid mobile number (E.164, e.g. +919876543210) before calling"
        if task.get("attempt_count", 0) >= MAX_ATTEMPTS:
            return False, "Maximum 3 attempts reached"
        return True, None

    # ------------------------------------------------------------------ serialisers
    @staticmethod
    def _mask_phone(e164: str | None) -> str:
        if not e164:
            return "—"
        digits = re.sub(r"\D", "", e164)
        if len(digits) < 4:
            return e164
        return f"{e164[:3]} …{digits[-4:]}"

    def patient_out(self, p: dict) -> dict:
        out = public(p)
        out["attention_status"] = self.attention_status(p["patient_id"])
        if self.settings.clinic_mode and p.get("phone_e164"):
            out["phone_masked"] = self._mask_phone(p["phone_e164"])
        return out

    def _spawned_followup_task_id(self, task: dict) -> str | None:
        sid = task.get("spawned_followup_task_id")
        if sid:
            return sid
        for ot in self.store.find("tasks", patient_id=task["patient_id"]):
            if ot.get("source_task_id") == task["task_id"]:
                return ot["task_id"]
            if task.get("latest_outcome") == "callback_requested" and ot.get("task_type") == "callback_request":
                purpose = ot.get("purpose") or ""
                if f"(raised during: {task.get('title')})" in purpose:
                    return ot["task_id"]
        return None

    def task_out(self, t: dict, with_name: bool = False) -> dict:
        out = public(t)
        eligible, reason = self.eligibility(t)
        out["call_eligible"] = eligible
        out["call_ineligible_reason"] = reason
        if with_name:
            out["patient_name"] = self.patient_name(t["patient_id"])
        if t.get("latest_outcome") == "callback_requested" and not t.get("escalation_id"):
            sid = self._spawned_followup_task_id(t)
            if sid:
                out["spawned_followup_task_id"] = sid
                if t.get("status") == "completed" and (t.get("next_action") or "").strip() == "No action needed":
                    spawned = self.store.get("tasks", sid)
                    if spawned:
                        out["next_action"] = f"Desk follow-up: {spawned['title']}"
        return out

    def named(self, doc: dict) -> dict:
        out = public(doc)
        out["patient_name"] = self.patient_name(doc["patient_id"])
        return out

    def events_for(self, entity_ids: set[str]) -> list[dict]:
        evts = [e for e in self.store.all("events") if e["entity_id"] in entity_ids]
        return [public(e) for e in self._sort_events(evts)]

    @staticmethod
    def _sort_events(evts: list[dict]) -> list[dict]:
        return sorted(evts, key=lambda e: (_ts(e["timestamp"]), e.get("_seq", 0)), reverse=True)

    @staticmethod
    def _calls_newest(calls: list[dict]) -> list[dict]:
        return sorted(calls, key=lambda c: _ts(c.get("created_at")), reverse=True)

    # ------------------------------------------------------------------ events
    def add_event(self, entity_type: str, entity_id: str, patient_id: str | None, event_type: str,
                  message: str, actor: str = "system") -> dict:
        evt = {
            "event_id": new_id("evt"),
            "entity_type": entity_type,
            "entity_id": entity_id,
            "patient_id": patient_id,
            "event_type": event_type,
            "message": message,
            "actor": actor,
            "timestamp": timeutil.now_iso(),
        }
        return self.store.save("events", evt)

    def _set_task_status(self, task: dict, status: str, actor: str = "system") -> None:
        if task["status"] == status:
            return
        task["status"] = status
        msg = "Task completed" if status == "completed" else f"Task moved to {label(status)}"
        self.add_event("task", task["task_id"], task["patient_id"], "task_status_changed", msg, actor)

    # ------------------------------------------------------------------ meta
    def meta(self) -> dict:
        live = self.settings.live_voice
        clinic = self.settings.clinic_mode
        return {
            "environment": "clinic" if clinic else "demo",
            "app_mode": "clinic" if clinic else "demo",
            "clinic_name": self.settings.clinic_name if clinic else None,
            "staff_role_default": "doctor" if clinic else None,
            "clinical_lead_label": self.settings.clinic_lead_name if clinic else None,
            "features": {"appointments": True},
            "auth_required": bool(
                clinic and (self.settings.clinic_api_key or self.settings.firebase_project_id)
            ),
            "auth_methods": (
                [
                    m
                    for m, ok in (
                        ("api_key", bool(self.settings.clinic_api_key)),
                        ("firebase", bool(self.settings.firebase_project_id)),
                    )
                    if ok
                ]
                if clinic
                else []
            ),
            "demo_seed_available": bool(clinic and self.settings.clinic_demo_seed_enabled),
            "daily_confirmation_batch": (
                {
                    "enabled": True,
                    "batch_time_ist": self.settings.clinic_confirmation_batch_time,
                    "auto_dial_enabled": bool(self.settings.auto_dial_enabled),
                    "description": (
                        f"Appointment confirmations for tomorrow's visits run as one Bolna batch "
                        f"around {self.settings.clinic_confirmation_batch_time} IST each day."
                    ),
                }
                if clinic and self.settings.clinic_daily_confirmation_batch_enabled
                else None
            ),
            **(
                {
                    "reviewer_sign_in": {
                        "title": "Hackathon & demo reviewers",
                        "detail": (
                            "Google sign-in is optional. Paste the access key below and click Continue "
                            "to explore the clinic dashboard (no Google account needed)."
                        ),
                        "access_key": self.settings.clinic_api_key,
                    }
                }
                if clinic
                and self.settings.clinic_api_key
                and self.settings.clinic_publish_reviewer_key
                else {}
            ),
            "dial_override_active": bool(clinic and self.settings.clinic_dial_override_e164),
            "auto_dial_enabled": bool(clinic and self.settings.auto_dial_enabled),
            "data_mode": "live" if clinic else "seeded",
            "voice_mode": "live" if live else ("unconfigured" if clinic else "simulated"),
            "workflows": list(TASK_TYPES),
            "integrations": [
                {
                    "name": "Bolna (Jiya voice)",
                    "status": "live" if live else "simulated",
                    "detail": (
                        "Outbound calls use each patient's mobile number (E.164)"
                        if clinic and live
                        else "Live Bolna calls to the demo recipient phone; patient data stays synthetic"
                        if live
                        else (
                            "Configure BOLNA_API_KEY and BOLNA_AGENT_ID for live patient calls"
                            if clinic
                            else "Simulated calls — set BOLNA_API_KEY, BOLNA_AGENT_ID and DEMO_CALL_RECIPIENT for live calls"
                        )
                    ),
                },
                {"name": "MongoDB", "status": self.store.mongo_status, "detail": self.store.mongo_detail},
                {"name": "EHR / booking sync", "status": "not_configured",
                 "detail": "Appointments are managed in Jivana; FHIR or calendar sync not connected"},
                {"name": "Lab/report system", "status": "not_configured",
                 "detail": "Test completion is patient-reported; report receipt is tracked by staff"},
            ],
        }

    # ------------------------------------------------------------------ dashboard
    def dashboard(self) -> dict:
        now = timeutil.now()
        eod = timeutil.end_of_today()
        tasks = self.store.all("tasks")
        calls = self.store.all("calls")
        week_ago = now - timedelta(days=7)

        followups_due = [t for t in tasks if t["status"] in ("pending", "due") and _ts(t["due_at"]) <= eod]
        completed_calls = [
            c for c in calls
            if c["status"] == "completed" and _ts(c.get("completed_at") or c.get("created_at")) >= week_ago
        ]
        open_escalations = [e for e in self.store.all("escalations") if e["status"] != "resolved"]

        needs: list[dict] = []
        for t in tasks:
            item = self._needs_attention_item(t, now)
            if item:
                needs.append(item)
        needs.sort(key=lambda i: (PRIORITY_RANK.get(i["priority"], 9), _ts(i["due_at"])))
        clinical_inbox = [i for i in needs if i["audience"] == "clinical"]
        operations_inbox = [i for i in needs if i["audience"] == "operations"]

        queue = sorted((t for t in tasks if t["status"] in ("pending", "due")), key=lambda t: _ts(t["due_at"]))[:6]
        return {
            "patients_count": len(self.store.all("patients")),
            "followups_due_count": len(followups_due),
            "calls_completed_count": len(completed_calls),
            "open_escalations_count": len(open_escalations),
            "needs_attention": needs,
            "clinical_inbox": clinical_inbox,
            "operations_inbox": operations_inbox,
            "recent_calls": [self.named(c) for c in self._calls_newest(calls)[:6]],
            "followup_queue": [self.task_out(t, with_name=True) for t in queue],
            "recent_activity": [public(e) for e in self._sort_events(self.store.all("events"))[:10]],
            "system_alerts": self.system_alerts(),
        }

    @staticmethod
    def _clinical_snippet_for_item(
        kind: str,
        reason: str,
        esc: dict | None,
        next_action: str | None,
    ) -> str | None:
        if esc and esc.get("concern_summary"):
            return esc["concern_summary"]
        na = next_action or ""
        prefix = "Answer patient question: "
        if na.startswith(prefix):
            return na[len(prefix) :].strip() or None
        if kind == "patient_concern":
            return reason
        return None

    @staticmethod
    def _inbox_audience(kind: str, esc: dict | None, next_action: str | None) -> str:
        if kind == "patient_concern":
            return "clinical"
        na = next_action or ""
        if esc or na.startswith("Answer patient question:"):
            return "clinical"
        return "operations"

    def _needs_attention_item(self, t: dict, now) -> dict | None:
        """One entry per open task. Precedence: patient_concern > rescheduling_request >
        callback_request > overdue_task > awaiting_staff_action."""
        if t["status"] in TERMINAL_TASK:
            return None
        esc = self.store.get("escalations", t.get("escalation_id"))
        esc = esc if esc and esc["status"] != "resolved" else None
        priority = t["priority"]
        kind = reason = None
        if esc:
            kind, reason = "patient_concern", esc["concern_summary"]
            if PRIORITY_RANK.get(esc["priority"], 9) < PRIORITY_RANK.get(priority, 9):
                priority = esc["priority"]
        elif t["status"] == "awaiting_staff_action" and t.get("latest_outcome") == "rescheduling_requested":
            kind, reason = "rescheduling_request", t["next_action"]
        elif t["task_type"] == "callback_request":
            kind = "callback_request"
            if t.get("callback_window"):
                reason = f"Confirm appointment slot — {t['callback_window']}"
            else:
                reason = t["next_action"]
        elif self.is_overdue(t, now):
            kind, reason = "overdue_task", f"Overdue — {t['next_action']}"
        elif t["status"] == "awaiting_staff_action":
            kind, reason = "awaiting_staff_action", t["next_action"]
        if not kind:
            return None
        audience = self._inbox_audience(kind, esc, t.get("next_action"))
        clinical_snippet = self._clinical_snippet_for_item(kind, reason, esc, t.get("next_action"))
        return {
            "kind": kind,
            "audience": audience,
            "task_id": t["task_id"],
            "patient_id": t["patient_id"],
            "patient_name": self.patient_name(t["patient_id"]),
            "title": t["title"],
            "reason": reason,
            "clinical_snippet": clinical_snippet,
            "priority": priority,
            "due_at": t["due_at"],
            "escalation_id": esc["escalation_id"] if esc else None,
            "task_type": t["task_type"],
        }

    def cancel_task(self, task_id: str, *, reason: str | None = None) -> dict:
        task = self._get("tasks", task_id, "Task")
        if task["status"] in TERMINAL_TASK:
            raise ApiError(409, "conflict", "Task is already closed.", False)
        for call in self.store.find("calls", task_id=task_id):
            if call["status"] in ("queued", "initiating", "in_progress"):
                raise ApiError(409, "conflict", "Cancel or wait for the active call on this task first.", False)
        note = (reason or "Cancelled by staff").strip()
        task["status"] = "cancelled"
        task["next_action"] = note
        self.store.save("tasks", task)
        self.add_event("task", task_id, task["patient_id"], "task_status_changed", note, "staff")
        return {"task": self.task_out(task)}

    # ------------------------------------------------------------------ patients
    def list_patients(self, q: str | None, attention_status: str | None) -> list[dict]:
        now = timeutil.now()
        items = []
        for p in sorted(self.store.all("patients"), key=lambda p: p["demo_id"]):
            if q:
                needle = q.strip().lower()
                hay = " ".join([p["display_name"], p["demo_id"], p["patient_id"]]).lower()
                if needle not in hay:
                    continue
            out = self.patient_out(p)
            if attention_status and out["attention_status"] != attention_status:
                continue
            pid = p["patient_id"]
            upcoming = [
                a["scheduled_at"] for a in self.store.find("appointments", patient_id=pid)
                if a["booking_status"] == "scheduled" and _ts(a["scheduled_at"]) >= now
            ]
            contacts = [c["started_at"] for c in self.store.find("calls", patient_id=pid) if c.get("started_at")]
            out["next_appointment_at"] = min(upcoming, key=_ts) if upcoming else None
            out["open_followups"] = sum(1 for t in self.store.find("tasks", patient_id=pid) if t["status"] not in TERMINAL_TASK)
            out["last_contact_at"] = max(contacts, key=_ts) if contacts else None
            items.append(out)
        return items

    def patient_detail(self, patient_id: str) -> dict:
        p = self._get("patients", patient_id, "Patient")
        appts = sorted(self.store.find("appointments", patient_id=patient_id), key=lambda a: _ts(a["scheduled_at"]))
        tasks = sorted(self.store.find("tasks", patient_id=patient_id), key=lambda t: _ts(t["due_at"]))
        calls = self._calls_newest(self.store.find("calls", patient_id=patient_id))
        escs = sorted(self.store.find("escalations", patient_id=patient_id), key=lambda e: _ts(e["created_at"]), reverse=True)
        events = [public(e) for e in self._sort_events(self.store.find("events", patient_id=patient_id))]
        return {
            "patient": self.patient_out(p),
            "appointments": [public(a) for a in appts],
            "tasks": [self.task_out(t) for t in tasks],
            "calls": [public(c) for c in calls],
            "escalations": [public(e) for e in escs],
            "events": events,
        }

    # ------------------------------------------------------------------ appointments / tasks / calls
    @staticmethod
    def _reschedule_window_matches_booked_day(window: str, scheduled_at: str) -> bool:
        """True when the patient named the same calendar day as the existing booking (usually means new time, not new date)."""
        w = window.lower()
        dt = _ts(scheduled_at)
        day = dt.day
        month = dt.strftime("%B").lower()
        short_month = dt.strftime("%b").lower()
        if month in w or short_month in w:
            if str(day) in w or f"{day:02d}" in w:
                return True
        return False

    def appointment_out(self, appt: dict) -> dict:
        out = self.named(appt)
        pid = appt["patient_id"]
        for t in self.store.find("tasks", patient_id=pid):
            if (
                t.get("task_type") == "callback_request"
                and t.get("status") in ("pending", "due", "awaiting_staff_action")
                and t.get("callback_window")
            ):
                out["requested_slot"] = t["callback_window"]
                out["requested_slot_task_id"] = t["task_id"]
                break
        task_id = appt.get("task_id")
        if not task_id:
            return out
        task = self.store.get("tasks", task_id)
        if not task:
            return out
        extracted = task.get("extracted_fields") or {}
        window = extracted.get("preferred_reschedule_window")
        if window and appt.get("confirmation_state") == "rescheduling_requested":
            if self._reschedule_window_matches_booked_day(window, appt["scheduled_at"]):
                out["confirmation_note"] = "Cannot make the booked time — offer another slot"
            else:
                out["confirmation_note"] = f"Patient prefers {window}"
        elif task.get("next_action") and appt.get("confirmation_state") in ("rescheduling_requested", "declined", "unable_to_confirm"):
            out["confirmation_note"] = task["next_action"]
        return out

    def list_appointments(self) -> list[dict]:
        return [self.appointment_out(a) for a in sorted(self.store.all("appointments"), key=lambda a: _ts(a["scheduled_at"]))]

    def list_tasks(self, status=None, task_type=None, priority=None, patient_id=None, due=None) -> list[dict]:
        now, sod, eod = timeutil.now(), timeutil.start_of_today(), timeutil.end_of_today()
        items = []
        for t in sorted(self.store.all("tasks"), key=lambda t: _ts(t["due_at"])):
            if status and t["status"] != status:
                continue
            if task_type and t["task_type"] != task_type:
                continue
            if priority and t["priority"] != priority:
                continue
            if patient_id and t["patient_id"] != patient_id:
                continue
            due_at = _ts(t["due_at"])
            if due == "overdue" and not self.is_overdue(t, now):
                continue
            if due == "today" and not (sod <= due_at <= eod):
                continue
            if due == "upcoming" and not (due_at > eod):
                continue
            items.append(self.task_out(t, with_name=True))
        return items

    def task_detail(self, task_id: str) -> dict:
        t = self._get("tasks", task_id, "Task")
        calls = self._calls_newest(self.store.find("calls", task_id=task_id))
        ids = {task_id, *(c["call_id"] for c in calls)}
        if t.get("escalation_id"):
            ids.add(t["escalation_id"])
        appt = self.store.get("appointments", t.get("appointment_id"))
        if appt:
            ids.add(appt["appointment_id"])
        spawned_id = self._spawned_followup_task_id(t)
        spawned = self.store.get("tasks", spawned_id) if spawned_id else None
        if spawned:
            ids.add(spawned["task_id"])
        return {
            "task": self.task_out(t),
            "patient": self.patient_out(self._get("patients", t["patient_id"], "Patient")),
            "appointment": self.appointment_out(appt) if appt else None,
            "calls": [public(c) for c in calls],
            "events": self.events_for(ids),
            "spawned_followup": self.task_out(spawned) if spawned else None,
        }

    def _call_flagged_clinical(self, call: dict) -> bool:
        esc_id = call.get("escalation_id")
        if esc_id:
            esc = self.store.get("escalations", esc_id)
            if esc and esc["status"] != "resolved":
                return True
        task = self.store.get("tasks", call.get("task_id")) if call.get("task_id") else None
        if not task:
            return False
        if task.get("escalation_id"):
            esc = self.store.get("escalations", task["escalation_id"])
            if esc and esc["status"] != "resolved":
                return True
        na = task.get("next_action") or ""
        return na.startswith("Answer patient question:")

    def list_calls(self, status=None, task_id=None, flagged: str | None = None) -> list[dict]:
        calls = self._calls_newest(self.store.all("calls"))
        out = []
        for c in calls:
            if status and c["status"] != status:
                continue
            if task_id and c["task_id"] != task_id:
                continue
            if flagged == "clinical" and not self._call_flagged_clinical(c):
                continue
            out.append(self.named(c))
        return out

    def call_detail(self, call_id: str) -> dict:
        c = self._get("calls", call_id, "Call")
        return {
            "call": public(c),
            "patient": self.patient_out(self._get("patients", c["patient_id"], "Patient")),
            "task": self.task_out(self._get("tasks", c["task_id"], "Task")),
            "escalation": public(self.store.get("escalations", c.get("escalation_id"))),
        }

    # ------------------------------------------------------------------ escalations
    def list_escalations(self, status=None) -> list[dict]:
        escs = self.store.all("escalations")
        if status:
            escs = [e for e in escs if e["status"] == status]
        escs = sorted(escs, key=lambda e: _ts(e["created_at"]), reverse=True)
        escs = sorted(escs, key=lambda e: (e["status"] == "resolved", PRIORITY_RANK.get(e["priority"], 9)))
        return [self.named(e) for e in escs]

    def escalation_detail(self, escalation_id: str) -> dict:
        e = self._get("escalations", escalation_id, "Escalation")
        ids = {escalation_id}
        if e.get("call_id"):
            ids.add(e["call_id"])
        if e.get("task_id"):
            ids.add(e["task_id"])
        task = self.store.get("tasks", e.get("task_id"))
        return {
            "escalation": public(e),
            "patient": self.patient_out(self._get("patients", e["patient_id"], "Patient")),
            "call": public(self.store.get("calls", e.get("call_id"))),
            "task": self.task_out(task) if task else None,
            "events": self.events_for(ids),
        }

    def update_escalation(
        self,
        escalation_id: str,
        action: str,
        assigned_to: str | None,
        note: str | None,
        author: str | None,
        resolution_type: str | None = None,
    ) -> dict:
        e = self._get("escalations", escalation_id, "Escalation")
        author = (author or "").strip() or "Demo staff"
        status = e["status"]
        pid = e["patient_id"]
        now = timeutil.now_iso()

        def conflict(msg: str) -> ApiError:
            return ApiError(409, "invalid_transition", msg, False)

        def add_note(text: str) -> None:
            e["notes"] = [*e.get("notes", []), {"note_id": new_id("note"), "text": text, "author": author, "created_at": now}]
            self.add_event("escalation", escalation_id, pid, "staff_action_recorded", f"Note added by {author}: {text}", "staff")

        if action == "acknowledge":
            if status != "open":
                raise conflict(f"Only open escalations can be acknowledged (this one is {label(status).lower()}).")
            e["status"] = "acknowledged"
            lead = (self.settings.clinic_lead_name or "").strip()
            if self.settings.clinic_mode and lead and not e.get("assigned_to"):
                e["assigned_to"] = lead
            self.add_event("escalation", escalation_id, pid, "escalation_updated", f"Escalation acknowledged by {author}", "staff")
        elif action == "assign":
            who = (assigned_to or "").strip()
            if not who:
                raise ApiError(422, "validation_error", "assigned_to is required to assign an escalation.", False)
            if status == "resolved":
                raise conflict("A resolved escalation cannot be assigned.")
            e["status"] = "assigned"
            e["assigned_to"] = who
            self.add_event("escalation", escalation_id, pid, "escalation_updated", f"Escalation assigned to {who} by {author}", "staff")
        elif action == "add_note":
            text = (note or "").strip()
            if not text:
                raise ApiError(422, "validation_error", "note is required to add a note.", False)
            add_note(text)
        elif action == "resolve":
            if status == "resolved":
                raise conflict("This escalation is already resolved.")
            rt = (resolution_type or "").strip()
            if self.settings.clinic_mode and not rt:
                raise ApiError(422, "validation_error", "resolution_type is required when resolving in clinic mode.", False)
            if rt and rt not in RESOLUTION_TYPES:
                raise ApiError(422, "validation_error", f"Invalid resolution_type '{rt}'.", False)
            e["status"] = "resolved"
            e["resolution_type"] = rt or None
            if (note or "").strip():
                add_note(note.strip())
            elif rt:
                add_note(f"Resolution: {label(rt.replace('_', ' '))}")
            self.add_event(
                "escalation",
                escalation_id,
                pid,
                "escalation_updated",
                f"Escalation resolved by {author}" + (f" ({label(rt)})" if rt else ""),
                "staff",
            )
        else:  # pragma: no cover - guarded by request validation
            raise ApiError(422, "validation_error", f"Unknown action '{action}'.", False)

        e["updated_at"] = now
        self.store.save("escalations", e)
        return {"escalation": public(e)}

    # ------------------------------------------------------------------ start call
    def _user_data(self, task: dict, call: dict) -> dict[str, str]:
        patient = self.store.get("patients", task["patient_id"]) or {}
        appt = self.store.get("appointments", task.get("appointment_id"))
        na = "not applicable"
        tt = task.get("test_tracking") or {}
        return {
            "patient_name": patient.get("display_name", ""),
            "call_ref": call["call_id"],
            "task_type": task["task_type"],
            "purpose": task["purpose"],
            "call_context": task["call_context"],
            "department": task.get("department") or na,
            "appointment_time": timeutil.human(appt["scheduled_at"]) if appt else na,
            "appointment_department": appt["department"] if appt else na,
            "clinician": appt["clinician"] if appt else na,
            "test_name": tt.get("test_name") or na,
            "callback_window": task.get("callback_window") or na,
            "language": patient.get("language", "hinglish"),
            "clinic_name": self.settings.clinic_name if self.settings.clinic_mode else "Jivana clinic",
        }

    async def start_call(self, task_id: str) -> dict:
        task = self._get("tasks", task_id, "Task")
        eligible, reason = self.eligibility(task)
        if not eligible:
            raise ApiError(409, "call_not_eligible", reason or "This task cannot be called right now.", False)

        live = self.settings.live_voice
        if self.settings.clinic_mode and not live:
            raise ApiError(
                503,
                "voice_unconfigured",
                "Clinic mode requires Bolna (BOLNA_API_KEY and BOLNA_AGENT_ID). Simulated calls are disabled.",
                False,
            )
        now = timeutil.now_iso()
        snapshot = {k: task.get(k) for k in ("status", "attempt_count", "last_attempt_at", "next_action", "updated_at")}
        call = {
            "call_id": new_id("call"),
            "task_id": task_id,
            "patient_id": task["patient_id"],
            "provider_call_id": None,
            "workflow": task["task_type"],
            "purpose": task["title"],
            "status": "initiating",
            "outcome": None,
            "summary": None,
            "transcript": None,
            "transcript_is_example": False,
            "extracted_fields": None,
            "processing_result": None,
            "is_live": live,
            "escalation_id": None,
            "started_at": now,
            "completed_at": None,
            "created_at": now,
        }
        self.store.save("calls", call)
        task["attempt_count"] = task.get("attempt_count", 0) + 1
        task["last_attempt_at"] = now
        task["next_action"] = "Jiya call in progress"
        task["updated_at"] = now
        mode = "live" if live else "simulated"
        self.add_event("call", call["call_id"], task["patient_id"], "call_started",
                       f"Jiya call started ({mode}) — attempt {task['attempt_count']} of {MAX_ATTEMPTS}", "staff")
        self._set_task_status(task, "in_progress")
        self.store.save("tasks", task)

        dial = self._dial_number(task["patient_id"])
        if live:
            try:
                execution_id = await self.bolna.start_call(self._user_data(task, call), recipient_phone_number=dial)
            except BolnaError as exc:
                call["status"] = "failed"
                call["completed_at"] = timeutil.now_iso()
                call["processing_result"] = f"{exc} Task restored to {label(snapshot['status']).lower()}; attempt not counted."
                call["_processed"] = True
                task.update(snapshot)
                self.add_event("call", call["call_id"], task["patient_id"], "call_failed",
                               f"Call could not be placed — {exc}", "system")
                self.add_event("task", task_id, task["patient_id"], "task_status_changed",
                               f"Task restored to {label(snapshot['status'])}", "system")
                self.store.save_many(("calls", call), ("tasks", task))
                raise ApiError(502, "provider_error", f"{exc} The task was not changed; you can retry.", True)
            call["provider_call_id"] = execution_id
            self.store.save("calls", call)
            self._pollers.add(call["call_id"])
            self._spawn(call["call_id"], self._poll_execution(call["call_id"], execution_id))
        elif self.settings.allow_simulated_voice:
            self._spawn(call["call_id"], self._simulate(call["call_id"]))
        else:
            raise ApiError(503, "voice_unconfigured", "Voice calling is not configured.", False)

        return {"call": public(call), "task": self.task_out(task)}

    def _dial_number(self, patient_id: str) -> str | None:
        if self.settings.clinic_mode:
            return self._patient_dial_phone(patient_id)
        return self.settings.demo_call_recipient

    def _patient_dial_phone(self, patient_id: str) -> str | None:
        if self.settings.clinic_dial_override_e164:
            return self.settings.clinic_dial_override_e164
        patient = self.store.get("patients", patient_id) or {}
        return patient.get("phone_e164")

    # ------------------------------------------------------------------ simulated calls
    async def _simulate(self, call_id: str) -> None:
        total = max(0.0, float(self.settings.simulated_call_seconds))
        ring = min(2.0, total * 0.25)
        await asyncio.sleep(ring)
        call = self.store.get("calls", call_id)
        if not call or call.get("_processed"):
            return
        if call["status"] == "initiating":
            call["status"] = "in_progress"
            self.store.save("calls", call)
        await asyncio.sleep(max(0.0, total - ring))
        call = self.store.get("calls", call_id)
        if not call or call.get("_processed"):
            return
        task = self.store.get("tasks", call["task_id"])
        patient = self.store.get("patients", call["patient_id"])
        appt = self.store.get("appointments", task.get("appointment_id")) if task else None
        status, extracted = simulated_result(task)
        transcript = example_transcript(task, patient, appt, status, extracted) if status == "completed" else None
        self.process_call_result(call, status, extracted, None, transcript, actor="simulator", transcript_is_example=True)

    # ------------------------------------------------------------------ live: poll + webhook
    async def _poll_execution(self, call_id: str, execution_id: str) -> None:
        elapsed = 0.0
        interval = max(0.5, self.settings.poll_interval_seconds)
        try:
            while elapsed < self.settings.poll_max_seconds:
                await asyncio.sleep(interval)
                elapsed += interval
                call = self.store.get("calls", call_id)
                if not call or call.get("_processed"):
                    return
                payload = await self.bolna.get_execution(execution_id)
                if payload is None:
                    continue
                payload.setdefault("id", execution_id)
                self.ingest_execution(payload, actor="bolna_webhook", source="poll")
                call = self.store.get("calls", call_id)
                if not call or call.get("_processed"):
                    return
        finally:
            self._pollers.discard(call_id)
            call = self.store.get("calls", call_id)
            if call and not call.get("_processed") and call["status"] in ACTIVE_CALL:
                payload = await self.bolna.get_execution(execution_id)
                if payload:
                    payload.setdefault("id", execution_id)
                    self.ingest_execution(payload, actor="bolna_webhook", source="poll")
                call = self.store.get("calls", call_id)
            if call and not call.get("_processed") and call["status"] in ACTIVE_CALL:
                self._timeout_stuck_call(
                    call,
                    "Bolna did not return a final outcome in time — verify webhook and agent status.",
                )

    def _find_call_for(self, execution_id: str | None, call_ref: str | None) -> dict | None:
        if execution_id:
            for c in self.store.all("calls"):
                if c.get("provider_call_id") == execution_id:
                    return c
        if call_ref:
            return self.store.get("calls", call_ref)
        return None

    def ingest_execution(self, payload: dict, actor: str = "bolna_webhook", source: str = "webhook") -> dict:
        """Single entry point for Bolna execution data, from the webhook or the fallback poller."""
        upd = parse_payload(payload)
        call = self._find_call_for(upd.execution_id, upd.call_ref)
        if call is None:
            return {"ok": True, "ignored": True, "reason": "unknown_call"}
        if call.get("_processed"):
            return {"ok": True, "duplicate": True, "call_id": call["call_id"]}
        if upd.execution_id and not call.get("provider_call_id"):
            call["provider_call_id"] = upd.execution_id

        known, mapped = map_status(upd.raw_status)
        # Keep the latest partial transcript/summary visible while the call is still running.
        if upd.transcript:
            call["transcript"] = upd.transcript
        if upd.summary:
            call["summary"] = upd.summary
        if known and mapped is None and isinstance(upd.raw_status, str):
            disconnected = upd.raw_status.strip().lower().replace("-", "_") == "call_disconnected"
            if disconnected and conversation_substantive(upd.transcript):
                mapped = "completed"
        if not known or mapped is None:
            self.store.save("calls", call)
            return {"ok": True, "ignored": True, "reason": "non_final_status" if known else "unknown_status",
                    "call_id": call["call_id"]}
        if mapped not in TERMINAL:
            if not (call["status"] == "in_progress" and mapped == "initiating"):
                call["status"] = mapped
            self.store.save("calls", call)
            return {"ok": True, "call_id": call["call_id"], "status": call["status"]}

        task = self.store.get("tasks", call["task_id"])
        infer_from_transcript_types = frozenset(
            {"appointment_confirmation", "test_report_reminder", "post_procedure_checkin"},
        )
        can_infer = (
            task
            and task.get("task_type") in infer_from_transcript_types
            and conversation_substantive(
                upd.transcript or call.get("transcript"),
                min_turns=2,
            )
            and not upd.extracted_present
        )
        # Bolna can post `completed` before post-call extraction is ready. While a poller is
        # watching this call, give extraction a few more polls before validating the outcome.
        extraction_wait_types = frozenset(
            {"appointment_confirmation", "post_procedure_checkin", "test_report_reminder", "clinician_task_reminder"},
        )
        wait_for_extraction = task and task.get("task_type") in extraction_wait_types
        if (
            mapped == "completed"
            and not upd.extracted_present
            and not can_infer
            and wait_for_extraction
            and call["call_id"] in self._pollers
        ):
            call["_extraction_waits"] = call.get("_extraction_waits", 0) + 1
            if call["_extraction_waits"] <= 8:
                self.store.save("calls", call)
                return {"ok": True, "deferred": True, "call_id": call["call_id"]}

        prepared, directives = prepare_extracted_for_task(
            task["task_type"] if task else "",
            upd.extracted,
            transcript=upd.transcript or call.get("transcript"),
            summary=upd.summary or call.get("summary"),
        )
        extracted_for_rules = prepared if prepared is not None else upd.extracted
        result = self.process_call_result(
            call, mapped, extracted_for_rules, call.get("summary"), call.get("transcript"), actor=actor,
        )
        call = self.store.get("calls", call["call_id"]) or call
        task = self.store.get("tasks", call["task_id"]) if call.get("task_id") else task
        if directives and task:
            self._apply_patient_directives(task["patient_id"], directives)
            if directives.needs_clinical_review and call.get("status") == "completed":
                self._ensure_clinical_review_escalation(call, task, directives)
        return result

    def _ensure_clinical_review_escalation(self, call: dict, task: dict, directives: MapperDirectives) -> None:
        if call.get("escalation_id"):
            return
        question = directives.clinical_question or "Patient asked a clinical question on the follow-up call."
        esc = self._create_escalation(
            call,
            task,
            question,
            reason="Clinical question — requires staff or clinician review",
            priority="high",
        )
        task["next_action"] = f"Answer patient question: {question[:120]}{'…' if len(question) > 120 else ''}"
        if task["status"] not in TERMINAL_TASK:
            task["status"] = "awaiting_staff_action"
        task["updated_at"] = timeutil.now_iso()
        self.store.save("tasks", task)

    def _apply_patient_directives(self, patient_id: str, directives: MapperDirectives) -> None:
        patient = self.store.get("patients", patient_id)
        if patient is None:
            return
        now = timeutil.now_iso()
        changed = False
        if directives.opt_out and not patient.get("opt_out_at"):
            patient["opt_out_at"] = now
            patient["contact_permitted"] = False
            changed = True
            self.add_event(
                "patient", patient_id, patient_id, "staff_action_recorded",
                "Patient opted out of voice contact (recorded from Jiya extraction)", "system",
            )
        if directives.wrong_number and not patient.get("wrong_number_at"):
            patient["wrong_number_at"] = now
            patient["contact_permitted"] = False
            changed = True
            self.add_event(
                "patient", patient_id, patient_id, "staff_action_recorded",
                "Wrong number recorded — voice contact disabled", "system",
            )
        if changed:
            self.store.save("patients", patient)

    # ------------------------------------------------------------------ workflow rules
    def process_call_result(self, call: dict, status: str, extracted: Any, summary: str | None,
                            transcript: list[dict] | None, actor: str = "system",
                            transcript_is_example: bool = False) -> dict:
        """Apply the CONTRACT.md workflow rules exactly once per call. Idempotent."""
        if call.get("_processed"):
            return {"ok": True, "duplicate": True, "call_id": call["call_id"]}
        if status not in TERMINAL:
            call["status"] = status
            self.store.save("calls", call)
            return {"ok": True, "call_id": call["call_id"], "status": status}

        task = self.store.get("tasks", call["task_id"])
        if task is None:  # pragma: no cover - data integrity guard
            call.update(status=status, completed_at=timeutil.now_iso(), _processed=True)
            self.store.save("calls", call)
            return {"ok": True, "call_id": call["call_id"], "status": status}
        appt = self.store.get("appointments", task.get("appointment_id"))
        pid = task["patient_id"]
        now = timeutil.now_iso()
        ex = normalise_extracted(extracted) or {}

        call["status"] = status
        call["completed_at"] = now
        if transcript:
            call["transcript"] = transcript
            call["transcript_is_example"] = transcript_is_example
        call["extracted_fields"] = ex or None
        call["_processed"] = True

        if status != "completed":
            result = self._apply_unanswered(call, task, appt, status, actor)
        else:
            result = self._apply_completed(call, task, appt, ex, summary, actor)

        task["updated_at"] = now
        if appt is not None:
            self.store.save("appointments", appt)
        self.store.save_many(("calls", call), ("tasks", task))
        return result

    def _apply_unanswered(self, call: dict, task: dict, appt: dict | None, status: str, actor: str) -> dict:
        pid = task["patient_id"]
        attempts = task.get("attempt_count", 0)
        call["outcome"] = None
        if status == "no_answer":
            self.add_event("call", call["call_id"], pid, "call_no_answer", f"No answer — attempt {attempts} of {MAX_ATTEMPTS}", actor)
            task["latest_outcome"] = "no_answer"
            if appt is not None and task["task_type"] == "appointment_confirmation":
                appt["confirmation_state"] = "no_answer"
            what = "No answer."
        else:
            word = "failed" if status == "failed" else "was cancelled"
            self.add_event("call", call["call_id"], pid, "call_failed", f"Call {word} — attempt {attempts} of {MAX_ATTEMPTS}", actor)
            what = f"Call {word}."
        if attempts < MAX_ATTEMPTS:
            task["next_action"] = "Retry call"
            self._set_task_status(task, "due")
            call["processing_result"] = f"{what} Attempt {attempts} of {MAX_ATTEMPTS} recorded; task due for retry."
        else:
            task["next_action"] = "Maximum attempts reached — contact patient manually"
            self._set_task_status(task, "awaiting_staff_action")
            call["processing_result"] = f"{what} Attempt {attempts} of {MAX_ATTEMPTS} — task moved to awaiting_staff_action."
        return {"ok": True, "call_id": call["call_id"], "status": status}

    def _apply_completed(self, call: dict, task: dict, appt: dict | None, ex: dict, summary: str | None, actor: str) -> dict:
        pid = task["patient_id"]
        wf = call["workflow"]
        outcome: str | None = None
        new_status = "awaiting_staff_action"
        next_action = "Review call outcome"
        result_msg = ""
        extracted_msg = ""
        validation_failed = False
        escalation = None
        callback_requested = ex.get("callback_requested") is True

        if wf == "appointment_confirmation":
            ao = ex.get("appointment_outcome")
            if ao not in APPOINTMENT_OUTCOMES:
                validation_failed = True
                ao = "unable_to_confirm"
                result_msg = (f"Extracted appointment_outcome {ex.get('appointment_outcome')!r} is missing or invalid; "
                              "validation failed. Recorded as unable_to_confirm and task moved to awaiting_staff_action "
                              "for review. Appointment booking unchanged.")
                next_action = "Review call — outcome could not be validated"
            outcome = ao
            window = ex.get("preferred_reschedule_window")
            if appt is not None:
                appt["confirmation_state"] = ao  # booking_status / scheduled_at are NEVER touched here
            if ao == "confirmed":
                new_status, next_action = "completed", "No action needed"
                result_msg = "Outcome validated. Task completed. Appointment confirmation recorded; booking unchanged."
                extracted_msg = "Appointment confirmed"
            elif ao == "rescheduling_requested":
                if window:
                    window = window[0].lower() + window[1:]  # reads mid-sentence: "prefers day after tomorrow"
                next_action = f"Call patient to offer a new slot (prefers {window})" if window else "Call patient to offer a new slot"
                result_msg = "Outcome validated. Task moved to awaiting_staff_action. Appointment booking unchanged until staff rebook."
                extracted_msg = f"Rescheduling requested — prefers {window}" if window else "Rescheduling requested"
            elif ao == "declined":
                next_action = "Review cancellation with patient"
                result_msg = "Outcome validated. Patient declined; task moved to awaiting_staff_action. Appointment booking unchanged."
                extracted_msg = "Patient declined the appointment"
            elif ao == "no_answer":
                attempts = task.get("attempt_count", 0)
                if attempts < MAX_ATTEMPTS:
                    new_status, next_action = "due", "Retry call"
                else:
                    next_action = "Maximum attempts reached — contact patient manually"
                result_msg = f"Patient could not be reached in conversation. Attempt {attempts} of {MAX_ATTEMPTS} recorded."
                extracted_msg = "No answer recorded"
            elif not validation_failed:  # unable_to_confirm
                next_action = "Call patient to confirm attendance"
                result_msg = "Outcome validated. Attendance could not be confirmed; task moved to awaiting_staff_action. Booking unchanged."
                extracted_msg = "Unable to confirm attendance"
            else:
                extracted_msg = "Outcome could not be validated — recorded as unable to confirm"

        elif wf == "test_report_reminder":
            tt = task.get("test_tracking") or {}
            test = tt.get("test_name") or "test"
            done = ex.get("test_completed")
            if done is True:
                outcome = "test_completion_reported"
                next_action = f"Check lab for {test} report"
                if task.get("test_tracking") is not None:
                    task["test_tracking"]["test_completion_reported"] = True  # report_received / clinician_reviewed untouched
                when = ex.get("test_date")
                result_msg = (f"Test completion reported by patient{f' ({when})' if when else ''}. Report not yet received; "
                              "clinician review pending. Task moved to awaiting_staff_action.")
                extracted_msg = f"Patient reports {test} test done" + (f" — {when}" if when else "")
            elif done is False:
                outcome = "test_not_done"
                new_status, next_action = "pending", "Remind again in 2 days"
                task["due_at"] = timeutil.iso(timeutil.now() + timedelta(days=2))
                result_msg = "Patient has not done the test yet. Task set to pending; reminder due again in 2 days."
                extracted_msg = f"{test} test not done yet"
            else:
                validation_failed = True
                next_action = "Review call — test status could not be validated"
                result_msg = "Extracted test_completed is missing or invalid; validation failed. Task moved to awaiting_staff_action for review."
                extracted_msg = "Test status could not be validated"

        elif wf == "post_procedure_checkin":
            cr = ex.get("checkin_result")
            concern = ex.get("concern_summary")
            if cr not in ("routine_ok", "concern_reported") and concern:
                cr = "concern_reported"  # safety: an unparsed result with a stated concern is escalated
            if cr == "routine_ok":
                outcome = "routine_ok"
                new_status, next_action = "completed", "No action needed"
                result_msg = "Routine check-in, no concerns reported. Task completed."
                extracted_msg = "Routine check-in — no concerns"
            elif cr == "concern_reported":
                outcome = "concern_reported"
                next_action = "Review escalated concern"
                escalation = self._create_escalation(call, task, concern or summary)
                result_msg = (f"Concern reported. Escalation {escalation['escalation_id']} created and routed to "
                              f"{escalation['routing_destination']}. Task moved to awaiting_staff_action.")
                extracted_msg = "Patient reported a concern"
            else:
                validation_failed = True
                next_action = "Review call — check-in result could not be validated"
                result_msg = "Extracted checkin_result is missing or invalid; validation failed. Task moved to awaiting_staff_action for review."
                extracted_msg = "Check-in result could not be validated"

        elif wf == "clinician_task_reminder":
            ack = ex.get("task_acknowledged")
            if ack is True:
                outcome = "task_acknowledged"
                new_status, next_action = "completed", "No action needed"
                result_msg = "Patient acknowledged the reminder. Task completed."
                extracted_msg = "Reminder acknowledged"
            elif ack is False:
                next_action = "Patient did not acknowledge the reminder — follow up"
                result_msg = "Patient did not acknowledge the reminder. Task moved to awaiting_staff_action."
                extracted_msg = "Reminder not acknowledged"
            else:
                validation_failed = True
                next_action = "Review call — acknowledgement could not be validated"
                result_msg = "Extracted task_acknowledged is missing or invalid; validation failed. Task moved to awaiting_staff_action for review."
                extracted_msg = "Acknowledgement could not be validated"

        else:  # callback_request: the call itself fulfils the callback
            new_status, next_action = "completed", "No action needed"
            result_msg = "Callback completed. Task completed."
            extracted_msg = "Callback completed"

        if outcome is None and callback_requested:
            outcome = "callback_requested"

        call["outcome"] = outcome
        if summary:
            call["summary"] = summary
        elif not call.get("summary"):
            call["summary"] = self._summary(task, outcome, ex, validation_failed)

        task["latest_outcome"] = outcome if outcome else task.get("latest_outcome")
        task["extracted_fields"] = ex or None
        task["next_action"] = next_action

        headline = label(outcome).lower() if outcome else "outcome needs review"
        self.add_event("call", call["call_id"], pid, "call_completed", f"Call completed — {headline}", actor)
        self.add_event("task", task["task_id"], pid, "outcome_extracted", extracted_msg or "Outcome recorded", "system")
        if appt is not None and wf == "appointment_confirmation":
            self.add_event("appointment", appt["appointment_id"], pid, "outcome_extracted",
                           f"Confirmation recorded as {label(appt['confirmation_state'])} — booking unchanged", "system")
        if escalation:
            self.add_event("escalation", escalation["escalation_id"], pid, "escalation_created",
                           f"Escalation created — routed to {escalation['routing_destination']}", "system")
        self._set_task_status(task, new_status)

        if callback_requested:
            cb = self._create_callback_task(task, ex.get("callback_window"))
            task["spawned_followup_task_id"] = cb["task_id"]
            # Do not override clinical next steps (e.g. open escalation) when callback is secondary.
            if not escalation:
                if cb.get("callback_window"):
                    task["next_action"] = f"Desk follow-up: confirm slot — {cb['callback_window']}"
                else:
                    task["next_action"] = f"Desk follow-up: {cb['title']}"
                task["updated_at"] = timeutil.now_iso()
                self.store.save("tasks", task)
            result_msg += f" Callback task {cb['task_id']} created" + (f" ({cb['callback_window']})." if cb.get("callback_window") else ".")

        call["processing_result"] = result_msg.strip()
        return {"ok": True, "call_id": call["call_id"], "status": "completed", "outcome": outcome}

    def _create_escalation(
        self,
        call: dict,
        task: dict,
        concern: str | None,
        *,
        reason: str = "Patient-reported concern after procedure",
        priority: str = "high",
    ) -> dict:
        now = timeutil.now_iso()
        dept = task.get("department") or self.settings.clinic_name
        esc = {
            "escalation_id": new_id("esc"),
            "patient_id": task["patient_id"],
            "call_id": call["call_id"],
            "task_id": task["task_id"],
            "reason": reason,
            "concern_summary": concern or "Patient reported a concern during the check-in call.",
            "priority": priority,
            "status": "open",
            "routing_destination": f"{dept} — clinical desk",
            "assigned_to": None,
            "resolution_type": None,
            "notes": [],
            "created_at": now,
            "updated_at": now,
        }
        self.store.save("escalations", esc)
        call["escalation_id"] = esc["escalation_id"]
        task["escalation_id"] = esc["escalation_id"]
        return esc

    def _create_callback_task(self, source: dict, window: str | None) -> dict:
        now = timeutil.now()
        cb: dict | None = None
        for t in self.store.all("tasks"):
            if (
                t.get("patient_id") == source["patient_id"]
                and t.get("task_type") == "callback_request"
                and t.get("status") == "pending"
                and (t.get("attempt_count") or 0) == 0
            ):
                cb = t
                break
        created = cb is None
        if cb is None:
            cb = {
                "task_id": new_id("task"),
                "patient_id": source["patient_id"],
                "source_task_id": source["task_id"],
                "appointment_id": None,
                "task_type": "callback_request",
                "title": "Patient callback request",
                "purpose": f"Patient asked the clinic to call back (raised during: {source['title']}).",
                "call_context": "Patient requested a callback during a Jiya call. Call in the requested window.",
                "department": source.get("department") or "",
                "due_at": timeutil.iso(now + timedelta(hours=2)),
                "status": "pending",
                "priority": "normal",
                "attempt_count": 0,
                "last_attempt_at": None,
                "next_action": "Call patient back",
                "latest_outcome": None,
                "extracted_fields": None,
                "test_tracking": None,
                "callback_window": None,
                "escalation_id": None,
                "created_at": timeutil.iso(now),
                "updated_at": timeutil.iso(now),
            }
        if not cb.get("source_task_id"):
            cb["source_task_id"] = source["task_id"]
        if window:
            cb["title"] = f"Schedule appointment — {window}"
            cb["callback_window"] = window
            cb["next_action"] = f"Call patient to confirm slot — {window}"
            cb["purpose"] = (
                f"Patient requested an appointment on {window} during {source['title']}. "
                "Confirm time with patient; do not book in Jiya."
            )
        cb["updated_at"] = timeutil.iso(now)
        self.store.save("tasks", cb)
        if created:
            self.add_event(
                "task",
                cb["task_id"],
                cb["patient_id"],
                "callback_task_created",
                f"Callback requested — {window}" if window else "Callback requested",
                "system",
            )
        elif window:
            self.add_event(
                "task",
                cb["task_id"],
                cb["patient_id"],
                "staff_action_recorded",
                f"Scheduling preference updated — {window}",
                "system",
            )
        return cb

    def _summary(self, task: dict, outcome: str | None, ex: dict, validation_failed: bool) -> str:
        name = self.patient_name(task["patient_id"])
        note = ex.get("patient_note")
        parts: list[str]
        if validation_failed:
            parts = [f"Call with {name} completed but the outcome could not be validated; staff review needed."]
        elif outcome == "confirmed":
            parts = [f"{name} confirmed they will attend the appointment."]
        elif outcome == "rescheduling_requested":
            window = ex.get("preferred_reschedule_window")
            parts = [f"{name} cannot attend and asked to reschedule" + (f" ({window})." if window else "."),
                     "No new slot was booked."]
        elif outcome == "declined":
            parts = [f"{name} said they will not attend the appointment."]
        elif outcome == "unable_to_confirm":
            parts = [f"Jiya could not confirm whether {name} will attend."]
        elif outcome == "test_completion_reported":
            when = ex.get("test_date")
            parts = [f"{name} says the test has been done" + (f" ({when})." if when else "."),
                     "The clinic has not yet received the report."]
        elif outcome == "test_not_done":
            parts = [f"{name} has not done the test yet; a reminder will follow."]
        elif outcome == "routine_ok":
            parts = [f"{name} reported no concerns during the routine check-in."]
        elif outcome == "concern_reported":
            parts = [f"{name} reported a concern: {ex.get('concern_summary') or 'see transcript'}.".replace("..", "."),
                     "Jiya gave no advice and routed it to the care team."]
        elif outcome == "task_acknowledged":
            parts = [f"{name} acknowledged the reminder."]
        else:
            parts = [f"Call with {name} completed."]
        if note:
            parts.append(f"Note: {note}.".replace("..", "."))
        return " ".join(parts)

    # ------------------------------------------------------------------ clinic registry
    def create_patient(
        self,
        display_name: str,
        phone_e164: str,
        language: str = "hinglish",
        contact_permitted: bool = True,
        chart_number: str | None = None,
        age: int | None = None,
    ) -> dict:
        name = display_name.strip()
        phone = phone_e164.strip()
        if not name:
            raise ApiError(422, "validation_error", "Patient name is required.", False)
        if not _E164.match(phone):
            raise ApiError(422, "validation_error", "Phone must be E.164 format (e.g. +919876543210).", False)
        if language not in ("hi", "en", "hinglish"):
            raise ApiError(422, "validation_error", "Language must be hi, en, or hinglish.", False)
        now = timeutil.now_iso()
        seq = len(self.store.all("patients")) + 1
        patient = {
            "patient_id": new_id("patient"),
            "display_name": name,
            "demo_id": chart_number.strip() if chart_number else f"P-{seq:04d}",
            "age": age,
            "language": language,
            "contact_ref": f"phone-{seq}",
            "phone_e164": phone,
            "phone_masked": self._mask_phone(phone),
            "contact_permitted": contact_permitted,
            "opt_out_at": None,
            "wrong_number_at": None,
            "created_at": now,
        }
        self.store.save("patients", patient)
        self.add_event("patient", patient["patient_id"], patient["patient_id"], "staff_action_recorded",
                       f"Patient registered — {name}", "staff")
        return {"patient": self.patient_out(patient)}

    @staticmethod
    def _test_name_from_task(title: str, call_context: str) -> str:
        blob = f"{title} {call_context}".lower()
        if "lipid" in blob:
            return "Lipid profile"
        if "hba1c" in blob or "hb a1c" in blob:
            return "HbA1c"
        return "Lab test"

    def create_task(
        self,
        patient_id: str,
        task_type: str,
        title: str,
        purpose: str,
        call_context: str,
        due_at: str,
        *,
        department: str | None = None,
        priority: str = "normal",
        appointment_scheduled_at: str | None = None,
        appointment_clinician: str | None = None,
    ) -> dict:
        if task_type not in TASK_TYPES:
            raise ApiError(422, "validation_error", f"Unknown task type '{task_type}'.", False)
        if priority not in PRIORITY_RANK:
            raise ApiError(422, "validation_error", "Invalid priority.", False)
        self._get("patients", patient_id, "Patient")
        now = timeutil.now_iso()
        appt_id = None
        if task_type == "appointment_confirmation":
            if not appointment_scheduled_at:
                raise ApiError(422, "validation_error", "Appointment confirmation requires scheduled_at.", False)
            appt_id = new_id("appt")
            appt = {
                "appointment_id": appt_id,
                "patient_id": patient_id,
                "scheduled_at": appointment_scheduled_at,
                "department": department or self.settings.clinic_name,
                "clinician": appointment_clinician or "Clinic team",
                "booking_status": "scheduled",
                "confirmation_state": "pending",
                "task_id": None,
            }
            self.store.save("appointments", appt)
        task = {
            "task_id": new_id("task"),
            "patient_id": patient_id,
            "appointment_id": appt_id,
            "task_type": task_type,
            "title": title.strip(),
            "purpose": purpose.strip(),
            "call_context": call_context.strip(),
            "department": department or self.settings.clinic_name,
            "due_at": due_at,
            "status": "pending",
            "priority": priority,
            "attempt_count": 0,
            "last_attempt_at": None,
            "next_action": "Start follow-up call",
            "latest_outcome": None,
            "extracted_fields": None,
            "test_tracking": {
                "test_name": self._test_name_from_task(title, call_context),
                "test_completion_reported": False,
                "report_received": False,
                "clinician_reviewed": False,
            }
            if task_type == "test_report_reminder"
            else None,
            "callback_window": None,
            "escalation_id": None,
            "created_at": now,
            "updated_at": now,
        }
        self.store.save("tasks", task)
        if appt_id:
            appt = self.store.get("appointments", appt_id)
            appt["task_id"] = task["task_id"]
            self.store.save("appointments", appt)
        self.add_event("task", task["task_id"], patient_id, "task_created", f"Follow-up created — {task['title']}", "staff")
        return {"task": self.task_out(task)}

    def create_appointment(
        self,
        patient_id: str,
        scheduled_at: str,
        department: str | None,
        clinician: str | None,
        *,
        spawn_confirmation_task: bool = True,
    ) -> dict:
        self._get("patients", patient_id, "Patient")
        now = timeutil.now_iso()
        appt_id = new_id("appt")
        appt = {
            "appointment_id": appt_id,
            "patient_id": patient_id,
            "scheduled_at": scheduled_at,
            "department": department or self.settings.clinic_name,
            "clinician": clinician or (self.settings.clinic_lead_name or "Clinic team"),
            "booking_status": "scheduled",
            "confirmation_state": "pending",
            "task_id": None,
        }
        self.store.save("appointments", appt)
        task_out = None
        if spawn_confirmation_task:
            batch_time = parse_batch_time(self.settings.clinic_confirmation_batch_time)
            appt_dt = _ts(scheduled_at)
            if self.settings.clinic_daily_confirmation_batch_enabled:
                due_at = timeutil.iso(confirmation_call_moment(appt_dt, batch_time))
                next_action = (
                    f"Automatic confirmation call on "
                    f"{confirmation_call_moment(appt_dt, batch_time).strftime('%d %b at %I:%M %p').lstrip('0')} "
                    f"(day before visit)"
                )
            else:
                due_at = timeutil.iso(appt_dt - timedelta(hours=24))
                next_action = "Start follow-up call"
            task = {
                "task_id": new_id("task"),
                "patient_id": patient_id,
                "appointment_id": appt_id,
                "task_type": "appointment_confirmation",
                "title": f"Confirm appointment — {timeutil.human(scheduled_at)}",
                "purpose": "Confirm the patient can attend their scheduled appointment.",
                "call_context": (
                    f"Confirm attendance for appointment on {timeutil.human(scheduled_at)} "
                    f"with {appt['clinician']}. Record reschedule preference only; do not book a new slot."
                ),
                "department": appt["department"],
                "due_at": due_at,
                "status": "pending",
                "priority": "normal",
                "attempt_count": 0,
                "last_attempt_at": None,
                "next_action": next_action,
                "latest_outcome": None,
                "extracted_fields": None,
                "test_tracking": None,
                "callback_window": None,
                "escalation_id": None,
                "created_at": now,
                "updated_at": now,
            }
            self.store.save("tasks", task)
            appt["task_id"] = task["task_id"]
            self.store.save("appointments", appt)
            self.add_event(
                "task",
                task["task_id"],
                patient_id,
                "task_created",
                f"Confirmation queued — {task['title']}",
                "staff",
            )
            task_out = self.task_out(task)
        self.add_event(
            "appointment",
            appt_id,
            patient_id,
            "staff_action_recorded",
            f"Appointment scheduled — {timeutil.human(scheduled_at)}",
            "staff",
        )
        return {"appointment": public(appt), "task": task_out}

    def update_patient(self, patient_id: str, fields: dict) -> dict:
        patient = self._get("patients", patient_id, "Patient")
        if "display_name" in fields and fields["display_name"] is not None:
            name = str(fields["display_name"]).strip()
            if not name:
                raise ApiError(422, "validation_error", "Patient name cannot be empty.", False)
            patient["display_name"] = name
        if "phone_e164" in fields and fields["phone_e164"] is not None:
            phone = str(fields["phone_e164"]).strip()
            if not _E164.match(phone):
                raise ApiError(422, "validation_error", "Phone must be E.164 format.", False)
            patient["phone_e164"] = phone
            patient["phone_masked"] = self._mask_phone(phone)
        if "language" in fields and fields["language"] is not None:
            if fields["language"] not in ("hi", "en", "hinglish"):
                raise ApiError(422, "validation_error", "Language must be hi, en, or hinglish.", False)
            patient["language"] = fields["language"]
        if "contact_permitted" in fields and fields["contact_permitted"] is not None:
            patient["contact_permitted"] = bool(fields["contact_permitted"])
        if "chart_number" in fields and fields["chart_number"] is not None:
            patient["demo_id"] = str(fields["chart_number"]).strip() or patient.get("demo_id")
        if "age" in fields:
            patient["age"] = fields["age"]
        self.store.save("patients", patient)
        self.add_event(
            "patient", patient_id, patient_id, "staff_action_recorded",
            f"Patient record updated — {patient['display_name']}", "staff",
        )
        return {"patient": self.patient_out(patient)}

    def update_appointment(self, appointment_id: str, fields: dict) -> dict:
        appt = self._get("appointments", appointment_id, "Appointment")
        if "scheduled_at" in fields and fields["scheduled_at"] is not None:
            appt["scheduled_at"] = fields["scheduled_at"]
        if "department" in fields and fields["department"] is not None:
            appt["department"] = fields["department"]
        if "clinician" in fields and fields["clinician"] is not None:
            appt["clinician"] = fields["clinician"]
        if "booking_status" in fields and fields["booking_status"] is not None:
            appt["booking_status"] = fields["booking_status"]
            if fields["booking_status"] == "cancelled":
                appt["confirmation_state"] = "declined"
                task = self.store.get("tasks", appt.get("task_id"))
                if task and task["status"] not in TERMINAL_TASK:
                    task["status"] = "cancelled"
                    task["next_action"] = "Appointment cancelled by staff"
                    task["updated_at"] = timeutil.now_iso()
                    self.store.save("tasks", task)
        self.store.save("appointments", appt)
        pid = appt["patient_id"]
        self.add_event(
            "appointment", appointment_id, pid, "staff_action_recorded",
            f"Appointment updated — {label(appt['booking_status'])}", "staff",
        )
        return {"appointment": public(appt)}

    def staff_complete_call(
        self,
        call_id: str,
        outcome: str | None,
        summary: str | None,
        note: str | None,
        author: str | None,
    ) -> dict:
        call = self._get("calls", call_id, "Call")
        if call.get("_processed"):
            raise ApiError(409, "conflict", "Call outcome was already finalized.", False)
        if call["status"] not in ("initiating", "in_progress", "queued", "no_answer", "failed"):
            raise ApiError(409, "conflict", "Call cannot be staff-completed in its current state.", False)
        extracted: dict = {}
        if outcome:
            extracted["staff_outcome"] = outcome
            if outcome in ("confirmed", "rescheduling_requested", "declined", "no_answer", "unable_to_confirm"):
                extracted["appointment_outcome"] = outcome.replace("rescheduling_requested", "rescheduling_requested")
        text = summary or note or "Marked complete by staff."
        if author:
            text = f"{text} ({author})"
        self.process_call_result(
            call,
            "completed",
            extracted or {"staff_note": text},
            text,
            None,
            actor="staff",
        )
        call = self.store.get("calls", call_id)
        return {"call": public(call)}

    def _reset_call_task_for_resync(self, call: dict, task: dict) -> None:
        """Allow ingest_execution to run again; unwind false escalations from bad early webhooks."""
        call.pop("_processed", None)
        esc_id = task.get("escalation_id") or call.get("escalation_id")
        if esc_id:
            esc = self.store.get("escalations", esc_id)
            if esc and esc.get("status") == "open":
                esc["status"] = "resolved"
                esc["resolution_type"] = "admin_handled"
                esc["updated_at"] = timeutil.now_iso()
                esc["notes"] = [
                    *esc.get("notes", []),
                    {
                        "note_id": new_id("note"),
                        "text": "Closed automatically: call re-synced from Bolna with updated transcript.",
                        "author": "system",
                        "created_at": timeutil.now_iso(),
                    },
                ]
                self.store.save("escalations", esc)
            task["escalation_id"] = None
            call["escalation_id"] = None
        if task.get("status") == "cancelled":
            task["status"] = "in_progress"
            task["next_action"] = "Re-syncing outcome from Bolna"

    async def resync_call_from_bolna(self, call_id: str, *, execution_id: str | None = None) -> dict:
        """Fetch Bolna execution payload and re-run workflow processing (fixes early fake webhooks)."""
        call = self._get("calls", call_id, "Call")
        task = self._get("tasks", call["task_id"], "Task")
        eid = (execution_id or call.get("provider_call_id") or "").strip()
        if not eid:
            raise ApiError(422, "validation_error", "Call has no Bolna execution id to resync.", False)
        payload = await self.bolna.get_execution(eid)
        if not payload:
            raise ApiError(502, "provider_error", "Could not load execution from Bolna.", True)
        self._reset_call_task_for_resync(call, task)
        if execution_id and execution_id != call.get("provider_call_id"):
            call["provider_call_id"] = execution_id
        self.store.save_many(("calls", call), ("tasks", task))
        return self.ingest_execution(payload, actor="bolna_resync", source="resync")

    def reinfer_call_outcome(self, call_id: str) -> dict:
        """Re-apply workflow rules from stored transcript (e.g. after inference improvements)."""
        call = self._get("calls", call_id, "Call")
        if call["status"] != "completed" or not call.get("transcript"):
            raise ApiError(422, "validation_error", "Call needs a completed transcript to reinfer.", False)
        task = self._get("tasks", call["task_id"], "Task")
        prepared, directives = prepare_extracted_for_task(
            task["task_type"],
            None,
            transcript=call["transcript"],
            summary=call.get("summary"),
        )
        from .transcript_inference import has_inferred_outcome

        if not prepared or not has_inferred_outcome(task["task_type"], prepared):
            raise ApiError(422, "validation_error", "Transcript did not yield a workflow outcome for this task type.", False)
        appt = self.store.get("appointments", task.get("appointment_id"))
        if appt:
            appt["confirmation_state"] = "pending"
            self.store.save("appointments", appt)
        call.pop("_processed", None)
        call["outcome"] = None
        call["processing_result"] = None
        call["extracted_fields"] = None
        task["latest_outcome"] = None
        task["extracted_fields"] = None
        task["status"] = "in_progress"
        task["next_action"] = "Reprocessing call outcome"
        if task.get("task_type") == "test_report_reminder" and task.get("test_tracking"):
            task["test_tracking"]["test_completion_reported"] = False
        self.store.save_many(("calls", call), ("tasks", task))
        window = prepared.get("preferred_reschedule_window")
        if prepared.get("appointment_outcome") == "rescheduling_requested":
            summary = f"Patient asked to reschedule{f' ({window})' if window else ''}."
        elif prepared.get("appointment_outcome") == "declined":
            summary = "Patient declined the appointment on the call."
        elif prepared.get("appointment_outcome") == "confirmed":
            summary = "Patient confirmed attendance on the call."
        elif task.get("task_type") == "test_report_reminder" and prepared.get("test_completed") is False:
            summary = "Patient has not completed the test yet."
        elif task.get("task_type") == "test_report_reminder" and prepared.get("test_completed") is True:
            summary = "Patient reports the test is done."
        else:
            summary = call.get("summary")
        call["summary"] = summary
        self.process_call_result(
            call,
            "completed",
            prepared,
            summary,
            call["transcript"],
            actor="system",
        )
        if directives and task:
            self._apply_patient_directives(task["patient_id"], directives)
        call = self.store.get("calls", call_id)
        task = self.store.get("tasks", call["task_id"])
        return {"call": public(call), "task": self.task_out(task)}

    def export_csv(self, kind: str) -> str:
        import csv
        import io

        buf = io.StringIO()
        if kind == "patients":
            writer = csv.writer(buf)
            writer.writerow(
                ["patient_id", "display_name", "phone_e164", "language", "contact_permitted", "attention_status", "created_at"],
            )
            for p in self.store.all("patients"):
                writer.writerow([
                    p["patient_id"],
                    p["display_name"],
                    p.get("phone_e164", ""),
                    p.get("language", ""),
                    p.get("contact_permitted", ""),
                    p.get("attention_status", ""),
                    p.get("created_at", ""),
                ])
        elif kind == "calls":
            writer = csv.writer(buf)
            writer.writerow(
                ["call_id", "patient_id", "task_id", "status", "outcome", "is_live", "started_at", "completed_at"],
            )
            for c in sorted(self.store.all("calls"), key=lambda x: _ts(x.get("created_at"))):
                writer.writerow([
                    c["call_id"],
                    c["patient_id"],
                    c["task_id"],
                    c["status"],
                    c.get("outcome") or "",
                    c.get("is_live", ""),
                    c.get("started_at") or "",
                    c.get("completed_at") or "",
                ])
        elif kind == "tasks":
            writer = csv.writer(buf)
            writer.writerow(["task_id", "patient_id", "task_type", "status", "priority", "due_at", "latest_outcome"])
            for t in sorted(self.store.all("tasks"), key=lambda x: _ts(x.get("due_at"))):
                writer.writerow([
                    t["task_id"],
                    t["patient_id"],
                    t["task_type"],
                    t["status"],
                    t.get("priority", ""),
                    t.get("due_at", ""),
                    t.get("latest_outcome") or "",
                ])
        else:
            raise ApiError(404, "not_found", f"Unknown report '{kind}'.", False)
        return buf.getvalue()

    # ------------------------------------------------------------------ daily confirmation batch (clinic)
    def _daily_batch_already_created(self, appt_day: date) -> bool:
        title = daily_batch_title(appt_day)
        for batch in self.store.all("batches"):
            if batch.get("title") == title and batch.get("status") in (
                "validated",
                "scheduled",
                "running",
                "completed",
            ):
                return True
        return False

    def collect_tomorrow_confirmation_task_ids(self) -> list[str]:
        if not self.settings.clinic_mode:
            return []
        target = tomorrow_date()
        ids: list[str] = []
        for appt in self.store.all("appointments"):
            if appt.get("booking_status") != "scheduled":
                continue
            if not appointment_on_date(appt["scheduled_at"], target):
                continue
            tid = appt.get("task_id")
            if not tid:
                continue
            task = self.store.get("tasks", tid)
            if task is None or task.get("task_type") != "appointment_confirmation":
                continue
            if task["status"] not in ("pending", "due"):
                continue
            eligible, _ = self.eligibility(task)
            if eligible:
                ids.append(tid)
        return ids

    def preview_daily_confirmation_batch(self) -> dict:
        task_ids = self.collect_tomorrow_confirmation_task_ids()
        target = tomorrow_date()
        preview = self.batch_preview(task_ids) if task_ids else {"included": [], "skipped": [], "recipient_count": 0}
        return {
            "appointment_date": target.isoformat(),
            "batch_time_ist": self.settings.clinic_confirmation_batch_time,
            "task_ids": task_ids,
            "recipient_count": preview.get("recipient_count", 0),
            "included": preview.get("included", []),
            "skipped": preview.get("skipped", []),
            "already_scheduled_today": self._daily_batch_already_created(target),
            "trial_note": preview.get("trial_note"),
        }

    async def run_daily_confirmation_batch(self, *, trigger: str = "manual") -> dict:
        if not self.settings.clinic_mode or not self.settings.clinic_daily_confirmation_batch_enabled:
            raise ApiError(403, "forbidden", "Daily confirmation batch is disabled.", False)
        if not self.settings.live_voice:
            raise ApiError(409, "batch_not_available", "Bolna must be configured for confirmation batches.", False)

        target = tomorrow_date()
        automated = trigger in ("cron", "scheduler")
        if self._daily_batch_already_created(target):
            if automated:
                return {
                    "ok": True,
                    "trigger": trigger,
                    "appointment_date": target.isoformat(),
                    "recipient_count": 0,
                    "already_scheduled": True,
                    "message": f"Confirmation batch for {target} was already created today.",
                }
            raise ApiError(409, "already_scheduled", f"A confirmation batch for {target} was already created today.", False)

        task_ids = self.collect_tomorrow_confirmation_task_ids()
        if not task_ids:
            if automated:
                return {
                    "ok": True,
                    "trigger": trigger,
                    "appointment_date": target.isoformat(),
                    "recipient_count": 0,
                    "message": "No eligible confirmation calls for tomorrow's appointments.",
                }
            raise ApiError(422, "validation_error", "No eligible confirmation calls for tomorrow's appointments.", False)

        title = daily_batch_title(target)
        created = await self.create_batch_from_tasks(task_ids, title=title)
        batch_id = created["batch"]["batch_id"]
        run_at = timeutil.now_iso()
        scheduled = await self.schedule_app_batch(batch_id, run_at)
        self.add_event(
            "task",
            batch_id,
            None,
            "staff_action_recorded",
            f"Daily confirmation batch scheduled ({trigger}) — {len(task_ids)} patients for {target.isoformat()}",
            "system",
        )
        return {
            "ok": True,
            "trigger": trigger,
            "appointment_date": target.isoformat(),
            "scheduled_at": run_at,
            "batch": scheduled["batch"],
            "recipient_count": len(task_ids),
            "skipped": created.get("skipped", []),
        }

    # ------------------------------------------------------------------ batches (M4)
    def batch_preview(self, task_ids: list[str]) -> dict:
        included: list[dict] = []
        skipped: list[dict] = []
        for tid in task_ids:
            task = self.store.get("tasks", tid)
            if task is None:
                skipped.append({"task_id": tid, "reason": "Task not found"})
                continue
            eligible, reason = self.eligibility(task)
            if not eligible:
                skipped.append({
                    "task_id": tid,
                    "patient_name": self.patient_name(task["patient_id"]),
                    "reason": reason or "Not eligible",
                })
                continue
            stub = {"call_id": "preview"}
            patient = self.store.get("patients", task["patient_id"]) or {}
            contact = patient.get("phone_e164") if self.settings.clinic_mode else self.settings.demo_call_recipient
            if not contact:
                contact = "+910000000000"
            included.append({
                "task_id": tid,
                "patient_id": task["patient_id"],
                "patient_name": self.patient_name(task["patient_id"]),
                "task_type": task["task_type"],
                "title": task["title"],
                "contact_number": contact,
                "variables_preview": self._user_data(task, stub),
            })
        trial_note = None
        if self.settings.live_voice and not self.settings.clinic_mode:
            trial_note = (
                "Live Bolna trial may only dial verified numbers; all recipients use DEMO_CALL_RECIPIENT until approved."
            )
        elif self.settings.clinic_mode:
            trial_note = "Each call uses the patient's registered mobile. Numbers must be allowed on your Bolna account."
        return {
            "included": included,
            "skipped": skipped,
            "recipient_count": len(included),
            "trial_note": trial_note,
        }

    async def create_batch_from_tasks(self, task_ids: list[str], title: str | None = None) -> dict:
        preview = self.batch_preview(task_ids)
        if not preview["included"]:
            raise ApiError(422, "validation_error", "No eligible tasks in this batch.", False)
        if not self.settings.live_voice:
            raise ApiError(409, "batch_not_available", "Batch calling requires live Bolna configuration.", False)

        batch_id = new_id("batch")
        now = timeutil.now_iso()
        recipients: list[dict[str, str]] = []
        members: list[dict] = []

        for row in preview["included"]:
            task = self.store.get("tasks", row["task_id"])
            if task is None:
                continue
            member_id = new_id("bmem")
            call = {
                "call_id": new_id("call"),
                "task_id": task["task_id"],
                "patient_id": task["patient_id"],
                "provider_call_id": None,
                "workflow": task["task_type"],
                "purpose": task["title"],
                "status": "queued",
                "outcome": None,
                "summary": None,
                "transcript": None,
                "transcript_is_example": False,
                "extracted_fields": None,
                "processing_result": None,
                "is_live": True,
                "escalation_id": None,
                "started_at": None,
                "completed_at": None,
                "created_at": now,
            }
            ud = self._user_data(task, call)
            patient = self.store.get("patients", task["patient_id"]) or {}
            contact = (
                self._patient_dial_phone(task["patient_id"])
                if self.settings.clinic_mode
                else (self.settings.demo_call_recipient or "+910000000000")
            )
            if not contact:
                continue
            recipients.append({"contact_number": contact, **ud})
            members.append({
                "member_id": member_id,
                "batch_id": batch_id,
                "task_id": task["task_id"],
                "patient_id": task["patient_id"],
                "call_id": call["call_id"],
                "execution_id": None,
                "status": "pending",
                "created_at": now,
            })
            self.store.save("calls", call)

        webhook_url = None
        if self.settings.public_base_url and self.settings.bolna_webhook_secret:
            webhook_url = f"{self.settings.public_base_url}/api/webhooks/bolna?token={self.settings.bolna_webhook_secret}"

        try:
            created = await self.bolna_batch.create_batch(recipients, webhook_url=webhook_url)
        except BolnaError as exc:
            raise ApiError(502, "provider_error", str(exc), True)

        batch = {
            "batch_id": batch_id,
            "bolna_batch_id": created["batch_id"],
            "title": title or f"Follow-up batch ({len(members)} tasks)",
            "status": "validated",
            "bolna_status": created.get("raw", {}).get("status", "idle"),
            "scheduled_at": None,
            "recipient_count": len(members),
            "completed_count": 0,
            "failed_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        self.store.save("batches", batch)
        for member in members:
            self.store.save("batch_members", member)
        self.add_event("task", batch_id, None, "task_created", f"Batch created — {len(members)} recipients", "staff")
        return {
            "batch": public(batch),
            "members": [public(m) for m in members],
            "skipped": preview["skipped"],
            "trial_note": preview.get("trial_note"),
        }

    async def schedule_app_batch(self, batch_id: str, scheduled_at: str) -> dict:
        batch = self._get("batches", batch_id, "Batch")
        if batch["status"] not in ("validated", "draft"):
            raise ApiError(409, "invalid_state", f"Batch cannot be scheduled from status {batch['status']}.", False)
        try:
            await self.bolna_batch.schedule_batch(batch["bolna_batch_id"], scheduled_at)
        except BolnaError as exc:
            raise ApiError(502, "provider_error", str(exc), True)
        batch["status"] = "scheduled"
        batch["scheduled_at"] = scheduled_at
        batch["updated_at"] = timeutil.now_iso()
        self.store.save("batches", batch)
        return {"batch": public(batch)}

    async def stop_app_batch(self, batch_id: str) -> dict:
        batch = self._get("batches", batch_id, "Batch")
        if batch["status"] not in ("scheduled", "running"):
            raise ApiError(409, "invalid_state", "Batch is not scheduled or running.", False)
        try:
            await self.bolna_batch.stop_batch(batch["bolna_batch_id"])
        except BolnaError as exc:
            raise ApiError(502, "provider_error", str(exc), True)
        batch["status"] = "stopped"
        batch["updated_at"] = timeutil.now_iso()
        self.store.save("batches", batch)
        return {"batch": public(batch)}

    def list_batches(self) -> list[dict]:
        batches = sorted(self.store.all("batches"), key=lambda b: _ts(b.get("created_at")), reverse=True)
        return [public(b) for b in batches]

    def batch_detail(self, batch_id: str) -> dict:
        batch = self._get("batches", batch_id, "Batch")
        members = [public(m) for m in self.store.find("batch_members", batch_id=batch_id)]
        return {"batch": public(batch), "members": members}
