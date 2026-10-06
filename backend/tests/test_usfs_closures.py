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
import random
import re
import time
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
            answer = self.answers[(layer, coarse, offset)]
        else:
            phase = "attributes" if query["returnGeometry"] == ["false"] else "geometry"
            answer = self.answers[(service, phase, coarse, offset)]
        # A test that means an HTTP failure hands the response itself.
        return answer if isinstance(answer, httpx.Response) else fake_response(answer)

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


FLOAT_PERMIT = _order(
    26008,
    "South Fork Salmon River & Big Creek Float Permit - Special Order",
    cfr="36 CFR 261.50(a) and (e), 36 CFR 261.58(k)",
    description=(
        "Prohibited is: 1. Entering or being on the South Fork of the Salmon River (below the confluence with "
        "the East Fork of the South Fork Salmon River) or Big Creek with float boating equipment without a permit."
    ),
)

RECKLESS_DRIVING = _order(
    102,
    "Reckless Driving",
    cfr="36 CFR 261.54(f)",
    description="Operating a vehicle carelessly or recklessly on a National Forest System road.",
)


# The orders #568 found passing that keep nobody out on foot, as the feeds
# sent them (Fossil Creek on 2026-09-30, the rest on 2026-10-01).
PAYETTE_MINES = _order(
    25393,
    "Abandoned Mine Area Closure",
    ordernum="04-12-328",
    cfr="36 CFR 261.50(a) and (e), 36 CFR 261.53(e)",
    description=(
        "Prohibited is: 1. Going into or being upon an area which is closed for the protection of public "
        "health and safety. 36 CFR 261.53(e)"
    ),
)
KIOWA_STAGE_ONE = _order(
    78592,
    "Kiowa / Rita Blanca NG Stage I Fire Restrictions",
    ordertype="Fire Restriction - Stage 1",
    cfr="36 CFR 261.52(a,d,i), 36 CFR 261.53(e), 36 CFR 261.56",
    description=(
        "Stage 1 fire restriction to reduce the risk of human-caused wildfires during periods of high fire "
        "danger and severe fire weather conditions"
    ),
)
FOSSIL_CREEK_VEHICLES = (
    "To protect public health and safety, and to protect resource integrity, the following are prohibited: "
    "1) Going into or being upon the Described Area with a motorized vehicle, and 2) Using a motorized vehicle "
    "on the Described Roads"
)
GOOSE_CREEK = _order(
    26951,
    "Goose Creek Winter Restrictions",
    ordertype="Motor Vehicle Use Prohibition",
    cfr="36 CFR 261.50 (a) (b) and (e), 36 CFR 261.58(b), 36 CFR 261.54 (a) and (d), 36 CFR 261.53 (e)",
    description=(
        "Prohibited is: 1. Exceeding combined vehicle/trailer length 52ft. 2. Exceeding 20MPH on the Thorn Cr "
        "Snowmobile Rte to Goose Cr Overlook. 3. Exceeding idling noise @ Goose Cr TH. 4. Being on a snowcat "
        "rte. 5. Snowmobile use on 50257."
    ),
)
SNOWBASIN = _order(
    27083,
    "Snowbasin Area Restrictions",
    cfr="See closure order",
    description="Going into or being upon the closed area, when posted or marked as closed.",
)


# Region 4's Stage 3 fire closures, which close ground by their type alone:
# no citation and no entry words (read 2026-10-01).
CLAREMONT_FIRE = _order(
    27072,
    "Claremont Fire Area, Road, and Trail Closure",
    ordernum="0402-01-119",
    ordertype="Fire Closure - Stage 3",
    cfr="See closure order",
    description=(
        "Road and Trail closure. The purpose of this Order is to protect public safety from hazards related "
        "to the Claremont Fire."
    ),
)
CROOKED_FIRE = _order(
    27212,
    "Crooked Fire Area, Road, and Trail Closure ",
    ordernum="0402-03-140",
    ordertype="Fire Closure - Stage 3",
    cfr="See closure order",
    description="The purpose of this Order is to protect public safety from hazards related to the Crooked Fire.",
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
            FLOAT_PERMIT,
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
        # Paragraph (e) in a list, and in upper case.
        {"cfr": "36 CFR 261.53(a) and (e)"},
        {"cfr": "36 C.F.R. § 261.53(a), (c) and (e)"},
        {"cfr": "36 CFR 261.52(E)"},
        # A permit named in ANOTHER sentence does not excuse this one.
        {"description": "Going into or being upon the area is prohibited. Outfitters need a permit."},
        # A single capital letter ends a sentence; only a dotted abbreviation
        # such as "C.F.R." does not ("Exhibit A." in a Region 4 order).
        {"description": "Going into or being upon the area at Exhibit A. Guides may not work without a permit."},
        # An unlimited entry sentence beside a vehicle rule still closes the
        # area (Region 3's Cottonwood Cove order).
        {
            "cfr": "36 CFR § 261.53(e)",
            "description": "Using any motor vehicle. Going into or being upon the Described Area.",
        },
        # The Santa Fe Watershed closure uses the Payette mine order's words,
        # and it is closed ground, so the exclusion is by order number.
        {
            "ordernum": "10-198",
            "cfr": "36 CFR 261.53(e)",
            "description": (
                "It is prohibited to go into or be upon any area which is closed for the protection of public "
                "health and safety, effective until further notice."
            ),
        },
        # Stage 3 closes the forest, so only Stages 1 and 2 are vetoed.
        {"ordertype": "Fire Closure - Stage 3", "cfr": "36 CFR 261.52(e)"},
        # And it closes by its type alone, with no citation and no entry
        # words (#568).
        CLAREMONT_FIRE["attributes"],
        CROOKED_FIRE["attributes"],
        # An unlimited entry sentence beside a permit sentence still closes.
        {
            "ordertype": "Fire Closure - Stage 3",
            "description": "Going into or being upon the area. Outfitters operate without a permit.",
        },
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
        # The (e) belongs to 261.50, and a paragraph never reaches back across
        # a section number.
        {"cfr": "36 CFR 261.50(a) and (e)"},
        {"cfr": "36 CFR 261.52(a), 36 C.F.R. § 251.55(e)"},
        # A permit rule, in Region 4's own words (order 26008, 2026-09-30).
        FLOAT_PERMIT["attributes"],
        {"description": "Being in or on the gorge unless you hold a valid permit."},
        # A period inside a sentence does not end it, so the permit clause
        # stays with the entry words.
        {"description": "Going into or being upon the river from Mile 12.5 to Mile 40 without a permit."},
        {"description": "Entering or being on the area along Rd. 123 without a permit."},
        {"description": "Going into or being upon the area, under 36 C.F.R. § 261.53, without a permit."},
        # Posted mine openings, filed with the whole forest as their polygon
        # (#568): excluded by order number.
        PAYETTE_MINES["attributes"],
        # A fire restriction cites 261.53(e) and closes nothing.
        KIOWA_STAGE_ONE["attributes"],
        {"ordername": "Stage II Fire Restrictions", "cfr": "36 CFR 261.52(e)"},
        # A vehicle order: by its type, and by its own words, which veto a
        # citation as well as the sentence.
        GOOSE_CREEK["attributes"],
        {
            "ordertype": "Motor Vehicle Use Prohibition",
            "ordername": "Fossil Creek Wild and Scenic River Permit Area Motor Vehicle Closure",
            "description": FOSSIL_CREEK_VEHICLES,
        },
        {"cfr": "36 C.F.R. § 261.53(e)", "description": FOSSIL_CREEK_VEHICLES},
        # Posted sites only.
        SNOWBASIN["attributes"],
        {"cfr": "36 CFR 261.53(e)", "description": SNOWBASIN["attributes"]["description"]},
        # A Stage 3 type passes by itself, but its own words still narrow it:
        # an entry sentence that names a permit, or posted ground.
        {
            **CROOKED_FIRE["attributes"],
            "description": "Going into or being upon the Described Area without a permit.",
        },
        {**CROOKED_FIRE["attributes"], "description": SNOWBASIN["attributes"]["description"]},
        # The Stage 1 and 2 types are restrictions, and the type alone passes
        # nothing.
        {"ordertype": "Fire Restriction - Stage 2", "cfr": "See closure order"},
        {"ordertype": "Fire Closure - Stage 2"},
        # A Stage 3 closure that has not started yet.
        {**CLAREMONT_FIRE["attributes"], "startdate": int(time.time() * 1000) + 365 * 86_400_000},
        # An order that has not started is not standing yet, however plainly
        # it closes the area (Goose Creek was served a month early, #568).
        {
            "cfr": "36 CFR 261.53(e)",
            "description": "Going into or being upon the Described Area.",
            "startdate": int(time.time() * 1000) + 365 * 86_400_000,
        },
        {"cfr": None, "description": None, "ordername": None},
        {},
    ],
)
def test_an_order_that_closes_nothing_fails(attributes):
    assert not usfs_closures.is_area_closure(attributes)


def test_the_feed_is_asked_for_started_orders_alone():
    # The server applies the clause, so no fake upstream can; this pins that
    # it is sent, and the classifier case above pins the rule itself.
    assert "startdate IS NULL OR startdate <= CURRENT_TIMESTAMP" in usfs_closures.ORDER_WHERE


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
    # A feed that answered and passed nothing still covers its ground: that
    # answer is "nothing closed", not "not covered".
    assert snapshot.regions == usfs_coverage.ALL_REGIONS


async def test_a_failed_order_feed_drops_its_region_alone(caplog):
    answers = _orders_answers()
    failure = fake_response({}, status=500)
    answers[(R03, "attributes", False, 0)] = failure
    upstream = _region(answers)
    with caplog.at_level("WARNING", logger="app.services.usfs_closures"):
        snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))

    assert snapshot.regions == frozenset({"R06", "R04"})
    assert _names(snapshot.areas_full) == ["Eagle Creek", "Redfish Cave - Special Order"]
    assert _names(snapshot.trails_full) == ["Trail 440", "Trail 441", "Wahtum Lake TH"]
    assert any("Region 3" in record.getMessage() for record in caplog.records)

    # The area outline leaves Arizona and New Mexico out, so a row there
    # reads "not covered" rather than clear.
    coverage = json.loads(usfs_closures.collection_json(snapshot, [], "area"))["coverage"]
    assert coverage == usfs_coverage.area_coverage(snapshot.regions)
    humphreys, kings = REGIONS_THREE_AND_FOUR["Humphreys Peak AZ"], REGIONS_THREE_AND_FOUR["Kings Peak UT"]
    assert not usfs_coverage.covers("area", *humphreys, regions=snapshot.regions)
    assert usfs_coverage.covers("area", *kings, regions=snapshot.regions)
    assert usfs_coverage.covers("area", *REGION_SIX["Mount Hood"], regions=snapshot.regions)
    # The trail outline is Region 6's either way.
    trail = json.loads(usfs_closures.collection_json(snapshot, [], "trail"))["coverage"]
    assert trail == usfs_coverage.COVERAGE_FOR["trail"]


async def test_a_failed_region_six_query_still_fails_the_fetch():
    answers = _orders_answers()
    upstream = _region(answers)
    upstream.answers[("2", True, 0)] = fake_response({}, status=500)
    with pytest.raises(httpx.HTTPStatusError):
        await usfs_closures.fetch_snapshot(httpx.MockTransport(upstream))


async def test_a_full_fetch_holds_every_region():
    snapshot = await usfs_closures.fetch_snapshot(httpx.MockTransport(_region(_orders_answers())))
    assert snapshot.regions == usfs_coverage.ALL_REGIONS


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
    # The Humboldt-Toiyabe, just north of the Lake Tahoe Basin cut, and just
    # east of it: the cut stops at -119.85 so the Carson Range's east slope
    # keeps its forest.
    "Reno NV": (39.53, -119.81),
    "Carson City NV": (39.16, -119.77),
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
    # Region 5 inside Nevada: the Inyo's White Mountains and the Lake Tahoe
    # Basin Management Unit's Nevada shore.
    "Boundary Peak NV": (37.85, -118.35),
    "Stateline NV": (38.96, -119.94),
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


# ── The sentence scan's cost (#630) ────────────────────────────────────────


@pytest.mark.parametrize(
    "unit",
    [
        # Many sentence ends: each one used to search the whole text before it
        # for an abbreviation, so the scan was quadratic in the length.
        "Trail x. ",
        # Many entry matches in one sentence: each one used to look for its
        # sentence among every end and re-read the same sentence.
        "closed to entry ",
        # Dotted single letters, the abbreviation pattern's own shape.
        "a.a.a.a. ",
    ],
)
def test_the_sentence_scan_is_linear_in_the_descriptions_length(unit):
    # About 60 KB. The quadratic scan took 7.4, 3.2 and 14.1 seconds over
    # these three in the backend test container (measured 2026-10-06); the
    # bound sits far above what a linear scan needs, so it holds on a slow
    # runner too.
    text = unit * (60_000 // len(unit))
    started = time.perf_counter()
    usfs_closures._entry_sentences(text)
    assert time.perf_counter() - started < 1.0


def test_the_permit_exception_is_linear_in_a_line_that_repeats_unless():
    # About 60 KB in one sentence on one line, with an "unless" every word and
    # no permit after any of them. Read from every "unless" to the end of the
    # line, this was quadratic: 0.22 s here and 0.86 s at twice the length in
    # the backend test container (measured 2026-10-06). One pass takes about a
    # millisecond, so the bound holds on a slow runner too.
    text = "Closed to entry " + "unless " * (60_000 // len("unless "))
    started = time.perf_counter()
    assert usfs_closures._entry_sentences(text) == ["closed"]
    assert time.perf_counter() - started < 0.05


# The pattern before #660, kept only to hold the linear one to its answers.
_PERMIT_EXCEPTION_BEFORE = re.compile(
    r"without (a |an )?(valid )?permit|unless .* permit", re.IGNORECASE
)


def test_the_permit_exception_answers_as_it_did():
    # Short random strings over the words the pattern reads, in both cases,
    # with line breaks among them: the old pattern's `.` stops at one, so
    # "unless" and "permit" on two lines never matched.
    words = ["unless ", "UNLESS ", "unles", "permit", "Permit", "without ", "a ", "an ",
             "valid ", "x", " ", "\n", "."]
    rng = random.Random(660)
    for _ in range(20_000):
        text = "".join(rng.choice(words) for _ in range(rng.randint(0, 12)))
        assert bool(usfs_closures.TEXT_PERMIT_EXCEPTION.search(text)) == bool(
            _PERMIT_EXCEPTION_BEFORE.search(text)
        ), text


@pytest.mark.parametrize(
    "text,readings",
    [
        # Sentences split at a period before a space or the end, and nowhere
        # an abbreviation ends: the permit clause stays in its own sentence.
        ("Going into or being upon the area. A permit is required.", ["closed"]),
        ("Going into or being upon the area without a permit.", ["permit"]),
        ("Going into or being upon the area, per 36 C.F.R. 261.53, without a permit.", ["permit"]),
        ("Going into or being upon Mt. Baker without a permit.", ["permit"]),
        ("Going into or being upon No. 4 Rd. without a permit.", ["permit"]),
        ("Going into or being upon the area at 6 A.M. without a permit.", ["permit"]),
        ("Going into or being upon the area. Unless you hold a permit.", ["closed"]),
        (
            "Going into or being upon the area. Going into or being upon it with a motorized vehicle.",
            ["closed", "scoped"],
        ),
        ("Closed to entry. Closed to entry. Closed to entry.", ["closed"] * 3),
        ("Bruno. Going into or being upon the area without a permit", ["permit"]),
    ],
)
def test_the_sentence_scan_keeps_its_reading(text, readings):
    assert usfs_closures._entry_sentences(text) == readings
