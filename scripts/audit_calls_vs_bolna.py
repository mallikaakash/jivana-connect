#!/usr/bin/env python3
"""
Compare clinic API call records to Bolna execution data (source of truth for live calls).

Exit 0 only when every audited call aligns: outcome + transcript overlap with Bolna.
Skips calls with no Bolna conversation (stopped / no transcript / zero duration).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.bolna import map_status, parse_payload, parse_transcript  # noqa: E402
from app.bolna_mapper import prepare_extracted_for_task  # noqa: E402


def _env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def http_json(url: str, *, method: str = "GET", headers: dict | None = None, body: dict | None = None) -> dict:
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=45) as res:
        return json.loads(res.read().decode())


def bolna_get_execution(base_url: str, api_key: str, execution_id: str) -> dict | None:
    url = f"{base_url.rstrip('/')}/executions/{execution_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode())
            return data if isinstance(data, dict) else None
    except urllib.error.HTTPError:
        return None


def outcome_from_extraction(workflow: str, ex: dict) -> str | None:
    if workflow == "appointment_confirmation":
        return ex.get("appointment_outcome") if isinstance(ex.get("appointment_outcome"), str) else None
    if workflow == "test_report_reminder":
        done = ex.get("test_completed")
        if done is True:
            return "test_completion_reported"
        if done is False:
            return "test_not_done"
        return None
    if workflow == "post_procedure_checkin":
        cr = ex.get("checkin_result")
        if cr == "routine_ok":
            return "routine_ok"
        if cr == "concern_reported":
            return "concern_reported"
        return None
    if workflow == "clinician_task_reminder":
        if ex.get("task_acknowledged") is True:
            return "task_acknowledged"
        return None
    if workflow == "callback_request":
        if ex.get("callback_requested") is True:
            return "callback_requested"
        return None
    return None


def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def _patient_lines(transcript: list[dict] | None) -> str:
    if not transcript:
        return ""
    return " ".join(t.get("text", "") for t in transcript if t.get("role") == "patient")


def transcript_aligns(db_transcript: list[dict] | None, bolna_transcript_raw: str | None) -> tuple[bool, str]:
    if not bolna_transcript_raw or not bolna_transcript_raw.strip():
        return True, "no bolna transcript"
    bolna_n = _normalize_text(bolna_transcript_raw)
    db_patient = _normalize_text(_patient_lines(db_transcript))
    if not db_patient:
        return False, "db has no patient transcript but Bolna does"
    # Require a meaningful chunk of patient speech to appear in Bolna (not a 2-line script stub).
    words = [w for w in db_patient.split() if len(w) > 2]
    if len(words) >= 3 and db_patient in bolna_n:
        return True, "patient text contained in bolna"
    overlap = sum(1 for w in words[:12] if w in bolna_n)
    if overlap >= max(3, len(words) // 3):
        return True, f"word overlap {overlap}"
    return False, f"db patient {db_patient[:80]!r} vs bolna snippet {bolna_n[:80]!r}"


def bolna_has_conversation(bolna: dict) -> bool:
    status = (bolna.get("status") or "").lower().replace("-", "_")
    duration = int(bolna.get("conversation_duration") or bolna.get("telephony_data", {}).get("duration") or 0)
    transcript = bolna.get("transcript")
    if status == "completed" and (duration >= 8 or (isinstance(transcript, str) and len(transcript) > 80)):
        return True
    if isinstance(transcript, str) and len(transcript.strip()) > 80:
        return True
    return False


def audit_call(call: dict, task: dict | None, bolna: dict) -> list[str]:
    issues: list[str] = []
    if not bolna_has_conversation(bolna):
        # DB marked completed with outcome but Bolna never connected — likely scripted webhook.
        if call.get("status") == "completed" and call.get("outcome") and call.get("is_live"):
            issues.append(
                f"{call['call_id']}: clinic shows completed/{call.get('outcome')} but Bolna has no conversation "
                f"(status={bolna.get('status')}, duration={bolna.get('conversation_duration')})"
            )
        return issues

    upd = parse_payload(bolna)
    known, mapped = map_status(upd.raw_status)
    if known and mapped != "completed":
        issues.append(f"{call['call_id']}: Bolna not completed ({bolna.get('status')})")
        return issues

    task_type = task["task_type"] if task else call.get("workflow")
    prepared, _ = prepare_extracted_for_task(
        task_type or "",
        upd.extracted,
        transcript=upd.transcript or parse_transcript(bolna.get("transcript")),
        summary=upd.summary or bolna.get("summary"),
    )
    ex = prepared or upd.extracted or {}
    expected = outcome_from_extraction(task_type or call.get("workflow") or "", ex)
    actual = call.get("outcome")

    if expected is not None and actual != expected:
        issues.append(f"{call['call_id']}: outcome mismatch db={actual!r} bolna_inferred={expected!r}")
    if expected is None and actual is not None and task_type == "callback_request" and ex.get("callback_requested") is not True:
        # completed callback call with no callback_requested is OK
        pass

    ok, reason = transcript_aligns(call.get("transcript"), bolna.get("transcript") if isinstance(bolna.get("transcript"), str) else None)
    if not ok:
        issues.append(f"{call['call_id']}: transcript misaligned ({reason})")

    return issues


def main() -> int:
    p = argparse.ArgumentParser(description="Audit clinic calls against Bolna executions")
    p.add_argument("--api", default=os.environ.get("API", "https://jivana-clinic-api-2lcs3sivbq-el.a.run.app"))
    p.add_argument("--key", default=os.environ.get("KEY", "jivana-hackathon-demo"))
    p.add_argument("--patient-id", default="", help="Only audit calls for this patient")
    p.add_argument("--env-file", default=str(ROOT / "backend" / ".env.gcp"))
    args = p.parse_args()

    env = _env_file(Path(args.env_file))
    bolna_key = os.environ.get("BOLNA_API_KEY") or env.get("BOLNA_API_KEY")
    bolna_base = os.environ.get("BOLNA_BASE_URL") or env.get("BOLNA_BASE_URL") or "https://api.bolna.ai"
    if not bolna_key:
        print("FAIL: BOLNA_API_KEY not set (env or backend/.env.gcp)", file=sys.stderr)
        return 2

    auth = {"Authorization": f"Bearer {args.key}"}
    calls_payload = http_json(f"{args.api.rstrip('/')}/api/calls?limit=200", headers=auth)
    calls = calls_payload.get("items") or []
    if args.patient_id:
        calls = [c for c in calls if c.get("patient_id") == args.patient_id]

    tasks_payload = http_json(f"{args.api.rstrip('/')}/api/tasks?limit=200", headers=auth)
    tasks = {t["task_id"]: t for t in tasks_payload.get("items") or []}

    audited = 0
    skipped = 0
    all_issues: list[str] = []

    print(f"Auditing {len(calls)} call(s) against Bolna…")
    for call in calls:
        eid = call.get("provider_call_id")
        if not eid:
            all_issues.append(f"{call['call_id']}: missing provider_call_id")
            continue
        bolna = bolna_get_execution(bolna_base, bolna_key, eid)
        if bolna is None:
            all_issues.append(f"{call['call_id']}: Bolna execution {eid} not found")
            continue
        task = tasks.get(call.get("task_id") or "")
        if bolna_has_conversation(bolna):
            audited += 1
        else:
            skipped += 1
        all_issues.extend(audit_call(call, task, bolna))

    print(f"  audited_with_conversation={audited} skipped_no_conversation={skipped}")
    if all_issues:
        print("AUDIT FAILED:")
        for line in all_issues:
            print(f"  - {line}")
        return 1
    print("AUDIT OK: all calls align with Bolna")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
