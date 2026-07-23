from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.air_quality import (
    _metrics,
    _parse_ts,
    _series,
    fetch_aqi_batch,
)

START = datetime(2026, 7, 21, 0, 0)
END = datetime(2026, 7, 21, 2, 0)


def _hourly(times, aqi):
    return {"hourly": {"time": times, "us_aqi_pm2_5": aqi}}


def test_metrics_avg_and_max():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [80, 90, 100])
    assert _metrics(data, START, END) == {"aqi_avg": 90, "aqi_max": 100}


def test_metrics_skips_none_values():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [80, None, 100])
    assert _metrics(data, START, END) == {"aqi_avg": 90, "aqi_max": 100}


def test_metrics_excludes_out_of_window():
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00", "2026-07-21T09:00"],
        [80, 90, 100, 500],
    )
    assert _metrics(data, START, END)["aqi_max"] == 100


def test_metrics_empty_returns_none():
    assert _metrics(_hourly([], []), START, END) is None


def test_metrics_all_none_returns_none():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00"], [None, None])
    assert _metrics(data, START, END) is None


def test_metrics_result_is_integer_index():
    # US AQI is an integer index; averages are rounded to whole numbers.
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [70, 80, 90])
    m = _metrics(data, START, END)
    assert isinstance(m["aqi_avg"], int)
    assert m["aqi_avg"] == 80


def test_metrics_malformed_payload_returns_none():
    assert _metrics({"nope": 1}, START, END) is None


def test_parse_ts_roundtrip():
    assert _parse_ts("2026-07-21T05:00") == datetime(2026, 7, 21, 5, 0)
    assert _parse_ts("garbage") is None


async def test_fetch_batch_empty_returns_empty():
    assert await fetch_aqi_batch([], START, END) == []


async def test_fetch_batch_beyond_horizon_skips_without_network():
    # A window that starts well past the ~5-day AQI horizon must degrade to
    # None entries rather than calling (and 400-ing) the upstream API.
    far_start = datetime.now(timezone.utc) + timedelta(days=10)
    far_end = far_start + timedelta(days=1)
    dests = [{"latitude": 47.0, "longitude": -121.0}, {"latitude": 46.0, "longitude": -122.0}]
    assert await fetch_aqi_batch(dests, far_start, far_end) == [None, None]


# ── _series (hourly bake-in for the chart) ─────────────────────────────────


def test_series_keeps_hours_and_preserves_nulls():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [80, None, 100])
    s = _series(data, START, END)
    assert s["aqi"] == [80, None, 100]
    assert len(s["times"]) == 3


def test_series_times_are_utc_epoch_ms():
    data = _hourly(["2026-07-21T00:00"], [80])
    s = _series(data, START, END)
    expected = int(datetime(2026, 7, 21, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    assert s["times"] == [expected]


def test_series_excludes_out_of_window():
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00", "2026-07-21T09:00"],
        [80, 90, 100, 500],
    )
    s = _series(data, START, END)
    assert s["aqi"] == [80, 90, 100]


def test_series_empty_returns_none():
    assert _series(_hourly([], []), START, END) is None
