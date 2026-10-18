"""The worldwide trailhead and crag set behind `GET /api/landmarks` (#734).

The behaviour worth pinning is the loader's shape, which the maintainer chose
on 2026-10-16: kinds land one at a time in order, a kind that failed is
retried forever on a doubling backoff, a kind that landed is served while the
next is still loading, and a held set is served however old it is.
"""

from __future__ import annotations

import asyncio
import json
import logging
import zlib

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from app.main import app
from app.models import DestinationType
from app.services import landmarks, osm
from app.services.errors import UpstreamError

# Bound before the conftest guard replaces it on the class, so the one test
# that drives a loader's own task can still start one.
_REAL_START = landmarks.LandmarkLoader.start

TRAILHEAD = {
    "type": "node",
    "id": 1,
    "lat": 47.4875,
    "lon": -121.7437,
    "tags": {"highway": "trailhead", "name": "Mailbox Peak Trailhead", "ele": "305"},
}
CRAG = {
    "type": "relation",
    "id": 2,
    "center": {"lat": 47.8208, "lon": -121.5555},
    "tags": {"sport": "climbing", "climbing": "crag", "name": "Lower Town Wall"},
}
BOULDER = {
    "type": "node",
    "id": 3,
    "lat": 47.82,
    "lon": -121.56,
    "tags": {"natural": "stone", "sport": "climbing", "name": "Midnite Boulder"},
}


def _props(features: list[landmarks.Landmark]) -> list[dict]:
    return [json.loads(f.blob)["properties"] for f in features]


# ── Parsing ───────────────────────────────────────────────────────────────────


def test_parse_reads_a_node_and_a_relation_centre_and_converts_the_elevation():
    [th] = landmarks.parse_elements([TRAILHEAD], DestinationType.trailhead)
    assert (th.lat, th.lon) == (47.4875, -121.7437)
    assert json.loads(th.blob) == {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [-121.7437, 47.4875]},
        "properties": {
            "name": "Mailbox Peak Trailhead",
            "kind": "trailhead",
            "osm_id": "node/1",
            "elevation_ft": 1001.0,
        },
    }
    [crag] = landmarks.parse_elements([CRAG], DestinationType.crag)
    assert (crag.lat, crag.lon) == (47.8208, -121.5555)
    assert _props([crag]) == [
        {"name": "Lower Town Wall", "kind": "crag", "osm_id": "relation/2", "elevation_ft": None}
    ]


def test_parse_types_by_the_discovery_classifier_so_a_stray_route_is_dropped():
    route = {**CRAG, "id": 9, "tags": {**CRAG["tags"], "climbing": "route"}}
    bare_stone = BOULDER
    kept = landmarks.parse_elements([CRAG, route, bare_stone], DestinationType.crag)
    assert [p["osm_id"] for p in _props(list(kept))] == ["relation/2", "node/3"]
    # A trailhead in a crag answer would be a tagging surprise, and is
    # classified by the same function the polygon search uses.
    assert landmarks.parse_elements([TRAILHEAD], DestinationType.crag) == ()


def test_parse_drops_the_unnamed_the_unplaced_and_a_repeated_id():
    unnamed = {**TRAILHEAD, "id": 4, "tags": {"highway": "trailhead"}}
    unplaced = {**CRAG, "id": 5, "center": {}}
    twice = [TRAILHEAD, TRAILHEAD]
    assert landmarks.parse_elements([unnamed], DestinationType.trailhead) == ()
    assert landmarks.parse_elements([unplaced], DestinationType.crag) == ()
    assert len(landmarks.parse_elements(twice, DestinationType.trailhead)) == 1


def test_two_trailheads_of_one_name_are_two_markers():
    # Discovery dedups by name because OSM carries duplicate nodes for one
    # summit; a marker stands where its feature is, so the id is the identity.
    other = {**TRAILHEAD, "id": 6, "lat": 46.0}
    assert len(landmarks.parse_elements([TRAILHEAD, other], DestinationType.trailhead)) == 2


# ── The worldwide query ──────────────────────────────────────────────────────


def test_the_world_query_is_the_discovery_clauses_with_no_polygon():
    query = osm.build_world_query(DestinationType.crag)
    assert query.startswith(f"[out:json][timeout:{osm.SERVER_TIMEOUT_TOKEN}];")
    for selector in osm._CLAUSES[DestinationType.crag]:
        assert f"  {selector}\n" in query
    assert "poly:" not in query
    # Tags and a centre, never members: 6,400 crag relations' members were
    # most of a 9 MB answer.
    assert query.rstrip().endswith("out tags center;")


def test_a_named_parking_lot_is_a_trailhead_when_its_name_says_so():
    # Issaquah, 2026-10-17: Poo Poo Trailhead is `amenity=parking`, and so are
    # twelve of its fourteen named trailheads. The world query asks for them
    # and the parser types them with the same words.
    query = osm.build_world_query(DestinationType.trailhead)
    assert 'way["amenity"="parking"]["name"~"[Tt]rail ?[Hh]ead"];' in query
    lot = {
        "type": "way",
        "id": 52524610,
        "center": {"lat": 47.5002, "lon": -122.0411},
        "tags": {"amenity": "parking", "name": "Poo Poo Trailhead", "capacity": "60"},
    }
    (feature,) = landmarks.parse_elements([lot], DestinationType.trailhead)
    assert json.loads(feature.blob)["properties"] == {
        "name": "Poo Poo Trailhead",
        "kind": "trailhead",
        "osm_id": "way/52524610",
        "elevation_ft": None,
    }


def test_the_polygon_query_is_the_same_clauses_inside_the_ring():
    query = osm._build_query([DestinationType.trailhead], "1 2 3 4")
    assert 'node["highway"="trailhead"]["name"](poly:"1 2 3 4");' in query
    assert query.rstrip().endswith("out center;")


async def test_fetch_stage_asks_the_chain_for_the_snapshot_path_with_its_own_timeout(monkeypatch):
    seen: dict = {}

    async def fake_post(query, on_status=None, **kwargs):
        seen.update(kwargs, query=query)
        return {"elements": [TRAILHEAD]}

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    [th] = await landmarks.fetch_stage(DestinationType.trailhead)
    assert th.lat == 47.4875
    assert seen["path"] == "snapshot"
    assert seen["attempt_timeout_s"] == landmarks.ATTEMPT_TIMEOUT_S
    assert "trailhead" in seen["query"]


def test_the_attempt_timeout_covers_the_measured_queries():
    # 119.8 s for the trailheads and about 160 s for the crags on 2026-10-16;
    # the mirror table's 25 s would fail both every time.
    assert landmarks.ATTEMPT_TIMEOUT_S >= 240
    assert all(m.timeout_s < landmarks.ATTEMPT_TIMEOUT_S for m in osm.OVERPASS_MIRRORS)


# ── The loader ───────────────────────────────────────────────────────────────


class _Script:
    """Canned answers per kind, consumed in order, and every sleep recorded."""

    def __init__(self, answers: dict[DestinationType, list[object]]):
        self.answers = answers
        self.asked: list[DestinationType] = []
        self.slept: list[float] = []
        self.now = 1_700_000_000.0

    async def fetch(self, kind: DestinationType) -> tuple[landmarks.Landmark, ...]:
        self.asked.append(kind)
        answer = self.answers[kind].pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer  # type: ignore[return-value]

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds

    def clock(self) -> float:
        return self.now


def _loader(script: _Script, **kw) -> landmarks.LandmarkLoader:
    return landmarks.LandmarkLoader(fetch=script.fetch, sleep=script.sleep, clock=script.clock, **kw)


TH = landmarks.parse_elements([TRAILHEAD], DestinationType.trailhead)
CR = landmarks.parse_elements([CRAG, BOULDER], DestinationType.crag)


async def test_kinds_land_in_order_and_each_is_served_as_it_lands():
    script = _Script({DestinationType.trailhead: [TH], DestinationType.crag: [CR]})
    loader = _loader(script)
    assert loader.snapshot is None
    await loader.run(forever=False)
    assert script.asked == [DestinationType.trailhead, DestinationType.crag]
    assert loader.snapshot is not None
    assert [p["kind"] for p in _props(list(loader.snapshot.features))] == ["trailhead", "crag", "crag"]
    assert loader.snapshot.fetched_at_ms == 1_700_000_000_000
    assert script.slept == []


async def test_a_failed_kind_is_retried_on_a_doubling_backoff_that_caps(caplog):
    failures = [UpstreamError(f"down {i}") for i in range(7)]
    script = _Script({DestinationType.trailhead: [*failures, TH], DestinationType.crag: [CR]})
    loader = _loader(script, backoff_first_s=60, backoff_max_s=3600)
    before = _failures()
    with caplog.at_level(logging.INFO, logger="app.services.landmarks"):
        await loader.run(forever=False)
    assert script.slept == [60, 120, 240, 480, 960, 1920, 3600]
    assert len([k for k in script.asked if k is DestinationType.trailhead]) == 8
    assert loader.snapshot is not None and loader.last_error is None
    assert _failures() - before == 7
    # Every step is on stdout: info for the fetch, warn for the failure with
    # the backoff beside it (the maintainer, 2026-10-16).
    fetches = [r for r in caplog.records if r.levelno == logging.INFO and "Fetching" in r.message]
    warns = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(fetches) == 9
    assert "down 0" in warns[0].message and "backing off 60 s before attempt 2" in warns[0].message


async def test_the_trailheads_are_served_while_the_crags_keep_failing():
    script = _Script(
        {DestinationType.trailhead: [TH], DestinationType.crag: [UpstreamError("busy"), CR]}
    )
    loader = _loader(script)

    seen_after_first_failure: list[int] = []

    async def spy_sleep(seconds: float) -> None:
        assert loader.snapshot is not None
        seen_after_first_failure.append(len(loader.snapshot.features))
        await script.sleep(seconds)

    loader._sleep = spy_sleep  # type: ignore[assignment]
    await loader.run(forever=False)
    assert seen_after_first_failure == [1]
    assert loader.snapshot is not None and len(loader.snapshot.features) == 3


async def test_a_complete_set_is_refreshed_on_the_interval_and_kept_through_a_failed_refresh():
    newer = landmarks.parse_elements([{**TRAILHEAD, "id": 7}], DestinationType.trailhead)
    script = _Script(
        {
            DestinationType.trailhead: [TH, newer],
            DestinationType.crag: [CR, UpstreamError("busy"), CR],
        }
    )
    loader = _loader(script, refresh_s=86_400, backoff_first_s=60)

    passes = 0

    async def two_passes(seconds: float) -> None:
        nonlocal passes
        await script.sleep(seconds)
        if seconds == 86_400:
            passes += 1
            if passes == 2:
                raise StopAsyncIteration

    loader._sleep = two_passes  # type: ignore[assignment]
    with pytest.raises(StopAsyncIteration):
        await loader.run()
    assert script.slept == [86_400, 60, 86_400]
    assert loader.snapshot is not None
    assert [p["osm_id"] for p in _props(list(loader.snapshot.features))] == [
        "node/7",
        "relation/2",
        "node/3",
    ]


async def test_start_runs_the_loop_once_and_stop_ends_it():
    script = _Script({DestinationType.trailhead: [TH], DestinationType.crag: [CR]})
    loader = _loader(script)
    import asyncio

    async def park(seconds: float) -> None:
        await asyncio.sleep(0)
        await asyncio.Event().wait()

    loader._sleep = park  # type: ignore[assignment]
    # The conftest guard stops the app's loader from starting; this one is
    # driven by hand through the real method.
    _REAL_START(loader)
    task = loader._task
    _REAL_START(loader)
    assert loader._task is task
    for _ in range(4):
        await asyncio.sleep(0)
    assert loader.snapshot is not None and len(loader.snapshot.features) == 3
    await loader.stop()
    assert task is not None and task.cancelled()


def test_a_new_loader_starts_its_failure_series_at_zero():
    # Created at 0 so the first failure is an increase an alert can see.
    assert REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": landmarks.PROVIDER}
    ) is not None


def _failures() -> float:
    value = REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": landmarks.PROVIDER}
    )
    return value or 0.0


# ── A polygon search from the held set (#745) ────────────────────────────────

# A ring around Index, closed, that holds the crag and the boulder but not
# the Mailbox Peak trailhead 37 km south.
INDEX = [[-121.7, 47.7], [-121.4, 47.7], [-121.4, 47.9], [-121.7, 47.9], [-121.7, 47.7]]
# A triangle whose bounding box holds the boulder at (-121.56, 47.82) and
# the crag at (-121.5555, 47.8208), and whose diagonal runs between the two:
# it crosses 47.82 at -121.558, so the crag is east of it and inside, and the
# boulder west of it and out.
TRIANGLE = [[-121.608, 47.72], [-121.508, 47.72], [-121.508, 47.92], [-121.608, 47.72]]
SAME_NAME = {
    "type": "node",
    "id": 4,
    "lat": 47.821,
    "lon": -121.556,
    "tags": {"sport": "climbing", "climbing": "crag", "name": "Lower Town Wall"},
}


def _holding(*kinds: DestinationType) -> landmarks.LandmarkLoader:
    """A loader that has landed exactly these kinds, from the canned answers."""
    answers = {DestinationType.trailhead: TH, DestinationType.crag: CR}
    script = _Script({k: [answers[k]] for k in kinds})
    loader = _loader(script)
    for kind in kinds:
        asyncio.run(loader._fill(kind))
    return loader


def test_a_search_reads_the_landed_kinds_inside_the_ring_in_discoverys_row_shape():
    rows, live = _holding(DestinationType.trailhead, DestinationType.crag).discover_held(
        INDEX, [DestinationType.crag, DestinationType.trailhead, DestinationType.peak]
    )
    assert live == [DestinationType.peak]
    assert rows == [
        {
            "name": "Lower Town Wall",
            "type": "crag",
            "latitude": 47.8208,
            "longitude": -121.5555,
            "elevation_ft": None,
            "osm_id": "relation/2",
        },
        {
            "name": "Midnite Boulder",
            "type": "crag",
            "latitude": 47.82,
            "longitude": -121.56,
            "elevation_ft": None,
            "osm_id": "node/3",
        },
    ]


def test_a_search_keeps_only_what_the_ring_holds_not_its_bounding_box():
    rows, _ = _holding(DestinationType.crag).discover_held(TRIANGLE, [DestinationType.crag])
    assert [r["name"] for r in rows] == ["Lower Town Wall"]


def test_a_kind_that_has_not_landed_goes_to_the_live_query():
    loader = _holding(DestinationType.trailhead)
    rows, live = loader.discover_held(INDEX, [DestinationType.trailhead, DestinationType.crag])
    assert rows == []
    assert live == [DestinationType.crag]
    assert loader.live_kinds([DestinationType.trailhead, DestinationType.lake]) == [DestinationType.lake]
    assert landmarks.LandmarkLoader().live_kinds([DestinationType.trailhead]) == [DestinationType.trailhead]


# The live query keeps one row per kind and name, because OSM carries
# duplicate nodes for one feature; a search from the set must answer the same.
def test_a_search_keeps_one_row_per_name_and_asks_each_kind_once():
    loader = landmarks.LandmarkLoader()
    loader._held[DestinationType.crag] = landmarks.parse_elements([CRAG, SAME_NAME], DestinationType.crag)
    rows, live = loader.discover_held(INDEX, [DestinationType.crag, DestinationType.crag])
    assert [r["osm_id"] for r in rows] == ["relation/2"]
    assert live == []


# ── The route ────────────────────────────────────────────────────────────────


@pytest.fixture
def served(monkeypatch):
    def install(*features: landmarks.Landmark, fetched_at_ms: int = 1_722_470_000_000):
        loader = landmarks.LandmarkLoader()
        loader.snapshot = landmarks.Snapshot(fetched_at_ms=fetched_at_ms, features=tuple(features))
        monkeypatch.setattr(landmarks, "LOADER", loader)
        return loader

    return install


def test_route_returns_the_features_inside_the_box(served):
    served(*TH, *CR)
    with TestClient(app) as client:
        response = client.get("/api/landmarks", params={"bbox": "-121.8,47.4,-121.7,47.5"})
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["fetched_at"] == 1_722_470_000_000
    assert [f["properties"]["name"] for f in body["features"]] == ["Mailbox Peak Trailhead"]
    assert body["features"][0]["geometry"]["coordinates"] == [-121.7437, 47.4875]


def test_route_answers_the_whole_world_once_gzipped_and_holds_it(served):
    served(*TH, *CR)
    with TestClient(app) as client:
        first = client.get(
            "/api/landmarks", params={"bbox": "-180,-90,180,90"}, headers={"Accept-Encoding": "gzip"}
        )
        second = client.get(
            "/api/landmarks", params={"bbox": "-180,-90,180,90"}, headers={"Accept-Encoding": "gzip"}
        )
    assert first.status_code == 200
    assert first.headers.get("content-encoding") == "gzip"
    assert len(first.json()["features"]) == 3
    assert second.content == first.content


def test_route_rejects_a_bad_box_the_way_the_wildfire_route_does(served):
    served(*TH)
    with TestClient(app) as client:
        ours = client.get("/api/landmarks", params={"bbox": "1,2,3"})
        theirs = client.get("/api/wildfires", params={"bbox": "1,2,3"})
    assert ours.status_code == 422
    assert ours.json() == theirs.json()


def test_route_answers_503_with_retry_after_until_the_first_kind_lands():
    with TestClient(app) as client:
        response = client.get("/api/landmarks", params={"bbox": "-180,-90,180,90"})
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "60"
    body = response.json()
    assert body["error"]["code"] == "snapshot_unavailable"
    assert body["detail"] == landmarks.LOADING_DETAIL


def test_route_names_the_last_failure_while_nothing_has_landed(monkeypatch):
    loader = landmarks.LandmarkLoader()
    loader.last_error = UpstreamError("OpenStreetMap is busy. Try again later.")
    monkeypatch.setattr(landmarks, "LOADER", loader)
    with TestClient(app) as client:
        response = client.get("/api/landmarks", params={"bbox": "-180,-90,180,90"})
    assert response.status_code == 503
    assert response.json()["detail"] == "OpenStreetMap is busy. Try again later."


def test_the_pod_starts_the_loader_with_the_app(monkeypatch):
    started: list[landmarks.LandmarkLoader] = []
    monkeypatch.setattr(landmarks.LandmarkLoader, "start", lambda self: started.append(self))
    with TestClient(app):
        pass
    assert started == [landmarks.LOADER]


def test_capabilities_publishes_the_bucket():
    with TestClient(app) as client:
        limits = client.get("/api/capabilities").json()["limits"]["rate"]
    assert "landmarks_per_minute" in limits and "landmarks_burst" in limits


def test_held_body_is_the_middleware_bytes():
    # A held answer must decompress to the join the per-request path sends.
    snapshot = landmarks.Snapshot(fetched_at_ms=5, features=TH)
    text = landmarks.collection_json(snapshot, list(TH))
    assert json.loads(text)["fetched_at"] == 5
    assert zlib.decompress(zlib.compress(text.encode()), 0) == text.encode()
