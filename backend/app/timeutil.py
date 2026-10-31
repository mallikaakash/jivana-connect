"""Time helpers. Every timestamp the API emits is ISO 8601 with the IST offset (+05:30)."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), name="IST")

# Tests can freeze "now" so time-dependent counts (overdue, due today) are deterministic.
_now_override: datetime | None = None


def set_now_override(dt: datetime | None) -> None:
    global _now_override
    _now_override = dt.astimezone(IST).replace(microsecond=0) if dt else None


def now() -> datetime:
    if _now_override is not None:
        return _now_override
    return datetime.now(IST).replace(microsecond=0)


def iso(dt: datetime) -> str:
    return dt.astimezone(IST).replace(microsecond=0).isoformat()


def now_iso() -> str:
    return iso(now())


def parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.astimezone(IST)


def end_of_today() -> datetime:
    return datetime.combine(now().date(), time(23, 59, 59), tzinfo=IST)


def start_of_today() -> datetime:
    return datetime.combine(now().date(), time(0, 0, 0), tzinfo=IST)


def human(dt_str: str | None) -> str:
    """'31 Oct, 10:30 AM' — used in user_data passed to the voice agent and in messages."""
    dt = parse(dt_str)
    if not dt:
        return ""
    return dt.strftime("%d %b, %I:%M %p").lstrip("0")
