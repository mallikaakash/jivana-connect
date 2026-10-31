#!/usr/bin/env python3
"""Push backend/bolna/jiya_system_prompt.txt to live Bolna agent (en + hi multilingual)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
PROMPT_FILE = ROOT / "backend" / "bolna" / "jiya_system_prompt.txt"
ENV_FILE = Path(os.environ.get("ENV_FILE", ROOT / "backend" / ".env.gcp"))

CALL_CANCELLATION = (
    "After the workflow goal is met (attendance confirmed, reschedule noted, concern recorded, "
    "test status noted, task acknowledged, or callback handled), say one brief goodbye and end. "
    "Do not repeat thank-yous or ask if they need anything else. If the patient already said bye, do not speak again."
)


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> int:
    env = load_env(ENV_FILE)
    api_key = env.get("BOLNA_API_KEY") or os.environ.get("BOLNA_API_KEY")
    agent_id = env.get("BOLNA_AGENT_ID") or os.environ.get("BOLNA_AGENT_ID")
    if not api_key or not agent_id:
        print("Missing BOLNA_API_KEY or BOLNA_AGENT_ID", file=sys.stderr)
        return 1
    prompt = PROMPT_FILE.read_text().strip()
    if not prompt:
        print("Empty prompt file", file=sys.stderr)
        return 1

    base = (env.get("BOLNA_BASE_URL") or "https://api.bolna.ai").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    with httpx.Client(timeout=60) as client:
        get_res = client.get(f"{base}/v2/agent/{agent_id}", headers=headers)
        get_res.raise_for_status()
        agent = get_res.json()

        tasks = agent.get("tasks") or []
        if not tasks:
            print("Agent has no tasks", file=sys.stderr)
            return 1
        task = tasks[0]
        ml = (task.get("tools_config") or {}).get("multilingual_config") or {}
        langs = ml.get("languages") or {}
        for code in ("en", "hi"):
            if code in langs:
                langs[code]["system_prompt"] = prompt
        task.setdefault("task_config", {})["call_cancellation_prompt"] = CALL_CANCELLATION

        agent_prompts = agent.get("agent_prompts") or {"task_1": {}}
        for key in list(agent_prompts.keys()):
            agent_prompts[key]["system_prompt"] = prompt
        if "task_1" not in agent_prompts:
            agent_prompts["task_1"] = {"system_prompt": prompt}

        body = {
            "agent_config": {
                "agent_name": agent.get("agent_name", "Jiya"),
                "agent_welcome_message": agent.get("agent_welcome_message"),
                "webhook_url": agent.get("webhook_url"),
                "tasks": tasks,
            },
            "agent_prompts": agent_prompts,
        }
        put_res = client.put(f"{base}/v2/agent/{agent_id}", headers=headers, json=body)
        if put_res.status_code >= 400:
            print(put_res.status_code, put_res.text[:2000], file=sys.stderr)
            put_res.raise_for_status()
        print(json.dumps({"ok": True, "agent_id": agent_id, "prompt_chars": len(prompt)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
