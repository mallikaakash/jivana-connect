"""Domain logic: derived fields, serialisation, workflow rules, calls (live + simulated), escalations."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import timedelta
from typing import Any

from . import timeutil
from .bolna import TERMINAL, BolnaClient, BolnaError, map_status, normalise_extracted, parse_payload
from .config import Settings
from .errors import ApiError, not_found
from .seed import load_seed
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
        self._bg: dict[str, asyncio.Task] = {}  # call_id -> simulator / poller task
        self._pollers: set[str] = set()

    # ------------------------------------------------------------------ lifecycle
    def startup(self) -> None:
        if not self.store.load_from_mongo():
            self.reseed()

    def reseed(self) -> None:
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
        if task.get("attempt_count", 0) >= MAX_ATTEMPTS:
            return False, "Maximum 3 attempts reached"
        return True, None

    # ------------------------------------------------------------------ serialisers
    def patient_out(self, p: dict) -> dict:
        out = public(p)
        out["attention_status"] = self.attention_status(p["patient_id"])
        return out

    def task_out(self, t: dict, with_name: bool = False) -> dict:
        out = public(t)
        eligible, reason = self.eligibility(t)
        out["call_eligible"] = eligible
        out["call_ineligible_reason"] = reason
        if with_name:
            out["patient_name"] = self.patient_name(t["patient_id"])
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
        return {
            "environment": "demo",
            "data_mode": "seeded",
            "voice_mode": "live" if live else "simulated",
            "workflows": list(TASK_TYPES),
            "integrations": [
                {
                    "name": "Bolna (Jiya voice)",
                    "status": "live" if live else "simulated",
                    "detail": "Live Bolna calls to the demo recipient phone; patient data stays synthetic"
                    if live else "Simulated calls — set BOLNA_API_KEY, BOLNA_AGENT_ID and DEMO_CALL_RECIPIENT for live calls",
                },
                {"name": "MongoDB", "status": self.store.mongo_status, "detail": self.store.mongo_detail},
                {"name": "Booking system", "status": "not_configured",
                 "detail": "Rescheduling creates a staff task; no booking integration"},
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

        queue = sorted((t for t in tasks if t["status"] in ("pending", "due")), key=lambda t: _ts(t["due_at"]))[:6]
        return {
            "patients_count": len(self.store.all("patients")),
            "followups_due_count": len(followups_due),
            "calls_completed_count": len(completed_calls),
            "open_escalations_count": len(open_escalations),
            "needs_attention": needs,
            "recent_calls": [self.named(c) for c in self._calls_newest(calls)[:6]],
            "followup_queue": [self.task_out(t, with_name=True) for t in queue],
            "recent_activity": [public(e) for e in self._sort_events(self.store.all("events"))[:10]],
        }

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
            reason = f"Callback window: {t['callback_window']}" if t.get("callback_window") else t["next_action"]
        elif self.is_overdue(t, now):
            kind, reason = "overdue_task", f"Overdue — {t['next_action']}"
        elif t["status"] == "awaiting_staff_action":
            kind, reason = "awaiting_staff_action", t["next_action"]
        if not kind:
            return None
        return {
            "kind": kind,
            "task_id": t["task_id"],
            "patient_id": t["patient_id"],
            "patient_name": self.patient_name(t["patient_id"]),
            "title": t["title"],
            "reason": reason,
            "priority": priority,
            "due_at": t["due_at"],
            "escalation_id": esc["escalation_id"] if esc else None,
        }

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
    def list_appointments(self) -> list[dict]:
        return [self.named(a) for a in sorted(self.store.all("appointments"), key=lambda a: _ts(a["scheduled_at"]))]

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
        return {
            "task": self.task_out(t),
            "patient": self.patient_out(self._get("patients", t["patient_id"], "Patient")),
            "appointment": public(appt),
            "calls": [public(c) for c in calls],
            "events": self.events_for(ids),
        }

    def list_calls(self, status=None, task_id=None) -> list[dict]:
        calls = self._calls_newest(self.store.all("calls"))
        return [self.named(c) for c in calls
                if (not status or c["status"] == status) and (not task_id or c["task_id"] == task_id)]

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

    def update_escalation(self, escalation_id: str, action: str, assigned_to: str | None,
                          note: str | None, author: str | None) -> dict:
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
            e["status"] = "resolved"
            if (note or "").strip():
                add_note(note.strip())
            self.add_event("escalation", escalation_id, pid, "escalation_updated", f"Escalation resolved by {author}", "staff")
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
            "clinic_name": "Jivana clinic",
        }

    async def start_call(self, task_id: str) -> dict:
        task = self._get("tasks", task_id, "Task")
        eligible, reason = self.eligibility(task)
        if not eligible:
            raise ApiError(409, "call_not_eligible", reason or "This task cannot be called right now.", False)

        live = self.settings.live_voice
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

        if live:
            try:
                execution_id = await self.bolna.start_call(self._user_data(task, call))
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
        else:
            self._spawn(call["call_id"], self._simulate(call["call_id"]))

        return {"call": public(call), "task": self.task_out(task)}

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
        if not known or mapped is None:
            self.store.save("calls", call)
            return {"ok": True, "ignored": True, "reason": "non_final_status" if known else "unknown_status",
                    "call_id": call["call_id"]}
        if mapped not in TERMINAL:
            if not (call["status"] == "in_progress" and mapped == "initiating"):
                call["status"] = mapped
            self.store.save("calls", call)
            return {"ok": True, "call_id": call["call_id"], "status": call["status"]}

        # Bolna can post `completed` before post-call extraction is ready. While a poller is
        # watching this call, give extraction a few more polls before validating the outcome.
        if mapped == "completed" and not upd.extracted_present and call["call_id"] in self._pollers:
            call["_extraction_waits"] = call.get("_extraction_waits", 0) + 1
            if call["_extraction_waits"] <= 3:
                self.store.save("calls", call)
                return {"ok": True, "deferred": True, "call_id": call["call_id"]}

        return self.process_call_result(call, mapped, upd.extracted, call.get("summary"), call.get("transcript"),
                                        actor=actor)

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
            result_msg += f" Callback task {cb['task_id']} created" + (f" ({cb['callback_window']})." if cb.get("callback_window") else ".")

        call["processing_result"] = result_msg.strip()
        return {"ok": True, "call_id": call["call_id"], "status": "completed", "outcome": outcome}

    def _create_escalation(self, call: dict, task: dict, concern: str | None) -> dict:
        now = timeutil.now_iso()
        dept = task.get("department") or "Clinic"
        esc = {
            "escalation_id": new_id("esc"),
            "patient_id": task["patient_id"],
            "call_id": call["call_id"],
            "task_id": task["task_id"],
            "reason": "Patient-reported concern after procedure",
            "concern_summary": concern or "Patient reported a concern during the check-in call.",
            "priority": "high",
            "status": "open",
            "routing_destination": f"{dept} nurse desk",
            "assigned_to": None,
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
        cb = {
            "task_id": new_id("task"),
            "patient_id": source["patient_id"],
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
            "next_action": f"Call patient back — {window}" if window else "Call patient back",
            "latest_outcome": None,
            "extracted_fields": None,
            "test_tracking": None,
            "callback_window": window,
            "escalation_id": None,
            "created_at": timeutil.iso(now),
            "updated_at": timeutil.iso(now),
        }
        self.store.save("tasks", cb)
        self.add_event("task", cb["task_id"], cb["patient_id"], "callback_task_created",
                       f"Callback requested — {window}" if window else "Callback requested", "system")
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
