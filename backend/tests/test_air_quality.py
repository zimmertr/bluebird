from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from app.services import air_quality
from app.services.air_quality import (
    _metrics,
    _parse_ts,
    _series,
    fetch_aqi_batch,
)

START = datetime(2026, 7, 21, 0, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
END = datetime(2026, 7, 21, 2, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local


def _hourly(times, aqi):
    return {"hourly": {"time": times, "us_aqi": aqi}}


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
    assert _parse_ts("2026-07-21T05:00") == datetime(2026, 7, 21, 5, 0)  # noqa: DTZ001 — _parse_ts returns naive
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


# ── the 429 short-circuit ──────────────────────────────────────────────────
#
# The 2026-07-29 incident's "zombie" AQI batches: once the quota was spent,
# every remaining batch still went out to learn the same thing, draining the
# next minute's budget mid-fallback. The guard against that had no test.


class _FakeResponse:
    def __init__(self, payload: Any):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self._payload


def _stub_openmeteo(monkeypatch, behaviors: list[Any]) -> list[dict[str, Any]]:
    """Replay one behavior per upstream GET; running off the end is an
    IndexError, which is how "this batch never fired" gets asserted."""
    calls: list[dict[str, Any]] = []

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None):
            # Yield once so concurrent batches actually overlap. Without it a
            # batch runs start-to-finish before its siblings begin, and the
            # short-circuit below would look stronger than it is.
            await asyncio.sleep(0)
            behavior = behaviors[len(calls)]
            calls.append(params or {})
            if isinstance(behavior, Exception):
                raise behavior
            return _FakeResponse(behavior)

    monkeypatch.setattr(air_quality.httpx, "AsyncClient", _Client)
    return calls


def _dests(n: int) -> list[dict[str, Any]]:
    return [{"latitude": 40.0 + i * 0.1, "longitude": -120.0} for i in range(n)]


def _rate_limited(scope: str = "minutely") -> httpx.HTTPStatusError:
    request = httpx.Request("GET", air_quality.AIR_QUALITY_URL)
    response = httpx.Response(
        429, request=request, json={"reason": f"{scope} API request limit exceeded"}
    )
    return httpx.HTTPStatusError("429", request=request, response=response)


async def test_a_rate_limit_skips_the_remaining_batches(monkeypatch):
    # 250 destinations = 5 batches against an in-flight gate of 4. The first
    # four overlap and all see the 429; the fifth only acquires a slot once one
    # of them has finished and set the flag, so it returns nulls without ever
    # reaching the network. The script holds four behaviors, so a fifth
    # upstream call would IndexError rather than pass quietly.
    calls = _stub_openmeteo(monkeypatch, [_rate_limited()] * 4)
    results = await fetch_aqi_batch(_dests(250), START, END)

    assert len(calls) == 4
    assert results == [None] * 250  # best-effort: nulls, never a raised error


async def test_rate_limited_nulls_are_not_cached(monkeypatch):
    # Those Nones mean "unknown", not "no data for this window". Caching them
    # would freeze the outage in place for the length of the forecast TTL.
    _stub_openmeteo(monkeypatch, [_rate_limited()] * 4)
    assert await fetch_aqi_batch(_dests(250), START, END) == [None] * 250

    calls = _stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]])
    results = await fetch_aqi_batch(_dests(1), START, END)
    assert len(calls) == 1  # asked again rather than serving the outage
    assert results[0]["aqi_avg"] == 80


async def test_a_real_answer_is_still_cached(monkeypatch):
    # The counterpart: a successful fetch does populate the cache, so the
    # no-caching rule above is specific to the rate-limited path.
    calls = _stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]])
    first = await fetch_aqi_batch(_dests(1), START, END)
    second = await fetch_aqi_batch(_dests(1), START, END)
    assert len(calls) == 1
    assert second == first
