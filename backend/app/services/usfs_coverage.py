"""Where the closure orders have meaning, per kind: two coarse outlines.

The two kinds read different feeds, so they cover different ground (#551).

- ``trail`` reads Region 6 alone, the Pacific Northwest Region, whose trail and
  site layers have no counterpart elsewhere. Its outline is Oregon and
  Washington.
- ``area`` reads Region 6's area polygons and the forest orders of the
  Southwestern Region (Region 3: Arizona and New Mexico) and the Intermountain
  Region (Region 4: Nevada, Utah, southern Idaho and western Wyoming). Its
  outline is the Oregon and Washington polygon plus four more.

An empty answer outside the outline for its kind therefore means "not
covered", never "nothing closed". The route publishes the outline beside the
closures so the browser can tell the two apart, the way ``wfigs_coverage.py``
does for fires (#256).

Three deliberate properties, in descending order of importance:

- **Biased outward on land.** Along a land border the line sits ~0.2° outside
  the region, because the failure modes are asymmetric: a border-adjacent
  trailhead told "no closure data here" loses a real closure, while a
  just-across-the-border one told "checked, nothing found" is off by the width
  of the bias. Ocean overshoot is free, since there are no destinations at
  sea. Where two outlines meet, one overlaps the other rather than both
  biasing: the ray cast asks whether ANY polygon holds a point, so an overlap
  costs nothing.
- **Three exceptions.** The Washington and Idaho line runs down the Snake River
  between Clarkston, Washington and Lewiston, Idaho, two towns that face each
  other across the water, and the line runs tight between them there so
  Lewiston stays outside. Lewiston is in the Nez Perce-Clearwater, which is
  Region 1, so the Idaho polygon stops short of it too. And western Wyoming
  follows the Continental Divide rather than a meridian, because east of the
  divide is the Shoshone, a Region 2 forest these feeds say nothing about: a
  box to -109.0 would tell a row outside Cody "checked, nothing found". And
  the Nevada polygon is cut back around two Region 5 units inside the state,
  the Inyo's White Mountains and the Lake Tahoe Basin (review of #551).
- **Static rings, composed per snapshot.** A region's scope is a fact about
  the Forest Service, not about any snapshot, so the rings are data rather
  than a fetch. Which rings the area outline carries is the snapshot's: a
  Region 3 or 4 feed that failed leaves its rings out (``area_coverage``).

Coordinates are GeoJSON MultiPolygon nesting: polygons → rings → [lon, lat].
"""

from __future__ import annotations

import functools
import json
from typing import Any, Literal

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

# Arizona and New Mexico, Region 3, as one polygon because the two states
# share a border. Every Region 3 forest is inside it. The Cibola's national
# grasslands in Oklahoma and Texas are not, so their orders draw on the map and
# a row beside them reads "not covered", which is the safe side.
_ARIZONA_NEW_MEXICO = [
    # The Colorado River from the Mexican line to Nevada, 0.2° west of the
    # water, which leaves Mexicali and Palm Springs outside.
    [-114.95, 32.35],
    [-114.92, 32.75],
    [-114.8, 33.6],
    [-114.35, 34.3],
    [-114.7, 34.8],
    [-114.85, 35.1],
    # North through Nevada, which the Great Basin polygon covers anyway, to
    # 0.2° north of the Utah and Colorado line (37.0).
    [-114.85, 37.2],
    # The Oklahoma and Texas line (-103.0), 0.2° east.
    [-102.85, 37.2],
    # The Texas line (32.0) and the Rio Grande at El Paso, 0.2° south. That
    # band holds Guadalupe Peak, Texas (31.89), so it reads as covered.
    [-102.85, 31.8],
    [-106.4, 31.8],
    # The Mexican line: 31.78 and the Bootheel's step down to 31.33, then the
    # diagonal to the Colorado, each 0.2° south.
    [-106.4, 31.58],
    [-108.0, 31.58],
    [-108.0, 31.13],
    [-111.1, 31.13],
    [-114.9, 32.3],
    [-114.95, 32.35],
]

# Nevada and Utah, Region 4, as one polygon for the same reason. The Humboldt-
# Toiyabe's districts in California lie outside it, which is the safe side:
# a row there reads "not covered". Two pieces of Nevada are Region 5 and are
# cut out: the Inyo National Forest's White Mountains around Boundary Peak,
# and the Lake Tahoe Basin Management Unit's Nevada shore.
_NEVADA_UTAH = [
    # 0.2° north of the Oregon and Idaho line (42.0), overlapping the Idaho
    # polygon, to the Wyoming line.
    [-120.2, 42.2],
    [-110.85, 42.2],
    # Utah's notch around the southwest corner of Wyoming, 0.2° out; the
    # Wyoming polygon covers the notch itself.
    [-110.85, 41.2],
    [-108.85, 41.2],
    # The Colorado line (-109.05), 0.2° east, down to 0.2° inside Arizona.
    [-108.85, 36.8],
    # Around Nevada's southern tip, overlapping Arizona to the Colorado River.
    [-114.2, 36.8],
    [-114.2, 34.84],
    [-114.75, 34.84],
    # The California diagonal from the Colorado River to Lake Tahoe, 0.2°
    # southwest, which leaves Mount Whitney and Bishop well outside.
    [-118.19, 37.4],
    # The Inyo's White Mountains (Region 5): -118.0 from 37.4 to 38.3, so
    # Boundary Peak (-118.35) stays outside.
    [-118.0, 37.4],
    [-118.0, 38.3],
    [-119.4, 38.3],
    # The Lake Tahoe Basin (Region 5): -119.75 from 38.85 to 39.3, so
    # Stateline and Incline Village stay outside. Reno and Mount Rose, north
    # of it, are the Humboldt-Toiyabe and stay inside.
    [-120.13, 38.85],
    [-119.75, 38.85],
    [-119.75, 39.3],
    # The 120th meridian north, 0.2° west.
    [-120.2, 39.3],
    [-120.2, 42.2],
]

# Southern Idaho, Region 4: the Boise, Payette, Salmon-Challis, Sawtooth and
# Caribou-Targhee. North of the Salmon River is Region 1, so the outline stops
# at 45.6 (the river runs at about 45.4 from Riggins to North Fork).
_SOUTHERN_IDAHO = [
    # The Oregon line (-117.03) with no bias, because the Oregon and
    # Washington polygon already reaches 0.2° into Idaho along it.
    [-117.03, 41.8],
    [-117.03, 45.6],
    [-114.0, 45.6],
    # Lost Trail Pass, then the Montana line down the Continental Divide
    # (Lemhi Pass, Bannock Pass, Montana's southern point by Scott Peak,
    # Monida Pass, Targhee Pass), each 0.2° into Montana.
    [-113.8, 45.85],
    [-113.25, 45.12],
    [-113.07, 44.95],
    [-112.8, 44.57],
    [-112.3, 44.76],
    [-111.25, 44.87],
    # The Wyoming line (-111.05), 0.2° east, to 0.2° south of the Nevada and
    # Utah line (42.0).
    [-110.85, 44.6],
    [-110.85, 41.8],
    [-117.03, 41.8],
]

# Western Wyoming, Region 4: the Bridger-Teton, the Wyoming side of the
# Caribou-Targhee, and the Ashley's reach north of Flaming Gorge. The east edge
# follows the Continental Divide: see the module docstring.
_WESTERN_WYOMING = [
    # The Idaho and Utah lines, overlapping both polygons.
    [-111.25, 40.8],
    [-111.25, 44.33],
    # Yellowstone's south boundary (44.13), 0.2° north. The park is not a
    # national forest, and the Idaho polygon's bias already takes its edge.
    [-109.65, 44.33],
    # The divide, 0.2° east: the Absaroka crest, Togwotee Pass, Union Pass,
    # Gannett Peak, Wind River Peak and South Pass. Dubois and Lander stay
    # outside.
    [-109.68, 44.0],
    [-109.87, 43.75],
    [-109.66, 43.47],
    [-109.45, 43.18],
    [-108.93, 42.71],
    [-108.72, 42.36],
    # South of South Pass the Red Desert holds no national forest, so a
    # meridian serves.
    [-108.72, 40.8],
    [-111.25, 40.8],
]

Kind = Literal["area", "trail"]

# Each region's rings, keyed by the `ClosureSource` code its features carry,
# in the order the area outline lists them. The area outline is composed from
# the regions a snapshot holds, so a feed that failed takes its ground out of
# coverage and a row there reads "not covered" rather than clear.
REGION_RINGS: dict[str, tuple[list[list[float]], ...]] = {
    "R06": (_OREGON_WASHINGTON,),
    "R03": (_ARIZONA_NEW_MEXICO,),
    "R04": (_NEVADA_UTAH, _SOUTHERN_IDAHO, _WESTERN_WYOMING),
}
ALL_REGIONS: frozenset[str] = frozenset(REGION_RINGS)


def area_coverage(regions: frozenset[str]) -> dict[str, Any]:
    """The area outline for the regions a snapshot holds."""
    return {
        "type": "MultiPolygon",
        "coordinates": [[ring] for region, rings in REGION_RINGS.items() if region in regions for ring in rings],
    }


@functools.cache
def area_coverage_json(regions: frozenset[str]) -> str:
    """``area_coverage`` serialized, once per set of regions.

    Cached because it rides every area response, and there are only as many
    sets as combinations of feeds that can fail.
    """
    return json.dumps(area_coverage(regions), separators=(",", ":"))


# The outlines when every feed answered. The trail outline never changes,
# because only Region 6 publishes trails and a snapshot without Region 6 is
# never built.
COVERAGE_FOR: dict[Kind, dict[str, Any]] = {
    "area": area_coverage(ALL_REGIONS),
    "trail": {
        "type": "MultiPolygon",
        "coordinates": [[_OREGON_WASHINGTON]],
    },
}

# Serialized once at import: the geometry is static and rides every
# /api/closures response as a foreign member.
COVERAGE_JSON_FOR: dict[Kind, str] = {
    kind: json.dumps(geometry, separators=(",", ":")) for kind, geometry in COVERAGE_FOR.items()
}


def covers(kind: Kind, lat: float, lon: float, regions: frozenset[str] = ALL_REGIONS) -> bool:
    """Whether the feeds behind one kind can say anything about a point.

    Mostly for the tests, which pin the geometry to named places; the browser
    runs the same ray cast against the published member. ``regions`` narrows
    the area outline to the feeds a snapshot holds.
    """
    geometry = area_coverage(regions) if kind == "area" else COVERAGE_FOR[kind]
    return any(_in_ring(lon, lat, polygon[0]) for polygon in geometry["coordinates"])
