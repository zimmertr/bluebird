"""Where WFIGS fire data has meaning: a coarse outline of the United States.

NIFC's WFIGS layer is the authoritative *national* dataset, so an empty answer
outside the US means "not covered", never "nothing burning" (#256). The route
publishes this geometry beside the perimeters so the browser can tell those
two apart without holding a second copy of the boundary anywhere.

Three deliberate properties, in descending order of importance:

- **Split at the antimeridian.** The Aleutians cross 180°, which is why
  ``nifc.py`` takes no bounding box for the national fetch; the same geometry
  problem is solved here by giving the chain one polygon per hemisphere, so
  every consumer can ray-cast in plain lon/lat with no wraparound case.
- **Coarse, and biased outward.** Vertices are placed to roughly ±50 km, and
  along the land borders the line sits ~0.2° outside the US, because the
  failure modes are asymmetric: a border-adjacent US analysis told "no fire
  data here" loses a real warning, while a just-across-the-border analysis
  told "checked, nothing found" is off by the width of the bias. Ocean
  overshoot is free — there are no destinations at sea. Over the Great Lakes
  and the St. Lawrence the line runs mid-water so Toronto, Kingston and
  Montreal stay outside.
- **Static.** WFIGS's scope is a fact about the program, not about any
  snapshot, so this is data rather than a fetch.

Coordinates are GeoJSON MultiPolygon nesting: polygons → rings → [lon, lat].
"""

from __future__ import annotations

import json
from typing import Any

_CONUS = [
    [-124.9, 32.3],
    [-125.4, 40.5],
    [-125.2, 48.4],
    [-123.5, 48.5],
    [-123.2, 49.2],
    [-95.2, 49.2],
    [-95.0, 49.5],
    [-92.0, 48.4],
    [-89.5, 48.3],
    [-86.5, 47.8],
    [-84.5, 46.8],
    [-83.5, 46.3],
    [-82.3, 45.3],
    [-82.1, 43.3],
    [-82.8, 42.5],
    [-81.5, 42.4],
    [-78.9, 42.9],
    [-79.1, 43.4],
    [-76.5, 43.6],
    [-75.6, 44.8],
    [-74.5, 45.2],
    [-71.4, 45.2],
    [-70.8, 45.6],
    [-69.2, 47.7],
    [-67.6, 47.3],
    [-66.9, 44.8],
    [-69.5, 43.3],
    [-69.8, 40.8],
    [-73.0, 40.2],
    [-74.5, 38.8],
    [-75.0, 36.8],
    [-75.0, 34.8],
    [-80.3, 31.5],
    [-79.5, 26.8],
    [-79.8, 24.6],
    [-82.2, 24.2],
    [-83.5, 27.0],
    [-84.2, 29.2],
    [-86.0, 29.6],
    [-89.0, 28.6],
    [-92.0, 29.2],
    [-95.5, 28.5],
    [-97.6, 25.6],
    [-99.2, 26.3],
    [-99.9, 27.3],
    [-101.5, 29.2],
    [-102.9, 28.8],
    [-104.9, 29.4],
    [-106.7, 31.5],
    [-108.2, 31.1],
    [-111.0, 31.1],
    [-114.9, 32.3],
    [-117.3, 32.4],
    [-124.9, 32.3],
]

# Mainland Alaska and the panhandle. The eastern edge is the 141°W meridian
# (the real border); the panhandle edge follows the coastal range coarsely and
# the ring closes across open ocean, where overshoot costs nothing. Dixon
# Entrance sits at ~54.5, keeping Prince Rupert (54.31) outside.
_ALASKA = [
    [-169.5, 52.5],
    [-169.5, 71.5],
    [-141.0, 71.5],
    [-141.0, 60.2],
    [-135.0, 59.3],
    [-132.5, 57.4],
    [-130.0, 56.2],
    [-129.7, 55.0],
    [-130.8, 54.5],
    [-134.0, 54.6],
    [-137.0, 56.5],
    [-141.5, 58.8],
    [-160.0, 54.5],
    [-169.5, 52.5],
]

# The Aleutian chain, one box per hemisphere: everything the mainland ring
# above does not reach, out to Attu. This pair is the antimeridian split.
_ALEUTIANS_WEST = [
    [172.0, 51.0],
    [172.0, 53.5],
    [180.0, 53.5],
    [180.0, 51.0],
    [172.0, 51.0],
]
_ALEUTIANS_EAST = [
    [-180.0, 51.0],
    [-180.0, 53.5],
    [-169.5, 53.5],
    [-169.5, 51.0],
    [-180.0, 51.0],
]

_HAWAII = [
    [-160.4, 18.7],
    [-160.4, 22.5],
    [-154.5, 22.5],
    [-154.5, 18.7],
    [-160.4, 18.7],
]

_PUERTO_RICO_USVI = [
    [-67.4, 17.6],
    [-67.4, 18.6],
    [-64.4, 18.6],
    [-64.4, 17.6],
    [-67.4, 17.6],
]

COVERAGE: dict[str, Any] = {
    "type": "MultiPolygon",
    "coordinates": [
        [_CONUS],
        [_ALASKA],
        [_ALEUTIANS_WEST],
        [_ALEUTIANS_EAST],
        [_HAWAII],
        [_PUERTO_RICO_USVI],
    ],
}

# Serialized once at import: the geometry is static and rides every
# /api/wildfires response as a foreign member (~2 KB).
COVERAGE_JSON: str = json.dumps(COVERAGE, separators=(",", ":"))


def _in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def covers(lat: float, lon: float) -> bool:
    """Whether WFIGS can say anything about a point.

    Mostly for the tests, which pin the geometry to named places; the browser
    runs the same ray cast against the published member.
    """
    return any(_in_ring(lon, lat, polygon[0]) for polygon in COVERAGE["coordinates"])
