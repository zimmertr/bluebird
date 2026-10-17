"""The Forest Service's closure orders: Region 6's three layers and the Region 3 and 4 order feeds.

The pod reads five layers off one ArcGIS organization (`services/usfs_closures.py`):

- Region 6's fire closures, under its own field names, as points (closed
  sites), lines (closed trails and roads) and polygons (closed areas). The
  lines outnumber the layer's 1,000-row page here as they do live, so the
  pod's pager takes two pages.
- Regions 3 and 4, every standing order as a polygon, under a lowercase
  schema, read in two phases: the attributes of every order, which the pod
  sifts with `is_area_closure`, then the geometry of the ones it kept, by id.
  The sim's orders cycle through four kinds so the sifting has work to do: an
  area closure citing 36 CFR 261.53(e), a Stage 1 fire restriction that cites
  261.53(e) for something narrower (vetoed by its type), a load limit that
  closes nothing, and a Stage 3 fire closure that passes on its type alone.

Each region's features stand inside its own states, well inside the pod's
coverage outlines (`usfs_coverage.py`), so a row the overlay reports clear is
one the sim had nothing to say about. Dates are fixed instants in the past,
because the pod refuses an order that has not started and the sim reads no
clock. Every query is answered through the shared ArcGIS habits in `nifc.py`.
"""

from __future__ import annotations

import functools
from collections.abc import Callable, Iterator
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app import lattice
from app.nifc import DAY_MS, EPOCH_MS, Feature, Layer, arcgis_fault, grid, name, query, ring, ring_acres
from app.values import unit_hash

# Oregon and Washington, Arizona and New Mexico, and Utah with southern Idaho,
# each kept inside its border by a margin, as boxes of south, west, north,
# east. Washington north of 48.1 starts at the Cascades, because west of them
# is the Strait of Juan de Fuca, which the pod's outline leaves out.
_Box = tuple[float, float, float, float]
R06_BOXES: tuple[_Box, ...] = ((42.3, -123.6, 48.1, -117.4), (48.1, -122.4, 48.8, -117.4))
R03_BOXES: tuple[_Box, ...] = ((32.6, -113.8, 36.9, -103.3),)
R04_BOXES: tuple[_Box, ...] = ((37.1, -113.9, 41.9, -109.3), (42.1, -116.8, 44.3, -111.4))

_COMMON = (
    "OBJECTID",
    "ForestUnit",
    "District",
    "FireName",
    "ClosureOrderName",
    "ClosureOrderNumber",
    "ClosureDescription",
    "ClosureStartDate",
    "ClosureEndDate",
    "ClosureURLlink",
    "ClosureStatus",
)
POINT_FIELDS = _COMMON
LINE_FIELDS = (*_COMMON, "RouteName", "RouteNum")
AREA_FIELDS = (*_COMMON, "GIS_Acres")
ORDER_FIELDS = (
    "objectid",
    "forestname",
    "ordername",
    "ordernum",
    "ordertype",
    "description",
    "cfr",
    "startdate",
    "enddate",
    "rescinddate",
    "hyperlink",
    "acres",
)

# Region 3's live object ids start in the seventy-five thousands, which is a
# sign the layer was renumbered once; the sim keeps the shape of that.
_R03_FIRST_ID = 75_247
_R04_FIRST_ID = 1_001


def _places(seed: int, boxes: tuple[_Box, ...], pitch: float) -> Iterator[tuple[int, float, float]]:
    """`grid` over several boxes, numbered through all of them."""
    k = 0
    for b, box in enumerate(boxes):
        for _, lat, lon in grid(seed + b, box, (pitch, pitch)):
            yield k, lat, lon
            k += 1


def _polygon(points: list[list[float]]) -> dict[str, Any]:
    return {"type": "Polygon", "coordinates": [points]}


def _forest(k: int) -> str:
    return f"{lattice.FIRST_WORDS[(k * 11) % len(lattice.FIRST_WORDS)]} National Forest"


def _region_six(seed: int, k: int, fire: str) -> dict[str, object]:
    start = EPOCH_MS + int(unit_hash(seed, k, 20) * 60) * DAY_MS
    order = f"06-{seed % 100:02d}-{k:04d}"
    return {
        "OBJECTID": k + 1,
        "ForestUnit": _forest(k),
        "District": f"{lattice.FIRST_WORDS[(k * 5) % 64]} Ranger District",
        "FireName": fire,
        "ClosureOrderName": f"{fire} Closure",
        "ClosureOrderNumber": order,
        "ClosureDescription": f"Closed for the {fire}. Going into or being upon the closed area is prohibited.",
        "ClosureStartDate": start,
        # Half the orders name no end, as many live ones do.
        "ClosureEndDate": start + 120 * DAY_MS if k % 2 else None,
        "ClosureURLlink": f"https://www.fs.usda.gov/r06/alerts/sim-{order}",
        "ClosureStatus": "Active",
    }


@functools.cache
def r06_points() -> Layer:
    seed = 41_000
    features = []
    for k, lat, lon in _places(seed, R06_BOXES, 0.5):
        attributes = _region_six(seed, k, name(seed, k // 4, " Fire"))
        point = {"type": "Point", "coordinates": [lon, lat]}
        features.append(Feature(k + 1, attributes, point, point))
    return Layer("OBJECTID", POINT_FIELDS, tuple(features))


@functools.cache
def r06_lines() -> Layer:
    seed = 42_000
    features = []
    for k, lat, lon in _places(seed, R06_BOXES, 0.18):
        # A trail a few kilometres long, wandering east-north-east.
        heading = unit_hash(seed, k, 3) * 3.14
        full = []
        for step in range(7):
            wiggle = 0.004 * (unit_hash(seed, k, step, 4) - 0.5)
            full.append(
                [
                    round(lon + 0.006 * step * (1 + heading / 3), 6),
                    round(lat + 0.004 * step * (heading / 3.14 - 0.3) + wiggle, 6),
                ]
            )
        trail = name(seed, k, " Trail")
        attributes = {
            **_region_six(seed, k, name(seed, k // 12, " Fire")),
            "RouteName": trail,
            "RouteNum": str(1000 + k),
        }
        features.append(
            Feature(
                k + 1,
                attributes,
                {"type": "LineString", "coordinates": full},
                {"type": "LineString", "coordinates": full[::3]},
            )
        )
    return Layer("OBJECTID", LINE_FIELDS, tuple(features))


@functools.cache
def r06_areas() -> Layer:
    seed = 43_000
    features = []
    for k, lat, lon in _places(seed, R06_BOXES, 1.5):
        coarse = ring(seed + k, lat, lon, 6.0, 10)
        full = ring(seed + k, lat, lon, 6.0, 10, between=3)
        attributes = {**_region_six(seed, k, name(seed, k, " Fire")), "GIS_Acres": ring_acres(full)}
        features.append(Feature(k + 1, attributes, _polygon(full), _polygon(coarse)))
    return Layer("OBJECTID", AREA_FIELDS, tuple(features))


# The four kinds an order feed's orders cycle through, as
# (ordertype, ordername suffix, cfr, description), and which of them the pod's
# `is_area_closure` keeps: the first and the last.
ORDER_KINDS = (
    (
        "Area Closure",
        " Area Closure",
        "36 CFR 261.53(e)",
        "Going into or being upon the described area is prohibited.",
    ),
    (
        "Fire Restriction - Stage 1",
        " Stage 1 Fire Restrictions",
        "36 CFR 261.52(a), 261.53(e)",
        "Building, maintaining, attending or using a fire or campfire.",
    ),
    (
        "Safety Closure",
        " Bridge Load Limit",
        "36 CFR 261.54(a)",
        "Operating a vehicle over the posted load limit on the bridge.",
    ),
    (
        "Fire Closure - Stage 3",
        " Fire Closure",
        "See closure order",
        "To protect public health and safety during fire suppression.",
    ),
)
KEPT_KINDS = frozenset({0, 3})


def _orders(seed: int, boxes: tuple[_Box, ...], pitch: float, first_id: int) -> Layer:
    features = []
    for k, lat, lon in _places(seed, boxes, pitch):
        order_type, suffix, cfr, description = ORDER_KINDS[k % len(ORDER_KINDS)]
        object_id = first_id + k
        start = EPOCH_MS - int(unit_hash(seed, k, 20) * 300) * DAY_MS
        radius = 2.0 + 8.0 * unit_hash(seed, k, 21)
        coarse = ring(seed + k, lat, lon, radius, 9)
        full = ring(seed + k, lat, lon, radius, 9, between=3)
        order = f"{seed % 100:02d}-{k:04d}"
        attributes = {
            "objectid": object_id,
            "forestname": _forest(k),
            "ordername": name(seed, k, suffix),
            "ordernum": order,
            "ordertype": order_type,
            "description": description,
            "cfr": cfr,
            "startdate": start,
            "enddate": None if k % 3 else start + 400 * DAY_MS,
            "rescinddate": None,
            "hyperlink": f"https://www.fs.usda.gov/alerts/sim-{order}",
            "acres": ring_acres(full),
        }
        features.append(Feature(object_id, attributes, _polygon(full), _polygon(coarse)))
    return Layer("objectid", ORDER_FIELDS, tuple(features))


@functools.cache
def r03_orders() -> Layer:
    return _orders(3_000, R03_BOXES, 0.9, _R03_FIRST_ID)


@functools.cache
def r04_orders() -> Layer:
    return _orders(4_000, R04_BOXES, 1.0, _R04_FIRST_ID)


router = APIRouter(prefix="/usfs", dependencies=[Depends(arcgis_fault("usfs"))], include_in_schema=False)

_LAYERS: dict[str, Callable[[], Layer]] = {
    "R06_FireClosureOrders_PublicView/FeatureServer/0": r06_points,
    "R06_FireClosureOrders_PublicView/FeatureServer/1": r06_lines,
    "R06_FireClosureOrders_PublicView/FeatureServer/2": r06_areas,
    "r03_ForestOrder/FeatureServer/1": r03_orders,
    "R04_Forest_Orders_PUBLIC_VIEW/FeatureServer/0": r04_orders,
}


def _route(layer: Callable[[], Layer]) -> Callable[[Request], Response]:
    def handle(request: Request) -> Response:
        return query(layer(), request)

    return handle


for _path, _layer in _LAYERS.items():
    router.add_api_route(f"/{_path}/query", _route(_layer), methods=["GET"])
