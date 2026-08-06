"""Server-side wildfire perimeter cache (issue #203).

The behavior worth pinning here is not the happy path but the failure shape:
NIFC's quota is shared with the rest of the internet, so refusals are routine
and the cache's whole job is to make them invisible.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from app.main import app
from app.services import nifc
from app.services.errors import UpstreamError, UpstreamRateLimited
from fastapi.testclient import TestClient


class _Clock:
    """Injectable monotonic clock, matching test_cache.py's idiom."""

    def __init__(self, t: float = 0.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def _polygon(west: float, south: float, east: float, north: float, name: str = "Test Fire") -> dict:
    return {
        "type": "Feature",
        "properties": {"attr_IncidentName": name, "poly_GISAcres": 100.0},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[west, south], [east, south], [east, north], [west, north], [west, south]]
            ],
        },
    }


def _snapshot(*features: dict, fetched_at_ms: int = 1_000) -> nifc.Snapshot:
    fires = tuple(f for f in map(nifc._to_fire, features) if f is not None)
    return nifc.Snapshot(fetched_at_ms=fetched_at_ms, full=fires, coarse=fires)


# ── Parsing and geometry ──────────────────────────────────────────────────────


def test_bounds_walks_multipolygon_rings():
    geometry = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[-120.0, 45.0], [-119.0, 45.0], [-119.0, 46.0], [-120.0, 45.0]]],
            [[[-118.0, 44.0], [-117.5, 44.0], [-117.5, 44.5], [-118.0, 44.0]]],
        ],
    }
    assert nifc._bounds(geometry["coordinates"]) == (-120.0, 44.0, -117.5, 46.0)


def test_to_fire_drops_a_feature_with_no_geometry():
    assert nifc._to_fire({"type": "Feature", "properties": {}, "geometry": None}) is None


def test_to_fire_preserves_the_upstream_json_verbatim():
    feature = _polygon(-120.0, 45.0, -119.0, 46.0, name="Dollar Lake")
    fire = nifc._to_fire(feature)
    assert fire is not None
    assert json.loads(fire.blob) == feature


def test_arcgis_reports_a_quota_refusal_inside_http_200():
    # The measured body: status 200, refusal in the envelope. A shape check
    # that only looks for "features" reads this as a parsing bug.
    body = {
        "error": {
            "code": 429,
            "message": "Unable to perform query. Too many requests.",
            "details": ["API calls quota exceeded (62896 request units)!"],
        }
    }
    with pytest.raises(UpstreamRateLimited) as excinfo:
        nifc._raise_for_arcgis_error(body)
    assert excinfo.value.retry_after_s == 60
    assert "rate-limited" in excinfo.value.message


def test_arcgis_non_quota_error_is_a_plain_upstream_error():
    with pytest.raises(UpstreamError) as excinfo:
        nifc._raise_for_arcgis_error({"error": {"code": 400, "message": "Invalid field"}})
    assert not isinstance(excinfo.value, UpstreamRateLimited)


def test_a_normal_body_raises_nothing():
    assert nifc._raise_for_arcgis_error({"type": "FeatureCollection", "features": []}) is None


# ── Paging ────────────────────────────────────────────────────────────────────


def _client_returning(pages: list[dict]) -> httpx.AsyncClient:
    """An httpx client whose GETs walk `pages` in order."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=pages[min(len(calls) - 1, len(pages) - 1)])

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client.recorded = calls  # type: ignore[attr-defined]
    return client


async def test_fetch_layer_follows_exceeded_transfer_limit():
    pages = [
        {
            "type": "FeatureCollection",
            "features": [_polygon(-120.0, 45.0, -119.9, 45.1)],
            "exceededTransferLimit": True,
        },
        {
            "type": "FeatureCollection",
            "features": [_polygon(-118.0, 44.0, -117.9, 44.1)],
        },
    ]
    async with _client_returning(pages) as client:
        fires = await nifc._fetch_layer(client, None)
        assert len(fires) == 2
        # The second request must resume where the first stopped, or paging
        # silently re-reads page one forever.
        assert "resultOffset=1" in str(client.recorded[1].url)


async def test_fetch_layer_stops_at_the_page_backstop(monkeypatch, caplog):
    monkeypatch.setattr(nifc, "MAX_PAGES", 3)
    forever = [
        {
            "type": "FeatureCollection",
            "features": [_polygon(-120.0, 45.0, -119.9, 45.1)],
            "exceededTransferLimit": True,
        }
    ]
    async with _client_returning(forever) as client:
        fires = await nifc._fetch_layer(client, None)
    assert len(fires) == 3
    assert "backstop" in caplog.text


async def test_fetch_layer_asks_for_simplified_geometry_only_when_told():
    page = [{"type": "FeatureCollection", "features": []}]
    async with _client_returning(page) as client:
        await nifc._fetch_layer(client, nifc.COARSE_OFFSET_DEG)
        assert "maxAllowableOffset" in str(client.recorded[0].url)
    async with _client_returning(page) as client:
        await nifc._fetch_layer(client, None)
        assert "maxAllowableOffset" not in str(client.recorded[0].url)


# ── The cache ─────────────────────────────────────────────────────────────────


async def test_cache_refetches_once_the_snapshot_ages_out():
    clock = _Clock()
    calls = 0

    async def fetch() -> nifc.Snapshot:
        nonlocal calls
        calls += 1
        return _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0), fetched_at_ms=calls)

    perimeters = nifc.perimeter_cache(ttl_s=600, clock=clock, fetch=fetch)
    assert (await perimeters.get()).fetched_at_ms == 1
    clock.t = 599
    assert (await perimeters.get()).fetched_at_ms == 1
    clock.t = 601
    await perimeters.get()
    await perimeters.settle()
    assert (await perimeters.get()).fetched_at_ms == 2
    assert calls == 2


async def test_an_aged_snapshot_is_served_without_waiting_for_the_refresh():
    # A national fetch measured 6.7 seconds against the live service. Blocking
    # on it would hand that wait to one unlucky visitor every TTL, to tell them
    # what the previous visitor already knew.
    clock = _Clock()
    release = asyncio.Event()
    calls = 0

    async def fetch() -> nifc.Snapshot:
        nonlocal calls
        calls += 1
        if calls > 1:
            await release.wait()
        return _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0), fetched_at_ms=calls)

    perimeters = nifc.perimeter_cache(ttl_s=600, clock=clock, fetch=fetch)
    await perimeters.get()

    clock.t = 601
    # Returns the aged copy while the refresh is still blocked on `release`. If
    # get() waited on the refresh, this line would hang rather than fail.
    served = await perimeters.get()
    assert served.fetched_at_ms == 1

    # One yield is enough for the scheduled refresh to reach its own await, so
    # the caller was served ahead of an upstream fetch that is still in flight.
    await asyncio.sleep(0)
    assert calls == 2

    release.set()
    await perimeters.settle()
    assert (await perimeters.get()).fetched_at_ms == 2


async def test_concurrent_cold_misses_cost_one_upstream_fetch():
    # The thundering herd this exists to stop: on a cold pod every visitor
    # would otherwise be its own query against a quota shared with the rest of
    # the internet.
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def fetch() -> nifc.Snapshot:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0))

    perimeters = nifc.perimeter_cache(fetch=fetch)
    waiters = [asyncio.create_task(perimeters.get()) for _ in range(5)]
    await started.wait()
    release.set()
    results = await asyncio.gather(*waiters)

    assert calls == 1
    assert all(r is results[0] for r in results)


async def test_concurrent_aged_reads_schedule_one_background_refresh():
    clock = _Clock()
    release = asyncio.Event()
    calls = 0

    async def fetch() -> nifc.Snapshot:
        nonlocal calls
        calls += 1
        if calls > 1:
            await release.wait()
        return _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0))

    perimeters = nifc.perimeter_cache(ttl_s=600, clock=clock, fetch=fetch)
    await perimeters.get()

    clock.t = 601
    await asyncio.gather(*(perimeters.get() for _ in range(5)))
    release.set()
    await perimeters.settle()
    assert calls == 2


async def test_a_failed_refresh_keeps_serving_the_last_good_snapshot():
    clock = _Clock()
    healthy = True

    async def fetch() -> nifc.Snapshot:
        if not healthy:
            raise UpstreamRateLimited(nifc.PROVIDER, "minutely", 60, "quota exhausted")
        return _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0), fetched_at_ms=7)

    perimeters = nifc.perimeter_cache(ttl_s=600, clock=clock, fetch=fetch)
    await perimeters.get()

    healthy = False
    clock.t = 601
    await perimeters.get()
    await perimeters.settle()
    stale = await perimeters.get()
    # Still answerable, and still honest about when it was true.
    assert stale.fetched_at_ms == 7
    assert len(stale.full) == 1


async def test_a_failed_refresh_backs_off_instead_of_retrying_per_request():
    clock = _Clock()
    attempts = 0

    async def fetch() -> nifc.Snapshot:
        nonlocal attempts
        attempts += 1
        if attempts > 1:
            raise UpstreamError("down")
        return _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0))

    perimeters = nifc.perimeter_cache(ttl_s=600, retry_after_failure_s=60, clock=clock, fetch=fetch)
    await perimeters.get()
    clock.t = 601
    await perimeters.get()
    await perimeters.settle()  # attempt 2, fails
    for _ in range(3):
        await perimeters.get()  # inside the backoff: must not become attempt 3
        await perimeters.settle()
    assert attempts == 2
    clock.t = 662
    await perimeters.get()
    await perimeters.settle()
    assert attempts == 3


async def test_the_first_ever_failure_has_nothing_to_serve_and_raises():
    async def fetch() -> nifc.Snapshot:
        raise UpstreamError("NIFC unreachable")

    perimeters = nifc.perimeter_cache(fetch=fetch)
    with pytest.raises(UpstreamError):
        await perimeters.get()


# ── Filtering and assembly ────────────────────────────────────────────────────


def test_within_returns_only_intersecting_perimeters():
    snapshot = _snapshot(
        _polygon(-120.0, 45.0, -119.0, 46.0, name="Near"),
        _polygon(-100.0, 30.0, -99.0, 31.0, name="Far"),
    )
    inside = snapshot.within((-121.0, 44.0, -118.0, 47.0), coarse=False)
    assert [json.loads(f.blob)["properties"]["attr_IncidentName"] for f in inside] == ["Near"]


def test_within_keeps_a_perimeter_that_merely_overlaps_the_edge():
    snapshot = _snapshot(_polygon(-120.0, 45.0, -119.0, 46.0))
    assert len(snapshot.within((-119.5, 45.5, -110.0, 50.0), coarse=False)) == 1


def test_collection_json_is_parseable_and_carries_the_fetch_time():
    snapshot = _snapshot(
        _polygon(-120.0, 45.0, -119.0, 46.0, name="A"),
        _polygon(-118.0, 45.0, -117.0, 46.0, name="B"),
        fetched_at_ms=1_722_470_000_000,
    )
    body = json.loads(nifc.collection_json(snapshot, list(snapshot.full)))
    assert body["type"] == "FeatureCollection"
    assert body["fetched_at"] == 1_722_470_000_000
    assert [f["properties"]["attr_IncidentName"] for f in body["features"]] == ["A", "B"]


def test_collection_json_handles_an_empty_result():
    body = json.loads(nifc.collection_json(_snapshot(), []))
    assert body["features"] == []


def test_collection_json_carries_the_coverage_member():
    # The member the browser reads to tell "not covered" from "nothing
    # burning" (#256). It rides every response, empty results included,
    # because the empty result is exactly the case that needs disambiguating.
    body = json.loads(nifc.collection_json(_snapshot(), []))
    assert body["coverage"]["type"] == "MultiPolygon"
    assert len(body["coverage"]["coordinates"]) >= 4


# ── The route ─────────────────────────────────────────────────────────────────


@pytest.fixture
def served(monkeypatch):
    """Install a cache that answers from fixed features without any network."""

    def install(*features: dict, fetched_at_ms: int = 1_722_470_000_000) -> None:
        snapshot = _snapshot(*features, fetched_at_ms=fetched_at_ms)

        async def fetch() -> nifc.Snapshot:
            return snapshot

        monkeypatch.setattr(nifc, "PERIMETERS", nifc.perimeter_cache(fetch=fetch))

    return install


def test_route_returns_perimeters_in_the_box(served):
    served(
        _polygon(-121.9, 46.7, -121.5, 47.0, name="Rainier Fire"),
        _polygon(-80.0, 25.0, -79.0, 26.0, name="Florida Fire"),
    )
    with TestClient(app) as client:
        response = client.get("/api/wildfires", params={"bbox": "-122.5,46.0,-121.0,47.5"})
    assert response.status_code == 200
    body = response.json()
    assert body["fetched_at"] == 1_722_470_000_000
    assert [f["properties"]["attr_IncidentName"] for f in body["features"]] == ["Rainier Fire"]


def test_route_defaults_to_coarse_and_accepts_full(served):
    served(_polygon(-121.9, 46.7, -121.5, 47.0))
    with TestClient(app) as client:
        assert (
            client.get("/api/wildfires", params={"bbox": "-180,-90,180,90"}).status_code == 200
        )
        assert (
            client.get(
                "/api/wildfires", params={"bbox": "-180,-90,180,90", "detail": "full"}
            ).status_code
            == 200
        )
        assert (
            client.get(
                "/api/wildfires", params={"bbox": "-180,-90,180,90", "detail": "sketch"}
            ).status_code
            == 422
        )


@pytest.mark.parametrize(
    "bbox",
    ["-122.5,46.0,-121.0", "not,a,bounding,box", "-200,46.0,-121.0,47.5", "-122.5,48.0,-121.0,47.5"],
)
def test_route_rejects_a_malformed_box(served, bbox):
    served()
    with TestClient(app) as client:
        assert client.get("/api/wildfires", params={"bbox": bbox}).status_code == 422


def test_route_answers_503_when_nothing_has_ever_been_fetched(monkeypatch):
    # The conftest default already refuses; this asserts the shape a cold pod
    # facing an unreachable NIFC presents to the browser.
    with TestClient(app) as client:
        response = client.get("/api/wildfires", params={"bbox": "-122.5,46.0,-121.0,47.5"})
    assert response.status_code == 503
    assert response.headers["Retry-After"]


def test_capabilities_publishes_the_wildfire_bucket():
    with TestClient(app) as client:
        limits = client.get("/api/capabilities").json()["limits"]["rate"]
    assert "wildfires_per_minute" in limits
    assert "wildfires_burst" in limits
