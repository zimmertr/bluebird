"""IEM's NEXRAD tiles: a few moving storms, so playback has something to show.

`radar.ts` names a frame by its age in the product, `nexrad-n0q-900913` for
now and `nexrad-n0q-900913-m10m` for ten minutes ago, and the sim moves every
storm east with that age, so stepping the player back visibly walks the
echoes west. Each storm is three rings painted in colours of IEM's own N0Q
palette, so the radar card (`radarPoint.ts` `dbzOfPixel`) reads a real
reflectivity off any pixel: about 45 dBZ at the core, 30 and 20 outside it.
"""

from __future__ import annotations

import math
import re
from functools import lru_cache

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app import png
from app.control import fault
from app.tiles import tile_bounds
from app.values import unit_hash

SIZE = 256
# N0Q palette entries at index (dBZ + 32.5) / 0.5, copied from `N0Q_PALETTE`
# in radarPoint.ts; a test reads them back off that file.
RINGS: tuple[tuple[float, int, str], ...] = (
    # (fraction of the storm's radius, dBZ, colour)
    (0.35, 45, "ffac00"),
    (0.7, 30, "0b840e"),
    (1.0, 20, "43d67e"),
)
_PALETTE = [png.TRANSPARENT] + [png.hex_rgba(colour) for _, _, colour in RINGS]

# One storm per cell of this lattice, in degrees, most cells left dry.
_STORM_PITCH_LAT, _STORM_PITCH_LON = 1.5, 2.0
_STORM_RADIUS_DEG = 0.35
# How far a storm travels east in a minute: about 50 km an hour at 47° N.
_DRIFT_DEG_PER_MIN = 0.011

_PRODUCT = re.compile(r"^nexrad-n0q-900913(?:-m(\d+)m)?$")


def _storms(south: float, west: float, north: float, east: float, age_min: int) -> list[tuple[float, float]]:
    """Storm centres whose disc reaches the box, at `age_min` minutes ago."""
    out = []
    # The longitude reach is wider because a storm's disc is squashed by
    # latitude, and to the east because an older frame draws it further west.
    reach_lat = _STORM_RADIUS_DEG
    reach_lon = _STORM_RADIUS_DEG * 3
    drift = _DRIFT_DEG_PER_MIN * age_min
    i0 = math.floor((south - reach_lat + 90) / _STORM_PITCH_LAT)
    i1 = math.floor((north + reach_lat + 90) / _STORM_PITCH_LAT)
    j0 = math.floor((west - reach_lon + 180) / _STORM_PITCH_LON)
    j1 = math.floor((east + reach_lon + drift + 180) / _STORM_PITCH_LON)
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            if unit_hash(7, i, j) > 0.45:
                continue
            lat = (i + 0.5) * _STORM_PITCH_LAT - 90
            lon = (j + 0.5) * _STORM_PITCH_LON - 180 - _DRIFT_DEG_PER_MIN * age_min
            out.append((lat, lon))
    return out


@lru_cache(maxsize=1024)
def radar_tile(age_min: int, z: int, x: int, y: int) -> bytes:
    south, west, north, east = tile_bounds(z, x, y)
    storms = _storms(south, west, north, east, age_min)
    if not storms:
        return png.encode_indexed(SIZE, SIZE, _PALETTE, bytes(SIZE * SIZE))
    n = 2**z
    lons = [(x + (px + 0.5) / SIZE) / n * 360 - 180 for px in range(SIZE)]
    pixels = bytearray(SIZE * SIZE)
    for py in range(SIZE):
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + (py + 0.5) / SIZE) / n))))
        squash = math.cos(math.radians(lat))
        near = [(s_lon, (lat - s_lat) ** 2) for s_lat, s_lon in storms if abs(lat - s_lat) < _STORM_RADIUS_DEG]
        if not near:
            continue
        row = py * SIZE
        for px, lon in enumerate(lons):
            best = 0
            for s_lon, dlat2 in near:
                d = math.sqrt(dlat2 + ((lon - s_lon) * squash) ** 2) / _STORM_RADIUS_DEG
                for k, (edge, _, _) in enumerate(RINGS):
                    if d <= edge:
                        best = max(best, len(RINGS) - k)
                        break
            if best:
                pixels[row + px] = len(RINGS) + 1 - best
    return png.encode_indexed(SIZE, SIZE, _PALETTE, bytes(pixels))


router = APIRouter(prefix="/radar", dependencies=[Depends(fault("radar"))], include_in_schema=False)


@router.get("/{product}/{z}/{x}/{y}.png")
def get_radar(product: str, z: int, x: int, y: int) -> Response:
    match = _PRODUCT.match(product)
    if not match or not (0 <= z <= 20 and 0 <= x < 2**z and 0 <= y < 2**z):
        return Response(status_code=404)
    return Response(radar_tile(int(match.group(1) or 0), z, x, y), media_type="image/png")
