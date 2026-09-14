from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from app import ratelimit
from app.models import DEFAULT_FORECAST_MODEL, ForecastModel
from app.services import weather
from app.services.errors import (
    InvalidApiKeyError,
    ModelCoverageError,
    UpstreamError,
    UpstreamRateLimited,
)
from app.services.weather import (
    _metrics,
    _naive,
    _parse_ts,
    _series,
    _wind_at_elevation,
    fetch_weather_batch,
)


def _hourly(times, precip, temp, wind, freeze=None, freeze_unit="m"):
    hourly = {
        "time": times,
        "precipitation": precip,
        "temperature_2m": temp,
        "wind_speed_10m": wind,
    }
    # Omitted rather than nulled by default: a payload with no
    # `freezing_level_height` key at all is what five of the eight models
    # return, so it is the shape most of these tests should exercise.
    payload: dict[str, Any] = {"hourly": hourly}
    if freeze is not None:
        hourly["freezing_level_height"] = freeze
        # A real response always declares the unit, so the payload carries it
        # whenever it carries the column. `freeze_unit=None` is the malformed
        # body the aggregation must refuse rather than guess at.
        if freeze_unit is not None:
            payload["hourly_units"] = {"freezing_level_height": freeze_unit}
    return payload


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
        # This payload carries no freezing level, which is what the five
        # models that do not publish it amount to.
        "freeze_min_ft": None,
        "freeze_max_ft": None,
        "freeze_avg_ft": None,
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


# ── Freezing level (issue #295) ────────────────────────────────────────────
#
# The variable is served by three of the eight models, so its aggregates are
# nullable on their own and are reduced outside the precip/temp/wind zip. What
# these pin is that separation: a model that answers a column of nulls must
# leave every other number on the row exactly as it was.

_TIMES_3H = ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"]


def test_metrics_converts_the_freezing_level_to_whole_feet():
    data = _hourly(
        _TIMES_3H, [0.0, 0.0, 0.0], [30.0, 31.0, 32.0], [5.0, 5.0, 5.0],
        freeze=[3000.0, 3100.0, 3050.0],
    )
    m = _metrics(data, START, END)
    assert m["freeze_min_ft"] == round(3000.0 / 0.3048, 0)
    assert m["freeze_max_ft"] == round(3100.0 / 0.3048, 0)
    assert m["freeze_avg_ft"] == round(3050.0 / 0.3048, 0)


def test_metrics_all_null_freezing_level_leaves_the_other_aggregates():
    # The five-model response shape: identical payloads but for the freezing
    # level, and every other figure must come out identical too.
    args = (_TIMES_3H, [0.1, 0.2, 0.0], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0])
    nulled = _metrics(_hourly(*args, freeze=[None, None, None]), START, END)
    absent = _metrics(_hourly(*args), START, END)

    assert nulled == absent
    assert nulled["freeze_avg_ft"] is None
    assert nulled["precip_total_in"] == 0.3
    assert nulled["temp_min_f"] == 50.0
    assert nulled["wind_avg_mph"] == 7.0


def test_metrics_skips_a_null_freezing_hour_without_dropping_it():
    # Contrast with the core metrics above, where a null drops the whole hour:
    # the middle hour's precipitation still counts.
    data = _hourly(
        _TIMES_3H, [0.1, 0.2, 0.3], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0],
        freeze=[2000.0, None, 2200.0],
    )
    m = _metrics(data, START, END)
    assert m["precip_total_in"] == 0.6
    assert m["freeze_min_ft"] == round(2000.0 / 0.3048, 0)
    assert m["freeze_max_ft"] == round(2200.0 / 0.3048, 0)


def test_metrics_freezing_level_zero_is_a_value_not_a_gap():
    # Open-Meteo clamps to 0.0 when the whole column is below freezing.
    data = _hourly(
        ["2026-07-21T00:00"], [0.0], [10.0], [5.0], freeze=[0.0]
    )
    m = _metrics(data, START, END)
    assert m["freeze_min_ft"] == 0.0
    assert m["freeze_avg_ft"] == 0.0
    assert m["freeze_max_ft"] == 0.0


def test_series_carries_the_freezing_level_and_its_gaps():
    data = _hourly(
        _TIMES_3H, [0.1, 0.2, 0.3], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0],
        freeze=[3000.0, None, 3100.0],
    )
    s = _series(data, START, END)
    assert s["freeze_ft"] == [round(3000.0 / 0.3048, 0), None, round(3100.0 / 0.3048, 0)]


def test_series_freezing_level_is_all_nulls_when_the_model_omits_it():
    data = _hourly(_TIMES_3H, [0.1, 0.2, 0.3], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0])
    s = _series(data, START, END)
    assert s["freeze_ft"] == [None, None, None]
    assert s["precip_in"] == [0.1, 0.2, 0.3]


# ── The freezing level's unit (issue #295 review) ──────────────────────────
#
# Open-Meteo quotes the height in the unit `precipitation_unit` selects and
# names it in `hourly_units`. One hour over Rainier, measured 2026-09-13 for
# 2026-09-15T12:00: 2560 with "m", 8398.95 with "ft", and both are 8,399 ft.
# Every request the app sends carries `precipitation_unit=inch`, so feet is
# the branch production takes.
_RAINIER_HOUR = "2026-09-15T12:00"
_RAINIER_START = datetime(2026, 9, 15, 12, 0)  # noqa: DTZ001 — naive, like the API's stamps
_RAINIER_END = datetime(2026, 9, 15, 12, 1)  # noqa: DTZ001 — naive, like the API's stamps


def _rainier(freeze, freeze_unit="m"):
    return _hourly(
        [_RAINIER_HOUR], [0.0], [3.3], [10.0], freeze=freeze, freeze_unit=freeze_unit
    )


def test_metrics_reads_the_unit_the_response_declares():
    meters = _metrics(_rainier([2560.0]), _RAINIER_START, _RAINIER_END)
    feet = _metrics(_rainier([8398.95], "ft"), _RAINIER_START, _RAINIER_END)
    assert meters["freeze_min_ft"] == 8399.0
    assert feet["freeze_min_ft"] == 8399.0
    assert feet == meters


def test_metrics_does_not_convert_a_response_already_in_feet():
    # The whole failure this guards: dividing feet by 0.3048 reads 27,556 ft
    # over a 14,409 ft summit, which looks like a forecast rather than a fault.
    m = _metrics(_rainier([8398.95], "ft"), _RAINIER_START, _RAINIER_END)
    assert m["freeze_max_ft"] == 8399.0


def test_series_reads_the_unit_the_response_declares():
    meters = _series(_rainier([2560.0]), _RAINIER_START, _RAINIER_END)
    feet = _series(_rainier([8398.95], "ft"), _RAINIER_START, _RAINIER_END)
    assert meters["freeze_ft"] == [8399.0]
    assert feet["freeze_ft"] == [8399.0]


def test_metrics_unknown_unit_fails_instead_of_guessing():
    with pytest.raises(UpstreamError):
        _metrics(_rainier([2560.0], "furlongs"), _RAINIER_START, _RAINIER_END)


def test_series_unknown_unit_fails_instead_of_guessing():
    with pytest.raises(UpstreamError):
        _series(_rainier([2560.0], "furlongs"), _RAINIER_START, _RAINIER_END)


def test_metrics_missing_unit_fails_when_the_column_carries_numbers():
    with pytest.raises(UpstreamError):
        _metrics(_rainier([2560.0], None), _RAINIER_START, _RAINIER_END)


def test_metrics_missing_unit_is_harmless_when_the_column_is_all_null():
    # The five models that publish no freezing level need no unit, and a
    # response that declares none for an empty column is not malformed.
    m = _metrics(_rainier([None], None), _RAINIER_START, _RAINIER_END)
    assert m["freeze_min_ft"] is None
    assert m["temp_min_f"] == 3.3


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


def _stub_openmeteo(
    monkeypatch, behaviors: list[Any], urls: list[str] | None = None
) -> list[dict[str, Any]]:
    """Replay one scripted behavior per upstream GET, in call order.

    A behavior is an Exception (raised), a ``(ticks, payload)`` pair (yields to
    the event loop ``ticks`` times first, so completion order can be forced
    independent of start order), or a bare payload. Returns the list of params
    each call was made with, so batching can be asserted. Running off the end
    of the script is an IndexError, which is the point: a test that expects two
    upstream calls fails loudly on a third.

    Pass ``urls`` to collect the host each call went to as well, which is what
    a keyed request has to get right.
    """
    calls: list[dict[str, Any]] = []

    class _Client:
        async def get(self, url, params=None):
            behavior = behaviors[len(calls)]
            calls.append(params or {})
            if urls is not None:
                urls.append(url)
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


async def test_the_request_asks_only_for_the_hours_the_window_needs(monkeypatch):
    # Issue #212: the request used to name whole calendar days and the filters
    # here threw the overhang away. Both bounds now floor to the hour, which
    # cannot drop a stamp the inclusive filter keeps — every kept stamp sits on
    # the hour inside the window, so it sits inside the floored bounds too.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    start = datetime(2026, 7, 21, 9, 30)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    end = datetime(2026, 7, 21, 14, 45)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    await fetch_weather_batch(_dests(1), start, end)

    assert calls[0]["start_hour"] == "2026-07-21T09:00"
    assert calls[0]["end_hour"] == "2026-07-21T14:00"
    assert "start_date" not in calls[0]
    assert "end_date" not in calls[0]


async def test_a_point_sample_asks_for_a_single_hour(monkeypatch):
    # The models normalize an equal start/end to [floor(T), floor(T)+1min],
    # which the filters match with exactly one stamp. This is the window the
    # whole-day request wasted most on: measured 2026-08-23 over 50 locations,
    # 97.3 KB for the day against 32.8 KB for the hour.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    moment = datetime(2026, 7, 21, 13, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    await fetch_weather_batch(_dests(1), moment, moment + timedelta(minutes=1))

    assert calls[0]["start_hour"] == "2026-07-21T13:00"
    assert calls[0]["end_hour"] == "2026-07-21T13:00"


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
    assert weather._FREEZING_LEVEL in hourly
    # Still at weight factor 1: max(1, vars x models/10) with 9 variables
    # and one model.
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


# ── a caller's own API key (issue #317) ────────────────────────────────────


class _RecordingWeight:
    """Stands in for the weighted pacer and records every acquire."""

    def __init__(self) -> None:
        self.acquired: list[float] = []
        self.estimates: list[float] = []

    def wait_estimate_s(self, weight: float) -> float:
        self.estimates.append(weight)
        return 99.0  # far past the 3s narration threshold

    async def acquire(self, weight: float) -> None:
        self.acquired.append(weight)


def _invalid_key() -> httpx.HTTPStatusError:
    """How Open-Meteo's customer host refuses a bad key.

    Measured 2026-09-11: HTTP 400, not a 401, which is why the reason text is
    what has to be recognised.
    """
    request = httpx.Request("GET", weather.CUSTOMER_FORECAST_URL)
    response = httpx.Response(
        400,
        request=request,
        json={"error": True, "reason": "The supplied API key is invalid."},
    )
    return httpx.HTTPStatusError("400", request=request, response=response)


async def test_a_keyed_batch_goes_to_the_customer_host_carrying_the_key(monkeypatch):
    urls: list[str] = []
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])], urls)
    await fetch_weather_batch(_dests(1), START, END, api_key="secret-key")

    assert urls == [weather.CUSTOMER_FORECAST_URL]
    assert calls[0]["apikey"] == "secret-key"


async def test_an_unkeyed_batch_stays_on_the_free_host_with_no_key(monkeypatch):
    urls: list[str] = []
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])], urls)
    await fetch_weather_batch(_dests(1), START, END)

    assert urls == [weather.FORECAST_URL]
    assert "apikey" not in calls[0]


async def test_a_keyed_batch_never_touches_the_weighted_pacer(monkeypatch):
    # The pacer meters this pod's free tier. A keyed batch spends the caller's
    # quota, so pacing it would queue one caller behind another's spend.
    pacer = _RecordingWeight()
    monkeypatch.setattr(ratelimit, "WEATHER_WEIGHT", pacer)
    paced: list[int] = []

    async def on_pace(seconds):
        paced.append(seconds)

    _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(
        _dests(1), START, END, on_pace=on_pace, api_key="secret-key"
    )

    assert pacer.acquired == []
    assert pacer.estimates == []
    assert paced == []  # nothing to narrate when nothing waits


async def test_an_unkeyed_batch_still_pays_the_weighted_pacer(monkeypatch):
    pacer = _RecordingWeight()
    monkeypatch.setattr(ratelimit, "WEATHER_WEIGHT", pacer)
    _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END)

    assert pacer.acquired == [1.0]


async def test_a_keyed_batch_still_takes_an_in_flight_slot(monkeypatch):
    # The in-flight budget guards the pod's own concurrency rather than a
    # quota, so it applies to every batch whoever pays for it.
    taken = {"n": 0}
    real_slot = ratelimit.WEATHER_BUDGET.slot

    class _CountingBudget:
        def slot(self):
            taken["n"] += 1
            return real_slot()

    monkeypatch.setattr(ratelimit, "WEATHER_BUDGET", _CountingBudget())
    _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END, api_key="secret-key")

    assert taken["n"] == 1


async def test_a_refused_key_raises_invalid_api_key(monkeypatch):
    _stub_openmeteo(monkeypatch, [_invalid_key()])
    with pytest.raises(InvalidApiKeyError) as exc:
        await fetch_weather_batch(_dests(1), START, END, api_key="bad-key")

    assert exc.value.message == "Open-Meteo rejected the API key."
    assert "bad-key" not in exc.value.message


async def test_a_refused_key_is_not_classified_as_a_transient_failure(monkeypatch):
    # Left to classify_http_error it would reach the caller as a 502 "try
    # again later" for a request no retry can fix.
    _stub_openmeteo(monkeypatch, [_invalid_key()])
    with pytest.raises(UpstreamError) as exc:
        await fetch_weather_batch(_dests(1), START, END, api_key="bad-key")

    assert isinstance(exc.value, InvalidApiKeyError)
    assert not isinstance(exc.value, ModelCoverageError)


async def test_the_key_reaches_no_log_record_at_trace(monkeypatch, caplog):
    # The pod forwards a paid credential and must forget it. TRACE logs the
    # full request params, and raise_for_status builds its message out of the
    # request URL, so both are places the key could come to rest.
    _stub_openmeteo(monkeypatch, [_invalid_key()])
    with caplog.at_level(5), pytest.raises(InvalidApiKeyError):  # TRACE
        await fetch_weather_batch(_dests(1), START, END, api_key="secret-key")

    assert caplog.records
    for record in caplog.records:
        assert "secret-key" not in record.getMessage()


async def test_a_keyed_and_an_unkeyed_request_share_one_cache_entry(monkeypatch):
    # Both hosts answer the same model the same way for the same location and
    # window, so the key is deliberately not part of the cache key.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    first = await fetch_weather_batch(_dests(1), START, END, api_key="secret-key")
    second = await fetch_weather_batch(_dests(1), START, END)

    assert len(calls) == 1
    assert second[0]["precip_total_in"] == first[0]["precip_total_in"]


# ── The archive endpoint (issue #123) ──────────────────────────────────────
#
# A window older than the forecast endpoint's retention is answered from the
# archive instead. `source` says which, and the caller decides it — these tests
# pass it the way the route does.


async def test_an_archive_window_goes_to_the_archive_endpoint(monkeypatch):
    urls: list[str] = []
    _stub_openmeteo(monkeypatch, [_payload([0.1])], urls)
    await fetch_weather_batch(_dests(1), START, END, source="archive")

    assert urls == [weather.ARCHIVE_URL]


async def test_an_archive_window_names_no_model(monkeypatch):
    # The archive's default is a reanalysis, one dataset everywhere, so nothing
    # varies row to row the way `best_match` would on the forecast endpoint.
    # Forwarding the picker's model would be worse than useless: the archive
    # accepts an unknown `models=` with a 200 and plausible data, so a name it
    # does not serve would be answered silently by something else.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(
        _dests(1), START, END, model=ForecastModel.gfs_hrrr, source="archive"
    )

    assert "models" not in calls[0]
    # Everything else about the request is unchanged, hours included.
    assert calls[0]["start_hour"] == "2026-07-21T00:00"
    assert calls[0]["hourly"] == weather.HOURLY_VARIABLES


async def test_a_forecast_window_still_names_its_model(monkeypatch):
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])])
    await fetch_weather_batch(_dests(1), START, END, model=ForecastModel.gfs_hrrr)

    assert calls[0]["models"] == "gfs_hrrr"


async def test_a_keyed_archive_window_goes_to_the_customer_archive_host(monkeypatch):
    urls: list[str] = []
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1])], urls)
    await fetch_weather_batch(
        _dests(1), START, END, api_key="secret-key", source="archive"
    )

    assert urls == [weather.CUSTOMER_ARCHIVE_URL]
    assert calls[0]["apikey"] == "secret-key"


async def test_fetch_weather_batch_keys_the_cache_by_endpoint(monkeypatch):
    # The two endpoints answer the same coordinates and window from different
    # data, and the boundary between them moves with the clock — so a window
    # that changes sides while an entry is live must miss rather than be served
    # the other endpoint's numbers.
    calls = _stub_openmeteo(monkeypatch, [_payload([0.1]), _payload([0.2])])

    forecast = await fetch_weather_batch(_dests(1), START, END)
    archive = await fetch_weather_batch(_dests(1), START, END, source="archive")

    assert len(calls) == 2
    assert forecast[0]["precip_total_in"] == 0.1
    assert archive[0]["precip_total_in"] == 0.2


async def test_an_archive_payload_with_no_level_winds_keeps_every_hour(monkeypatch):
    # The archive accepts the five pressure levels and answers them all null
    # (measured 2026-09-12). The elevation adjustment degrades to the 10 m wind
    # — and, crucially, drops no hour doing it: the aggregation zips the four
    # core arrays, so a null level can only ever change a wind number.
    block = _one_location()
    block["hourly"].update({name: [None] * 3 for name, _ in weather._WIND_LEVELS})
    _stub_openmeteo(monkeypatch, [[block]])
    dests = _dests(1)
    dests[0]["elevation_ft"] = 14000.0

    results = await fetch_weather_batch(dests, START, END, source="archive")

    assert results[0]["wind_avg_mph"] == 7.0  # mean of the 10 m 5, 7, 9
    assert results[0]["wind_max_mph"] == 9.0
    assert results[0]["series"]["wind_mph"] == [5.0, 7.0, 9.0]
    assert len(results[0]["series"]["times"]) == 3


# ── A window that crosses the boundary (issue #123) ────────────────────────
#
# Two fetches, one per endpoint, joined per location before the aggregation
# runs. The caller decides both the classification and the seam, so these pass
# them the way the route does.

SPAN_START = datetime(2026, 7, 18, 22, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
SPAN_END = datetime(2026, 7, 19, 1, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
SEAM = datetime(2026, 7, 19, 0, 0, tzinfo=timezone.utc)


def _half(times, precip):
    """One location's half-window, with the five levels answered null."""
    block = _hourly(
        times,
        precip,
        [50.0] * len(times),
        [5.0] * len(times),
    )
    block["hourly"].update({name: [None] * len(times) for name, _ in weather._WIND_LEVELS})
    block["hourly_units"] = {"precipitation": "inch"}
    return [block]


def _archive_half():
    return _half(["2026-07-18T22:00", "2026-07-18T23:00"], [0.1, 0.2])


def _forecast_half():
    return _half(["2026-07-19T00:00", "2026-07-19T01:00"], [0.4, 0.8])


async def test_a_spanning_window_asks_each_endpoint_for_its_own_hours(monkeypatch):
    urls: list[str] = []
    calls = _stub_openmeteo(monkeypatch, [_archive_half(), _forecast_half()], urls)
    await fetch_weather_batch(
        _dests(1),
        SPAN_START,
        SPAN_END,
        model=ForecastModel.gfs_hrrr,
        source="spanning",
        boundary=SEAM,
    )

    assert urls == [weather.ARCHIVE_URL, weather.FORECAST_URL]
    # Disjoint: the archive answers through the hour BEFORE the seam, and an
    # hour arriving twice would be counted twice in the precipitation total.
    assert calls[0]["start_hour"] == "2026-07-18T22:00"
    assert calls[0]["end_hour"] == "2026-07-18T23:00"
    assert calls[1]["start_hour"] == "2026-07-19T00:00"
    assert calls[1]["end_hour"] == "2026-07-19T01:00"
    # The model rides only on the half a model answered.
    assert "models" not in calls[0]
    assert calls[1]["models"] == "gfs_hrrr"


async def test_a_spanning_window_aggregates_both_halves_as_one_series(monkeypatch):
    _stub_openmeteo(monkeypatch, [_archive_half(), _forecast_half()])
    results = await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    # 0.1 + 0.2 + 0.4 + 0.8: every hour of both halves, counted once.
    assert results[0]["precip_total_in"] == 1.5
    assert results[0]["precip_max_in_hr"] == 0.8
    assert len(results[0]["series"]["times"]) == 4


async def test_a_spanning_window_drops_a_location_whose_halves_disagree_on_units(
    monkeypatch,
):
    # A total of inches and millimetres is a number with no meaning, so the row
    # degrades to no forecast the way every unreadable payload here does.
    other = _forecast_half()
    other[0]["hourly_units"] = {"precipitation": "mm"}
    _stub_openmeteo(monkeypatch, [_archive_half(), other])
    results = await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    assert results == [None]


async def test_a_spanning_window_joins_halves_whose_unserved_units_differ(
    monkeypatch,
):
    # Measured 2026-09-13: the archive declares "undefined" for every
    # pressure-level wind it does not serve, where the forecast endpoint says
    # "mp/h". A column one side does not have is not a disagreement, and the
    # window that crosses the boundary must not come back empty for it.
    archive = _archive_half()
    archive[0]["hourly_units"] = {
        "precipitation": "inch",
        "wind_speed_10m": "mp/h",
        "wind_speed_500hPa": "undefined",
    }
    forecast = _forecast_half()
    forecast[0]["hourly_units"] = {
        "precipitation": "inch",
        "wind_speed_10m": "mp/h",
        "wind_speed_500hPa": "mp/h",
    }
    _stub_openmeteo(monkeypatch, [archive, forecast])
    results = await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    assert results[0]["precip_total_in"] == 1.5


async def test_a_spanning_window_reads_the_freezing_level_in_the_served_unit(
    monkeypatch,
):
    # The archive answers the freezing level null under "undefined" (measured
    # 2026-09-13); the forecast half answers feet. The joined payload must
    # declare the served unit, or the reader refuses the forecast half's numbers
    # and the row has no weather at all.
    archive = _archive_half()
    archive[0]["hourly_units"] = {"precipitation": "inch", weather._FREEZING_LEVEL: "undefined"}
    archive[0]["hourly"][weather._FREEZING_LEVEL] = [None, None]
    forecast = _forecast_half()
    forecast[0]["hourly_units"] = {"precipitation": "inch", weather._FREEZING_LEVEL: "ft"}
    forecast[0]["hourly"][weather._FREEZING_LEVEL] = [8000.0, 9000.0]
    _stub_openmeteo(monkeypatch, [archive, forecast])
    results = await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    assert results[0]["precip_total_in"] == 1.5
    assert results[0]["freeze_min_ft"] == 8000.0
    assert results[0]["freeze_max_ft"] == 9000.0


async def test_a_spanning_window_counts_a_repeated_hour_once(monkeypatch):
    # The spans are disjoint, so this cannot come from the request — but a host
    # that answered one hour on both sides would otherwise double it.
    _stub_openmeteo(
        monkeypatch,
        [_archive_half(), _half(["2026-07-18T23:00", "2026-07-19T00:00"], [9.9, 0.4])],
    )
    results = await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    assert results[0]["precip_total_in"] == 0.7  # 0.1 + 0.2 + 0.4
    assert len(results[0]["series"]["times"]) == 3


async def test_a_spanning_window_keys_the_cache_apart_from_either_half(monkeypatch):
    # The joined series is a third answer at the same coordinates and window,
    # and it must not be served from — or serve — either endpoint alone.
    calls = _stub_openmeteo(
        monkeypatch,
        [_archive_half(), _forecast_half(), _archive_half(), _archive_half()],
    )
    await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )
    await fetch_weather_batch(_dests(1), SPAN_START, SPAN_END, source="archive")
    # And the spanning fetch itself repeats from the cache.
    await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    assert len(calls) == 3


async def test_a_spanning_window_pays_for_both_halves(monkeypatch):
    # Two requests, two answers, so the pod's weighted budget is acquired for
    # each span on its own hours rather than once for the whole window.
    spent: list[float] = []

    class _Budget:
        async def acquire(self, weight):
            spent.append(weight)

        def wait_estimate_s(self, weight):
            return 0

    monkeypatch.setattr(ratelimit, "WEATHER_WEIGHT", _Budget())
    _stub_openmeteo(monkeypatch, [_archive_half(), _forecast_half()])
    await fetch_weather_batch(
        _dests(1), SPAN_START, SPAN_END, source="spanning", boundary=SEAM
    )

    assert len(spent) == 2


async def test_a_spanning_window_needs_the_boundary_that_classified_it():
    # The service never reads the clock: a boundary it worked out for itself
    # could cut a window at an instant the classification never saw.
    with pytest.raises(ValueError, match="boundary"):
        await fetch_weather_batch(_dests(1), SPAN_START, SPAN_END, source="spanning")


async def test_a_spanning_window_with_one_empty_half_is_one_request(monkeypatch):
    # `window_source` compares real instants and a request carries wall-clock
    # hours, so an offset-carrying caller can be spanning by instant and
    # one-sided by wall clock. The empty half is dropped, never requested
    # backwards.
    urls: list[str] = []
    _stub_openmeteo(monkeypatch, [_forecast_half()], urls)
    await fetch_weather_batch(
        _dests(1),
        SEAM.replace(tzinfo=None),
        SPAN_END,
        source="spanning",
        boundary=SEAM,
    )

    assert urls == [weather.FORECAST_URL]


async def test_fetch_weather_batch_fails_on_an_unreadable_unit(monkeypatch):
    # The raise has to clear both aggregation functions' degrade-to-None
    # handlers and the chunk loop, or an unreadable unit would quietly drop
    # every row in the batch instead of saying anything.
    _stub_openmeteo(monkeypatch, [[_rainier([2560.0], "furlongs")]])
    with pytest.raises(UpstreamError):
        await fetch_weather_batch(_dests(1), _RAINIER_START, _RAINIER_END)
