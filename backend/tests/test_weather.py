from __future__ import annotations

from datetime import datetime, timezone

from app.services.weather import (
    _metrics,
    _naive,
    _parse_ts,
    _series,
    fetch_weather_batch,
)


def _hourly(times, precip, temp, wind):
    return {
        "hourly": {
            "time": times,
            "precipitation": precip,
            "temperature_2m": temp,
            "wind_speed_10m": wind,
        }
    }


START = datetime(2026, 7, 21, 0, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
END = datetime(2026, 7, 21, 2, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local


def test_metrics_aggregates_full_window():
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"],
        [0.1, 0.2, 0.0],
        [50.0, 52.0, 54.0],
        [5.0, 7.0, 9.0],
    )
    m = _metrics(data, START, END)
    assert m == {
        "precip_total_in": 0.3,
        "precip_avg_in_hr": 0.1,
        "precip_max_in_hr": 0.2,
        "temp_min_f": 50.0,
        "temp_max_f": 54.0,
        "temp_avg_f": 52.0,
        "wind_min_mph": 5.0,
        "wind_max_mph": 9.0,
        "wind_avg_mph": 7.0,
    }


def test_metrics_excludes_timestamps_outside_window():
    # The 03:00 sample sits past END and must not contribute to the totals.
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00", "2026-07-21T03:00"],
        [0.1, 0.2, 0.0, 99.0],
        [50.0, 52.0, 54.0, 99.0],
        [5.0, 7.0, 9.0, 99.0],
    )
    m = _metrics(data, START, END)
    assert m["precip_max_in_hr"] == 0.2
    assert m["temp_max_f"] == 54.0


def test_metrics_skips_hours_with_missing_values():
    # Any hour with a None in precip/temp/wind is dropped whole.
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"],
        [0.1, None, 0.3],
        [50.0, 52.0, 54.0],
        [5.0, 7.0, 9.0],
    )
    m = _metrics(data, START, END)
    assert m["precip_total_in"] == 0.4  # 0.1 + 0.3, the None hour excluded
    assert m["temp_min_f"] == 50.0
    assert m["temp_max_f"] == 54.0


def test_metrics_empty_window_returns_none():
    data = _hourly([], [], [], [])
    assert _metrics(data, START, END) is None


def test_metrics_all_out_of_range_returns_none():
    data = _hourly(["2020-01-01T00:00"], [0.1], [50.0], [5.0])
    assert _metrics(data, START, END) is None


def test_metrics_rounding_precision():
    # Feed many-decimal inputs whose raw averages are NOT already at the target
    # precision, then assert each output is idempotent under a round to that
    # precision — i.e. the code truncated it (precip to 4 places, temp/wind to 1).
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00"],
        [0.1234567, 0.7654321],
        [50.123456, 51.987654],
        [5.111111, 7.999999],
    )
    m = _metrics(data, START, END)
    assert m["precip_total_in"] == round(m["precip_total_in"], 4)
    assert m["precip_avg_in_hr"] == round(m["precip_avg_in_hr"], 4)
    assert m["temp_avg_f"] == round(m["temp_avg_f"], 1)
    assert m["wind_avg_mph"] == round(m["wind_avg_mph"], 1)
    # Sanity: the raw temp average (51.0555…) really would differ pre-rounding.
    assert m["temp_avg_f"] == 51.1


def test_metrics_malformed_payload_returns_none():
    # A completely unexpected shape is swallowed to None, never raised.
    assert _metrics({"unexpected": True}, START, END) is None


def test_parse_ts_valid():
    assert _parse_ts("2026-07-21T06:30") == datetime(2026, 7, 21, 6, 30)  # noqa: DTZ001 — _parse_ts returns naive


def test_parse_ts_invalid_returns_none():
    assert _parse_ts("not-a-timestamp") is None


def test_naive_strips_timezone():
    from datetime import timezone

    aware = datetime(2026, 7, 21, 0, 0, tzinfo=timezone.utc)
    assert _naive(aware).tzinfo is None


async def test_fetch_weather_batch_empty_returns_empty():
    assert await fetch_weather_batch([], START, END) == []


# ── _series (hourly bake-in for the chart) ─────────────────────────────────


def test_series_keeps_every_hour_and_preserves_nulls_per_metric():
    # Unlike _metrics (which drops a whole hour on any null), _series keeps all
    # in-window hours and preserves each metric's nulls independently.
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"],
        [0.1, None, 0.3],
        [50.0, 52.0, None],
        [5.0, 7.0, 9.0],
    )
    s = _series(data, START, END)
    assert s["precip_in"] == [0.1, None, 0.3]
    assert s["temp_f"] == [50.0, 52.0, None]
    assert s["wind_mph"] == [5.0, 7.0, 9.0]
    assert len(s["times"]) == 3


def test_series_times_are_utc_epoch_ms():
    data = _hourly(["2026-07-21T00:00"], [0.0], [50.0], [5.0])
    s = _series(data, START, END)
    expected = int(datetime(2026, 7, 21, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    assert s["times"] == [expected]


def test_series_excludes_out_of_window():
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00", "2026-07-21T03:00"],
        [0.1, 0.2, 0.3, 99.0],
        [50.0, 51.0, 52.0, 99.0],
        [5.0, 6.0, 7.0, 99.0],
    )
    s = _series(data, START, END)
    assert len(s["times"]) == 3
    assert s["precip_in"] == [0.1, 0.2, 0.3]


def test_series_rounds_like_metrics():
    data = _hourly(["2026-07-21T00:00"], [0.1234567], [50.123456], [5.111111])
    s = _series(data, START, END)
    assert s["precip_in"] == [round(0.1234567, 4)]
    assert s["temp_f"] == [round(50.123456, 1)]
    assert s["wind_mph"] == [round(5.111111, 1)]


def test_series_empty_window_returns_none():
    assert _series(_hourly([], [], [], []), START, END) is None


def test_series_malformed_payload_returns_none():
    assert _series({"unexpected": True}, START, END) is None
