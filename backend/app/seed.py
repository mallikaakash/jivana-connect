"""Seed loading. Resolves the relative timestamp form used in shared/seed.json:

- "rel:<±N>d@HH:MM" -> today (IST) ± N days at HH:MM IST
- "rel:<±N>m"       -> now ± N minutes
"""

from __future__ import annotations

import copy
import json
import re
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any

from . import timeutil
from .timeutil import IST

_REL_DAY = re.compile(r"^rel:([+-]?\d+)d@(\d{1,2}):(\d{2})$")
_REL_MIN = re.compile(r"^rel:([+-]?\d+)m$")

COLLECTIONS = ("patients", "appointments", "tasks", "calls", "escalations", "events")


def resolve_rel(value: str, now: datetime | None = None) -> str:
    now = now or timeutil.now()
    m = _REL_DAY.match(value)
    if m:
        days, hh, mm = int(m.group(1)), int(m.group(2)), int(m.group(3))
        day = now.astimezone(IST).date() + timedelta(days=days)
        return timeutil.iso(datetime.combine(day, time(hh, mm), tzinfo=IST))
    m = _REL_MIN.match(value)
    if m:
        return timeutil.iso(now + timedelta(minutes=int(m.group(1))))
    raise ValueError(f"Unrecognised relative timestamp: {value!r}")


def _resolve(node: Any, now: datetime) -> Any:
    if isinstance(node, str) and node.startswith("rel:"):
        return resolve_rel(node, now)
    if isinstance(node, list):
        return [_resolve(v, now) for v in node]
    if isinstance(node, dict):
        return {k: _resolve(v, now) for k, v in node.items()}
    return node


_raw_cache: dict[Path, dict] = {}


def load_seed(path: Path, now: datetime | None = None) -> dict[str, list[dict]]:
    """Return {collection: [records]} with every rel: timestamp resolved against `now`."""
    path = Path(path)
    if path not in _raw_cache:
        _raw_cache[path] = json.loads(path.read_text(encoding="utf-8"))
    raw = copy.deepcopy(_raw_cache[path])
    now = now or timeutil.now()
    return {name: _resolve(raw.get(name, []), now) for name in COLLECTIONS}
