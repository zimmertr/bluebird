"""Forest Service Region 6 fire closure orders, fetched once per pod.

Region 6 is the Pacific Northwest Region: every national forest in Oregon and
Washington. Its closure orders are published as one ArcGIS feature service in
three layers, and this module holds all three the way ``nifc.py`` holds fire
perimeters (issue #550):

    layer 0  points    closed trailheads and sites      174 active
    layer 1  lines     closed trails and roads        1,536 active
    layer 2  polygons  area closures                     15 active

Measured 2026-09-30. The lines are the heavy layer: 5.8 MB at full resolution
and 1.4 MB at the ~56 m simplification the wildfire overlay already uses, and
they arrive in two pages because the layer's ``maxRecordCount`` is 1,000. The
polygons are 1.2 MB full and 0.08 MB simplified. The whole region is therefore
small enough to hold, and nothing here keys on the caller's bounding box.

The layers answer two questions, so the snapshot holds two sets rather than
three. ``area`` is the polygons: a place you may not enter. ``trail`` is the
lines AND the points: a closed trailhead is a closed way in, and it reads on a
map beside the trail it serves. Points carry no shape to simplify, so one copy
serves both fidelities.

Two facts about the data decide what this module does NOT do. ``ClosureStatus``
is maintained by hand, and some orders still marked ``Active`` carry an end
date in the past; the maintainer decided to trust the status as sent
(2026-09-30), so nothing here filters on dates. And ``ClosureURLlink`` is null
on 629 of the first 1,000 lines, so it is passed through as the Forest Service
sent it rather than filled in.

Features are held as the JSON text ArcGIS sent plus a bounding box, as in
``nifc.py``, so a request is a filter and a join rather than a re-encode.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.env import env_int
from app.services import arcgis, usfs_coverage
from app.services.errors import UpstreamError
from app.services.http import HEADERS
from app.services.nifc import COARSE_OFFSET_DEG
from app.services.snapshot import cache_factory

PROVIDER = "US Forest Service (closure orders)"

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
# an order is not. Five queries (seven requests today) per refresh.
TTL_S = env_int("CLOSURE_CACHE_TTL_S", 1800)

# How long a failed refresh suppresses the next attempt. The same contract as
# the wildfire twin: without it every request during an outage becomes its own
# upstream attempt, and ArcGIS's own answer to an exhausted quota asks for 60
# seconds anyway.
RETRY_AFTER_FAILURE_S = env_int("CLOSURE_RETRY_AFTER_FAILURE_S", 60)

Kind = Literal["area", "trail"]


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
    """One fetch of the whole region, both kinds at both fidelities.

    The trail sets hold the lines and then the closed-site points; the same
    points sit in both fidelities. ``fetched_at_ms`` is wall time because it is
    shown to a person, as in ``nifc.Snapshot``.
    """

    fetched_at_ms: int
    areas_full: tuple[Closure, ...]
    areas_coarse: tuple[Closure, ...]
    trails_full: tuple[Closure, ...]
    trails_coarse: tuple[Closure, ...]

    def within(self, bbox: tuple[float, float, float, float], kind: Kind, *, coarse: bool) -> list[Closure]:
        west, south, east, north = bbox
        if kind == "area":
            closures = self.areas_coarse if coarse else self.areas_full
        else:
            closures = self.trails_coarse if coarse else self.trails_full
        return [c for c in closures if c.intersects(west, south, east, north)]


def collection_json(snapshot: Snapshot, closures: list[Closure]) -> str:
    """Assemble a GeoJSON FeatureCollection from stored feature text.

    ``fetched_at`` and ``coverage`` ride as GeoJSON foreign members, as they do
    on ``/api/wildfires``: the first survives being saved to a file, and the
    second lets an empty answer outside Oregon and Washington read as "not
    covered" rather than "nothing closed".
    """
    return (
        '{"type":"FeatureCollection","fetched_at":'
        + str(snapshot.fetched_at_ms)
        + ',"coverage":'
        + usfs_coverage.COVERAGE_JSON
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
    closures = [c for c in map(_to_closure, features) if c is not None]
    return closures, arcgis.page_flag(body), len(features)


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


async def fetch_snapshot(transport: httpx.AsyncBaseTransport | None = None) -> Snapshot:
    """Every active closure in the region, both kinds at both fidelities.

    Five queries, fetched concurrently on one client, so a cold pod waits for
    the slowest rather than for their sum: points once, and lines and polygons
    once per fidelity. ``transport`` exists for the tests, which answer every
    request without a network.
    """
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS, transport=transport) as client:
        points, lines_full, lines_coarse, areas_full, areas_coarse = await asyncio.gather(
            _fetch_layer(client, POINT_QUERY_URL, POINT_FIELDS, None),
            _fetch_layer(client, LINE_QUERY_URL, LINE_FIELDS, None),
            _fetch_layer(client, LINE_QUERY_URL, LINE_FIELDS, COARSE_OFFSET_DEG),
            _fetch_layer(client, AREA_QUERY_URL, AREA_FIELDS, None),
            _fetch_layer(client, AREA_QUERY_URL, AREA_FIELDS, COARSE_OFFSET_DEG),
        )
    return Snapshot(
        fetched_at_ms=int(time.time() * 1000),
        areas_full=areas_full,
        areas_coarse=areas_coarse,
        trails_full=lines_full + points,
        trails_coarse=lines_coarse + points,
    )


# The shared snapshot cache, wired to this module's fetch and knobs.
closure_cache = cache_factory(
    label=PROVIDER,
    fetch=fetch_snapshot,
    ttl_s=TTL_S,
    retry_after_failure_s=RETRY_AFTER_FAILURE_S,
    describe=lambda s: f"{len(s.areas_full)} areas, {len(s.trails_full)} trails and sites",
)

CLOSURES = closure_cache()
