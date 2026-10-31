"""Daily Bolna batch: call all patients with appointments tomorrow at a fixed IST time."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from . import timeutil

IST = timeutil.IST


def parse_batch_time(hhmm: str) -> time:
    parts = (hhmm or "16:00").strip().split(":")
    hour = int(parts[0]) if parts else 16
    minute = int(parts[1]) if len(parts) > 1 else 0
    return time(max(0, min(23, hour)), max(0, min(59, minute)))


def confirmation_call_moment(appointment_scheduled_at: datetime, batch_time: time) -> datetime:
    """IST datetime when we intend to confirm (calendar day before the appointment)."""
    appt = appointment_scheduled_at.astimezone(IST)
    call_day = appt.date() - timedelta(days=1)
    return datetime.combine(call_day, batch_time, tzinfo=IST)


def tomorrow_date(now: datetime | None = None) -> date:
    return (now or timeutil.now()).date() + timedelta(days=1)


def appointment_on_date(appt_scheduled_at: str, day: date) -> bool:
    dt = timeutil.parse(appt_scheduled_at)
    return dt is not None and dt.astimezone(IST).date() == day


def batch_run_window(now: datetime, batch_time: time) -> bool:
    """True during the configured minute (scheduler checks once per loop minute)."""
    local = now.astimezone(IST)
    return local.hour == batch_time.hour and local.minute == batch_time.minute


def daily_batch_title(for_appt_day: date) -> str:
    return f"Daily confirmation — appointments on {for_appt_day.strftime('%d %b %Y')}"
