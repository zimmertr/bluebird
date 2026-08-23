from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest
from app import ratelimit
from app.models import DEFAULT_FORECAST_MODEL, ForecastModel
from app.services import weather
from app.services.errors import ModelCoverageError, UpstreamError, UpstreamRateLimited
from app.services.weather import (
    _metrics,
    _naive,
    _parse_ts,
    _series,
    _wind_at_elevation,
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
        "precip_min_in_hr": 0.0,
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


# One hour's free-air winds at the five levels, weakest to strongest, so an
# interpolation that picks the wrong bracket lands on a visibly wrong number.
_LEVELS_HOUR = [7.0, 10.0, 30.0, 40.0, 50.0]


def test_wind_at_elevation_none_returns_10m():
    assert _wind_at_elevation(5.0, None, _LEVELS_HOUR) == 5.0


def test_wind_at_elevation_below_lowest_level_returns_10m():
    # 2,000 ft = 609.6 m, under the 925 hPa height (762 m): a valley
    # destination is sheltered, and free air says nothing about it.
    assert _wind_at_elevation(5.0, 2000.0, _LEVELS_HOUR) == 5.0


def test_wind_at_elevation_interpolates_between_brackets():
    # 8,000 ft = 2438.4 m between 850 hPa (1457 m) and 700 hPa (3012 m):
    # 10 + (30 - 10) * (981.4 / 1555) = 22.6226...
    assert _wind_at_elevation(5.0, 8000.0, _LEVELS_HOUR) == pytest.approx(22.6226, abs=1e-3)


def test_wind_at_elevation_above_top_level_clamps():
    # 20,000 ft = 6096 m, above 500 hPa (5574 m): the top level's value.
    assert _wind_at_elevation(5.0, 20000.0, _LEVELS_HOUR) == 50.0


def test_wind_at_elevation_floors_at_10m_wind():
    # Free air weaker than the surface keeps the surface value: altitude can
    # only add exposure, never shelter.
    assert _wind_at_elevation(35.0, 8000.0, _LEVELS_HOUR) == 35.0


def test_wind_at_elevation_null_level_returns_10m():
    levels = [7.0, None, 30.0, 40.0, 50.0]
    assert _wind_at_elevation(5.0, 8000.0, levels) == 5.0


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

    stub = _Client()
    monkeypatch.setattr(weather.http, "client", lambda: stub)
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


async def test_fetch_weather_batch_requests_the_level_winds(monkeypatch):
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END)

    hourly = calls[0]["hourly"].split(",")
    for name, _ in weather._WIND_LEVELS:
        assert name in hourly
    # Still at weight factor 1: max(1, vars/10) with 8 variables.
    assert len(hourly) == weather.N_VARIABLES


async def test_fetch_weather_batch_adjusts_wind_to_the_destinations_elevation(
    monkeypatch,
):
    # Two destinations, one payload each: identical hourly blocks carrying
    # level winds. The 8,000 ft destination reads the interpolated free-air
    # wind; the one with no elevation keeps the 10 m value.
    block = _one_location()
    block["hourly"].update(
        {
            "wind_speed_925hPa": [7.0] * 3,
            "wind_speed_850hPa": [10.0] * 3,
            "wind_speed_700hPa": [30.0] * 3,
            "wind_speed_600hPa": [40.0] * 3,
            "wind_speed_500hPa": [50.0] * 3,
        }
    )
    _stub_openmeteo(monkeypatch, [[block, dict(block)]])
    dests = _dests(2)
    dests[0]["elevation_ft"] = 8000.0

    results = await fetch_weather_batch(dests, START, END)

    # 10 + 20 * (981.4 / 1555) = 22.6226... → 22.6 at every hour.
    assert results[0]["wind_avg_mph"] == 22.6
    assert results[1]["wind_avg_mph"] == 7.0  # mean of 5, 7, 9
    assert results[0]["series"]["wind_mph"] == [22.6, 22.6, 22.6]
    assert results[1]["series"]["wind_mph"] == [5.0, 7.0, 9.0]


async def test_fetch_weather_batch_keys_the_cache_by_elevation(monkeypatch):
    # The cached aggregates were computed AT an elevation, so the same
    # coordinates claimed at a different height are a genuine miss — being
    # served the other row's numbers would be the model-sharing bug the model
    # key already guards against, one field over.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1]), _payload([0.1])])
    base = _dests(1)
    raised = [{**base[0], "elevation_ft": 8000.0}]

    await fetch_weather_batch(base, START, END)
    await fetch_weather_batch(raised, START, END)

    assert len(calls) == 2


async def test_fetch_weather_batch_splits_into_batches_of_fifty(monkeypatch):
    calls = _stub_openmeteo(
        monkeypatch, [_payload([0.1] * 50), _payload([0.2] * 50), _payload([0.3] * 20)]
    )
    results = await fetch_weather_batch(_dests(120), START, END)

    assert len(calls) == 3
    assert [len(c["latitude"].split(",")) for c in calls] == [50, 50, 20]
    assert len(results) == 120


async def test_batches_share_one_client_instead_of_one_each(monkeypatch):
    # The regression this pins: a client built inside the chunk loop discards
    # httpx's connection pool every batch, so all thirty batches of a
    # 1,500-destination analysis pay their own TLS handshake. Constructing an
    # AsyncClient anywhere on this path is now the failure.
    _stub_openmeteo(
        monkeypatch, [_payload([0.1] * 50), _payload([0.2] * 50), _payload([0.3] * 20)]
    )

    def _forbidden(*args, **kwargs):
        raise AssertionError("built a per-batch AsyncClient instead of reusing one")

    monkeypatch.setattr(weather.httpx, "AsyncClient", _forbidden)

    results = await fetch_weather_batch(_dests(120), START, END)

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
    assert "quota reached" in exc.value.message


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

def _whole_day(day: str, count: int = 25):
    """A day's hourly payload, plus the next day's midnight sample."""
    times = [f"{day}T{h:02d}:00" for h in range(24)]
    if count > 24:
        times.append("2026-07-22T00:00")
    n = len(times)
    return _hourly(times, [0.1] * n, [50.0] * n, [5.0] * n)


# What a calendar day means on the wire (#166). One click on a day sends
# 00:00 → 23:59, and this is why: the hour filter is inclusive at BOTH ends, so
# midnight-to-midnight would catch 25 samples and count the boundary hour twice
# into precip_total_in. Untested until the calendar made whole days the common
# case rather than something a user had to type.
def test_metrics_counts_a_whole_day_as_24_hours():
    day = datetime(2026, 7, 21, 0, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    end = datetime(2026, 7, 21, 23, 59)  # noqa: DTZ001 — same
    m = _metrics(_whole_day("2026-07-21"), day, end)
    assert m["precip_total_in"] == round(24 * 0.1, 4)
    assert len(_series(_whole_day("2026-07-21"), day, end)["times"]) == 24


def test_metrics_counts_midnight_to_midnight_as_25_hours():
    day = datetime(2026, 7, 21, 0, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    next_midnight = datetime(2026, 7, 22, 0, 0)  # noqa: DTZ001 — same
    m = _metrics(_whole_day("2026-07-21"), day, next_midnight)
    assert m["precip_total_in"] == round(25 * 0.1, 4)


# ── forecast model ─────────────────────────────────────────────────────────


def _out_of_domain() -> httpx.HTTPStatusError:
    """How Open-Meteo refuses a point outside a regional model's grid.

    Measured 2026-08-01: `models=gfs_hrrr` at 46.5,8.0 answers exactly this.
    """
    request = httpx.Request("GET", weather.FORECAST_URL)
    response = httpx.Response(
        400,
        request=request,
        json={"error": True, "reason": "No data is available for this location"},
    )
    return httpx.HTTPStatusError("400", request=request, response=response)


async def test_the_chosen_model_reaches_the_wire(monkeypatch):
    # `models=` is always sent, never omitted. Omitting it takes Open-Meteo's
    # `best_match` blend, which picks per location and never reports its pick,
    # so two peaks in one response could come from two models unannounced.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_hrrr)

    assert calls[0]["models"] == "gfs_hrrr"


async def test_every_request_names_a_model_even_at_the_default(monkeypatch):
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END)

    assert calls[0]["models"] == DEFAULT_FORECAST_MODEL.value


async def test_two_models_do_not_share_one_cache_entry(monkeypatch):
    # The bug this prevents is silent: models disagree, so a shared entry would
    # serve the second model asked for the first one's numbers, which is exactly
    # the thing choosing a model is supposed to make impossible.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1]), _payload([0.9])])
    first = await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.ecmwf_ifs025)
    second = await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_seamless)

    assert len(calls) == 2
    assert first[0]["precip_total_in"] == 0.1
    assert second[0]["precip_total_in"] == 0.9


async def test_the_same_model_twice_still_serves_from_cache(monkeypatch):
    # The other half of the pair above: adding the model to the key must not
    # cost the repeat-analysis hit the cache exists for.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_seamless)
    await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_seamless)

    assert len(calls) == 1


async def test_a_point_outside_a_regional_model_raises_model_coverage(monkeypatch):
    _stub_openmeteo(monkeypatch, [_out_of_domain()])
    with pytest.raises(ModelCoverageError) as exc:
        await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_hrrr)

    assert exc.value.model == "gfs_hrrr"
    # The message names the model, states the coverage gap, and offers the remedy.
    assert "NOAA HRRR" in exc.value.message
    assert "has no forecast coverage" in exc.value.message
    assert "Switch to a different model" in exc.value.message


async def test_a_coverage_refusal_is_not_reported_as_a_generic_upstream_failure(monkeypatch):
    # It subclasses UpstreamError so existing handlers still catch it, but the
    # route maps it to 400 rather than 502 — the upstream is healthy and
    # answered correctly, and only the caller can fix the request.
    _stub_openmeteo(monkeypatch, [_out_of_domain()])
    with pytest.raises(UpstreamError) as exc:
        await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_hrrr)

    assert isinstance(exc.value, ModelCoverageError)


async def test_an_ordinary_400_stays_an_ordinary_upstream_error(monkeypatch):
    # Only the "no data for this location" body means coverage. A 400 for any
    # other reason must not be blamed on the model.
    request = httpx.Request("GET", weather.FORECAST_URL)
    response = httpx.Response(400, request=request, json={"reason": "Invalid date"})
    _stub_openmeteo(monkeypatch, [httpx.HTTPStatusError("400", request=request, response=response)])
    with pytest.raises(UpstreamError) as exc:
        await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_hrrr)

    assert not isinstance(exc.value, ModelCoverageError)
