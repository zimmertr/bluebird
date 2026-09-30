"""Forest Service closure orders, held once per pod (#550, #551).

Region 6 is five queries against three layers, and the lines layer is the one
that pages. Regions 3 and 4 are two phases each: every live order's
attributes, then the geometry of the entry closures alone. What is worth
pinning is that every page arrives, that each kind reads the feeds it names,
that an order which closes nothing never costs its geometry, and that an empty
answer outside the coverage can be told apart from a clear one.
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


R06 = "R06_FireClosureOrders_PublicView"
R03 = "r03_ForestOrder"
R04 = "R04_Forest_Orders_PUBLIC_VIEW"


def _service(request: httpx.Request) -> str:
    return request.url.path.split("/")[-4]


class _Upstream:
    """Answers each feed, layer, fidelity and offset the way the live services do.

    Region 6 is keyed by layer. Regions 3 and 4 are keyed by service and phase,
    because Region 3's polygons are its layer 1, which is Region 6's lines.
    """

    def __init__(self, answers: dict[tuple, dict]):
        self.answers = answers
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        service = _service(request)
        layer = request.url.path.split("/")[-2]
        query = parse_qs(urlsplit(str(request.url)).query)
        coarse = "maxAllowableOffset" in query
        offset = int(query["resultOffset"][0])
        if service == R06:
            return fake_response(self.answers[(layer, coarse, offset)])
        phase = "attributes" if query["returnGeometry"] == ["false"] else "geometry"
        return fake_response(self.answers[(service, phase, coarse, offset)])

    def queries(self, service: str | None = None) -> list[dict[str, list[str]]]:
        return [
            parse_qs(urlsplit(str(r.url)).query)
            for r in self.requests
            if service is None or _service(r) == service
        ]


def _region(orders: dict | None = None) -> _Upstream:
    """Region 6's layers, and the two order feeds answering nothing unless told."""
    return _Upstream(
        {
            (R03, "attributes", False, 0): _rows(),
            (R04, "attributes", False, 0): _rows(),
            **(orders or {}),
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

    # Five queries, and the lines page once more at each fidelity. The order
    # feeds pass nothing here, so each costs its attribute query alone.
    assert len([r for r in upstream.requests if _service(r) == R06]) == 7
    assert len(upstream.requests) == 9
    assert _names(snapshot.areas_full) == ["Eagle Creek"]
    assert _names(snapshot.areas_coarse) == ["Eagle Creek coarse"]
    # Points ride in both fidelities, after the lines.
    assert _names(snapshot.trails_full) == ["Trail 440", "Trail 441", "Wahtum Lake TH"]
    assert _names(snapshot.trails_coarse) == ["Trail 440 coarse", "Trail 441 coarse", "Wahtum Lake TH"]

    # The second page of lines resumes where the first stopped.
    line_offsets = sorted(
        (q["resultOffset"][0], "maxAllowableOffset" in q)
        for r, q in zip(upstream.requests, upstream.queries(), strict=True)
        if _service(r) == R06 and r.url.path.endswith("/1/query")
    )
    assert line_offsets == [("0", False), ("0", True), ("1", False), ("1", True)]
    # Every page asks for one order, or an offset walk could repeat or skip a
    # feature at a page edge (review of #552).
    assert {q["orderByFields"][0] for q in upstream.queries()} == {"OBJECTID"}


async def test_the_fetch_asks_each_layer_for_its_own_fields():
    upstream = _region()
    await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))
    requests = [r for r in upstream.requests if _service(r) == R06]
    fields = {
        r.url.path.split("/")[-2]: q["outFields"][0]
        for r, q in zip(requests, upstream.queries(R06), strict=True)
    }
    # ArcGIS answers a field a layer lacks with a 400 (measured 2026-09-30).
    assert fields["0"] == usfs_closures.POINT_FIELDS
    assert "RouteName" in fields["1"] and "GIS_Acres" not in fields["1"]
    assert "GIS_Acres" in fields["2"] and "RouteName" not in fields["2"]
    for query in upstream.queries(R06):
        assert query["where"] == ["ClosureStatus='Active'"]
        assert query["f"] == ["geojson"]
        assert query["resultRecordCount"] == [str(usfs_closures.PAGE_SIZE)]


async def test_the_coarse_copy_uses_the_wildfire_tolerance():
    upstream = _region(_orders_answers())
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


# ── Regions 3 and 4 ───────────────────────────────────────────────────────────


def _order(objectid: int, name: str, *, cfr: str | None = None, description: str | None = None, **extra) -> dict:
    """One row of a Region 3 or 4 attribute page, as `f=json` sends it."""
    return {
        "attributes": {
            "objectid": objectid,
            "forestname": "Coconino National Forest",
            "ordername": name,
            "ordernum": f"03-04-00-26-{objectid}",
            "ordertype": "Safety Closure",
            "description": description,
            "cfr": cfr,
            "startdate": 1_780_000_000_000,
            "enddate": None,
            "hyperlink": "https://www.fs.usda.gov/r03/coconino/alerts",
            "acres": 640.0,
            **extra,
        }
    }


def _rows(*orders: dict, more: bool = False) -> dict:
    body: dict = {"objectIdFieldName": "objectid", "features": list(orders)}
    if more:
        # Where f=json puts the flag.
        body["exceededTransferLimit"] = True
    return body


def _shape(objectid: int, west: float, south: float, east: float, north: float) -> dict:
    """One feature of a phase-2 page: the ID, the one field asked for, a shape."""
    ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    return {
        "type": "Feature",
        "id": objectid,
        "properties": {"objectid": objectid},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


RECKLESS_DRIVING = _order(
    102,
    "Reckless Driving",
    cfr="36 CFR 261.54(f)",
    description="Operating a vehicle carelessly or recklessly on a National Forest System road.",
)


def _orders_answers() -> dict:
    """Region 3 passes two of three orders across two pages; Region 4 one of two."""
    region_three = (_shape(101, -111.2, 34.0, -111.1, 34.1), _shape(103, -111.0, 34.2, -110.9, 34.3))
    return {
        (R03, "attributes", False, 0): _rows(
            _order(101, "Davis Wash Public Safety Closure Order", cfr="36 C.F.R. § 261.53(e)"),
            RECKLESS_DRIVING,
            more=True,
        ),
        (R03, "attributes", False, 2): _rows(
            _order(103, "Mine Area Closure", description="Going into or being upon the closed area is prohibited."),
        ),
        (R03, "geometry", False, 0): _collection(*region_three),
        (R03, "geometry", True, 0): _collection(*region_three),
        (R04, "attributes", False, 0): _rows(
            _order(201, "Redfish Cave - Special Order", cfr="36 CFR 261.50(a) and (e), 36 CFR 261.53(e)"),
            _order(202, "Float Permit - Special Order", cfr="36 CFR 261.50(a) and (e), 36 CFR 261.58(k)"),
        ),
        (R04, "geometry", False, 0): _collection(_shape(201, -114.95, 44.1, -114.9, 44.15)),
        (R04, "geometry", True, 0): _collection(_shape(201, -114.95, 44.1, -114.9, 44.15)),
    }


@pytest.mark.parametrize(
    "attributes",
    [
        # The citation as the feeds spell it: the section sign, and a space.
        {"cfr": "16 U.S.C. § 551; 36 C.F.R. § 261.50(a) and (b); 36 C.F.R. § 261.53(e);"},
        {"cfr": "36 CFR 261.50(a) and (e), 36 CFR 261.53(e)"},
        {"cfr": "16 U.S.C. § 551 and 36 C.F.R. § 261.50(a), 36 C.F.R. § 261.53 (e)"},
        {"cfr": "36 C.F.R. § 261.52(e) & 36 C.F.R. §§ 261.54(e)"},
        # The text, in either field, in any case.
        {"description": "Going into or being upon the closure area is prohibited."},
        {"description": "prohibits entering or being on the site"},
        {"description": "Being in or on the area described in Exhibit A."},
        {"ordername": "Bear Canyon closed to all public entry"},
        {"ordername": "Mine site CLOSED TO ACCESS"},
    ],
)
def test_an_order_that_closes_an_area_to_entry_passes(attributes):
    assert usfs_closures.is_area_closure(attributes)


@pytest.mark.parametrize(
    "attributes",
    [
        # Region 4 files reckless driving as a Safety Closure; the type is not
        # the test.
        RECKLESS_DRIVING["attributes"],
        # 261.53(a) and 261.50(e) are other paragraphs.
        {"cfr": "36 C.F.R. § 261.53(a)", "ordername": "Occupancy and Use Prohibition"},
        {"cfr": "36 CFR 261.50(a) and (e), 36 CFR 261.58(k)", "ordername": "Float Permit"},
        {"ordertype": "Safety Closure", "ordername": "Bridge Load Limits"},
        {"cfr": None, "description": None, "ordername": None},
        {},
    ],
)
def test_an_order_that_closes_nothing_fails(attributes):
    assert not usfs_closures.is_area_closure(attributes)


async def test_an_order_feed_sends_its_passing_ids_alone_for_geometry():
    upstream = _region(_orders_answers())
    await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))

    attributes = [q for q in upstream.queries(R03) if q["returnGeometry"] == ["false"]]
    geometry = [q for q in upstream.queries(R03) if q["returnGeometry"] == ["true"]]
    # Phase 1 reads every live order across both pages, with no shape.
    assert [q["resultOffset"] for q in attributes] == [["0"], ["2"]]
    for query in attributes:
        assert query["where"] == [usfs_closures.ORDER_WHERE]
        assert query["outFields"] == [usfs_closures.ORDER_FIELDS]
        assert query["f"] == ["json"]
    # Phase 2 asks for the two that passed, once per fidelity, and the IDs are
    # the whole filter.
    assert sorted("maxAllowableOffset" in q for q in geometry) == [False, True]
    for query in geometry:
        assert query["objectIds"] == ["101,103"]
        assert "where" not in query
        assert query["f"] == ["geojson"]
        assert query["orderByFields"] == ["OBJECTID"]


async def test_an_order_feed_where_nothing_passes_sends_no_geometry_request():
    upstream = _region({**_orders_answers(), (R04, "attributes", False, 0): _rows(RECKLESS_DRIVING)})
    snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))

    assert [q["returnGeometry"] for q in upstream.queries(R04)] == [["false"]]
    sources = {json.loads(c.blob)["properties"]["ClosureSource"] for c in snapshot.areas_full}
    assert sources == {"R06", "R03"}


async def test_the_areas_join_region_six_then_three_then_four():
    snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(_region(_orders_answers())))
    expected = [
        "Eagle Creek",
        "Davis Wash Public Safety Closure Order",
        "Mine Area Closure",
        "Redfish Cave - Special Order",
    ]
    assert _names(snapshot.areas_full) == expected
    assert _names(snapshot.areas_coarse) == ["Eagle Creek coarse", *expected[1:]]
    # Regions 3 and 4 publish no trails.
    assert _names(snapshot.trails_full) == ["Trail 440", "Trail 441", "Wahtum Lake TH"]


async def test_an_order_carries_region_six_property_names():
    snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(_region(_orders_answers())))
    feature = json.loads(snapshot.areas_full[1].blob)
    assert feature["id"] == 101
    assert feature["properties"] == {
        "OBJECTID": 101,
        "ForestUnit": "Coconino National Forest",
        "District": None,
        "FireName": None,
        "ClosureOrderName": "Davis Wash Public Safety Closure Order",
        "ClosureOrderNumber": "03-04-00-26-101",
        "ClosureDescription": None,
        "ClosureStartDate": 1_780_000_000_000,
        "ClosureEndDate": None,
        "ClosureURLlink": "https://www.fs.usda.gov/r03/coconino/alerts",
        "GIS_Acres": 640.0,
        "ClosureSource": "R03",
        "ClosureType": "Safety Closure",
    }
    assert feature["geometry"]["type"] == "Polygon"
    # Rebuilt compactly, as Region 6's stored text is.
    assert snapshot.areas_full[1].blob == json.dumps(feature, separators=(",", ":"))
    assert json.loads(snapshot.areas_full[3].blob)["properties"]["ClosureSource"] == "R04"
    closure = snapshot.areas_full[1]
    assert (closure.west, closure.south, closure.east, closure.north) == (-111.2, 34.0, -111.1, 34.1)


async def test_every_region_six_feature_carries_its_source():
    snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(_region()))
    for closure in (*snapshot.areas_full, *snapshot.areas_coarse, *snapshot.trails_full, *snapshot.trails_coarse):
        properties = json.loads(closure.blob)["properties"]
        assert properties["ClosureSource"] == "R06"
        assert properties["ClosureType"] is None
    # The Forest Service's own properties still ride beside them.
    assert json.loads(snapshot.areas_full[0].blob)["properties"]["GIS_Acres"] == 1200.0


def test_a_geometry_page_joins_by_id_and_skips_what_phase_one_did_not_keep():
    attributes = {101: _order(101, "Kept", cfr="36 CFR 261.53(e)")["attributes"]}
    by_property = _shape(101, -111.2, 34.0, -111.1, 34.1)
    del by_property["id"]
    payload = json.dumps(
        _collection(by_property, _shape(999, -111.0, 34.2, -110.9, 34.3), more=True)
    ).encode()
    closures, more, count = usfs_closures._parse_order_geometry(payload, attributes, "R03")
    assert _names(closures) == ["Kept"]
    assert more is True
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
    body = json.loads(usfs_closures.collection_json(snapshot, list(snapshot.trails_full), "trail"))
    assert body["type"] == "FeatureCollection"
    assert body["fetched_at"] == 1_790_000_000_000
    assert body["coverage"] == usfs_coverage.COVERAGE_FOR["trail"]
    assert [f["properties"]["ClosureOrderName"] for f in body["features"]] == ["Trail 440", "Wahtum Lake TH"]


def test_collection_json_carries_the_coverage_on_an_empty_answer():
    # The empty answer is exactly the one that needs "not covered" told apart
    # from "nothing closed".
    body = json.loads(usfs_closures.collection_json(_snapshot(), [], "area"))
    assert body["features"] == []
    assert body["coverage"]["type"] == "MultiPolygon"


def test_collection_json_picks_the_outline_by_kind():
    # Only Region 6 publishes trails, so the trail outline is its two states
    # and the area outline is three regions (#551).
    area = json.loads(usfs_closures.collection_json(_snapshot(), [], "area"))["coverage"]
    trail = json.loads(usfs_closures.collection_json(_snapshot(), [], "trail"))["coverage"]
    assert area == usfs_coverage.COVERAGE_FOR["area"]
    assert trail == usfs_coverage.COVERAGE_FOR["trail"]
    assert len(area["coordinates"]) == 5
    assert trail["coordinates"] == [area["coordinates"][0]]


# ── Coverage ──────────────────────────────────────────────────────────────────

# Oregon and Washington, which both kinds cover.
REGION_SIX = {
    "Mount Hood": (45.37, -121.70),
    "Mount Rainier": (46.85, -121.76),
    "Wallowa Lake": (45.28, -117.21),
    "Clarkston WA": (46.42, -117.05),
    "the San Juan Islands": (48.53, -123.01),
    "Crater Lake": (42.94, -122.10),
    "Huntington OR": (44.35, -117.27),
    "Halfway OR": (44.88, -117.11),
}

# Regions 3 and 4, which only the area kind covers (#551).
REGIONS_THREE_AND_FOUR = {
    "Humphreys Peak AZ": (35.35, -111.68),
    "Wheeler Peak NM": (36.56, -105.42),
    "Kings Peak UT": (40.78, -110.37),
    "Wheeler Peak NV": (38.98, -114.31),
    "Borah Peak ID": (44.14, -113.78),
    # In the Beaverhead Mountains, a few miles from Montana's southern point.
    "Scott Peak ID": (44.36, -112.83),
    "Boise ID": (43.62, -116.20),
    "Gannett Peak WY": (43.18, -109.65),
    "Grand Teton WY": (43.74, -110.80),
}

# Outside every region, for both kinds.
NEITHER = {
    # Region 1: the Nez Perce-Clearwater, across the river from Clarkston.
    "Lewiston ID": (46.42, -117.02),
    "Mount Shasta CA": (41.41, -122.19),
    "Mount Whitney CA": (36.58, -118.29),
    "Vancouver BC": (49.28, -123.12),
    "Victoria BC": (48.43, -123.37),
    "Coeur d'Alene ID": (47.68, -116.78),
    "Longs Peak CO": (40.25, -105.62),
    "Cloud Peak WY": (44.38, -107.17),
    "Granite Peak MT": (45.16, -109.81),
    "Lolo Peak MT": (46.71, -114.24),
    # Guadalupe Peak (31.89) sits in the 0.2° band south of New Mexico, so
    # Texas is pinned further out.
    "Emory Peak TX": (29.27, -103.30),
    # East of the Continental Divide is the Shoshone, a Region 2 forest.
    "Cody WY": (44.53, -109.06),
    "Lander WY": (42.83, -108.73),
}

# Idaho along the Snake, which the trail outline leaves out: a straight edge
# there once reached 0.45° into Idaho (review of #552). The area outline takes
# them in, because southern Idaho is Region 4.
IDAHO_BY_THE_SNAKE = {
    "Cambridge ID": (44.57, -116.68),
    "Midvale ID": (44.47, -116.73),
    "Weiser ID": (44.25, -116.97),
}


@pytest.mark.parametrize("place", sorted(REGION_SIX))
@pytest.mark.parametrize("kind", ["area", "trail"])
def test_region_six_is_covered_for_both_kinds(kind, place):
    assert usfs_coverage.covers(kind, *REGION_SIX[place]), place


@pytest.mark.parametrize("place", sorted(REGIONS_THREE_AND_FOUR))
def test_regions_three_and_four_are_covered_for_areas_alone(place):
    assert usfs_coverage.covers("area", *REGIONS_THREE_AND_FOUR[place]), place
    assert not usfs_coverage.covers("trail", *REGIONS_THREE_AND_FOUR[place]), place


@pytest.mark.parametrize("place", sorted(NEITHER))
@pytest.mark.parametrize("kind", ["area", "trail"])
def test_outside_every_region_is_not_covered(kind, place):
    assert not usfs_coverage.covers(kind, *NEITHER[place]), place


@pytest.mark.parametrize("place", sorted(IDAHO_BY_THE_SNAKE))
def test_idaho_by_the_snake_is_an_area_but_not_a_trail(place):
    assert usfs_coverage.covers("area", *IDAHO_BY_THE_SNAKE[place]), place
    assert not usfs_coverage.covers("trail", *IDAHO_BY_THE_SNAKE[place]), place


@pytest.mark.parametrize("kind", ["area", "trail"])
def test_coverage_json_is_the_geometry(kind):
    assert json.loads(usfs_coverage.COVERAGE_JSON_FOR[kind]) == usfs_coverage.COVERAGE_FOR[kind]
    for polygon in usfs_coverage.COVERAGE_FOR[kind]["coordinates"]:
        ring = polygon[0]
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
