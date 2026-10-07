"""Regenerate the golden record of what both analyze routes answer.

Every case posts one request to `POST /api/analyze` and to
`POST /api/analyze/stream` with the upstream services stubbed, and records
what a caller receives: the JSON route's status, `Retry-After` and body, the
stream's every `data:` line, and every argument each upstream fetch was given.
The two routes together show every field of every event the analysis yields.
The call log pins which fetches run for every candidate and which run only for
the returned rows (a quota decision, not a detail), and the model, window,
endpoint split, key and discovery flags each fetch receives.

The record is the guard for restructuring the analysis: a change that is meant
to move no behavior must leave this file byte-identical. So the stubs patch
the service modules and nothing else, and this script imports nothing from the
analyze route module, which is the code the record checks. A change that is
MEANT to move an answer regenerates the file in the same PR and says why.

No case depends on the clock. Each window starts at the current hour, the
stubs answer fixed hour stamps rather than the hours asked for, and the one
snow grid is a held snapshot with its own date.

Run:
    cd backend && python scripts/generate_analyze_golden.py
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

from conftest import dest, fake_response  # noqa: E402 — after the sys.path inserts above
from fastapi.testclient import TestClient  # noqa: E402
from test_snodas import a_snapshot  # noqa: E402

from app import ratelimit  # noqa: E402
from app.main import app  # noqa: E402
from app.models import MAX_ANALYZE_PEAKS, PAST_DATA_DAYS  # noqa: E402
from app.services import air_quality, cache, http, osm, snodas, weather  # noqa: E402
from app.services.errors import (  # noqa: E402
    InvalidApiKeyError,
    UpstreamError,
    UpstreamRateLimited,
)
from app.services.snapshot import SnapshotCache  # noqa: E402

OUT = BACKEND / "tests" / "data" / "analyze_golden.json"

# Taken before any case patches the name, so a case can run the real service
# behind its recording stub.
REAL_FETCH_AQI = air_quality.fetch_aqi_batch

# Three fixed hours. The weather and cloud answers cover all three and the air
# quality answer only the first two, so every row shows how a shorter series
# aligns onto the weather grid.
STAMPS = [1_790_000_000_000 + 3_600_000 * h for h in range(3)]

POLYGON = {"type": "Polygon", "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]}

# Five discovered peaks. One has no elevation, which the elevation band, the
# floor suggestion and the top-by-elevation cut each treat differently.
PEAKS = [
    dest(47.1, -121.1, name="Peak A", elevation_ft=8000.0, osm_id="node/101", type="peak"),
    dest(47.2, -121.2, name="Peak B", elevation_ft=6500.0, osm_id="node/102", type="peak"),
    dest(47.3, -121.3, name="Peak C", elevation_ft=None, osm_id="node/103", type="peak"),
    dest(47.4, -121.4, name="Peak D", elevation_ft=9200.0, osm_id="node/104", type="peak"),
    dest(47.5, -121.5, name="Peak E", elevation_ft=7100.0, osm_id="node/105", type="peak"),
]

# A caller's list. In the union case the first claims Peak A's name and the
# second Peak B's coordinate, so the custom row wins both collisions.
CUSTOM = [
    {"name": "Peak A", "latitude": 46.6, "longitude": -121.6, "elevation_ft": 5400.0},
    {"name": "Camp", "latitude": 47.2, "longitude": -121.2},
    {"name": "Lake", "latitude": 46.8, "longitude": -121.8, "elevation_ft": 4300.0},
]

# Inside test_snodas's synthetic grid: one metre, one hundred inches, and a
# coordinate the grid does not cover.
SNOW_CUSTOM = [
    {"name": "metre", "latitude": 39.5, "longitude": -98.5},
    {"name": "hundred", "latitude": 38.5, "longitude": -99.5},
    {"name": "outside", "latitude": 10.0, "longitude": 10.0},
]


def _k(d: dict) -> int:
    """A small integer from the latitude alone, so an answer depends on which
    destination was asked about and never on its position in the batch."""
    return round(d["latitude"] * 10) % 10


def _weather(d: dict) -> dict:
    k = _k(d)
    # Odd rows carry no freezing level, as five of the eight models do.
    freeze = None if k % 2 else 5000.0 + 100 * k
    return {
        "precip_total_in": round(0.1 * k, 3), "precip_avg_in_hr": round(0.03 * k, 3),
        "precip_min_in_hr": 0.0, "precip_max_in_hr": round(0.05 * k, 3),
        "temp_min_f": 20.0 + k, "temp_max_f": 40.0 + k, "temp_avg_f": 30.0 + k,
        "wind_min_mph": 2.0, "wind_max_mph": 10.0 + 2 * k, "wind_avg_mph": 6.0 + k,
        "freeze_min_ft": freeze, "freeze_max_ft": freeze and freeze + 400, "freeze_avg_ft": freeze and freeze + 200,
        "series": {
            "times": STAMPS,
            "precip_in": [0.0, round(0.05 * k, 3), 0.01],
            "temp_f": [20.0 + k, 30.0 + k, 40.0 + k],
            "wind_mph": [2.0, 6.0 + k, 10.0 + 2 * k],
            "freeze_ft": [freeze, freeze, freeze],
        },
    }


def _aqi(d: dict) -> dict:
    k = _k(d)
    return {
        "aqi_avg": 30 + 5 * k, "aqi_min": 20 + k, "aqi_max": 40 + 7 * k,
        "series": {"times": STAMPS[:2], "aqi": [20 + k, 40 + 7 * k]},
    }


def _cloud(d: dict) -> dict:
    k = _k(d)
    return {
        "cloud_deck_min_ft": 1000.0 * k, "cloud_deck_avg_ft": 1000.0 * k + 500,
        "cloud_deck_max_ft": 1000.0 * k + 1000,
        "series": {
            "times": STAMPS,
            "cloud_deck_ft": [1000.0 * k, None, 1000.0 * k + 1000],
        },
    }


def _flood(n: int) -> list[dict]:
    """More candidates than the cap, every hundredth with no elevation.

    Sized so the rows WITH an elevation still outnumber the cap, which is what
    makes the top-by-elevation cut drop rows rather than only the unknowns.
    """
    return [
        dest(
            40.0 + i * 1e-4, -110.0 - i * 1e-4, name=f"Summit {i}",
            elevation_ft=None if i % 100 == 0 else 3000.0 + i,
            osm_id=f"node/{1000 + i}", type="peak",
        )
        for i in range(n)
    ]


@dataclass
class Case:
    """One request, and what each stubbed upstream does with it.

    An upstream set to an exception raises it. `discovered` of None means the
    request never reaches discovery; a case that does reach it without a list
    would be a gap in the record, so the stub fails it loudly.
    """

    name: str
    body: Callable[[datetime], dict]
    discovered: list[dict] | Exception | None = None
    failover: bool = False
    weather: Exception | None = None
    pace: bool = False
    aqi: Exception | None = None
    # Every air-quality request answers this HTTP status, and the real service
    # decides what the analysis sees. A stub that raised instead would pin an
    # answer the service never gives: it absorbs everything but a refused key.
    aqi_http_status: int | None = None
    cloud: Exception | None = None
    snow: bool = False
    headers: dict[str, str] = field(default_factory=dict)


def _hour(t: datetime) -> datetime:
    return t.replace(minute=0, second=0, microsecond=0)


def _window(now: datetime, **extra: Any) -> dict:
    start = _hour(now)
    return {
        "start_datetime": start.isoformat(),
        "end_datetime": (start + timedelta(days=1)).isoformat(),
        **extra,
    }


def _peaks(**extra: Any) -> Callable[[datetime], dict]:
    return lambda now: _window(now, destination_types=["peak"], polygon=POLYGON, **extra)


def _custom(rows: list[dict] = CUSTOM, **extra: Any) -> Callable[[datetime], dict]:
    return lambda now: _window(now, destination_types=[], custom_destinations=rows, **extra)


KEY = {"X-Open-Meteo-Key": "golden-test-key"}

CASES = [
    # The whole happy path of a drawn ring: a mirror failover, per-batch
    # progress, a pace wait, the cut, and air quality for the returned rows.
    Case(
        "polygon",
        _peaks(limit=3, include_unnamed_peaks=True, forecast_model="icon_seamless"),
        discovered=PEAKS, failover=True, pace=True,
    ),
    Case("custom_list", _custom()),
    Case("union", _peaks(custom_destinations=CUSTOM), discovered=PEAKS),
    Case("empty_discovery", _peaks(), discovered=[]),
    # A floor keeps the row with no elevation, as every elevation filter does.
    Case("elevation_band", _peaks(min_elevation_ft=7000), discovered=PEAKS),
    Case("over_cap", _peaks(), discovered=_flood(MAX_ANALYZE_PEAKS + 30)),
    Case(
        "over_cap_top_by_elevation",
        _peaks(top_by_elevation=True, limit=2),
        discovered=_flood(MAX_ANALYZE_PEAKS + 30),
    ),
    Case(
        "bad_window",
        lambda now: {
            **_custom()(now),
            "start_datetime": _hour(now + timedelta(days=2)).isoformat(),
        },
    ),
    Case("nothing_to_analyze", lambda now: _window(now, destination_types=[])),
    Case("types_without_polygon", lambda now: _window(now, destination_types=["peak"])),
    Case("discovery_failure", _peaks(), discovered=UpstreamError("Every Overpass mirror failed.")),
    Case(
        "weather_rate_limited",
        _custom(),
        weather=UpstreamRateLimited("Open-Meteo", "minutely", 37, "Open-Meteo quota reached. Try again later."),
    ),
    Case("weather_unavailable", _custom(), weather=UpstreamError("Open-Meteo did not answer.")),
    Case("weather_busy", _custom(), weather=ratelimit.BudgetExhausted("Open-Meteo (weather service)")),
    Case("aqi_sort", _peaks(sort_by="aqi_max", sort_desc=True, limit=2), discovered=PEAKS),
    Case("aqi_bound", _peaks(max_aqi=60), discovered=PEAKS),
    Case("cloud_sort", _peaks(sort_by="cloud_deck_min_ft", sort_desc=True, limit=2), discovered=PEAKS),
    Case("cloud_display_only", _peaks(include_clouds=True, limit=2), discovered=PEAKS, headers=KEY),
    Case("late_aqi_key_refused", _custom(), aqi=InvalidApiKeyError(), headers=KEY),
    # Open-Meteo answers the late air-quality request with a 429. The service
    # turns it into null rows, so the ranking still answers.
    Case("late_aqi_rate_limited", _custom(), aqi_http_status=429),
    Case(
        "late_cloud_failure",
        _custom(include_clouds=True),
        cloud=UpstreamError("Open-Meteo request failed. Try again later."),
    ),
    # A bound that removes every row leaves the late fetches nothing to ask
    # about, and they ask about nothing rather than sending an empty batch.
    Case("bound_removes_every_row", _peaks(min_temp_f=1000, include_clouds=True), discovered=PEAKS),
    # Starts two days inside the archive's range and ends now, so the weather
    # and cloud fetches are told the window spans the seam.
    Case(
        "spanning_window",
        lambda now: {
            **_custom()(now),
            "start_datetime": _hour(now - timedelta(days=PAST_DATA_DAYS + 2)).isoformat(),
            "end_datetime": _hour(now).isoformat(),
        },
    ),
    Case("series_off_with_bound", _peaks(include_series=False, max_wind_mph=18, limit=2), discovered=PEAKS),
    Case("snow_depth", _custom(SNOW_CUSTOM, sort_by="snow_depth_in", sort_desc=True), snow=True),
]


def _dests(destinations: list[dict]) -> dict:
    """What a fetch was asked about: the keys each row carries, and each row's
    name, coordinate and elevation (the wind and temperature read it). A long
    list keeps its ends, which is where a wrong cut or a wrong order shows."""
    rows = [[d.get("name"), d["latitude"], d["longitude"], d.get("elevation_ft")] for d in destinations]
    return {
        "n": len(rows),
        "keys": sorted(destinations[0]) if destinations else [],
        "rows": rows if len(rows) <= 10 else rows[:3] + rows[-3:],
    }


def _window_offsets(start: datetime, end: datetime, origin: datetime) -> list[float]:
    """The window a fetch was given, in seconds from the window the request
    asked for, so the record holds no instant the clock chose."""
    return [(start - origin).total_seconds(), (end - origin).total_seconds()]


def _stubs(mp: pytest.MonkeyPatch, case: Case, calls: dict[str, list], origin: datetime) -> SnapshotCache:
    """Install one case's upstreams on the service modules the analysis reads.

    Each stub records every argument the analysis hands it, not only how many
    destinations: the model, the window, the endpoint split, the key and the
    discovery flags are exactly what a restructuring carries from one phase to
    the next, and a stub that ignores an argument cannot notice it was dropped.
    """

    async def query_osm(polygon, destination_types, on_status=None, include_unnamed_peaks=False):
        calls["discovery"].append({
            "types": [t.value for t in destination_types],
            "ring": polygon.coordinates[0],
            "include_unnamed_peaks": include_unnamed_peaks,
            "on_status": on_status is not None,
        })
        if case.discovered is None:
            raise AssertionError(f"{case.name} reached discovery without a stubbed answer")
        if isinstance(case.discovered, Exception):
            raise case.discovered
        if case.failover and on_status is not None:
            await on_status("Trying backup map server 2 of 3…")
        return [dict(d) for d in case.discovered]

    async def enrich_custom(destinations):
        calls["enrich"].append(_dests(destinations))
        return [dict(d) for d in destinations]

    async def fetch_weather_batch(
        destinations, start_dt, end_dt, on_progress=None, on_pace=None, model=None,
        api_key=None, source="forecast", boundary=None,
    ):
        calls["weather"].append({
            "destinations": _dests(destinations),
            "window": _window_offsets(start_dt, end_dt, origin),
            "model": getattr(model, "value", model),
            "source": source,
            "boundary": boundary is not None,
            "key": api_key,
            "on_progress": on_progress is not None,
            "on_pace": on_pace is not None,
        })
        if case.weather is not None:
            raise case.weather
        total = len(destinations)
        # The pipeline's own batch of 50 for a large field, and two for a
        # small one, so a five-row case still reports more than one batch.
        size = 50 if total > 50 else 2
        batches = -(-total // size)
        for b in range(batches):
            if case.pace and b == 1 and on_pace is not None:
                await on_pace(12)
            if on_progress is not None:
                await on_progress(min(size * (b + 1), total), total, b + 1, batches)
        return [_weather(d) for d in destinations]

    async def fetch_aqi_batch(destinations, start_dt, end_dt, api_key=None):
        calls["aqi"].append({
            "destinations": _dests(destinations),
            "window": _window_offsets(start_dt, end_dt, origin),
            "key": api_key,
        })
        if case.aqi is not None:
            raise case.aqi
        if case.aqi_http_status is not None:
            return await REAL_FETCH_AQI(destinations, start_dt, end_dt, api_key=api_key)
        return [_aqi(d) for d in destinations]

    async def fetch_cloud_batch(
        destinations, start_dt, end_dt, model=None, api_key=None, source="forecast", boundary=None,
    ):
        calls["cloud"].append({
            "destinations": _dests(destinations),
            "window": _window_offsets(start_dt, end_dt, origin),
            "model": getattr(model, "value", model),
            "source": source,
            "boundary": boundary is not None,
            "key": api_key,
        })
        if case.cloud is not None:
            raise case.cloud
        return [_cloud(d) for d in destinations]

    async def fetch_grid():
        # Reached only if the analysis waits on the grid. `_run` fails on any
        # entry here, and on any refresh scheduled behind a request.
        calls["snow_fetch"].append(case.name)
        raise RuntimeError("the golden record never fetches a snow grid")

    # Fresh forever, so the analysis never schedules a refresh: the snow case
    # holds a grid, and every other case holds none and reads nulls.
    grid = snodas.snow_cache(fetch=fetch_grid)
    grid._snapshot = a_snapshot("2026-09-22") if case.snow else None
    grid._fresh_until = float("inf")

    mp.setattr(osm, "query_osm", query_osm)
    async def enrich_custom_reporting(destinations):
        return await enrich_custom(destinations), True

    mp.setattr(osm, "enrich_custom", enrich_custom)
    mp.setattr(osm, "enrich_custom_reporting", enrich_custom_reporting)
    mp.setattr(weather, "fetch_weather_batch", fetch_weather_batch)
    mp.setattr(weather, "fetch_cloud_batch", fetch_cloud_batch)
    mp.setattr(air_quality, "fetch_aqi_batch", fetch_aqi_batch)
    mp.setattr(snodas, "GRID", grid)
    if case.aqi_http_status is not None:
        answer = fake_response({"reason": "Hourly API request limit exceeded"}, case.aqi_http_status)

        class _Client:
            async def get(self, url, params=None):
                return answer

        mp.setattr(http, "client", lambda: _Client())
        # Pacing off, as the test suite runs it, so the script and pytest
        # render the same record.
        mp.setattr(ratelimit, "AQI_WEIGHT", ratelimit.WeightedBudget("Open-Meteo (air quality)", 0))
    mp.setattr(ratelimit.client, "ANALYZE_LIMITER", ratelimit.RateLimiter(0, 1))
    return grid


def _fresh_calls() -> dict[str, list]:
    return {"discovery": [], "enrich": [], "weather": [], "aqi": [], "cloud": [], "snow_fetch": []}


def _stream_events(text: str) -> list[str]:
    """Every event the stream sent, as its exact `data:` line.

    A keepalive is left out: it marks a silence of the proxy's idle timer, not
    anything the analysis said. Anything that is not a `data:` event fails
    here, so the list is the whole stream.
    """
    events = [e for e in text.split("\n\n") if e]
    assert all(e.startswith("data: ") and "\n" not in e for e in events), text
    return [e for e in events if e != 'data: {"type": "keepalive"}']


def _run(client: TestClient, case: Case, now: datetime) -> dict:
    body = case.body(now)
    out: dict[str, Any] = {"name": case.name}
    with pytest.MonkeyPatch.context() as mp:
        for route in ("json", "stream"):
            for held in (cache.DISCOVERY_CACHE, cache.ENRICH_CACHE, cache.FORECAST_CACHE):
                held.clear()
            calls = _fresh_calls()
            grid = _stubs(mp, case, calls, datetime.fromisoformat(body["start_datetime"]))
            path = "/api/analyze" if route == "json" else "/api/analyze/stream"
            # Identity encoding, so the record is the body and not its gzip.
            resp = client.post(path, json=body, headers={"accept-encoding": "identity", **case.headers})
            answer: dict[str, Any] = {
                "status": resp.status_code,
                "content_type": resp.headers.get("content-type"),
                "retry_after": resp.headers.get("retry-after"),
            }
            if route == "json":
                answer["body"] = resp.text
            else:
                answer["events"] = _stream_events(resp.text)
            snow_fetches = calls.pop("snow_fetch")
            assert not snow_fetches, f"{case.name} on the {route} route fetched a snow grid"
            assert grid._refresh_task is None, f"{case.name} on the {route} route scheduled a snow refresh"
            answer["calls"] = calls
            out[route] = answer
    return out


def render() -> str:
    now = datetime.now(UTC)
    # A server error is recorded as the response a caller gets rather than
    # raised here, so a case that ends in one is pinned like any other.
    client = TestClient(app, raise_server_exceptions=False)
    record = {
        "_comment": (
            "Generated by backend/scripts/generate_analyze_golden.py. Do not edit by hand. "
            "A change here is a change to what the analyze routes answer."
        ),
        "cases": [_run(client, case, now) for case in CASES],
    }
    return json.dumps(record, indent=1, ensure_ascii=False) + "\n"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render())
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
