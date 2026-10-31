#!/usr/bin/env python3
"""Print live-voice readiness checks (no outbound calls)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402


def line(ok: bool, label: str, detail: str = "") -> None:
    mark = "OK  " if ok else "FAIL"
    msg = f"[{mark}] {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)


def main() -> int:
    s = Settings.from_env()
    fails = 0

    line(s.bolna_api_key is not None, "BOLNA_API_KEY set")
    line(s.bolna_agent_id is not None, "BOLNA_AGENT_ID set")
    line(s.demo_call_recipient is not None, "DEMO_CALL_RECIPIENT set", s.demo_call_recipient or "")
    line(s.live_voice, "live_voice composite", "all three vars above required")

    if s.public_base_url:
        line(True, "PUBLIC_BASE_URL", s.public_base_url)
    else:
        line(False, "PUBLIC_BASE_URL", "set for webhooks; poller-only works without tunnel")
        fails += 1

    if s.bolna_webhook_secret:
        line(True, "BOLNA_WEBHOOK_SECRET set")
        if s.public_base_url:
            print(f"       webhook: {s.public_base_url}/api/webhooks/bolna?token=<secret>")
    else:
        line(False, "BOLNA_WEBHOOK_SECRET", "recommended for production webhook")
        fails += 1

    seed = s.seed_path
    line(seed.is_file(), "seed file", str(seed))

    try:
        from app.bolna_mapper import JiyaExtractionMapper  # noqa: F401

        line(True, "bolna_mapper import")
    except Exception as exc:
        line(False, "bolna_mapper import", str(exc))
        fails += 1

    if not s.live_voice:
        fails += 1

    print()
    if fails:
        print(f"{fails} check(s) need attention before a live demo.")
        return 1
    print("Ready for a live test call (see docs/bolna/LIVE_RUNBOOK.md).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
