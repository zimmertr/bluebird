from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from conftest import (
    FAKE_API_KEY,
    RecordingPacer,
    answered,
    assert_no_key_logged,
    dest,
    fake_response,
    stub_openmeteo,
)

from app.services import air_quality
from app.services.aggregation import _aqi_metrics, _aqi_series, _parse_ts
from app.services.air_quality import fetch_aqi_batch
from app.services.errors import InvalidApiKeyError

# A fixed window in the past. fetch_aqi_batch skips only a window that starts
# past the ~5-day horizon and fetches any older one
# (test_an_archive_era_window_is_still_fetched), so these tests never meet the
# clamp.
START = datetime(2026, 7, 21, 0, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
END = datetime(2026, 7, 21, 2, 0)  # noqa: DTZ001 — Open-Meteo timestamps are naive local


def _hourly(times, aqi):
    return {"hourly": {"time": times, "us_aqi": aqi}}


def test_metrics_avg_and_max():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [80, 90, 100])
    assert _aqi_metrics(data, START, END) == {"aqi_avg": 90, "aqi_min": 80, "aqi_max": 100}


def test_metrics_skips_none_values():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [80, None, 100])
    assert _aqi_metrics(data, START, END) == {"aqi_avg": 90, "aqi_min": 80, "aqi_max": 100}


def test_metrics_excludes_out_of_window():
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00", "2026-07-21T09:00"],
        [80, 90, 100, 500],
    )
    assert _aqi_metrics(data, START, END)["aqi_max"] == 100


def test_metrics_empty_returns_none():
    assert _aqi_metrics(_hourly([], []), START, END) is None


def test_metrics_all_none_returns_none():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00"], [None, None])
    assert _aqi_metrics(data, START, END) is None


def test_metrics_result_is_integer_index():
    # US AQI is an integer index; averages are rounded to whole numbers.
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [70, 80, 90])
    m = _aqi_metrics(data, START, END)
    assert isinstance(m["aqi_avg"], int)
    assert m["aqi_avg"] == 80


def test_metrics_malformed_payload_returns_none():
    assert _aqi_metrics({"nope": 1}, START, END) is None


def test_parse_ts_roundtrip():
    assert _parse_ts("2026-07-21T05:00") == datetime(2026, 7, 21, 5, 0)  # noqa: DTZ001 — _parse_ts returns naive
    assert _parse_ts("garbage") is None


async def test_fetch_batch_empty_returns_empty():
    assert await fetch_aqi_batch([], START, END) == []


async def test_fetch_batch_beyond_horizon_skips_without_network():
    # A window that starts well past the ~5-day AQI horizon must degrade to
    # None entries rather than calling (and 400-ing) the upstream API.
    far_start = datetime.now(UTC) + timedelta(days=10)
    far_end = far_start + timedelta(days=1)
    dests = [dest(47.0, -121.0), dest(46.0, -122.0)]
    assert await fetch_aqi_batch(dests, far_start, far_end) == [None, None]


async def test_the_request_asks_only_for_the_hours_the_window_needs(monkeypatch):
    # Issue #212, the air-quality half. Same flooring rule as the weather
    # service, and it has to respect the CAMS clamp below.
    calls = stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T10:00"], [80])]])
    start = datetime(2026, 7, 21, 9, 30)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    end = datetime(2026, 7, 21, 14, 45)  # noqa: DTZ001 — Open-Meteo timestamps are naive local
    await fetch_aqi_batch([dest(47.0, -121.0)], start, end)

    assert calls[0]["start_hour"] == "2026-07-21T09:00"
    assert calls[0]["end_hour"] == "2026-07-21T14:00"
    assert "start_date" not in calls[0]
    assert "end_date" not in calls[0]


async def test_the_horizon_clamp_ends_at_the_last_hour_of_the_cap_day(monkeypatch):
    # The whole-day request this replaced ended at 23:00 on the cap day, so the
    # hour bound has to end there too. Clamping to the instant instead would
    # quietly drop most of a day of real AQI.
    calls = stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T10:00"], [80])]])
    # The service reads the clock for its own cap, so the cap day is either
    # side of the call: a run that crosses UTC midnight sees two.
    start = datetime.now(UTC)
    await fetch_aqi_batch([dest(47.0, -121.0)], start, start + timedelta(days=15))
    after = datetime.now(UTC)
    cap_days = {(t + timedelta(days=air_quality.MAX_FORECAST_DAYS)).date() for t in (start, after)}

    assert calls[0]["end_hour"] in {f"{d.isoformat()}T23:00" for d in cap_days}


# ── _series (hourly bake-in for the chart) ─────────────────────────────────


def test_series_keeps_hours_and_preserves_nulls():
    data = _hourly(["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00"], [80, None, 100])
    s = _aqi_series(data, START, END)
    assert s["aqi"] == [80, None, 100]
    assert len(s["times"]) == 3


def test_series_times_are_utc_epoch_ms():
    data = _hourly(["2026-07-21T00:00"], [80])
    s = _aqi_series(data, START, END)
    expected = int(datetime(2026, 7, 21, 0, 0, tzinfo=UTC).timestamp() * 1000)
    assert s["times"] == [expected]


def test_series_excludes_out_of_window():
    data = _hourly(
        ["2026-07-21T00:00", "2026-07-21T01:00", "2026-07-21T02:00", "2026-07-21T09:00"],
        [80, 90, 100, 500],
    )
    s = _aqi_series(data, START, END)
    assert s["aqi"] == [80, 90, 100]


def test_series_empty_returns_none():
    assert _aqi_series(_hourly([], []), START, END) is None


# ── the 429 short-circuit ──────────────────────────────────────────────────
#
# The 2026-07-29 incident's "zombie" AQI batches: once the quota was spent,
# every remaining batch still went out to learn the same thing, draining the
# next minute's budget mid-fallback. The guard against that had no test.


def _dests(n: int) -> list[dict[str, Any]]:
    return [dest(40.0 + i * 0.1, -120.0) for i in range(n)]


async def test_a_rate_limit_skips_the_remaining_batches(monkeypatch):
    # 250 destinations = 5 batches against an in-flight gate of 4. The first
    # four overlap and all see the 429; the fifth only acquires a slot once one
    # of them has finished and set the flag, so it returns nulls without ever
    # reaching the network. The script holds four behaviors, so a fifth
    # upstream call would IndexError rather than pass quietly.
    rate_limited = answered(429, {"reason": "minutely API request limit exceeded"})
    calls = stub_openmeteo(monkeypatch, [rate_limited] * 4, overlap=True)
    results = await fetch_aqi_batch(_dests(250), START, END)

    assert len(calls) == 4
    assert results == [None] * 250  # best-effort: nulls, never a raised error


async def test_rate_limited_nulls_are_not_cached(monkeypatch):
    # Those Nones mean "unknown", not "no data for this window". Caching them
    # would freeze the outage in place for the length of the forecast TTL.
    rate_limited = answered(429, {"reason": "minutely API request limit exceeded"})
    stub_openmeteo(monkeypatch, [rate_limited] * 4, overlap=True)
    assert await fetch_aqi_batch(_dests(250), START, END) == [None] * 250

    calls = stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]])
    results = await fetch_aqi_batch(_dests(1), START, END)
    assert len(calls) == 1  # asked again rather than serving the outage
    assert results[0]["aqi_avg"] == 80


async def test_a_real_answer_is_still_cached(monkeypatch):
    # The counterpart: a successful fetch does populate the cache, so the
    # no-caching rule above is specific to the rate-limited path.
    calls = stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]])
    first = await fetch_aqi_batch(_dests(1), START, END)
    second = await fetch_aqi_batch(_dests(1), START, END)
    assert len(calls) == 1
    assert second == first


async def test_a_miscounted_answer_degrades_and_is_not_cached(monkeypatch):
    # Issue #581: two answers for three locations. The rows are null for this
    # analysis, as before, but they mean "unknown", so the next analysis asks
    # again instead of reading "no data" out of the cache for fifteen minutes.
    one = _hourly(["2026-07-21T00:00"], [80])
    calls = stub_openmeteo(monkeypatch, [[one, one], [one, one, one]])
    assert await fetch_aqi_batch(_dests(3), START, END) == [None] * 3

    results = await fetch_aqi_batch(_dests(3), START, END)
    assert len(calls) == 2
    assert [r["aqi_avg"] for r in results] == [80, 80, 80]


async def test_a_failed_request_degrades_and_is_not_cached(monkeypatch):
    # The same rule for a batch the provider failed outright (a 5xx): null for
    # this analysis, asked again by the next.
    one = _hourly(["2026-07-21T00:00"], [80])
    calls = stub_openmeteo(monkeypatch, [answered(502, {}), [one]])
    assert await fetch_aqi_batch(_dests(1), START, END) == [None]

    results = await fetch_aqi_batch(_dests(1), START, END)
    assert len(calls) == 2
    assert results[0]["aqi_avg"] == 80


async def test_a_body_that_is_not_json_degrades_and_is_not_cached(monkeypatch):
    # Issue #630: air quality is best-effort, so an answer that does not
    # decode is a null row like any other failed batch, never an exception
    # that fails the analysis around it.
    one = _hourly(["2026-07-21T00:00"], [80])
    calls = stub_openmeteo(
        monkeypatch, [lambda url, params: fake_response(None, text="<html>busy</html>"), [one]]
    )
    assert await fetch_aqi_batch(_dests(1), START, END) == [None]

    results = await fetch_aqi_batch(_dests(1), START, END)
    assert len(calls) == 2
    assert results[0]["aqi_avg"] == 80


async def test_a_request_past_its_total_deadline_degrades(monkeypatch):
    monkeypatch.setattr(air_quality.http, "TIMEOUT_S", 0.05)

    async def slow(url, params):
        await asyncio.sleep(1)
        return fake_response([_hourly(["2026-07-21T00:00"], [80])])

    stub_openmeteo(monkeypatch, [slow])
    assert await fetch_aqi_batch(_dests(1), START, END) == [None]


async def test_one_unusable_batch_leaves_its_siblings_cached(monkeypatch):
    # 60 destinations are two batches. The second answers short; the first is
    # a real answer and is cached, so the next ask fetches only the second.
    one = _hourly(["2026-07-21T00:00"], [80])
    calls = stub_openmeteo(monkeypatch, [[one] * 50, [one] * 9, [one] * 10], overlap=True)
    first = await fetch_aqi_batch(_dests(60), START, END)
    assert first[:50] == [first[0]] * 50 and first[0] is not None
    assert first[50:] == [None] * 10

    again = await fetch_aqi_batch(_dests(60), START, END)
    assert len(calls) == 3
    assert calls[2]["latitude"].count(",") == 9
    assert None not in again


# ── a caller's own API key (issue #317) ────────────────────────────────────


# How the air-quality customer host refuses a bad key (measured 2026-09-11):
# a 400 whose reason names the key, not a 401.
_INVALID_KEY_BODY = {"error": True, "reason": "The supplied API key is invalid."}


async def test_a_keyed_chunk_goes_to_the_customer_host_carrying_the_key(monkeypatch):
    urls: list[str] = []
    calls = stub_openmeteo(
        monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]], urls
    )
    await fetch_aqi_batch(_dests(1), START, END, api_key="secret-key")

    assert urls == [air_quality.CUSTOMER_AIR_QUALITY_URL]
    assert calls[0]["apikey"] == "secret-key"


async def test_an_unkeyed_chunk_stays_on_the_free_host_with_no_key(monkeypatch):
    urls: list[str] = []
    calls = stub_openmeteo(
        monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]], urls
    )
    await fetch_aqi_batch(_dests(1), START, END)

    assert urls == [air_quality.AIR_QUALITY_URL]
    assert "apikey" not in calls[0]


async def test_a_keyed_chunk_never_touches_the_weighted_pacer(monkeypatch):
    pacer = RecordingPacer()
    monkeypatch.setattr(air_quality.ratelimit, "AQI_WEIGHT", pacer)
    stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]])
    await fetch_aqi_batch(_dests(1), START, END, api_key="secret-key")

    assert pacer.acquired == []


async def test_an_unkeyed_chunk_still_pays_the_weighted_pacer(monkeypatch):
    pacer = RecordingPacer()
    monkeypatch.setattr(air_quality.ratelimit, "AQI_WEIGHT", pacer)
    stub_openmeteo(monkeypatch, [[_hourly(["2026-07-21T00:00"], [80])]])
    await fetch_aqi_batch(_dests(1), START, END)

    assert pacer.acquired == [1.0]


async def test_a_refused_key_raises_instead_of_degrading_to_nulls(monkeypatch):
    # The one air-quality failure that is not best-effort: the same key rides
    # every batch, so nulls here would report no air quality for a reason the
    # caller could have fixed.
    stub_openmeteo(monkeypatch, [answered(400, _INVALID_KEY_BODY)])
    with pytest.raises(InvalidApiKeyError) as exc:
        await fetch_aqi_batch(_dests(1), START, END, api_key="bad-key")

    assert exc.value.message == "Open-Meteo rejected the API key."


async def test_an_ordinary_400_still_degrades_to_nulls(monkeypatch):
    # Only the invalid-key reason raises. Every other 400 stays best-effort.
    stub_openmeteo(monkeypatch, [answered(400, {"reason": "Invalid date"})])
    assert await fetch_aqi_batch(_dests(1), START, END) == [None]


def _unreachable(url: str, params: dict) -> httpx.Response:
    # httpx's own transport messages name no URL today. This one does, so the
    # branch is held to redacting whatever its error says rather than to
    # httpx's current wording.
    request = httpx.Request("GET", url, params=params)
    raise httpx.ConnectError(f"Cannot connect to {request.url}", request=request)


# Every branch of `request_openmeteo` that logs, each answered on a keyed URL.
# Only the refused key leaves the service; the rest degrade to null rows.
@pytest.mark.parametrize(
    ("answer", "error"),
    [
        pytest.param(
            answered(400, _INVALID_KEY_BODY),
            InvalidApiKeyError,
            id="refused-key",
        ),
        pytest.param(
            answered(429, {"reason": "Hourly API request limit exceeded"}), None, id="rate-limit"
        ),
        pytest.param(answered(502, {}), None, id="upstream-error"),
        pytest.param(_unreachable, None, id="unreachable"),
    ],
)
async def test_the_key_reaches_no_log_record(monkeypatch, caplog, answer, error):
    stub_openmeteo(monkeypatch, [answer])
    with caplog.at_level(5):  # TRACE
        if error is None:
            assert await fetch_aqi_batch(_dests(1), START, END, api_key=FAKE_API_KEY) == [None]
        else:
            with pytest.raises(error):
                await fetch_aqi_batch(_dests(1), START, END, api_key=FAKE_API_KEY)
    assert_no_key_logged(caplog.records)


async def test_an_archive_era_window_is_still_fetched(monkeypatch):
    # The archive routing (issue #123) leaves this service alone, and the reason
    # it can is that air quality has history of its own: measured 2026-09-12 at
    # 46.85,-121.76, this endpoint answered a window 365 days back with real US
    # AQI. So a window older than the weather boundary is an ordinary fetch —
    # only the FUTURE clamp above skips one — and an hour the endpoint cannot
    # answer degrades to null the way every other gap does.
    old_start = (datetime.now(UTC) - timedelta(days=200)).replace(
        minute=0, second=0, microsecond=0
    )
    stamp = old_start.strftime("%Y-%m-%dT%H:00")
    calls = stub_openmeteo(monkeypatch, [[_hourly([stamp], [42])]])

    results = await fetch_aqi_batch(
        [dest(47.0, -121.0)], old_start, old_start + timedelta(hours=1)
    )

    assert len(calls) == 1
    assert calls[0]["start_hour"] == stamp
    assert results[0]["aqi_max"] == 42
