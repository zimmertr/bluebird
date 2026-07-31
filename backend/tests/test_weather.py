from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest
from app import ratelimit
from app.services import weather
from app.services.errors import UpstreamError, UpstreamRateLimited
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


def test_metrics_point_sample_window_hits_exactly_one_hour():
    # The models normalize an equal start/end (the "now" / "future day-time"
    # modes) to [floor(T), floor(T)+1min]. With the inclusive hour filter that
    # must catch exactly the requested hour's stamp — never the next one —
    # so every aggregate collapses to that single sample.
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"],
        [0.1, 0.2, 0.4],
        [50.0, 52.0, 54.0],
        [5.0, 7.0, 9.0],
    )
    start = datetime(2026, 7, 21, 1, 0)  # noqa: DTZ001 — matches the API's naive stamps
    end = datetime(2026, 7, 21, 1, 1)  # noqa: DTZ001
    m = _metrics(data, start, end)
    assert m["precip_total_in"] == 0.2
    assert m["temp_min_f"] == m["temp_avg_f"] == m["temp_max_f"] == 52.0
    assert m["wind_min_mph"] == m["wind_avg_mph"] == m["wind_max_mph"] == 7.0


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


# ── fetch_weather_batch (the fetch path itself) ────────────────────────────
#
# Everything above tests aggregation on a payload already in hand. These cover
# the half of weather.py that decides *whether and how* the payload is fetched:
# the cache, the batching, the index reassembly, and the 429 handling that came
# out of the 2026-07-29 incident. Before them the module sat at 45% coverage
# with the entire retry loop unexecuted.


class _FakeResponse:
    def __init__(self, payload: Any):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self._payload


def _stub_openmeteo(monkeypatch, behaviors: list[Any]) -> list[dict[str, Any]]:
    """Replay one scripted behavior per upstream GET, in call order.

    A behavior is an Exception (raised), a ``(ticks, payload)`` pair (yields to
    the event loop ``ticks`` times first, so completion order can be forced
    independent of start order), or a bare payload. Returns the list of params
    each call was made with, so batching can be asserted. Running off the end
    of the script is an IndexError, which is the point: a test that expects two
    upstream calls fails loudly on a third.
    """
    calls: list[dict[str, Any]] = []

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None):
            behavior = behaviors[len(calls)]
            calls.append(params or {})
            if isinstance(behavior, Exception):
                raise behavior
            if isinstance(behavior, tuple):
                ticks, payload = behavior
                for _ in range(ticks):
                    await asyncio.sleep(0)
                return _FakeResponse(payload)
            return _FakeResponse(behavior)

    monkeypatch.setattr(weather.httpx, "AsyncClient", _Client)
    return calls


def _one_location(precip: float = 0.1) -> dict[str, Any]:
    """One location's hourly block, its precip total carrying `precip`."""
    return _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"],
        [precip, 0.0, 0.0],
        [50.0, 52.0, 54.0],
        [5.0, 7.0, 9.0],
    )


def _payload(precips: list[float]) -> list[dict[str, Any]]:
    """Open-Meteo's multi-location shape: one hourly object per location."""
    return [_one_location(p) for p in precips]


def _dests(n: int, offset: int = 0) -> list[dict[str, Any]]:
    # Distinct coordinates so each gets its own cache key.
    return [
        {"latitude": 40.0 + (offset + i) * 0.5, "longitude": -120.0}
        for i in range(n)
    ]


def _rate_limited(scope: str, retry_after: int | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", weather.FORECAST_URL)
    response = httpx.Response(
        429,
        request=request,
        json={"reason": f"{scope} API request limit exceeded"},
        headers={"Retry-After": str(retry_after)} if retry_after else {},
    )
    return httpx.HTTPStatusError("429", request=request, response=response)


async def test_fetch_weather_batch_serves_a_repeat_analysis_from_cache(monkeypatch):
    # The whole point of the per-location cache: re-analyzing the same polygon
    # and window costs zero upstream calls. A second scripted payload is loaded
    # so a stray second fetch would return data rather than IndexError — the
    # call count is what proves it never happened.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1, 0.2]), _payload([9.9, 9.9])])
    dests = _dests(2)

    first = await fetch_weather_batch(dests, START, END)
    second = await fetch_weather_batch(dests, START, END)

    assert len(calls) == 1
    assert second == first
    assert [r["precip_total_in"] for r in second] == [0.1, 0.2]


async def test_fetch_weather_batch_fetches_only_the_uncached_locations(monkeypatch):
    # A partially-overlapping polygon pays only for what actually changed.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1, 0.2]), _payload([0.3])])
    await fetch_weather_batch(_dests(2), START, END)
    results = await fetch_weather_batch(_dests(3), START, END)

    assert len(calls) == 2
    # The second request carried one coordinate, not three.
    assert calls[1]["latitude"] == "41.0"
    assert [r["precip_total_in"] for r in results] == [0.1, 0.2, 0.3]


async def test_fetch_weather_batch_splits_into_batches_of_fifty(monkeypatch):
    calls = _stub_openmeteo(
        monkeypatch, [_payload([0.1] * 50), _payload([0.2] * 50), _payload([0.3] * 20)]
    )
    results = await fetch_weather_batch(_dests(120), START, END)

    assert len(calls) == 3
    assert [len(c["latitude"].split(",")) for c in calls] == [50, 50, 20]
    assert len(results) == 120


async def test_fetch_weather_batch_reassembles_by_index_not_arrival(monkeypatch):
    # Batches are awaited with as_completed, so results arrive in completion
    # order. The first batch is made to finish last to prove the reassembly
    # keys off each chunk's own index — otherwise a slow early batch would
    # silently hand every destination another location's forecast.
    calls = _stub_openmeteo(
        monkeypatch,
        [
            (4, _payload([0.1] * 50)),
            (2, _payload([0.2] * 50)),
            (0, _payload([0.3] * 20)),
        ],
    )
    results = await fetch_weather_batch(_dests(120), START, END)

    assert len(calls) == 3
    totals = [r["precip_total_in"] for r in results]
    assert totals[:50] == [0.1] * 50
    assert totals[50:100] == [0.2] * 50
    assert totals[100:] == [0.3] * 20


async def test_fetch_weather_batch_reports_progress_as_batches_land(monkeypatch):
    # Drives the SSE route's incremental progress; a miscount here shows the
    # user a bar that never reaches the end.
    seen: list[tuple[int, int, int, int]] = []

    async def on_progress(processed, total, done, total_batches):
        seen.append((processed, total, done, total_batches))

    _stub_openmeteo(monkeypatch, [_payload([0.1] * 50), _payload([0.2] * 10)])
    await fetch_weather_batch(_dests(60), START, END, on_progress=on_progress)

    assert [s[2] for s in seen] == [1, 2]  # batches done, in order
    assert seen[-1] == (60, 60, 2, 2)  # ends at the full count


async def test_fetch_weather_batch_counts_cached_rows_in_the_first_progress_call(
    monkeypatch,
):
    seen: list[tuple[int, int, int, int]] = []

    async def on_progress(processed, total, done, total_batches):
        seen.append((processed, total, done, total_batches))

    _stub_openmeteo(monkeypatch, [_payload([0.1, 0.2]), _payload([0.3])])
    await fetch_weather_batch(_dests(2), START, END)
    await fetch_weather_batch(_dests(3), START, END, on_progress=on_progress)

    # Two of the three were already held, so progress opens at 2/3 rather than
    # crawling up from zero.
    assert seen[0] == (2, 3, 0, 1)


async def test_fetch_weather_batch_narrates_a_long_pace_wait(monkeypatch):
    # When the weighted budget is about to make us wait, the route gets told
    # how long so the UI can say so instead of appearing hung.
    paced: list[int] = []

    async def on_pace(seconds):
        paced.append(seconds)

    class _SlowBudget:
        def wait_estimate_s(self, weight):
            return 12.4

        async def acquire(self, weight):
            return None

    monkeypatch.setattr(ratelimit, "WEATHER_WEIGHT", _SlowBudget())
    _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END, on_pace=on_pace)

    assert paced == [13]  # rounded up, so the countdown never finishes early


async def test_fetch_weather_batch_stays_quiet_for_a_short_pace_wait(monkeypatch):
    paced: list[int] = []

    async def on_pace(seconds):
        paced.append(seconds)

    class _BriefBudget:
        def wait_estimate_s(self, weight):
            return 3.0  # at the threshold, not past it

        async def acquire(self, weight):
            return None

    monkeypatch.setattr(ratelimit, "WEATHER_WEIGHT", _BriefBudget())
    _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END, on_pace=on_pace)

    assert paced == []


async def test_minutely_rate_limit_resumes_the_batch_once(monkeypatch):
    # The incident behavior: a minutely quota refills within the minute, so one
    # paced retry completes the batch instead of failing the whole analysis.
    slept: list[float] = []

    async def fake_sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr(weather.asyncio, "sleep", fake_sleep)
    calls = _stub_openmeteo(
        monkeypatch, [_rate_limited("minutely", retry_after=7), _payload([0.4])]
    )
    results = await fetch_weather_batch(_dests(1), START, END)

    assert len(calls) == 2
    assert slept == [7]  # the provider's Retry-After, honored
    assert results[0]["precip_total_in"] == 0.4


async def test_minutely_rate_limit_twice_gives_up(monkeypatch):
    # One resume, not a loop. A second 429 on the same batch is real exhaustion.
    async def fake_sleep(seconds):
        return None

    monkeypatch.setattr(weather.asyncio, "sleep", fake_sleep)
    calls = _stub_openmeteo(
        monkeypatch,
        [_rate_limited("minutely", retry_after=1), _rate_limited("minutely", retry_after=1)],
    )
    with pytest.raises(UpstreamRateLimited) as exc:
        await fetch_weather_batch(_dests(1), START, END)

    assert len(calls) == 2
    assert exc.value.scope == "minutely"


async def test_hourly_rate_limit_stops_immediately(monkeypatch):
    # No wait we are willing to impose helps an hourly quota, so it must not
    # burn a retry (or a sleep) discovering that.
    slept: list[float] = []

    async def fake_sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr(weather.asyncio, "sleep", fake_sleep)
    calls = _stub_openmeteo(monkeypatch, [_rate_limited("hourly")])
    with pytest.raises(UpstreamRateLimited) as exc:
        await fetch_weather_batch(_dests(1), START, END)

    assert len(calls) == 1
    assert slept == []
    assert exc.value.scope == "hourly"
    assert "hourly" in exc.value.message


async def test_a_non_429_status_error_is_an_upstream_error(monkeypatch):
    request = httpx.Request("GET", weather.FORECAST_URL)
    response = httpx.Response(500, request=request, text="upstream boom")
    failure = httpx.HTTPStatusError("500", request=request, response=response)
    calls = _stub_openmeteo(monkeypatch, [failure])

    with pytest.raises(UpstreamError) as exc:
        await fetch_weather_batch(_dests(1), START, END)

    assert len(calls) == 1  # a 5xx is not retried here
    assert not isinstance(exc.value, UpstreamRateLimited)


async def test_a_transport_failure_is_an_upstream_error(monkeypatch):
    _stub_openmeteo(monkeypatch, [httpx.ConnectError("no route to host")])
    with pytest.raises(UpstreamError):
        await fetch_weather_batch(_dests(1), START, END)


async def test_a_failed_batch_does_not_poison_the_cache(monkeypatch):
    # A failure must leave nothing behind, or the outage outlives itself for
    # the length of the forecast TTL.
    _stub_openmeteo(monkeypatch, [httpx.ConnectError("down")])
    with pytest.raises(UpstreamError):
        await fetch_weather_batch(_dests(1), START, END)

    calls = _stub_openmeteo(monkeypatch, [_payload([0.5])])
    results = await fetch_weather_batch(_dests(1), START, END)
    assert len(calls) == 1
    assert results[0]["precip_total_in"] == 0.5


async def test_a_single_location_response_object_is_normalized(monkeypatch):
    # Open-Meteo answers one location with an object and many with an array.
    _stub_openmeteo(monkeypatch, [_one_location(0.6)])
    results = await fetch_weather_batch(_dests(1), START, END)
    assert len(results) == 1
    assert results[0]["precip_total_in"] == 0.6


async def test_a_location_with_no_usable_hours_comes_back_none(monkeypatch):
    # Open-Meteo answered, but this location's window holds nothing — a real
    # None row, distinct from a fetch failure, and cached as such.
    _stub_openmeteo(monkeypatch, [[_hourly([], [], [], [])]])
    results = await fetch_weather_batch(_dests(1), START, END)
    assert results == [None]


async def test_the_response_carries_the_hourly_series_for_the_chart(monkeypatch):
    # One upstream fetch feeds both the aggregates and the chart; the route
    # must not have to re-query for the series.
    _stub_openmeteo(monkeypatch, [_payload([0.1])])
    results = await fetch_weather_batch(_dests(1), START, END)
    assert results[0]["series"]["precip_in"] == [0.1, 0.0, 0.0]
    assert len(results[0]["series"]["times"]) == 3
