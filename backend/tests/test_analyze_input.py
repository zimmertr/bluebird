"""What a direct API caller can send that the web app never does (issue #564).

The browser sends no window and always a well-formed ring, so these inputs
reach the server only from programs written against the API. Each test drives
the real route with only the upstream HTTP answered from a stub, because what
matters lies between validation and the fetch: a request must be classified,
fetched and cached by one reading of its timestamps.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from conftest import fake_response
from fastapi.testclient import TestClient
from test_weather import _hourly

from app.main import app
from app.models import AnalyzeRequest, DestinationsRequest
from app.services import cache, osm, weather

client = TestClient(app)

ROUTES = ["/api/analyze", "/api/analyze/stream"]


def _stamps(params: dict[str, Any]) -> list[str]:
    """Every hour from `start_hour` to `end_hour`, as Open-Meteo answers them."""
    first = datetime.fromisoformat(params["start_hour"])
    last = datetime.fromisoformat(params["end_hour"])
    hours = int((last - first) / timedelta(hours=1)) + 1
    return [(first + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)]


@pytest.fixture
def upstream(monkeypatch) -> list[tuple[str, dict[str, Any]]]:
    """Answer every Open-Meteo GET for the hours it asked for, with values that
    differ hour by hour, so a fetch of the wrong hours changes the body."""
    calls: list[tuple[str, dict[str, Any]]] = []

    class _Client:
        async def get(self, url, params=None):
            calls.append((url, params))
            times = _stamps(params)
            hour = [int(t[11:13]) for t in times]
            if "air-quality" in url:
                return fake_response([{"hourly": {"time": times, "us_aqi": [10 + h for h in hour]}}])
            return fake_response(
                [
                    _hourly(
                        times,
                        [h / 100 for h in hour],
                        [30.0 + h for h in hour],
                        [float(h) for h in hour],
                    )
                ]
            )

    monkeypatch.setattr(weather.http, "client", lambda: _Client())
    return calls


def _tomorrow(hour: int) -> datetime:
    return (datetime.now(UTC) + timedelta(days=1)).replace(
        hour=hour, minute=0, second=0, microsecond=0
    )


def _body(start: str, end: str) -> dict[str, Any]:
    return {
        "destination_types": [],
        "start_datetime": start,
        "end_datetime": end,
        "custom_destinations": [{"name": "a", "latitude": 47.0, "longitude": -121.0}],
        "include_series": True,
    }


def _answer(route: str, body: dict[str, Any]) -> tuple[int, Any]:
    resp = client.post(route, json=body)
    if route.endswith("/stream"):
        events = [
            json.loads(line[len("data: "):])
            for line in resp.text.splitlines()
            if line.startswith("data: ")
        ]
        [last] = [e for e in events if e["type"] in ("result", "error")]
        return resp.status_code, last
    return resp.status_code, resp.json()


# ── a timestamp means the instant it names ─────────────────────────────────


@pytest.mark.parametrize("route", ROUTES)
def test_an_offset_window_fetches_and_reports_the_hours_it_names(route, upstream):
    # The same three hours, once in UTC and once at -07:00 (#564). Read as a
    # wall clock, the second would fetch 08:00 UTC, seven hours early.
    utc = _tomorrow(15)
    local = utc.astimezone(UTC).replace(tzinfo=None) - timedelta(hours=7)
    as_utc = _body(utc.isoformat(), (utc + timedelta(hours=3)).isoformat())
    as_local = _body(
        local.isoformat() + "-07:00", (local + timedelta(hours=3)).isoformat() + "-07:00"
    )

    status_utc, answer_utc = _answer(route, as_utc)
    cache.FORECAST_CACHE.clear()
    status_local, answer_local = _answer(route, as_local)

    assert status_utc == status_local == 200
    starts = [params["start_hour"] for _, params in upstream]
    assert starts == [utc.strftime("%Y-%m-%dT%H:00")] * len(starts)
    assert answer_local == answer_utc


def test_an_offset_window_shares_a_cache_entry_with_its_utc_spelling(upstream):
    # Both spellings name one instant, so the second is the first's cache hit
    # rather than a second fetch of the same hours.
    utc = _tomorrow(15)
    plus_two = utc.astimezone(UTC).replace(tzinfo=None) + timedelta(hours=2)
    client.post("/api/analyze", json=_body(utc.isoformat(), (utc + timedelta(hours=3)).isoformat()))
    weather_calls = len([u for u, _ in upstream if "air-quality" not in u])
    resp = client.post(
        "/api/analyze",
        json=_body(
            plus_two.isoformat() + "+02:00", (plus_two + timedelta(hours=3)).isoformat() + "+02:00"
        ),
    )
    assert resp.status_code == 200
    assert len([u for u, _ in upstream if "air-quality" not in u]) == weather_calls


@pytest.mark.parametrize("route", ROUTES)
def test_a_naive_and_an_aware_end_together_are_one_window(route, upstream):
    # A naive end is read as UTC, so it compares with a `Z` start rather than
    # raising a TypeError in the ordering guard, which would answer 500 here
    # and a retryable `internal` error on the stream.
    start = _tomorrow(15)
    naive_end = (start + timedelta(hours=3)).replace(tzinfo=None).isoformat()
    status, answer = _answer(route, _body(start.isoformat().replace("+00:00", "Z"), naive_end))
    assert status == 200
    if route.endswith("/stream"):
        assert answer["type"] == "result"


@pytest.mark.parametrize("route", ROUTES)
def test_a_naive_end_before_an_aware_start_is_the_ordinary_400(route, upstream):
    start = _tomorrow(15)
    naive_end = (start - timedelta(hours=3)).replace(tzinfo=None).isoformat()
    status, answer = _answer(route, _body(start.isoformat(), naive_end))
    if route.endswith("/stream"):
        assert answer["message"] == "The start date must be before the end date."
        assert answer["error"] == {"code": "validation", "retryable": False}
    else:
        assert status == 400
        assert answer["detail"] == "The start date must be before the end date."


# ── a malformed ring is a 422 ──────────────────────────────────────────────


_MALFORMED_RINGS = {
    "no rings": [],
    "an empty ring": [[]],
    "a one-number position": [[[1.0]]],
    "two positions": [[[-121.0, 47.0], [-121.1, 47.1]]],
    "latitude 999": [[[-121.0, 999.0], [-121.1, 47.0], [-121.0, 47.1], [-121.0, 999.0]]],
    "longitude 999": [[[999.0, 47.0], [-121.1, 47.0], [-121.0, 47.1], [999.0, 47.0]]],
    "a three-number position": [
        [[-121.0, 47.0, 5.0], [-121.1, 47.0, 5.0], [-121.0, 47.1, 5.0], [-121.0, 47.0, 5.0]]
    ],
}


@pytest.mark.parametrize("route", ["/api/analyze", "/api/analyze/stream", "/api/destinations"])
@pytest.mark.parametrize("ring", _MALFORMED_RINGS.values(), ids=_MALFORMED_RINGS.keys())
def test_a_malformed_ring_is_a_422(route, ring, monkeypatch):
    async def no_discovery(*_, **__):
        raise AssertionError("a malformed ring reached discovery")

    monkeypatch.setattr(osm, "query_osm", no_discovery)
    # Unconstrained, each of these reaches `bbox_area_km2` or discovery: an
    # IndexError (500), a raw "max() iterable argument is empty", an unpacking
    # error reported as an Overpass outage, or a query for a polygon that does
    # not exist. Pydantic's own refusal names the position instead.
    body = {"polygon": {"type": "Polygon", "coordinates": ring}, "destination_types": ["peak"]}
    resp = client.post(route, json=body)
    assert resp.status_code == 422
    for error in resp.json()["detail"]:
        assert error["loc"][:3] == ["body", "polygon", "coordinates"]
        assert error["type"] != "value_error"


# The canary's api-test body in Kubernetes-Manifests
# (`public/bluebird/resources/analysisTemplate-apiTest.yml`), copied as it
# stands: a release whose model refused it would fail its own rollout.
_CANARY_BODY = {
    "destination_types": ["peak"],
    "forecast_mode": "current",
    "limit": 3,
    "polygon": {
        "type": "Polygon",
        "coordinates": [
            [[-122.03, 47.44], [-121.91, 47.44], [-121.91, 47.53], [-122.03, 47.53], [-122.03, 47.44]]
        ],
    },
}


def test_the_canary_body_still_validates():
    AnalyzeRequest(**_CANARY_BODY)


@pytest.mark.parametrize("bbox", [None, [-121.2, 47.0, -121.0, 47.2]])
def test_the_web_apps_smallest_ring_still_validates(bbox):
    # `ringPolygon` in drawGeometry.ts: three or more [lon, lat] points closed
    # back onto the first, so the smallest ring it sends is four positions.
    pts = [[-121.0, 47.0], [-121.2, 47.0], [-121.1, 47.2]]
    polygon = {"type": "Polygon", "coordinates": [[*pts, pts[0]]]}
    if bbox is not None:
        polygon["bbox"] = bbox
    request = DestinationsRequest(polygon=polygon, destination_types=["peak"])
    assert request.polygon is not None
    assert request.polygon.coordinates[0][0] == (-121.0, 47.0)
