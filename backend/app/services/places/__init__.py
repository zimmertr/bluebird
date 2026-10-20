"""Reading the places table: ring search, the pasted-coordinate lookup and the map's markers (#760).

The table holds every peak, lake, trailhead and crag OpenStreetMap carries,
filled from the planet file and kept current from its daily change files, so a
search reads it in milliseconds where Overpass took seconds and sometimes
never answered (2026-10-15 and 2026-10-16). Each reader here returns None when
the table cannot answer: no database, one not filled yet, or one that dropped
mid-query. The caller then takes the live Overpass path it took before #760, so
nothing here is ever the reason a request fails.

A place stands at one point, a node's position or a way's or relation's
centre, and is inside a ring when that point is. Overpass asks whether any part
of a way touches the ring, so a lake whose shore crosses the edge but whose
centre is outside was a row there and is not one here, which is also where its
marker would have stood.
"""

from __future__ import annotations

import json
import logging
import math
import time
from collections.abc import Sequence
from datetime import datetime
from typing import Any, NamedTuple

from app import db
from app.models import DestinationType, GeoPolygon
from app.services.osm import rules
from app.services.osm.query import check_implemented

log = logging.getLogger(__name__)

# How long a pod trusts its last look at `osm_state.filled_at`. The answer
# changes once, when the first fill completes, so a minute is how long a pod
# keeps asking Overpass after that and nothing more.
FILLED_TTL_S = 60.0

_filled: tuple[float, bool] | None = None

# Metres in a degree of latitude, for the boxes that narrow a radius search to
# the index before the exact distance decides.
_M_PER_DEG = 111_320.0


def _forget() -> None:
    """Drop the cached fill state (tests, and a pod that loses its database)."""
    global _filled
    _filled = None


async def is_filled() -> bool:
    """Whether the table has completed a fill, as of at most FILLED_TTL_S ago."""
    global _filled
    if not db.available():
        return False
    now = time.monotonic()
    if _filled is not None and now - _filled[0] < FILLED_TTL_S:
        return _filled[1]
    try:
        async with db.connection() as conn:
            row = await (
                await conn.execute("SELECT filled_at IS NOT NULL FROM osm_state")
            ).fetchone()
    except db.DatabaseUnavailable:
        return False
    filled = bool(row and row[0])
    _filled = (now, filled)
    return filled


def _ring_geojson(polygon: GeoPolygon) -> str:
    # The outer ring alone, as Overpass's `poly:` filter reads it.
    return json.dumps({"type": "Polygon", "coordinates": [polygon.coordinates[0]]})


def _row(osm_type: str, osm_id: int, kind: str, name: str | None, ele: float | None,
         lat: float, lon: float) -> dict[str, Any]:
    elevation_ft = float(ele) if ele is not None else None
    return {
        # An unnamed summit is named for its height, the string the live path
        # and the browser's clicked peak both build (`osm/mirrors.py`).
        "name": name if name is not None else f"Peak {round(elevation_ft or 0)}",
        "type": kind,
        "latitude": lat,
        "longitude": lon,
        "elevation_ft": elevation_ft,
        "osm_id": f"{osm_type}/{osm_id}",
    }


def _merged(records: Sequence[tuple[Any, ...]]) -> list[dict[str, Any]]:
    """Rows from (osm_type, osm_id, kind, name, ele_ft, rank, lat, lon), merged by rules."""
    rows = [_row(t, i, k, n, e, lat, lon) for t, i, k, n, e, _r, lat, lon in records]
    order = [(r, rules.ELEMENT_ORDER[t], i) for t, i, _k, _n, _e, r, _lat, _lon in records]
    mergeable = [n is not None for _t, _i, _k, n, _e, _r, _lat, _lon in records]
    return rules.merge_neighbours(rows, order, mergeable)


# Overpass answers a union nodes first, then ways, then relations, each by id;
# the table answers in the same order so a ring reads the same either way.
_ORDER = "ORDER BY CASE osm_type WHEN 'node' THEN 0 WHEN 'way' THEN 1 ELSE 2 END, osm_id"


async def discover(
    polygon: GeoPolygon,
    destination_types: Sequence[DestinationType],
    *,
    include_unnamed_peaks: bool = False,
) -> list[dict[str, Any]] | None:
    """Every place of the asked kinds inside the ring, as `osm.query_osm` returns them.

    None when the table cannot answer. Raises NotImplementedError for a type
    discovery does not carry, the same refusal the live path gives.
    """
    types = sorted(set(destination_types), key=lambda t: t.value)
    check_implemented(types)
    if not types or not await is_filled():
        return None if types else []
    try:
        async with db.connection() as conn:
            records = await (
                await conn.execute(
                    "SELECT osm_type, osm_id, kind, name, ele_ft, rank, ST_Y(geom), ST_X(geom)"
                    " FROM places"
                    " WHERE kind = ANY(%(kinds)s)"
                    "   AND (name IS NOT NULL"
                    "        OR (%(unnamed)s AND kind = 'peak' AND ele_ft IS NOT NULL))"
                    # MakeValid because a hand-drawn ring can cross itself,
                    # which Overpass reads and PostGIS refuses.
                    "   AND ST_Intersects(geom, ST_MakeValid("
                    "       ST_SetSRID(ST_GeomFromGeoJSON(%(ring)s), 4326)))"
                    f" {_ORDER}",
                    {
                        "kinds": [t.value for t in types],
                        "unnamed": include_unnamed_peaks,
                        "ring": _ring_geojson(polygon),
                    },
                )
            ).fetchall()
    except db.DatabaseUnavailable as exc:
        log.warning("Places table unavailable mid-search (%s); asking Overpass", exc)
        return None
    rows = _merged(records)
    log.info("Places table answered %d destination(s) for types=%s",
             len(rows), ",".join(t.value for t in types))
    return rows


def _degrees_for(metres: float, lat: float) -> float:
    """A radius in degrees wide enough for `metres` along either axis at `lat`.

    A degree of longitude shrinks with the cosine of the latitude, so it is the
    wider of the two; clamped so a point near a pole still gets a finite box.
    """
    return metres / (_M_PER_DEG * max(math.cos(math.radians(lat)), 0.01))


class Summit(NamedTuple):
    """A summit a pasted point may stand on, from the table or from Overpass."""

    latitude: float
    longitude: float
    name: str | None
    elevation_ft: float | None
    osm_id: str


async def summits_near(
    points: Sequence[dict[str, Any]], reach_m: float
) -> list[list[Summit]] | None:
    """Every summit within about `reach_m` of each point, in the points' order.

    The box is a little wider than the reach, and `osm.enrich` measures each
    candidate and picks, so the table and the live path apply one rule. None
    when the table cannot answer.
    """
    if not await is_filled():
        return None
    lats = [float(p["latitude"]) for p in points]
    lons = [float(p["longitude"]) for p in points]
    degs = [_degrees_for(reach_m, lat) for lat in lats]
    try:
        async with db.connection() as conn:
            records = await (
                await conn.execute(
                    "SELECT q.i, ST_Y(p.geom), ST_X(p.geom), p.name, p.ele_ft, p.osm_type, p.osm_id"
                    " FROM unnest(%s::float8[], %s::float8[], %s::float8[])"
                    "      WITH ORDINALITY AS q(lat, lon, deg, i)"
                    " JOIN places p ON p.kind = 'peak'"
                    "  AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(q.lon, q.lat), 4326), q.deg)",
                    (lats, lons, degs),
                )
            ).fetchall()
    except db.DatabaseUnavailable as exc:
        log.warning("Places table unavailable mid-lookup (%s); asking Overpass", exc)
        return None
    near: list[list[Summit]] = [[] for _ in points]
    for i, lat, lon, name, ele, osm_type, osm_id in records:
        near[i - 1].append(
            Summit(lat, lon, name, float(ele) if ele is not None else None, f"{osm_type}/{osm_id}")
        )
    return near


# The kinds the map draws as markers of its own: the basemap's tiles carry no
# trailhead and no crag it can tell from a route (#734).
LANDMARK_KINDS = (rules.TRAILHEAD, rules.CRAG)


def _boxes(west: float, south: float, east: float, north: float) -> list[tuple[float, ...]]:
    # A box across the antimeridian is two boxes either side of it.
    if west <= east:
        return [(west, south, east, north)]
    return [(west, south, 180.0, north), (-180.0, south, east, north)]


def _inside(lat: float, lon: float, box: tuple[float, float, float, float]) -> bool:
    return any(w <= lon <= e and s <= lat <= n for w, s, e, n in _boxes(*box))


async def landmarks(
    box: tuple[float, float, float, float],
) -> tuple[datetime, list[dict[str, Any]]] | None:
    """The trailheads and crags inside `box`, merged as a ring search merges them.

    Read over a box one merge radius wider, so a trailhead node just outside
    the view still stands for the lot named for it just inside, and the marker
    a reader clicks is the row a ring around it returns. Also returns when the
    table was last brought up to date. None when the table cannot answer.
    """
    if not await is_filled():
        return None
    west, south, east, north = box
    pad_lat = rules.MERGE_RADIUS_M / _M_PER_DEG
    pad_lon = _degrees_for(rules.MERGE_RADIUS_M, max(abs(south), abs(north)))
    wide = (
        west - pad_lon if west - pad_lon >= -180 else west - pad_lon + 360,
        max(south - pad_lat, -90.0),
        east + pad_lon if east + pad_lon <= 180 else east + pad_lon - 360,
        min(north + pad_lat, 90.0),
    )
    envelopes = " OR ".join(
        "geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)" for _ in _boxes(*wide)
    )
    params: list[Any] = [list(LANDMARK_KINDS)]
    for b in _boxes(*wide):
        params.extend(b)
    try:
        async with db.connection() as conn:
            state = await (
                await conn.execute("SELECT coalesce(updated_at, filled_at) FROM osm_state")
            ).fetchone()
            records = await (
                await conn.execute(
                    "SELECT osm_type, osm_id, kind, name, ele_ft, rank, ST_Y(geom), ST_X(geom)"
                    " FROM places WHERE kind = ANY(%s) AND name IS NOT NULL"
                    f" AND ({envelopes}) {_ORDER}",
                    params,
                )
            ).fetchall()
    except db.DatabaseUnavailable as exc:
        log.warning("Places table unavailable for markers (%s)", exc)
        return None
    if not state or state[0] is None:
        return None
    rows = [r for r in _merged(records) if _inside(r["latitude"], r["longitude"], box)]
    return state[0], rows
