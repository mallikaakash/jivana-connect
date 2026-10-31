from datetime import datetime

from app import timeutil
from app.reschedule_parse import parse_reschedule_window_to_iso


def test_parse_second_november():
    iso = parse_reschedule_window_to_iso(
        "second November",
        "2026-11-01T16:00:00+05:30",
        now=datetime(2026, 10, 31, 14, 0, tzinfo=timeutil.IST),
    )
    assert iso == "2026-11-02T16:00:00+05:30"


def test_parse_numeric_november():
    iso = parse_reschedule_window_to_iso("3 November", "2026-11-01T16:00:00+05:30")
    assert iso == "2026-11-03T16:00:00+05:30"


def test_same_day_returns_none():
    assert parse_reschedule_window_to_iso("1 November", "2026-11-01T16:00:00+05:30") is None


def test_vague_window_returns_none():
    assert parse_reschedule_window_to_iso("Monday morning", "2026-11-01T16:00:00+05:30") is None
