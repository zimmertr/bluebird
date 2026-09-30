"""One test per phase of the analysis (`routes/analyze/phases.py`), and the
promise `_run_analysis` makes about closing them.

The golden record (`test_analyze_golden.py`) pins what the two routes answer
end to end. These pin each phase's own contract, so a change to one phase
fails beside the phase rather than as a changed answer somewhere downstream.
Upstreams are stubbed on their service modules, as every route test does.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from conftest import dest

from app.models import MAX_ANALYZE_PEAKS, AnalyzeRequest, DestinationResult
from app.routes.analyze.events import Done, Failure, Progress, Refusal, Result, Status
from app.routes.analyze.phases import (
    Capped,
    Eager,
    Fetched,
    Ranked,
    Window,
    _apply_cap,
    _attach_late,
    _check_window,
    _eager_fetches,
    _fetch_forecasts,
    _find_candidates,
    _rank_and_cut,
    _result,
)
from app.routes.analyze.route import _run_analysis
from app.services import air_quality, osm, weather
from app.services.errors import InvalidApiKeyError, UpstreamError, UpstreamRateLimited

POLYGON = {"type": "Polygon", "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]}


def _request(**fields) -> AnalyzeRequest:
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    body = {
        "destination_types": [],
        "start_datetime": now,
        "end_datetime": now + timedelta(days=1),
        "custom_destinations": [{"name": "a", "latitude": 1.0, "longitude": 2.0}],
        **fields,
    }
    return AnalyzeRequest(**body)


def _window(request: AnalyzeRequest) -> Window:
    window = _check_window(request)
    assert isinstance(window, Window)
    return window


def _wx(precip: float, wind_max: float = 9.0) -> dict:
    return {
        "precip_total_in": precip, "precip_avg_in_hr": precip,
        "precip_min_in_hr": precip, "precip_max_in_hr": precip,
        "temp_min_f": 40.0, "temp_max_f": 60.0, "temp_avg_f": 50.0,
        "wind_min_mph": 1.0, "wind_max_mph": wind_max, "wind_avg_mph": 5.0,
    }


def _row(name: str, precip: float) -> DestinationResult:
    return DestinationResult(name=name, type="custom", latitude=1.0, longitude=2.0, **_wx(precip))


async def _collect(phase) -> list:
    return [item async for item in phase]


# ── _check_window ──────────────────────────────────────────────────────────


def test_check_window_refuses_a_window_that_ends_before_it_starts():
    request = _request()
    request.end_datetime = request.start_datetime - timedelta(hours=1)
    failure = _check_window(request)
    assert isinstance(failure, Failure)
    assert (failure.error.status_code, failure.error.code.value) == (400, "validation")


def test_check_window_classifies_the_window_it_resolves():
    request = _request()
    window = _check_window(request)
    assert isinstance(window, Window)
    assert (window.start, window.end) == request.resolved_window()
    assert window.source == "forecast"
    assert window.boundary < window.start


# ── _find_candidates ───────────────────────────────────────────────────────


async def test_find_candidates_refuses_a_request_that_names_nothing():
    events = await _collect(_find_candidates(_request(custom_destinations=None)))
    assert len(events) == 1 and isinstance(events[0], Failure)
    assert events[0].error.detail.startswith("Nothing to analyze")


async def test_find_candidates_relays_a_failover_then_hands_back_the_band(monkeypatch):
    async def query_osm(polygon, destination_types, on_status=None, include_unnamed_peaks=False):
        await on_status("Trying backup map server 2 of 3…")
        return [dest(1.0, 2.0, name="low", elevation_ft=3000.0), dest(1.1, 2.1, name="high", elevation_ft=9000.0)]

    monkeypatch.setattr(osm, "query_osm", query_osm)
    request = _request(destination_types=["peak"], polygon=POLYGON, custom_destinations=None, min_elevation_ft=5000)
    events = await _collect(_find_candidates(request))
    assert events[:2] == [
        Status("Searching for Destinations…"),
        Status("Searching for Destinations…", "Trying backup map server 2 of 3…"),
    ]
    assert isinstance(events[2], Done) and [d["name"] for d in events[2].value] == ["high"]


async def test_find_candidates_ends_on_the_discovery_failure(monkeypatch):
    async def query_osm(*args, **kwargs):
        raise UpstreamError("Every Overpass mirror failed.")

    monkeypatch.setattr(osm, "query_osm", query_osm)
    request = _request(destination_types=["peak"], polygon=POLYGON, custom_destinations=None)
    events = await _collect(_find_candidates(request))
    assert isinstance(events[-1], Failure) and events[-1].error.status_code == 502
    assert not any(isinstance(e, Done) for e in events)


# ── _apply_cap ─────────────────────────────────────────────────────────────


def _field(n: int) -> list[dict]:
    return [dest(40.0 + i * 1e-4, -110.0, name=f"s{i}", elevation_ft=3000.0 + i) for i in range(n)]


def test_apply_cap_answers_an_empty_field_with_an_empty_result():
    result = _apply_cap([], _request(), "destination")
    assert isinstance(result, Result) and result.response.total_queried == 0


def test_apply_cap_refuses_an_over_cap_field_with_a_floor():
    refusal = _apply_cap(_field(MAX_ANALYZE_PEAKS + 1), _request(), "peak")
    assert isinstance(refusal, Refusal)
    assert refusal.body["found"] == MAX_ANALYZE_PEAKS + 1
    assert refusal.body["suggested_min_elevation_ft"] is not None


def test_apply_cap_cuts_to_the_highest_when_asked():
    capped = _apply_cap(_field(MAX_ANALYZE_PEAKS + 3), _request(top_by_elevation=True), "peak")
    assert isinstance(capped, Capped)
    assert (len(capped.destinations), capped.total_found, capped.truncated) == (
        MAX_ANALYZE_PEAKS, MAX_ANALYZE_PEAKS + 3, True,
    )
    # The snow fill ran on the final set: every row carries the field.
    assert all("snow_depth_in" in d for d in capped.destinations)


# ── _eager_fetches ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        ({}, Eager(aqi=False, cloud=False)),
        ({"sort_by": "aqi_max"}, Eager(aqi=True, cloud=False)),
        ({"max_aqi": 50}, Eager(aqi=True, cloud=False)),
        ({"sort_by": "cloud_base_min_ft"}, Eager(aqi=False, cloud=True)),
        ({"min_cloud_cover_pct": 10}, Eager(aqi=False, cloud=True)),
        ({"include_clouds": True}, Eager(aqi=False, cloud=False)),
    ],
)
def test_eager_fetches_reads_the_ranking_and_the_bounds(fields, expected):
    assert _eager_fetches(_request(**fields)) == expected


# ── _fetch_forecasts ───────────────────────────────────────────────────────


@pytest.fixture
def calls(monkeypatch):
    seen: dict[str, list[int]] = {"weather": [], "aqi": [], "cloud": []}

    async def fetch_weather_batch(destinations, start, end, on_progress=None, on_pace=None, *a, **k):
        seen["weather"].append(len(destinations))
        await on_progress(len(destinations), len(destinations), 1, 1)
        return [_wx(d["latitude"]) for d in destinations]

    async def fetch_aqi_batch(destinations, start, end, api_key=None):
        seen["aqi"].append(len(destinations))
        return [None] * len(destinations)

    async def fetch_cloud_batch(destinations, *a, **k):
        seen["cloud"].append(len(destinations))
        return [None] * len(destinations)

    monkeypatch.setattr(weather, "fetch_weather_batch", fetch_weather_batch)
    monkeypatch.setattr(air_quality, "fetch_aqi_batch", fetch_aqi_batch)
    monkeypatch.setattr(weather, "fetch_cloud_batch", fetch_cloud_batch)
    return seen


async def test_fetch_forecasts_announces_the_count_then_hands_back_the_forecasts(calls):
    request = _request()
    field = [dest(1.0, 2.0), dest(3.0, 4.0)]
    events = await _collect(
        _fetch_forecasts(field, _window(request), request, None, "destination", Eager(aqi=True, cloud=False))
    )
    assert events[0] == Progress(processed=0, total=2, percent=0)
    assert isinstance(events[1], Progress) and events[1].percent == 100
    assert isinstance(events[-1], Done) and isinstance(events[-1].value, Fetched)
    # The eager decision is the one it was handed: air quality for every row,
    # no cloud request at all.
    assert calls == {"weather": [2], "aqi": [2], "cloud": []}


async def test_fetch_forecasts_ends_on_the_mapped_failure(monkeypatch, calls):
    async def refuse(*args, **kwargs):
        raise UpstreamRateLimited("Open-Meteo", "hourly", 60, "Open-Meteo quota reached. Try again later.")

    monkeypatch.setattr(weather, "fetch_weather_batch", refuse)
    request = _request()
    events = await _collect(
        _fetch_forecasts([dest(1.0, 2.0)], _window(request), request, None, "destination", Eager(False, False))
    )
    assert isinstance(events[-1], Failure)
    assert (events[-1].error.status_code, events[-1].extra) == (429, {"scope": "hourly", "retry_after_s": 60})


# ── _rank_and_cut ──────────────────────────────────────────────────────────


def test_rank_and_cut_bounds_before_it_cuts():
    field = [dest(float(i), 0.0, name=n) for i, n in enumerate("abcd", start=1)]
    fetched = Fetched(wx=[_wx(1.0), _wx(2.0, wind_max=30.0), _wx(3.0), _wx(4.0)], aqi=[None] * 4, cloud=None)
    ranked = _rank_and_cut(field, fetched, _request(max_wind_mph=20, limit=2))
    assert [r.name for r in ranked.results] == ["a", "c"]
    assert ranked.total_matched == 3


# ── _attach_late ───────────────────────────────────────────────────────────


async def test_attach_late_skips_what_was_fetched_eagerly(calls):
    request = _request(include_clouds=True)
    ranked = Ranked([_row("a", 1.0)], [], 1)
    assert await _attach_late(ranked, _window(request), request, None, Eager(aqi=True, cloud=True)) is None
    assert calls["aqi"] == [] and calls["cloud"] == []


async def test_attach_late_maps_a_refused_key_through_the_one_ladder(monkeypatch):
    async def refuse(*args, **kwargs):
        raise InvalidApiKeyError()

    monkeypatch.setattr(air_quality, "fetch_aqi_batch", refuse)
    request = _request()
    ranked = Ranked([_row("a", 1.0)], [], 1)
    failure = await _attach_late(ranked, _window(request), request, "key", Eager(False, False))
    assert isinstance(failure, Failure)
    error = failure.error
    assert (error.status_code, error.detail, error.code.value, error.headers, failure.extra) == (
        401, "Open-Meteo rejected the API key.", "invalid_api_key", None, None,
    )


async def test_attach_late_fails_on_a_cloud_error(monkeypatch, calls):
    async def refuse(*args, **kwargs):
        raise UpstreamError("Open-Meteo request failed. Try again later.")

    monkeypatch.setattr(weather, "fetch_cloud_batch", refuse)
    request = _request(include_clouds=True)
    ranked = Ranked([_row("a", 1.0)], [], 1)
    failure = await _attach_late(ranked, _window(request), request, None, Eager(False, False))
    assert isinstance(failure, Failure) and failure.error.status_code == 502


# ── _result ────────────────────────────────────────────────────────────────


def test_result_reports_the_counts_the_phases_carried():
    capped = Capped([dest(1.0, 2.0), dest(3.0, 4.0), dest(5.0, 6.0)], 9, True, "2026-09-22")
    result = _result(Ranked([_row("a", 1.0)], [1, 2], 2), capped, _request())
    response = result.response
    assert (response.total_queried, response.total_matched, response.total_found) == (3, 2, 9)
    assert (response.truncated, response.times, response.snow_analysis_date) == (True, [1, 2], "2026-09-22")


# ── Closing the analysis mid-phase ─────────────────────────────────────────


@pytest.mark.parametrize(
    ("phase", "fields", "expected_tasks"),
    [
        ("discovery", {}, 1),
        ("retrieval", {}, 1),
        # Air quality and the cloud fields both fetched for every candidate,
        # so three upstream tasks run side by side and all three must stop.
        ("retrieval", {"sort_by": "aqi_max", "include_clouds": True, "min_cloud_cover_pct": 0}, 3),
    ],
    ids=["discovery", "retrieval", "retrieval-with-eager-fetches"],
)
async def test_closing_the_analysis_cancels_the_phase_tasks_before_it_returns(
    monkeypatch, phase, fields, expected_tasks
):
    """A consumer that goes away closes `_run_analysis`. Every upstream task
    the current phase started must be cancelled by the time that close
    returns, not later when the phase's generator is collected."""
    tasks: list[asyncio.Task] = []

    async def hang(*args, **kwargs) -> None:
        tasks.append(asyncio.current_task())
        await asyncio.Event().wait()

    async def hang_discovery(polygon, destination_types, on_status=None, include_unnamed_peaks=False):
        await on_status("Trying backup map server 2 of 3…")
        await hang()

    async def hang_retrieval(destinations, start, end, on_progress=None, on_pace=None, *args, **kwargs):
        await on_progress(0, 1, 0, 1)
        await hang()

    async def discovered(*args, **kwargs):
        return [dest(1.0, 2.0, name="a")]

    monkeypatch.setattr(osm, "query_osm", hang_discovery if phase == "discovery" else discovered)
    monkeypatch.setattr(weather, "fetch_weather_batch", hang_retrieval)
    monkeypatch.setattr(air_quality, "fetch_aqi_batch", hang)
    monkeypatch.setattr(weather, "fetch_cloud_batch", hang)
    request = _request(destination_types=["peak"], polygon=POLYGON, custom_destinations=None, **fields)

    analysis = _run_analysis(request, None)
    # Read up to the event the hanging call relays, so the analysis is
    # suspended inside the phase with every task in flight.
    async for event in analysis:
        if getattr(event, "detail", None) or getattr(event, "batches_done", None) is not None:
            break
    await analysis.aclose()

    assert len(tasks) == expected_tasks
    assert all(task.cancelling() > 0 or task.cancelled() for task in tasks)
    # Let each task take its cancellation, then none of them may still run.
    for _ in range(3):
        await asyncio.sleep(0)
    assert all(task.cancelled() for task in tasks)
    assert not set(tasks) & asyncio.all_tasks()
