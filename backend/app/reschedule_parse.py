"""Parse patient reschedule phrases into a new appointment datetime (IST)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta

from . import timeutil

IST = timeutil.IST

_MONTHS = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}

_ORDINAL_WORDS = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
    "eleventh": 11,
    "twelfth": 12,
    "thirteenth": 13,
    "fourteenth": 14,
    "fifteenth": 15,
    "sixteenth": 16,
    "seventeenth": 17,
    "eighteenth": 18,
    "nineteenth": 19,
    "twentieth": 20,
    "twenty first": 21,
    "twenty-first": 21,
    "twenty second": 22,
    "twenty-second": 22,
    "thirtieth": 30,
    "thirty first": 31,
    "thirty-first": 31,
}


def _combine_date_keep_time(original: datetime, year: int, month: int, day: int) -> datetime | None:
    orig = original.astimezone(IST)
    try:
        return datetime(year, month, day, orig.hour, orig.minute, tzinfo=IST)
    except ValueError:
        return None


def _parse_day_month(text: str, ref: datetime) -> tuple[int, int, int] | None:
    t = text.lower().strip()
    t = re.sub(r"\s+", " ", t)

    for phrase, days in [("day after tomorrow", 2), ("tomorrow", 1)]:
        if phrase in t:
            d = (ref.astimezone(IST).date() + timedelta(days=days))
            return d.year, d.month, d.day

    for word, day in sorted(_ORDINAL_WORDS.items(), key=lambda x: -len(x[0])):
        for mname, month in _MONTHS.items():
            if re.search(rf"\b{re.escape(word)}\s+{mname}\b", t):
                return ref.year, month, day
            if re.search(rf"\b{mname}\s+{re.escape(word)}\b", t):
                return ref.year, month, day

    m = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b",
        t,
    )
    if m:
        return ref.year, _MONTHS[m.group(2)], int(m.group(1))

    m = re.search(
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b",
        t,
    )
    if m:
        return ref.year, _MONTHS[m.group(1)], int(m.group(2))

    return None


def parse_reschedule_window_to_iso(
    window: str | None,
    original_scheduled_at: str,
    *,
    now: datetime | None = None,
) -> str | None:
    """
    When the patient names a different calendar day, return new scheduled_at ISO (same clock time as original).
    Returns None if the phrase is not a concrete date or matches the same day as the booking.
    """
    if not window or not window.strip():
        return None
    orig = timeutil.parse(original_scheduled_at)
    if orig is None:
        return None
    ref = now or timeutil.now()
    parts = _parse_day_month(window, ref)
    if not parts:
        return None
    year, month, day = parts
    new_dt = _combine_date_keep_time(orig, year, month, day)
    if new_dt is None:
        return None
    # If parsed date is before "today" in IST, assume next year (edge: December call for January)
    if new_dt.date() < ref.astimezone(IST).date() and month < ref.astimezone(IST).month:
        new_dt = _combine_date_keep_time(orig, year + 1, month, day)
    if new_dt is None:
        return None
    if new_dt.astimezone(IST).date() == orig.astimezone(IST).date():
        return None
    return timeutil.iso(new_dt)
