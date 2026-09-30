"""Forest Service closure orders, fetched once per pod.

Three regions publish their orders on the same ArcGIS organization, under two
schemas, and this module holds all of them the way ``nifc.py`` holds fire
perimeters.

Region 6, the Pacific Northwest Region (every national forest in Oregon and
Washington), publishes its fire closure orders as one feature service in three
layers (issue #550):

    layer 0  points    closed trailheads and sites      174 active
    layer 1  lines     closed trails and roads        1,536 active
    layer 2  polygons  area closures                     15 active

Region 3, the Southwestern Region (Arizona and New Mexico), and Region 4, the
Intermountain Region (Nevada, Utah, southern Idaho and western Wyoming),
publish EVERY standing forest order as polygons, under one lowercase schema of
their own with no status field (issue #551):

    Region 3  r03_ForestOrder layer 1               96 live, 32 closures
    Region 4  R04_Forest_Orders_PUBLIC_VIEW layer 0 214 live,  5 closures

Measured 2026-09-30. Region 6's lines are its heavy layer: 5.8 MB at full
resolution and 1.4 MB at the ~56 m simplification the wildfire overlay already
uses, in two pages because the layer's ``maxRecordCount`` is 1,000. Its
polygons are 1.2 MB full and 0.08 MB simplified. Region 4's live orders are
29.9 MB at full resolution (2.2 MB simplified) and Region 3's 5.5 MB (0.8 MB),
almost all of it orders that close nothing, so those two feeds are read in two
phases: the attributes of every live order first, then the geometry of the
ones that pass ``is_area_closure`` alone. What is held is small enough that
nothing here keys on the caller's bounding box.

The feeds answer two questions, so the snapshot holds two sets. ``area`` is
the polygons: a place you may not enter. Region 6's come first, then Region
3's, then Region 4's, and every one carries Region 6's property names, so one
feature shape reaches the browser. ``trail`` is Region 6's lines AND points: a
closed trailhead is a closed way in, and it reads on a map beside the trail it
serves. Points carry no shape to simplify, so one copy serves both fidelities.
Regions 3 and 4 publish no trails or sites, which is why the two kinds cover
different ground (``usfs_coverage.py``).

Two facts about Region 6's data decide what this module does NOT do there.
``ClosureStatus`` is maintained by hand, and some orders still marked
``Active`` carry an end date in the past; the maintainer decided to trust the
status as sent (2026-09-30), so nothing filters Region 6 on dates. And
``ClosureURLlink`` is null on 629 of the first 1,000 lines, so it is passed
through as the Forest Service sent it rather than filled in. Regions 3 and 4
have no status to trust, so there the dates decide: see ``ORDER_WHERE``.

Features are held as JSON text plus a bounding box, as in ``nifc.py``, so a
request is a filter and a join rather than a re-encode.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.env import env_int
from app.services import arcgis, usfs_coverage
from app.services.errors import UpstreamError
from app.services.http import HEADERS
from app.services.nifc import COARSE_OFFSET_DEG
from app.services.snapshot import cache_factory
from app.services.usfs_coverage import ALL_REGIONS, Kind

log = logging.getLogger(__name__)

PROVIDER = "US Forest Service (closure orders)"

_ARCGIS_URL = "https://services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/"
_SERVICE_URL = (
    "https://services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/"
    "R06_FireClosureOrders_PublicView/FeatureServer"
)
POINT_QUERY_URL = f"{_SERVICE_URL}/0/query"
LINE_QUERY_URL = f"{_SERVICE_URL}/1/query"
AREA_QUERY_URL = f"{_SERVICE_URL}/2/query"

# The fields the popup renders, shared by all three layers.
_COMMON_FIELDS = (
    "OBJECTID,"
    "ForestUnit,"
    "District,"
    "FireName,"
    "ClosureOrderName,"
    "ClosureOrderNumber,"
    "ClosureDescription,"
    "ClosureStartDate,"
    "ClosureEndDate,"
    "ClosureURLlink"
)
# One list per layer, because ArcGIS answers an `outFields` naming a field the
# layer does not have with an error rather than ignoring it: `GIS_Acres` on the
# point layer came back `{"error":{"code":400,...,"'outFields' parameter is
# invalid"}}` (measured 2026-09-30). Route names exist on lines only and
# acreage on polygons only.
POINT_FIELDS = _COMMON_FIELDS
LINE_FIELDS = f"{_COMMON_FIELDS},RouteName,RouteNum"
AREA_FIELDS = f"{_COMMON_FIELDS},GIS_Acres"

# The layers also hold expired and rescinded orders. The status is trusted as
# sent: see the module docstring.
WHERE = "ClosureStatus='Active'"

# Stamped on every feature, so an API caller can tell the regions apart. The
# browser does not read it.
REGION_SIX = "R06"


@dataclass(frozen=True)
class OrderFeed:
    """One region that publishes every standing forest order as polygons."""

    label: str
    query_url: str
    source: str


# Region 3's layer 0 is the same orders as centroid points, and layers 2 and 3
# are map helpers ("no data" and "click"), so layer 1 is the only one read.
REGION_THREE = OrderFeed(
    label="Southwestern Region (Region 3)",
    query_url=f"{_ARCGIS_URL}r03_ForestOrder/FeatureServer/1/query",
    source="R03",
)
REGION_FOUR = OrderFeed(
    label="Intermountain Region (Region 4)",
    query_url=f"{_ARCGIS_URL}R04_Forest_Orders_PUBLIC_VIEW/FeatureServer/0/query",
    source="R04",
)
# The order `areas_full` joins them in, after Region 6.
ORDER_FEEDS = (REGION_THREE, REGION_FOUR)

# The fields the mapping reads, plus the two the entry test reads.
ORDER_FIELDS = (
    "objectid,forestname,ordername,ordernum,ordertype,description,cfr,startdate,enddate,hyperlink,acres"
)

# These feeds carry no status, so a live order is one nobody rescinded whose
# end date, if it has one, is still ahead. The clause answered 96 orders on
# Region 3 and 214 on Region 4 (2026-09-30).
ORDER_WHERE = "rescinddate IS NULL AND (enddate IS NULL OR enddate > CURRENT_TIMESTAMP)"

# Regions 3 and 4 file every standing order, and `ordertype` does not say
# whether a person may enter: Region 4 files "Reckless Driving" and "Bridge
# Load Limits" as "Safety Closure". So an order counts as an area closure when
# its `cfr` text cites 36 CFR 261.52(e) or 261.53(e), which prohibit "going
# into or being upon" an area, OR its description or name says entry is
# prohibited. TJ chose this test on 2026-09-30 (#551). Of the live orders that
# day, Region 3 passed 32 of 96 (29 on the citation, 17 on the text) and
# Region 4 passed 5 of 214 (3 and 4). An `ordertype` allowlist would have
# passed 58 and 132.
#
# The feeds spell the citation many ways ("36 C.F.R. § 261.53(e)",
# "36 CFR 261.53 (e)", "261.53(a), (c) and (e)"), so each 261.52 or 261.53 is
# read up to the next section number, and a paragraph (e) anywhere in that
# stretch counts. The stretch stops there so "261.50(a) and (e)" never lends
# its (e) to a section before it.
CFR_ENTRY_SECTION = re.compile(r"261\.5[23]")
CFR_NEXT_SECTION = re.compile(r"\b\d{3}\.\d")
CFR_PARAGRAPH_E = re.compile(r"\(e\)", re.IGNORECASE)
TEXT_ENTRY_CLOSURE = re.compile(
    r"going into or being (up)?on"
    r"|entering or being (up)?on"
    r"|being in or on"
    r"|closed to (all )?(public )?(entry|access)",
    re.IGNORECASE,
)
# A permit rule is written in the same words as a closure: Region 4's float
# permit order 26008 prohibits "Entering or being on the South Fork of the
# Salmon River ... with float boating equipment without a permit" (review of
# #551). So a text match does not count when its own sentence names a permit
# as the way in.
TEXT_PERMIT_EXCEPTION = re.compile(r"without (a |an )?(valid )?permit|unless .* permit", re.IGNORECASE)

# The layers' own maxRecordCount. Sending it explicitly makes paging
# deterministic instead of dependent on a server default that can change.
PAGE_SIZE = 1000

# Backstop on the paging loop: 20,000 features, thirteen times today's line
# count. It exists so a server that never clears the page flag cannot spin
# forever.
MAX_PAGES = 20

# ~1 m. Trims coordinate noise from the payload without touching shape.
GEOMETRY_PRECISION = 5

# The slowest page measured 1.7 s (the first 1,000 full-resolution lines, 4.2
# MB, 2026-09-30). The ceiling is generous because a slow answer is still an
# answer, and the refresh runs behind the request anyway.
REQUEST_TIMEOUT_S = 60.0

# The orders are edited by hand at the forest offices, a few times a week, so
# half an hour is never the reason a closure is missing. Longer than the
# wildfire TTL because perimeters are redrawn from the air as a fire moves and
# an order is not. Eleven queries per refresh today: Region 6's five, plus
# three per order feed (its attributes, then its passing orders' geometry at
# each fidelity, one page each). Region 6's lines page, so that is thirteen
# requests.
TTL_S = env_int("CLOSURE_CACHE_TTL_S", 1800)

# How long a failed refresh suppresses the next attempt. The same contract as
# the wildfire twin: without it every request during an outage becomes its own
# upstream attempt, and ArcGIS's own answer to an exhausted quota asks for 60
# seconds anyway.
RETRY_AFTER_FAILURE_S = env_int("CLOSURE_RETRY_AFTER_FAILURE_S", 60)

@dataclass(frozen=True)
class Closure:
    """One closed area, trail, road or site: its bounding box, and its GeoJSON text.

    A point's box has zero width, which the intersection test handles as it
    handles any other box.
    """

    west: float
    south: float
    east: float
    north: float
    blob: str

    def intersects(self, west: float, south: float, east: float, north: float) -> bool:
        return not (self.east < west or self.west > east or self.north < south or self.south > north)


@dataclass(frozen=True)
class Snapshot:
    """One fetch of every feed, both kinds at both fidelities.

    The area sets hold Region 6's polygons, then Region 3's orders, then
    Region 4's. The trail sets hold Region 6's lines and then its closed-site
    points; the same points sit in both fidelities. ``fetched_at_ms`` is wall
    time because it is shown to a person, as in ``nifc.Snapshot``.

    ``regions`` is the ``ClosureSource`` codes this snapshot holds. Region 6 is
    always one of them, since a snapshot without it is never built; a Region 3
    or 4 feed that failed is missing, and the area outline leaves its ground
    out so a row there reads "not covered" rather than clear.
    """

    fetched_at_ms: int
    areas_full: tuple[Closure, ...]
    areas_coarse: tuple[Closure, ...]
    trails_full: tuple[Closure, ...]
    trails_coarse: tuple[Closure, ...]
    regions: frozenset[str] = ALL_REGIONS

    def within(self, bbox: tuple[float, float, float, float], kind: Kind, *, coarse: bool) -> list[Closure]:
        west, south, east, north = bbox
        if kind == "area":
            closures = self.areas_coarse if coarse else self.areas_full
        else:
            closures = self.trails_coarse if coarse else self.trails_full
        return [c for c in closures if c.intersects(west, south, east, north)]


def collection_json(snapshot: Snapshot, closures: list[Closure], kind: Kind) -> str:
    """Assemble a GeoJSON FeatureCollection from stored feature text.

    ``fetched_at`` and ``coverage`` ride as GeoJSON foreign members, as they do
    on ``/api/wildfires``: the first survives being saved to a file, and the
    second lets an empty answer outside the feeds read as "not covered" rather
    than "nothing closed". The outline is the one for ``kind``, because only
    Region 6 publishes trails, and the area outline is the snapshot's own,
    because it holds only the regions whose feeds answered.
    """
    if kind == "area":
        coverage = usfs_coverage.area_coverage_json(snapshot.regions)
    else:
        coverage = usfs_coverage.COVERAGE_JSON_FOR[kind]
    return (
        '{"type":"FeatureCollection","fetched_at":'
        + str(snapshot.fetched_at_ms)
        + ',"coverage":'
        + coverage
        + ',"features":['
        + ",".join(c.blob for c in closures)
        + "]}"
    )


def _to_closure(feature: dict[str, Any]) -> Closure | None:
    """One ArcGIS feature as a stored ``Closure``, or None if it carries no shape.

    A closure without geometry cannot be drawn or tested against a row, so it
    is dropped here rather than becoming a feature the browser has to skip.
    """
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        return None
    box = arcgis.bounds(geometry.get("coordinates"))
    if box is None:
        return None
    west, south, east, north = box
    return Closure(
        west=west,
        south=south,
        east=east,
        north=north,
        blob=json.dumps(feature, separators=(",", ":")),
    )


def _raise_for_arcgis_error(body: Any) -> None:
    """An ArcGIS refusal inside an HTTP 200, in this overlay's own words."""
    arcgis.raise_for_arcgis_error(
        body,
        PROVIDER,
        rate_limited="Closure data is rate-limited. Try again later.",
        rejected="Closure data was rejected. Try again later.",
    )


def _parse_page(payload: bytes) -> tuple[list[Closure], bool, int]:
    """One page of one layer, decoded and reduced to stored closures.

    Pure and synchronous so the pager can hand it to a thread. The page flag
    is read through ``arcgis.page_flag``, because ``f=geojson`` puts it under
    ``properties`` and the lines layer is the one that pages.
    """
    body = json.loads(payload)
    _raise_for_arcgis_error(body)
    features = body.get("features") if isinstance(body, dict) else None
    if not isinstance(features, list):
        raise UpstreamError("Closure data could not be read.")
    closures = [c for c in map(_to_closure, map(_tag_region_six, features)) if c is not None]
    return closures, arcgis.page_flag(body), len(features)


def _tag_region_six(feature: Any) -> Any:
    """A Region 6 feature with the two properties the other regions carry.

    ``ClosureType`` is null because Region 6's service is fire closures alone
    and names no type.
    """
    if not isinstance(feature, dict):
        return feature
    properties = feature.get("properties")
    properties = properties if isinstance(properties, dict) else {}
    return {**feature, "properties": {**properties, "ClosureSource": REGION_SIX, "ClosureType": None}}


async def _fetch_layer(
    client: httpx.AsyncClient, url: str, out_fields: str, simplify_deg: float | None
) -> tuple[Closure, ...]:
    """Every active closure in one layer, at one fidelity.

    No geometry filter: the service covers one region, so asking for all of it
    is the smallest query to describe.
    """
    params: dict[str, Any] = {
        "where": WHERE,
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": GEOMETRY_PRECISION,
        "f": "geojson",
    }
    if simplify_deg is not None:
        params["maxAllowableOffset"] = simplify_deg
    return await arcgis.fetch_pages(
        client,
        url,
        params,
        _parse_page,
        page_size=PAGE_SIZE,
        max_pages=MAX_PAGES,
        label="Forest Service closures",
    )


def is_area_closure(attributes: dict[str, Any]) -> bool:
    """Whether a Region 3 or 4 order closes an area to entry.

    The rule, and why it reads two signals, is the comment above
    ``CFR_ENTRY_SECTION``.
    """
    cfr = attributes.get("cfr")
    if isinstance(cfr, str) and _cites_entry_closure(cfr):
        return True
    return any(
        isinstance(text, str) and _says_entry_is_prohibited(text)
        for text in (attributes.get("description"), attributes.get("ordername"))
    )


def _cites_entry_closure(cfr: str) -> bool:
    """Whether a citation names paragraph (e) of 261.52 or 261.53."""
    for section in CFR_ENTRY_SECTION.finditer(cfr):
        following = CFR_NEXT_SECTION.search(cfr, section.end())
        stretch = cfr[section.end() : following.start() if following else len(cfr)]
        if CFR_PARAGRAPH_E.search(stretch):
            return True
    return False


def _says_entry_is_prohibited(text: str) -> bool:
    """Whether a sentence prohibits entry without naming a permit as the way in.

    A sentence runs from the period before the match to the period after it.
    """
    for match in TEXT_ENTRY_CLOSURE.finditer(text):
        start = text.rfind(".", 0, match.start()) + 1
        end = text.find(".", match.end())
        sentence = text[start : end if end >= 0 else len(text)]
        if not TEXT_PERMIT_EXCEPTION.search(sentence):
            return True
    return False


def _to_order_closure(attributes: dict[str, Any], geometry: Any, source: str) -> Closure | None:
    """One Region 3 or 4 order under Region 6's property names.

    The browser reads Region 6's names, so mapping here means one feature shape
    reaches it. The feeds name no fire and no district, so those two are null.
    """
    object_id = attributes.get("objectid")
    feature = {
        "type": "Feature",
        "id": object_id,
        "properties": {
            "OBJECTID": object_id,
            "ForestUnit": attributes.get("forestname"),
            "District": None,
            "FireName": None,
            "ClosureOrderName": attributes.get("ordername"),
            "ClosureOrderNumber": attributes.get("ordernum"),
            "ClosureDescription": attributes.get("description"),
            "ClosureStartDate": attributes.get("startdate"),
            "ClosureEndDate": attributes.get("enddate"),
            "ClosureURLlink": attributes.get("hyperlink"),
            "GIS_Acres": attributes.get("acres"),
            "ClosureSource": source,
            "ClosureType": attributes.get("ordertype"),
        },
        "geometry": geometry,
    }
    return _to_closure(feature)


def _parse_order_attributes(payload: bytes) -> tuple[list[dict[str, Any]], bool, int]:
    """One page of live orders' attributes, reduced to the entry closures.

    ``f=json`` puts each row under ``attributes``.
    """
    body = json.loads(payload)
    _raise_for_arcgis_error(body)
    features = body.get("features") if isinstance(body, dict) else None
    if not isinstance(features, list):
        raise UpstreamError("Closure data could not be read.")
    rows = [f.get("attributes") for f in features if isinstance(f, dict)]
    kept = [r for r in rows if isinstance(r, dict) and is_area_closure(r)]
    return kept, arcgis.page_flag(body), len(features)


def _parse_order_geometry(
    payload: bytes, attributes: dict[int, dict[str, Any]], source: str
) -> tuple[list[Closure], bool, int]:
    """One page of geometry, joined to the attributes phase 1 kept by object ID."""
    body = json.loads(payload)
    _raise_for_arcgis_error(body)
    features = body.get("features") if isinstance(body, dict) else None
    if not isinstance(features, list):
        raise UpstreamError("Closure data could not be read.")
    closures: list[Closure] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        # `f=geojson` lifts the object ID to the feature's `id`; the property
        # is the fallback, since phase 2 asks for that one field.
        properties = feature.get("properties")
        object_id = feature.get("id")
        if not isinstance(object_id, int) and isinstance(properties, dict):
            object_id = properties.get("objectid")
        row = attributes.get(object_id) if isinstance(object_id, int) else None
        if row is None:
            continue
        closure = _to_order_closure(row, feature.get("geometry"), source)
        if closure is not None:
            closures.append(closure)
    return closures, arcgis.page_flag(body), len(features)


async def fetch_forest_orders(
    client: httpx.AsyncClient, feed: OrderFeed
) -> tuple[tuple[Closure, ...], tuple[Closure, ...]]:
    """Every live entry closure in one Region 3 or 4 feed, at both fidelities.

    Two phases, because the geometry is the cost and most orders close
    nothing: Region 4's live orders are 29.9 MB at full resolution, and the five
    that pass the test are a fraction of it (2026-09-30). Phase 1 reads the
    attributes of every live order and keeps the ones ``is_area_closure``
    passes. Phase 2 asks for those object IDs alone, once per fidelity, and
    sends no ``where``: the IDs are the whole filter. The 32 and 5 IDs that
    passed on 2026-09-30 are a few hundred bytes of query string. When nothing
    passes, phase 2 sends nothing.
    """
    rows = await arcgis.fetch_pages(
        client,
        feed.query_url,
        {
            "where": ORDER_WHERE,
            "outFields": ORDER_FIELDS,
            "returnGeometry": "false",
            "f": "json",
        },
        _parse_order_attributes,
        page_size=PAGE_SIZE,
        max_pages=MAX_PAGES,
        label=f"Forest Service orders, {feed.label}",
    )
    attributes = {row["objectid"]: row for row in rows if isinstance(row.get("objectid"), int)}
    if not attributes:
        return (), ()

    def parse(payload: bytes) -> tuple[list[Closure], bool, int]:
        return _parse_order_geometry(payload, attributes, feed.source)

    async def geometry(simplify_deg: float | None) -> tuple[Closure, ...]:
        params: dict[str, Any] = {
            "objectIds": ",".join(str(object_id) for object_id in sorted(attributes)),
            "outFields": "objectid",
            "returnGeometry": "true",
            "outSR": "4326",
            "geometryPrecision": GEOMETRY_PRECISION,
            "f": "geojson",
        }
        if simplify_deg is not None:
            params["maxAllowableOffset"] = simplify_deg
        return await arcgis.fetch_pages(
            client,
            feed.query_url,
            params,
            parse,
            page_size=PAGE_SIZE,
            max_pages=MAX_PAGES,
            label=f"Forest Service orders, {feed.label}",
        )

    full, coarse = await asyncio.gather(geometry(None), geometry(COARSE_OFFSET_DEG))
    return full, coarse


async def fetch_snapshot(transport: httpx.AsyncBaseTransport | None = None) -> Snapshot:
    """Every active closure in every feed, both kinds at both fidelities.

    Region 6 is five queries: points once, and lines and polygons once per
    fidelity. Each order feed is two phases (``fetch_forest_orders``). All of
    it runs concurrently on one client, so a cold pod waits for the slowest
    feed rather than for their sum. ``transport`` exists for the tests, which
    answer every request without a network.

    A failed Region 6 query fails the fetch, as before: Region 6 is the only
    source of trails. A failed Region 3 or 4 feed drops that region alone,
    with a warning, so one feed's outage cannot take the others down with it,
    which on a cold pod would mean no snapshot at all. The next refresh tries
    it again.
    """
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS, transport=transport) as client:
        region_six, orders = await asyncio.gather(
            asyncio.gather(
                _fetch_layer(client, POINT_QUERY_URL, POINT_FIELDS, None),
                _fetch_layer(client, LINE_QUERY_URL, LINE_FIELDS, None),
                _fetch_layer(client, LINE_QUERY_URL, LINE_FIELDS, COARSE_OFFSET_DEG),
                _fetch_layer(client, AREA_QUERY_URL, AREA_FIELDS, None),
                _fetch_layer(client, AREA_QUERY_URL, AREA_FIELDS, COARSE_OFFSET_DEG),
            ),
            asyncio.gather(
                *(fetch_forest_orders(client, feed) for feed in ORDER_FEEDS),
                return_exceptions=True,
            ),
        )
    points, lines_full, lines_coarse, areas_full, areas_coarse = region_six
    regions = {REGION_SIX}
    for feed, result in zip(ORDER_FEEDS, orders, strict=True):
        if isinstance(result, BaseException):
            # Cancellation and interpreter exits are not a feed's failure.
            if not isinstance(result, Exception):
                raise result
            log.warning(
                "Forest Service orders from the %s failed; serving the snapshot without them: %s",
                feed.label,
                result,
            )
            continue
        full, coarse = result
        areas_full += full
        areas_coarse += coarse
        regions.add(feed.source)
    return Snapshot(
        fetched_at_ms=int(time.time() * 1000),
        areas_full=areas_full,
        areas_coarse=areas_coarse,
        trails_full=lines_full + points,
        trails_coarse=lines_coarse + points,
        regions=frozenset(regions),
    )


# The shared snapshot cache, wired to this module's fetch and knobs.
closure_cache = cache_factory(
    label=PROVIDER,
    fetch=fetch_snapshot,
    ttl_s=TTL_S,
    retry_after_failure_s=RETRY_AFTER_FAILURE_S,
    describe=lambda s: (
        f"{len(s.areas_full)} areas from {', '.join(sorted(s.regions))}, {len(s.trails_full)} trails and sites"
    ),
)

CLOSURES = closure_cache()
