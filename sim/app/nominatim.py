"""Nominatim's search, answered off the lattice.

The pod forwards the answer verbatim (`routes/geocode.py`) and the web app
reads `lat`, `lon`, `name`, `display_name`, `type`, `addresstype`, `osm_type`,
`osm_id`, `boundingbox` and `extratags.ele` from it (`utils/geocode.ts`), so
every row carries those in Nominatim's own `jsonv2` shape: coordinates and the
box as strings, `category` where the older `json` format says `class`, and
`importance` falling down the list.

A search does not read words. The text is hashed to a point in the sim's home
box and the answer is the lattice's places nearest that point, towns, peaks and
lakes in turn so the list shows every kind, which is all a dev stack needs: the
same text finds the same places forever, and a different text finds others. A
query that reads as `lat, lon` answers the places nearest that point instead.
"""

from __future__ import annotations

import json
import math
import re
import zlib
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app import lattice
from app.control import fault
from app.overpass import HOME_BOX, ele_tag

LICENCE = "Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright"
COUNTY = "Sim County, Washington, United States"

_COORDINATES = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$")

# Nominatim's own default and ceiling for `limit`.
_DEFAULT_LIMIT = 10
_MAX_LIMIT = 40


def point_for(q: str) -> tuple[float, float]:
    """Where a search text lands: a pure function of the text, inside the home box.

    CRC32 rather than `hash()`, which Python salts per process for strings.
    """
    match = _COORDINATES.match(q)
    if match and abs(float(match[1])) <= 90 and abs(float(match[2])) <= 180:
        return float(match[1]), float(match[2])
    south, west, north, east = HOME_BOX
    data = q.strip().casefold().encode()
    u = zlib.crc32(data) / 2**32
    v = zlib.crc32(data, 0x5BD1E995) / 2**32
    return south + (north - south) * u, west + (east - west) * v


def _nearest(lat: float, lon: float, find: Any, count: int) -> list[Any]:
    half = 0.1
    while True:
        dlon = half / max(0.01, math.cos(math.radians(lat)))
        places = find(lat - half, lon - dlon, lat + half, lon + dlon)
        if len(places) >= count or half > 10:
            break
        half *= 2
    places.sort(key=lambda p: (lattice.distance_m(lat, lon, p.lat, p.lon), p.osm_id))
    return places[:count]


def _box(lat: float, lon: float, half: float) -> list[str]:
    # Nominatim's order: south, north, west, east.
    return [f"{lat - half:.7f}", f"{lat + half:.7f}", f"{lon - half:.7f}", f"{lon + half:.7f}"]


def _row(place: Any, rank: int) -> dict[str, Any]:
    if isinstance(place, lattice.Town):
        osm_type, category, kind, addresstype, extratags, half, place_rank = (
            "node", "place", place.kind, place.kind, {}, 0.05, 16 if place.kind == "town" else 19,
        )
    elif isinstance(place, lattice.Lake):
        osm_type, category, kind, addresstype, extratags, half, place_rank = (
            "way", "natural", "water", "water", {"water": "lake"}, 0.01, 22,
        )
    else:
        osm_type, category, kind, addresstype, extratags, half, place_rank = (
            "node", "natural", "peak", "peak", {"ele": ele_tag(place.elevation_m)}, 0.0001, 18,
        )
    return {
        "place_id": place.osm_id % 1_000_000_000,
        "licence": LICENCE,
        "osm_type": osm_type,
        "osm_id": place.osm_id,
        "lat": f"{place.lat:.7f}",
        "lon": f"{place.lon:.7f}",
        "category": category,
        "type": kind,
        "place_rank": place_rank,
        "importance": round(0.6 - 0.03 * rank, 5),
        "addresstype": addresstype,
        "name": place.name,
        "display_name": f"{place.name}, {COUNTY}",
        "extratags": extratags,
        "boundingbox": _box(place.lat, place.lon, half),
    }


def search(q: str, limit: int) -> list[dict[str, Any]]:
    """Up to `limit` places near where the text lands, towns, peaks and lakes in turn."""
    if not q.strip():
        return []
    lat, lon = point_for(q)
    each = -(-limit // 3)
    kinds = [
        _nearest(lat, lon, lattice.towns_in_bbox, each),
        _nearest(lat, lon, lattice.peaks_in_bbox, each),
        _nearest(lat, lon, lattice.lakes_in_bbox, each),
    ]
    places = [kind[k] for k in range(each) for kind in kinds if k < len(kind)][:limit]
    return [_row(place, rank) for rank, place in enumerate(places)]


router = APIRouter(prefix="/nominatim", dependencies=[Depends(fault("nominatim"))], include_in_schema=False)


@router.get("/search")
async def get_search(request: Request) -> Response:
    params = request.query_params
    try:
        limit = int(params.get("limit", _DEFAULT_LIMIT))
    except ValueError:
        limit = _DEFAULT_LIMIT
    rows = search(params.get("q", ""), min(max(limit, 1), _MAX_LIMIT))
    text = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    return Response(text.encode(), media_type="application/json")
