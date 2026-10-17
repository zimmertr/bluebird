"""NIFC's wildfire perimeters, and the ArcGIS feature-service habits `usfs.py` shares.

The pod asks the WFIGS perimeter layer for every wildfire nationally, at full
resolution and at a `maxAllowableOffset` simplification, paged by `OBJECTID`
(`services/nifc.py`, `services/arcgis.py`). The sim answers about three hundred
fires on a coarse lattice over the lower 48, one per cell of 1.5° by 2° that a
hash keeps, each a small polygon of 8 to 12 corners, 1 to 20 km across. The
simplified copy is those corners alone and the full one adds three between
each pair, so the pod's two fidelities differ the way NIFC's do.

The service habits are written once here because both ArcGIS suppliers answer
the same way (`services/arcgis.py` names the three that have cost an
investigation):

- **A quota refusal is HTTP 200** with the error in an `error` member. A 429
  fault is answered so; every other status keeps its own, so the pod's
  `raise_for_status` path stays reachable too.
- **The page flag moves with the format**: top level for `f=json`, under the
  collection's `properties` for `f=geojson`, as the live services answered on
  2026-09-30.
- **A field the layer lacks in `outFields` is a 400 inside a 200**, the live
  answer to `GIS_Acres` on Region 6's points. Here it is the drift guard: a
  field the pod starts asking for fails loudly until the sim learns it.

Nothing reads the clock. The fires' dates are fixed instants, because a sim
fire does not need to be news, only to have a date the popup can show.
"""

from __future__ import annotations

import functools
import json
import math
from collections.abc import Awaitable, Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app import control, lattice
from app.values import unit_hash

# The live layer's `maxRecordCount`. A request asking for more gets this many.
MAX_RECORD_COUNT = 2000

# The fixed instant every sim date counts from.
EPOCH_MS = int(datetime(2026, 7, 1, tzinfo=UTC).timestamp() * 1000)
DAY_MS = 86_400_000

_KM_PER_DEG = 111.32

# The lower 48, as the lattice's box, and the seed that places fires in it.
CONUS = (25.0, -125.0, 49.0, -67.0)
_FIRE_SEED = 31_000
_FIRE_PITCH = (1.5, 2.0)
_FIRE_KEEP = 0.65


# ── The ArcGIS habits ────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Feature:
    """One feature of a layer: every attribute the layer has, and both geometries."""

    object_id: int
    attributes: dict[str, Any]
    full: dict[str, Any] | None
    coarse: dict[str, Any] | None


@dataclass(frozen=True, slots=True)
class Layer:
    """A hosted feature layer: its fields in the order it lists them, and its features."""

    id_field: str
    fields: tuple[str, ...]
    features: tuple[Feature, ...]


def grid(
    seed: int, box: tuple[float, float, float, float], pitch: tuple[float, float], keep: float = 1.0
) -> Iterator[tuple[int, float, float]]:
    """A jittered lattice over the box, as (index, lat, lon), in index order.

    `keep` is the share of cells a hash leaves standing, so a layer can be
    sparser than its pitch without looking like a grid with holes in rows.
    """
    south, west, north, east = box
    rows = math.ceil((north - south) / pitch[0])
    cols = math.ceil((east - west) / pitch[1])
    index = 0
    for i in range(rows):
        for j in range(cols):
            if unit_hash(seed, i, j, 0) >= keep:
                continue
            lat = south + (i + 0.5 + 0.6 * (unit_hash(seed, i, j, 1) - 0.5)) * pitch[0]
            lon = west + (j + 0.5 + 0.6 * (unit_hash(seed, i, j, 2) - 0.5)) * pitch[1]
            if lat < north and lon < east:
                yield index, round(lat, 6), round(lon, 6)
                index += 1


def name(seed: int, k: int, suffix: str) -> str:
    """A name from the lattice's word lists: `Copper Ridge Fire`."""
    first = lattice.FIRST_WORDS[(k * 29 + seed) % len(lattice.FIRST_WORDS)]
    second = lattice.SECOND_WORDS[(k * 13 + seed // 7) % len(lattice.SECOND_WORDS)]
    return f"{first} {second}{suffix}"


def ring(seed: int, lat: float, lon: float, radius_km: float, corners: int, between: int = 0) -> list[list[float]]:
    """A closed GeoJSON ring of `corners` points around the centre, [lon, lat].

    `between` adds that many points on each side, each pushed in or out a
    little, which is what the full-resolution copy has that the simplified one
    does not. The corners are the same in both, so the coarse copy is the full
    one with its detail removed rather than a different shape.
    """
    scale = math.cos(math.radians(lat))
    radii = [radius_km * (0.7 + 0.6 * unit_hash(seed, k, 7)) for k in range(corners)]
    points: list[list[float]] = []
    for k in range(corners):
        for b in range(between + 1):
            t = b / (between + 1)
            angle = 2 * math.pi * (k + t) / corners
            r = radii[k] * (1 - t) + radii[(k + 1) % corners] * t
            if b:
                r *= 0.9 + 0.2 * unit_hash(seed, k, b, 8)
            points.append(
                [
                    round(lon + r * math.cos(angle) / (_KM_PER_DEG * scale), 6),
                    round(lat + r * math.sin(angle) / _KM_PER_DEG, 6),
                ]
            )
    return [*points, points[0]]


def ring_acres(points: list[list[float]]) -> float:
    """A ring's area in acres, by the shoelace on a local flat projection."""
    lat0 = points[0][1]
    scale = math.cos(math.radians(lat0)) * _KM_PER_DEG
    xy = [(lon * scale, lat * _KM_PER_DEG) for lon, lat in points]
    twice = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:], strict=False))
    return round(abs(twice) / 2 * 247.105, 2)


def _rounded(value: Any, digits: int) -> Any:
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, list):
        return [_rounded(v, digits) for v in value]
    return value


def json_response(body: Any) -> Response:
    text = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    return Response(text.encode(), media_type="application/json")


_INVALID = "Cannot perform query. Invalid query parameters."


def arcgis_error(code: int, message: str, details: list[str] | None = None) -> Response:
    """An ArcGIS refusal, inside an HTTP 200 the way the services send one."""
    return json_response({"error": {"code": code, "message": message, "details": details or []}})


def query(layer: Layer, request: Request) -> Response:
    """One `/query` against a layer, read the way ArcGIS reads it.

    `where` is not evaluated: every feature a sim layer holds is one the pod's
    `where` would keep. `objectIds`, `outFields`, `returnGeometry`,
    `maxAllowableOffset`, `geometryPrecision`, `f` and the pager are honoured.
    """
    params = request.query_params
    asked = [f.strip() for f in params.get("outFields", "*").split(",") if f.strip()]
    by_lower = {f.lower(): f for f in layer.fields}
    if asked != ["*"] and any(f.lower() not in by_lower for f in asked):
        return arcgis_error(400, _INVALID, ["'outFields' parameter is invalid"])
    fields = list(layer.fields) if asked == ["*"] else [by_lower[f.lower()] for f in asked]
    if layer.id_field not in fields:
        fields.insert(0, layer.id_field)

    features = list(layer.features)
    if params.get("objectIds"):
        try:
            wanted = {int(v) for v in params["objectIds"].split(",") if v.strip()}
        except ValueError:
            return arcgis_error(400, _INVALID, ["'objectIds' is invalid"])
        features = [f for f in features if f.object_id in wanted]
    # Ordered whatever `orderByFields` says: OBJECTID is the only order the pod
    # asks for, and the one a layer's features are built in.
    features.sort(key=lambda f: f.object_id)
    try:
        offset = max(0, int(params.get("resultOffset", 0)))
        count = min(MAX_RECORD_COUNT, max(1, int(params.get("resultRecordCount", MAX_RECORD_COUNT))))
        digits = int(params.get("geometryPrecision", 6))
    except ValueError:
        return arcgis_error(400, _INVALID)
    page = features[offset : offset + count]
    more = offset + count < len(features)
    coarse = "maxAllowableOffset" in params
    geometry = params.get("returnGeometry", "true").lower() != "false"
    geojson = params.get("f", "json").lower() == "geojson"

    if geojson:
        out: list[dict[str, Any]] = []
        for f in page:
            shape = (f.coarse if coarse else f.full) if geometry else None
            if shape is not None:
                shape = {"type": shape["type"], "coordinates": _rounded(shape["coordinates"], digits)}
            out.append(
                {
                    "type": "Feature",
                    "id": f.object_id,
                    "geometry": shape,
                    "properties": {k: f.attributes.get(k) for k in fields},
                }
            )
        body: dict[str, Any] = {"type": "FeatureCollection", "features": out}
        if more:
            body["properties"] = {"exceededTransferLimit": True}
        return json_response(body)
    # `f=json` carries attributes alone here: the pod asks it only with
    # `returnGeometry=false`, and Esri's geometry encoding is not worth a sim
    # of its own until something reads it.
    body = {
        "objectIdFieldName": layer.id_field,
        "features": [{"attributes": {k: f.attributes.get(k) for k in fields}} for f in page],
    }
    if more:
        body["exceededTransferLimit"] = True
    return json_response(body)


# ArcGIS's own words for the quota refusal, from the body `arcgis.py` quotes.
QUOTA_MESSAGE = "Unable to perform query. Too many requests."


def arcgis_fault(endpoint: control.Endpoint) -> Callable[[], Awaitable[None]]:
    """`control.fault(endpoint)`, answered the way an ArcGIS service answers.

    A 429 is the quota refusal and arrives as HTTP 200 with the error inside,
    which is the one an investigation once spent hours on (#203). Any other
    status is sent as itself, in the same envelope.
    """
    apply = control.fault(endpoint)

    async def answer() -> None:
        armed = control.current().faults.get(endpoint)
        reason = armed.reason if armed else None
        try:
            await apply()
        except control.FaultAnswer as exc:
            status = exc.response.status_code
            message = reason or (QUOTA_MESSAGE if status == 429 else f"Simulated {status} from the supplier sim.")
            body = {"error": {"code": status, "message": message, "details": []}}
            retry = {k: v for k, v in exc.response.headers.items() if k.lower() == "retry-after"}
            text = json.dumps(body, separators=(",", ":")).encode()
            sent = 200 if status == 429 else status
            raise control.FaultAnswer(
                Response(text, status_code=sent, media_type="application/json", headers=retry)
            ) from None

    return answer


# ── The perimeter layer ──────────────────────────────────────────────────────

FIRE_FIELDS = (
    "OBJECTID",
    "attr_IncidentName",
    "poly_IncidentName",
    "poly_GISAcres",
    "attr_PercentContained",
    "attr_ModifiedOnDateTime_dt",
    "attr_FireDiscoveryDateTime",
    "attr_IncidentTypeCategory",
)


@functools.cache
def fires() -> Layer:
    """The perimeter layer, built once: it is the same layer forever."""
    features = []
    for k, lat, lon in grid(_FIRE_SEED, CONUS, _FIRE_PITCH, _FIRE_KEEP):
        object_id = k + 1
        radius = 0.5 + 9.5 * unit_hash(_FIRE_SEED, k, 3) ** 2
        corners = 8 + int(unit_hash(_FIRE_SEED, k, 4) * 5)
        seed = _FIRE_SEED + k
        coarse = ring(seed, lat, lon, radius, corners)
        full = ring(seed, lat, lon, radius, corners, between=3)
        discovered = EPOCH_MS - int(unit_hash(_FIRE_SEED, k, 5) * 40) * DAY_MS
        fire = name(_FIRE_SEED, k, " Fire")
        features.append(
            Feature(
                object_id=object_id,
                attributes={
                    "OBJECTID": object_id,
                    "attr_IncidentName": fire,
                    # The perimeter's own record spells it upper case, as many do.
                    "poly_IncidentName": fire.upper(),
                    "poly_GISAcres": ring_acres(full),
                    "attr_PercentContained": int(unit_hash(_FIRE_SEED, k, 6) * 20) * 5,
                    "attr_ModifiedOnDateTime_dt": discovered + int(unit_hash(_FIRE_SEED, k, 9) * 10 + 1) * DAY_MS,
                    "attr_FireDiscoveryDateTime": discovered,
                    "attr_IncidentTypeCategory": "WF",
                },
                full={"type": "Polygon", "coordinates": [full]},
                coarse={"type": "Polygon", "coordinates": [coarse]},
            )
        )
    return Layer("OBJECTID", FIRE_FIELDS, tuple(features))


router = APIRouter(prefix="/nifc", dependencies=[Depends(arcgis_fault("nifc"))], include_in_schema=False)


@router.get("/query")
def get_query(request: Request) -> Response:
    return query(fires(), request)
