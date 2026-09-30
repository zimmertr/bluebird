"""Where the closure orders have meaning: a coarse outline of Oregon and Washington.

The closure feed is the Forest Service's Pacific Northwest Region (Region 6),
which is every national forest in those two states and nothing else. An empty
answer anywhere outside them therefore means "not covered", never "nothing
closed". The route publishes this geometry beside the closures so the browser
can tell the two apart, the way ``wfigs_coverage.py`` does for fires (#256).

Three deliberate properties, in descending order of importance:

- **Biased outward on land.** Along the Canadian, Idaho, Nevada and
  California borders the line sits ~0.2° outside the two states, because the
  failure modes are asymmetric: a border-adjacent Oregon trailhead told "no
  closure data here" loses a real closure, while a just-across-the-border one
  told "checked, nothing found" is off by the width of the bias. Ocean
  overshoot is free, since there are no destinations at sea. Mount Shasta
  (41.41°N) stays well outside the southern edge at 41.8°N.
- **One exception, at Lewiston.** The Washington and Idaho line runs down the
  Snake River between Clarkston, Washington and Lewiston, Idaho, two towns that
  face each other across the water. The line runs tight between them there
  rather than 0.2° out, so Lewiston stays outside. North of it the bias holds,
  and south of it the line follows the Snake through Hells Canyon rather than
  a rectangle, which would take in a band of Idaho the whole length of the
  Oregon border.
- **Static.** Region 6's scope is a fact about the Forest Service, not about
  any snapshot, so this is data rather than a fetch.

Coordinates are GeoJSON MultiPolygon nesting: polygons → rings → [lon, lat].
One polygon, because the two states share a border.
"""

from __future__ import annotations

import json
from typing import Any

from app.services.wfigs_coverage import _in_ring

_OREGON_WASHINGTON = [
    # The Pacific, well offshore, from the California line to the Strait of
    # Juan de Fuca.
    [-125.0, 41.8],
    [-125.0, 48.45],
    # Mid-strait, then up Haro Strait, so Victoria and Sidney on Vancouver
    # Island stay outside and the San Juan Islands stay inside.
    [-123.5, 48.25],
    [-123.25, 48.45],
    [-123.2, 49.2],
    # The 49th parallel, 0.2° north, which keeps Vancouver (49.28) outside.
    [-116.84, 49.2],
    # The Washington and Idaho line (-117.04), 0.2° east.
    [-116.84, 46.6],
    # Between Clarkston and Lewiston: see the module docstring.
    [-117.03, 46.5],
    [-117.03, 46.3],
    # The Snake River through Hells Canyon, 0.2° east of the water.
    [-116.72, 46.0],
    [-116.26, 45.6],
    [-116.49, 45.25],
    [-116.70, 44.85],
    # Below Brownlee Dam the river swings west to Farewell Bend (-117.23 at
    # 44.30) before it turns back east past Nyssa. A straight edge from Hells
    # Canyon to the meridian took in 0.45° of Idaho here (review of #552), so
    # the outline follows the bend, 0.2° east of it: Cambridge, Midvale and
    # Weiser, Idaho, stay outside and Huntington and Halfway, Oregon, inside.
    [-117.03, 44.30],
    # The Oregon and Idaho line south of the river (-117.03), 0.2° east, to
    # 0.2° south of the Nevada and California line (42.0).
    [-116.83, 43.8],
    [-116.83, 41.8],
    [-125.0, 41.8],
]

COVERAGE: dict[str, Any] = {
    "type": "MultiPolygon",
    "coordinates": [[_OREGON_WASHINGTON]],
}

# Serialized once at import: the geometry is static and rides every
# /api/closures response as a foreign member.
COVERAGE_JSON: str = json.dumps(COVERAGE, separators=(",", ":"))


def covers(lat: float, lon: float) -> bool:
    """Whether the closure feed can say anything about a point.

    Mostly for the tests, which pin the geometry to named places; the browser
    runs the same ray cast against the published member.
    """
    return any(_in_ring(lon, lat, polygon[0]) for polygon in COVERAGE["coordinates"])
