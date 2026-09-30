"""Forest Service Region 6 closure orders, held once per pod (#550).

The fetch is five queries against three layers, and the lines layer is the one
that pages. What is worth pinning is that every page arrives, that each kind
reads the layers it names, and that an empty answer outside Oregon and
Washington can be told apart from a clear one.
"""

from __future__ import annotations

import json
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from conftest import fake_response

from app.services import nifc, usfs_closures, usfs_coverage
from app.services.errors import UpstreamRateLimited


def _feature(geometry: dict, name: str, **properties) -> dict:
    return {
        "type": "Feature",
        "properties": {"ClosureOrderName": name, "ClosureURLlink": None, **properties},
        "geometry": geometry,
    }


def _point(lon: float, lat: float, name: str) -> dict:
    return _feature({"type": "Point", "coordinates": [lon, lat]}, name)


def _line(west: float, south: float, east: float, north: float, name: str) -> dict:
    return _feature({"type": "LineString", "coordinates": [[west, south], [east, north]]}, name, RouteNum="440")


def _area(west: float, south: float, east: float, north: float, name: str) -> dict:
    ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    return _feature({"type": "Polygon", "coordinates": [ring]}, name, GIS_Acres=1200.0)


def _collection(*features: dict, more: bool = False) -> dict:
    body: dict = {"type": "FeatureCollection", "features": list(features)}
    if more:
        # Where f=geojson puts the flag (measured 2026-09-30).
        body["properties"] = {"exceededTransferLimit": True}
    return body


def _names(closures) -> list[str]:
    return [json.loads(c.blob)["properties"]["ClosureOrderName"] for c in closures]


def _snapshot(*, areas=(), lines=(), points=(), fetched_at_ms: int = 1_000) -> usfs_closures.Snapshot:
    def stored(features):
        return tuple(c for c in map(usfs_closures._to_closure, features) if c is not None)

    trails = stored(lines) + stored(points)
    return usfs_closures.Snapshot(
        fetched_at_ms=fetched_at_ms,
        areas_full=stored(areas),
        areas_coarse=stored(areas),
        trails_full=trails,
        trails_coarse=trails,
    )


# ── The fetch ─────────────────────────────────────────────────────────────────


class _Upstream:
    """Answers each layer, fidelity and offset the way the live service does."""

    def __init__(self, answers: dict[tuple[str, bool, int], dict]):
        self.answers = answers
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        layer = urlsplit(str(request.url)).path.split("/")[-2]
        query = parse_qs(urlsplit(str(request.url)).query)
        coarse = "maxAllowableOffset" in query
        offset = int(query["resultOffset"][0])
        return fake_response(self.answers[(layer, coarse, offset)])

    def queries(self) -> list[dict[str, list[str]]]:
        return [parse_qs(urlsplit(str(r.url)).query) for r in self.requests]


def _region() -> _Upstream:
    return _Upstream(
        {
            ("0", False, 0): _collection(_point(-121.94, 45.62, "Wahtum Lake TH")),
            ("1", False, 0): _collection(_line(-121.95, 45.60, -121.90, 45.63, "Trail 440"), more=True),
            ("1", False, 1): _collection(_line(-122.00, 45.55, -121.98, 45.58, "Trail 441")),
            ("1", True, 0): _collection(_line(-121.95, 45.60, -121.90, 45.63, "Trail 440 coarse"), more=True),
            ("1", True, 1): _collection(_line(-122.00, 45.55, -121.98, 45.58, "Trail 441 coarse")),
            ("2", False, 0): _collection(_area(-122.08, 45.58, -122.07, 45.59, "Eagle Creek")),
            ("2", True, 0): _collection(_area(-122.08, 45.58, -122.07, 45.59, "Eagle Creek coarse")),
        }
    )


async def test_the_fetch_holds_every_page_of_every_layer():
    upstream = _region()
    snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))

    # Five queries, and the lines page once more at each fidelity.
    assert len(upstream.requests) == 7
    assert _names(snapshot.areas_full) == ["Eagle Creek"]
    assert _names(snapshot.areas_coarse) == ["Eagle Creek coarse"]
    # Points ride in both fidelities, after the lines.
    assert _names(snapshot.trails_full) == ["Trail 440", "Trail 441", "Wahtum Lake TH"]
    assert _names(snapshot.trails_coarse) == ["Trail 440 coarse", "Trail 441 coarse", "Wahtum Lake TH"]

    # The second page of lines resumes where the first stopped.
    line_offsets = sorted(
        (q["resultOffset"][0], "maxAllowableOffset" in q)
        for r, q in zip(upstream.requests, upstream.queries(), strict=True)
        if r.url.path.endswith("/1/query")
    )
    assert line_offsets == [("0", False), ("0", True), ("1", False), ("1", True)]


async def test_the_fetch_asks_each_layer_for_its_own_fields():
    upstream = _region()
    await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))
    fields = {
        r.url.path.split("/")[-2]: q["outFields"][0]
        for r, q in zip(upstream.requests, upstream.queries(), strict=True)
    }
    # ArcGIS answers a field a layer lacks with a 400 (measured 2026-09-30).
    assert fields["0"] == usfs_closures.POINT_FIELDS
    assert "RouteName" in fields["1"] and "GIS_Acres" not in fields["1"]
    assert "GIS_Acres" in fields["2"] and "RouteName" not in fields["2"]
    for query in upstream.queries():
        assert query["where"] == ["ClosureStatus='Active'"]
        assert query["f"] == ["geojson"]
        assert query["resultRecordCount"] == [str(usfs_closures.PAGE_SIZE)]


async def test_the_coarse_copy_uses_the_wildfire_tolerance():
    upstream = _region()
    await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))
    offsets = {q["maxAllowableOffset"][0] for q in upstream.queries() if "maxAllowableOffset" in q}
    # Mirror row 10 names one tolerance; this module reads it rather than
    # spelling a second one.
    assert offsets == {str(nifc.COARSE_OFFSET_DEG)}


async def test_a_quota_refusal_inside_http_200_fails_the_fetch():
    refusal = {"error": {"code": 429, "message": "Unable to perform query. Too many requests."}}

    def handler(request: httpx.Request) -> httpx.Response:
        return fake_response(refusal)

    with pytest.raises(UpstreamRateLimited) as excinfo:
        await usfs_closures.fetch_snapshot(httpx.MockTransport(handler))
    assert excinfo.value.provider == usfs_closures.PROVIDER
    assert excinfo.value.retry_after_s == 60


def test_a_feature_without_geometry_is_dropped_but_still_counted():
    payload = json.dumps(
        _collection(
            _line(-121.95, 45.60, -121.90, 45.63, "Trail 440"),
            {"type": "Feature", "properties": {"ClosureOrderName": "no shape"}, "geometry": None},
            more=True,
        )
    ).encode()
    closures, more, count = usfs_closures._parse_page(payload)
    assert _names(closures) == ["Trail 440"]
    assert more is True
    # The offset step counts what ArcGIS SENT, or paging re-reads the rows the
    # dropped feature displaced.
    assert count == 2


# ── Filtering and assembly ────────────────────────────────────────────────────


def _mixed() -> usfs_closures.Snapshot:
    return _snapshot(
        areas=[_area(-122.08, 45.58, -122.07, 45.59, "Eagle Creek")],
        lines=[_line(-121.95, 45.60, -121.90, 45.63, "Trail 440")],
        points=[_point(-121.94, 45.62, "Wahtum Lake TH")],
    )


@pytest.mark.parametrize("coarse", [True, False])
def test_area_reads_only_the_polygons(coarse):
    found = _mixed().within((-122.2, 45.5, -121.8, 45.7), "area", coarse=coarse)
    assert _names(found) == ["Eagle Creek"]


@pytest.mark.parametrize("coarse", [True, False])
def test_trail_reads_the_lines_and_the_points(coarse):
    found = _mixed().within((-122.2, 45.5, -121.8, 45.7), "trail", coarse=coarse)
    assert _names(found) == ["Trail 440", "Wahtum Lake TH"]


def test_the_fidelity_picks_the_copy():
    snapshot = usfs_closures.Snapshot(
        fetched_at_ms=1,
        areas_full=_snapshot(areas=[_area(-122.08, 45.58, -122.07, 45.59, "full")]).areas_full,
        areas_coarse=_snapshot(areas=[_area(-122.08, 45.58, -122.07, 45.59, "coarse")]).areas_full,
        trails_full=_snapshot(lines=[_line(-121.95, 45.60, -121.90, 45.63, "full")]).trails_full,
        trails_coarse=_snapshot(lines=[_line(-121.95, 45.60, -121.90, 45.63, "coarse")]).trails_full,
    )
    box = (-122.2, 45.5, -121.8, 45.7)
    assert _names(snapshot.within(box, "area", coarse=True)) == ["coarse"]
    assert _names(snapshot.within(box, "area", coarse=False)) == ["full"]
    assert _names(snapshot.within(box, "trail", coarse=True)) == ["coarse"]
    assert _names(snapshot.within(box, "trail", coarse=False)) == ["full"]


def test_a_point_on_the_edge_of_the_box_is_inside_and_one_past_it_is_not():
    snapshot = _snapshot(points=[_point(-121.9, 45.6, "Edge TH")])
    assert _names(snapshot.within((-122.0, 45.5, -121.9, 45.6), "trail", coarse=True)) == ["Edge TH"]
    assert snapshot.within((-122.0, 45.5, -121.91, 45.6), "trail", coarse=True) == []


def test_collection_json_carries_the_fetch_time_and_the_coverage():
    snapshot = _mixed()
    snapshot = usfs_closures.Snapshot(
        fetched_at_ms=1_790_000_000_000,
        areas_full=snapshot.areas_full,
        areas_coarse=snapshot.areas_coarse,
        trails_full=snapshot.trails_full,
        trails_coarse=snapshot.trails_coarse,
    )
    body = json.loads(usfs_closures.collection_json(snapshot, list(snapshot.trails_full)))
    assert body["type"] == "FeatureCollection"
    assert body["fetched_at"] == 1_790_000_000_000
    assert body["coverage"] == usfs_coverage.COVERAGE
    assert [f["properties"]["ClosureOrderName"] for f in body["features"]] == ["Trail 440", "Wahtum Lake TH"]


def test_collection_json_carries_the_coverage_on_an_empty_answer():
    # The empty answer is exactly the one that needs "not covered" told apart
    # from "nothing closed".
    body = json.loads(usfs_closures.collection_json(_snapshot(), []))
    assert body["features"] == []
    assert body["coverage"]["type"] == "MultiPolygon"


# ── Coverage ──────────────────────────────────────────────────────────────────

COVERED = {
    "Mount Hood": (45.37, -121.70),
    "Mount Rainier": (46.85, -121.76),
    "Wallowa Lake": (45.28, -117.21),
    "Clarkston WA": (46.42, -117.05),
    "the San Juan Islands": (48.53, -123.01),
    "Crater Lake": (42.94, -122.10),
}

NOT_COVERED = {
    "Lewiston ID": (46.42, -117.02),
    "Mount Shasta": (41.41, -122.19),
    "Vancouver BC": (49.28, -123.12),
    "Victoria BC": (48.43, -123.37),
    "Boise ID": (43.62, -116.20),
    "Coeur d'Alene ID": (47.68, -116.78),
}


@pytest.mark.parametrize("place", sorted(COVERED))
def test_region_six_is_covered(place):
    assert usfs_coverage.covers(*COVERED[place]), place


@pytest.mark.parametrize("place", sorted(NOT_COVERED))
def test_outside_region_six_is_not_covered(place):
    assert not usfs_coverage.covers(*NOT_COVERED[place]), place


def test_coverage_json_is_the_geometry():
    assert json.loads(usfs_coverage.COVERAGE_JSON) == usfs_coverage.COVERAGE
    ring = usfs_coverage.COVERAGE["coordinates"][0][0]
    assert ring[0] == ring[-1]


# ── The cache ─────────────────────────────────────────────────────────────────


async def test_the_cache_serves_the_last_good_snapshot_after_a_failed_refresh():
    now = 0.0
    healthy = True

    async def fetch() -> usfs_closures.Snapshot:
        if not healthy:
            raise UpstreamRateLimited(usfs_closures.PROVIDER, "minutely", 60, "quota exhausted")
        return _mixed()

    cache = usfs_closures.closure_cache(ttl_s=1800, clock=lambda: now, fetch=fetch)
    first = await cache.get()
    healthy = False
    now = 1801.0
    assert await cache.get() is first
    await cache.settle()
    assert await cache.get() is first


def test_the_cache_ttl_is_half_an_hour_by_default():
    # The orders are edited by hand a few times a week (#550).
    assert usfs_closures.TTL_S == 1800
