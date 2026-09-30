"""`GET /api/closures`: the closure snapshot, filtered by box and kind (#550, #551).

Modelled on the wildfire route tests in test_nifc.py. The route shares its
bbox parser and its cold-cache answer with that route, so these pin that the
two answer alike, plus the one parameter this route adds.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.services import usfs_closures, usfs_coverage

BOX = "-122.2,45.5,-121.8,45.7"


def _feature(geometry: dict, name: str) -> dict:
    return {"type": "Feature", "properties": {"ClosureOrderName": name}, "geometry": geometry}


AREA = _feature(
    {
        "type": "Polygon",
        "coordinates": [[[-122.08, 45.58], [-122.07, 45.58], [-122.07, 45.59], [-122.08, 45.58]]],
    },
    "Eagle Creek",
)
AREA_COARSE = _feature(
    {
        "type": "Polygon",
        "coordinates": [[[-122.08, 45.58], [-122.07, 45.58], [-122.07, 45.59], [-122.08, 45.58]]],
    },
    "Eagle Creek (coarse)",
)
LINE = _feature({"type": "LineString", "coordinates": [[-121.95, 45.60], [-121.90, 45.63]]}, "Trail 440")
POINT = _feature({"type": "Point", "coordinates": [-121.94, 45.62]}, "Wahtum Lake TH")
FAR = _feature({"type": "Point", "coordinates": [-120.0, 48.0]}, "Far TH")


@pytest.fixture
def served(monkeypatch):
    """Install a cache that answers from fixed features without any network."""

    def stored(*features):
        return tuple(usfs_closures._to_closure(f) for f in features)

    snapshot = usfs_closures.Snapshot(
        fetched_at_ms=1_790_000_000_000,
        # The two fidelities hold different features on purpose, so a test can
        # tell which copy a `detail` value reached.
        areas_full=stored(AREA),
        areas_coarse=stored(AREA_COARSE),
        trails_full=stored(LINE, POINT, FAR),
        trails_coarse=stored(LINE, POINT, FAR),
    )

    async def fetch() -> usfs_closures.Snapshot:
        return snapshot

    monkeypatch.setattr(usfs_closures, "CLOSURES", usfs_closures.closure_cache(fetch=fetch))


def _names(response) -> list[str]:
    return [f["properties"]["ClosureOrderName"] for f in response.json()["features"]]


def test_area_returns_the_polygons_in_the_box(served):
    with TestClient(app) as client:
        response = client.get("/api/closures", params={"bbox": BOX, "kind": "area"})
    assert response.status_code == 200
    body = response.json()
    assert body["fetched_at"] == 1_790_000_000_000
    assert body["coverage"]["type"] == "MultiPolygon"
    # The default fidelity is the coarse copy, which the fixture names apart.
    assert _names(response) == ["Eagle Creek (coarse)"]


def test_trail_returns_the_lines_and_the_closed_sites_in_the_box(served):
    with TestClient(app) as client:
        response = client.get("/api/closures", params={"bbox": BOX, "kind": "trail"})
    assert response.status_code == 200
    assert _names(response) == ["Trail 440", "Wahtum Lake TH"]


def test_each_kind_answers_its_own_coverage(served):
    # Only Region 6 publishes trails, so the trail outline is Oregon and
    # Washington and the area outline adds Regions 3 and 4 (#551).
    with TestClient(app) as client:
        area = client.get("/api/closures", params={"bbox": BOX, "kind": "area"}).json()["coverage"]
        trail = client.get("/api/closures", params={"bbox": BOX, "kind": "trail"}).json()["coverage"]
    assert area == usfs_coverage.COVERAGE_FOR["area"]
    assert trail == usfs_coverage.COVERAGE_FOR["trail"]
    assert len(trail["coordinates"]) == 1
    assert len(area["coordinates"]) == 5


def test_kind_is_required_and_closed(served):
    with TestClient(app) as client:
        assert client.get("/api/closures", params={"bbox": BOX}).status_code == 422
        assert client.get("/api/closures", params={"bbox": BOX, "kind": "road"}).status_code == 422


def test_detail_defaults_to_coarse_and_accepts_full(served):
    with TestClient(app) as client:
        for params, expected in (
            ({}, ["Eagle Creek (coarse)"]),
            ({"detail": "coarse"}, ["Eagle Creek (coarse)"]),
            ({"detail": "full"}, ["Eagle Creek"]),
        ):
            response = client.get("/api/closures", params={"bbox": BOX, "kind": "area", **params})
            assert response.status_code == 200
            assert _names(response) == expected, params
        response = client.get("/api/closures", params={"bbox": BOX, "kind": "area", "detail": "sketch"})
    assert response.status_code == 422


def test_bbox_is_required(served):
    with TestClient(app) as client:
        assert client.get("/api/closures", params={"kind": "area"}).status_code == 422


@pytest.mark.parametrize(
    "bbox",
    ["-122.5,46.0,-121.0", "not,a,bounding,box", "-200,46.0,-121.0,47.5", "-122.5,48.0,-121.0,47.5"],
)
def test_a_malformed_box_answers_the_wildfire_route_422(served, bbox):
    with TestClient(app) as client:
        closures = client.get("/api/closures", params={"bbox": bbox, "kind": "area"})
        wildfires = client.get("/api/wildfires", params={"bbox": bbox})
    assert closures.status_code == 422
    assert closures.json()["error"] == {"code": "validation", "retryable": False}
    # One parser, so the two routes cannot word the same mistake two ways.
    assert closures.json() == wildfires.json()


def test_a_cold_cache_answers_503_with_retry_after():
    # The conftest default refuses to fetch, which is a cold pod facing an
    # unreachable Forest Service.
    with TestClient(app) as client:
        response = client.get("/api/closures", params={"bbox": BOX, "kind": "area"})
    assert response.status_code == 503
    assert response.headers["Retry-After"]
    assert response.json()["error"] == {"code": "snapshot_unavailable", "retryable": True}


def test_the_closures_bucket_throttles_this_route_alone(served, monkeypatch):
    monkeypatch.setattr(ratelimit.client, "CLOSURES_LIMITER", ratelimit.RateLimiter(1, 1, name="closures"))
    with TestClient(app) as client:
        assert client.get("/api/closures", params={"bbox": BOX, "kind": "area"}).status_code == 200
        throttled = client.get("/api/closures", params={"bbox": BOX, "kind": "trail"})
        # The wildfire bucket is its own: spending this one leaves it alone.
        assert client.get("/api/wildfires", params={"bbox": BOX}).status_code != 429
    assert throttled.status_code == 429
    assert throttled.headers["Retry-After"]
    assert throttled.json()["error"] == {"code": "rate_limited", "retryable": True}


def test_capabilities_publishes_the_closures_bucket_and_the_source():
    with TestClient(app) as client:
        body = client.get("/api/capabilities").json()
    assert "closures_per_minute" in body["limits"]["rate"]
    assert "closures_burst" in body["limits"]["rate"]
    assert {
        "name": "US Forest Service",
        "url": "https://www.fs.usda.gov/",
        "provides": "Regions 3, 4 and 6 closure orders behind GET /api/closures",
    } in body["data_sources"]
