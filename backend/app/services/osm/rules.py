"""What each destination kind is in OpenStreetMap's tags, and where it stands: the one definition (#760).

Three readers ask the same questions and must get the same answers: the live
Overpass query (`query.py`, a deployment with no database), the planet fill
(`fill/fill.py`, which copies this file into an image that has none of the
app's dependencies) and the daily update (`services/places/update.py`). So this
module is standard library only. It states each rule twice, once as the
Overpass selectors and once as `classify` in Python, side by side, with
`tests/test_osm_rules.py` holding the two to one table of tagged examples; and
it holds the one way a shape is placed and the one reading of a replication
state file, which the fill and the update both use.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Iterator, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

# Bumped whenever a rule below changes what is kept. The daily update applies a
# new rule only to features edited after it ships, so the planet fill compares
# this with the version the places table was built under and rebuilds the
# table when they differ (fill/fill.py).
RULES_VERSION = 1

PEAK = "peak"
TRAILHEAD = "trailhead"
LAKE = "lake"
CRAG = "crag"

# A trailhead is also a named parking lot whose name says so: much of the US
# maps the lot and never adds the node (Issaquah, 2026-10-17: 2 of 14 named
# trailhead features in a box around it were `highway=trailhead`, Poo Poo
# Trailhead among the lots). Overpass regexes are POSIX extended and `re` is
# Python's; this pattern means the same in both. English only on purpose:
# mappers elsewhere use the tag.
TRAILHEAD_LOT_NAME = r"[Tt]rail ?[Hh]ead"
_TRAILHEAD_LOT = re.compile(TRAILHEAD_LOT_NAME)

CRAG_SUBTYPES = ("crag", "area", "boulder")
# Natural features a bare `sport=climbing` makes a crag on (#760, measured
# 2026-10-18 over Washington: 24 such cliffs, rocks and slabs, Ozone Wall and
# Icicle Buttress among them). `stone` was already one, as a boulder.
CRAG_ROCK = ("cliff", "bare_rock", "rock")
# Keys that mark a climbing feature as a gym or a business rather than rock.
# Washington had 40 such `sport=climbing` features, every one indoors or built.
# Only the widened rules read this list: a feature the original rule takes
# (`sport=climbing` with a subtype) stays a crag even when, say, `tourism`
# marks it as an attraction.
NOT_OUTDOOR = ("leisure", "building", "shop", "club", "amenity", "tourism")

_OUTDOOR = "".join(f'[!"{key}"]' for key in NOT_OUTDOOR)

# The selectors, without a spatial filter: `query.py` puts the polygon in
# front of each semicolon.
#
# Peaks are nodes only: the vast majority of OSM peaks are nodes, and node-only
# clauses are much faster on the public API. natural=volcano is in because OSM
# tags volcanic summits as volcano INSTEAD of peak; without it Baker, Rainier,
# Glacier Peak, Adams and St. Helens are invisible to a Cascades search.
#
# A crag is `sport=climbing` with `climbing=crag`, `area` or `boulder`, or a
# climbable stone with no `climbing=` key. Bare `sport=climbing` also tags
# every route: over 47.0 to 48.0 N, 121.8 to 120.8 W on 2026-10-15 it found 183
# named features, of which 82 were crags, 22 areas and 4 boulders, and 67 routes
# and 5 route bottoms. So the widened rules (#760) take a bare `sport=climbing`
# only on natural rock or on a climbing site, and a subtype alone only when
# nothing marks the feature as indoors: Hag Crag carries `climbing=crag` and no
# sport, K Cliff and Ozone are `type=site` relations with `sport=climbing`.
CLAUSES: dict[str, tuple[str, ...]] = {
    PEAK: (
        'node["natural"="peak"]["name"];',
        'node["natural"="volcano"]["name"];',
    ),
    TRAILHEAD: (
        'node["highway"="trailhead"]["name"];',
        'way["highway"="trailhead"]["name"];',
        f'nwr["amenity"="parking"]["name"~"{TRAILHEAD_LOT_NAME}"];',
    ),
    LAKE: ('nwr["natural"="water"]["water"="lake"]["name"];',),
    CRAG: (
        'nwr["sport"="climbing"]["climbing"~"^(crag|area|boulder)$"]["name"];',
        'node["natural"="stone"]["sport"="climbing"][!"climbing"]["name"];',
        'way["natural"="stone"]["sport"="climbing"][!"climbing"]["name"];',
        f'nwr["climbing"~"^(crag|area|boulder)$"][!"sport"]["name"]{_OUTDOOR};',
        f'nwr["sport"="climbing"][!"climbing"]["natural"~"^(cliff|bare_rock|rock)$"]["name"]{_OUTDOOR};',
        f'relation["type"="site"]["sport"="climbing"][!"climbing"]["name"]{_OUTDOOR};',
    ),
}

# The same summits without the name filter, for callers that opt in. A
# different question with a different cost: over one 8x10 km box in the Alpine
# Lakes, 7 peaks are named and 13 are not. `ele` is required because an unnamed
# summit with no elevation has nothing to call itself.
UNNAMED_PEAK_CLAUSES: tuple[str, ...] = (
    'node["natural"="peak"]["ele"][!"name"];',
    'node["natural"="volcano"]["ele"][!"name"];',
)


def classify(element: str, tags: Mapping[str, str]) -> tuple[str, bool] | None:
    """(kind, named) for an element the clauses above select, else None.

    `element` is "node", "way" or "relation". Named is False only for an
    unnamed summit with an elevation, which the app keeps for
    `include_unnamed_peaks` and names for its height. The checks run in the
    order a feature carrying two kinds' tags resolves: a summit before a
    trailhead before a lake before a crag.
    """
    name = tags.get("name")
    natural = tags.get("natural")
    if element == "node" and natural in ("peak", "volcano"):
        if name:
            return PEAK, True
        return (PEAK, False) if tags.get("ele") else None
    if not name:
        return None
    if tags.get("highway") == "trailhead" and element in ("node", "way"):
        return TRAILHEAD, True
    if tags.get("amenity") == "parking" and _TRAILHEAD_LOT.search(name):
        return TRAILHEAD, True
    if natural == "water" and tags.get("water") == "lake":
        return LAKE, True
    sport = tags.get("sport")
    climbing = tags.get("climbing")
    if sport == "climbing" and climbing in CRAG_SUBTYPES:
        return CRAG, True
    if sport == "climbing" and climbing is None and natural == "stone" and element in ("node", "way"):
        return CRAG, True
    if any(key in tags for key in NOT_OUTDOOR):
        return None
    if climbing in CRAG_SUBTYPES and sport is None:
        return CRAG, True
    if sport == "climbing" and climbing is None and natural in CRAG_ROCK:
        return CRAG, True
    if sport == "climbing" and climbing is None and element == "relation" and tags.get("type") == "site":
        return CRAG, True
    return None


def preference(tags: Mapping[str, str]) -> int:
    """Which of two same-named neighbours stands for both: the lower wins.

    Places of one kind and name within `MERGE_RADIUS_M` are one place (#760),
    and the specific feature beats the general one: in Washington 70 of the
    105 doubled trailheads were a `highway=trailhead` node beside the parking
    lot named for it, and the node is where the trail starts. Ties fall to the
    element type and then the id, which the readers order themselves.
    """
    return 0 if tags.get("highway") == "trailhead" or tags.get("amenity") != "parking" else 1


# The tie-break after `preference`: a node marks a point someone placed, where
# a way's or relation's centre is computed from its outline.
ELEMENT_ORDER = {"node": 0, "way": 1, "relation": 2}

# Places of one kind and one name closer than this are one place (#760, the
# maintainer's call on 2026-10-18). Measured over Washington's extract that
# day: 105 same-named trailhead pairs stood within it (the farthest 269 m) and
# the next nearest at 342 m; peaks 5 within (52 m) and the next at 344 m.
# Lakes have no such gap, 40 pairs within and 88 between 300 m and 2 km, since
# a lake mapped in parts and two lakes sharing a name look alike from their
# centres.
MERGE_RADIUS_M = 300.0


def ele_ft(tags: Mapping[str, str]) -> float | None:
    """Feet from an OSM `ele` tag (metres), or None if absent or unparseable.

    Shared by every reader so none of them disagrees about what an elevation
    read off OSM means.
    """
    ele = tags.get("ele")
    if not ele:
        return None
    try:
        metres = float(ele)
    except (ValueError, TypeError):
        return None
    # `float` reads "nan" and "inf", which the browser's Number.isFinite
    # refuses, and an unnamed peak is named by rounding its feet to an integer,
    # which raises on either. `errors.finite_float` says the same, but this
    # module stays standard library only for the fill image.
    return round(metres * 3.28084, 0) if math.isfinite(metres) else None


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle metres between two points (haversine on a 6,371 km sphere)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_000.0 * math.asin(math.sqrt(a))


def merge_neighbours[T: Mapping[str, Any]](
    rows: Sequence[T], order: Sequence[tuple[Any, ...]], mergeable: Sequence[bool]
) -> list[T]:
    """The rows with same-kind, same-name neighbours within MERGE_RADIUS_M made one.

    `order` ranks each row (lower stands for the group: `preference`, then
    whatever the caller breaks ties on); `mergeable` is False for a row whose
    name the app made up, an unnamed summit's `Peak 5961`, since two of those
    are two summits. A row is dropped only when it lies within the radius of a
    row already kept, so two far-apart places that share a name both stay
    however many of them a ring holds. The kept rows keep their input order.
    """
    groups: dict[tuple[Any, Any], list[int]] = {}
    for i, row in enumerate(rows):
        if mergeable[i]:
            groups.setdefault((row["type"], row["name"]), []).append(i)
    dropped: set[int] = set()
    for members in groups.values():
        if len(members) < 2:
            continue
        kept: list[int] = []
        for i in sorted(members, key=lambda i: order[i]):
            r = rows[i]
            if any(
                _distance_m(r["latitude"], r["longitude"], rows[k]["latitude"], rows[k]["longitude"])
                <= MERGE_RADIUS_M
                for k in kept
            ):
                dropped.add(i)
            else:
                kept.append(i)
    return [row for i, row in enumerate(rows) if i not in dropped]


# --- Where a place stands -------------------------------------------------------

Box = tuple[float, float, float, float]  # min lon, min lat, max lon, max lat
# osm_type, osm_id, kind, name, ele_ft, rank, lon, lat: one places row.
Row = tuple[str, int, str, str | None, float | None, int, float, float]


def extend(box: Box | None, lon: float, lat: float) -> Box:
    if box is None:
        return (lon, lat, lon, lat)
    return (min(box[0], lon), min(box[1], lat), max(box[2], lon), max(box[3], lat))


def union(a: Box | None, b: Box | None) -> Box | None:
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def centre(box: Box) -> tuple[float, float]:
    """The middle of a bounding box, which is Overpass's `out center`."""
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def relation_boxes(
    members: Mapping[int, Sequence[tuple[str, int]]],
    node_at: Callable[[int], tuple[float, float] | None],
    way_boxes: Mapping[int, Box],
) -> dict[int, Box]:
    """Every relation's bounding box: its own points, else the relations it holds.

    `members` maps a relation id to its (type, ref) members, the type being
    "n", "w" or "r". A relation with member nodes or ways is boxed around
    those alone, which is where Overpass's `out center` puts it. Only a
    relation with neither, a climbing area made only of other areas
    (Leavenworth, the Inner Walls at Index; 27 in Washington), is boxed
    around the relations it holds, each boxed by this same rule, since
    Overpass gives it no position at all. Both are the maintainer's calls
    (2026-10-18): the second placed those 27, and the first kept the 21
    areas that hold both points and areas where Overpass has them, where
    boxing everything moved 20 of them by up to 1.24 km (Boston Basin).

    Depth-first with an explicit stack, because a mapper can build a chain
    deeper than Python's recursion limit. A cycle is cut where it closes. A
    relation with no geometry anywhere below it is left out.
    """
    done: dict[int, Box | None] = {}
    for rel, items in members.items():
        own: Box | None = None
        for kind, ref in items:
            if kind == "n":
                point = node_at(ref)
                if point is not None:
                    own = extend(own, *point)
            elif kind == "w":
                own = union(own, way_boxes.get(ref))
        if own is not None:
            done[rel] = own
    for root in members:
        if root in done:
            continue
        acc: dict[int, Box | None] = {root: None}
        stack: list[tuple[int, Iterator[tuple[str, int]]]] = [(root, iter(members[root]))]
        while stack:
            rel, pending = stack[-1]
            for kind, ref in pending:
                if kind != "r":
                    continue
                if ref in done:
                    acc[rel] = union(acc[rel], done[ref])
                elif ref in members and ref not in acc:
                    acc[ref] = None
                    stack.append((ref, iter(members[ref])))
                    break
            else:
                stack.pop()
                done[rel] = acc.pop(rel)
                if stack:
                    parent = stack[-1][0]
                    acc[parent] = union(acc[parent], done[rel])
    return {rel: box for rel, box in done.items() if box is not None}


def place_row(element: str, osm_id: int, tags: Mapping[str, str], point: tuple[float, float]) -> Row | None:
    """The places row for an element the rules keep, at (lon, lat), else None."""
    kept = classify(element, tags)
    if kept is None:
        return None
    kind, named = kept
    return (
        element,
        osm_id,
        kind,
        tags.get("name") if named else None,
        ele_ft(tags),
        preference(tags),
        *point,
    )


# --- OpenStreetMap's daily change files ----------------------------------------


def parse_state(text: str) -> tuple[int, datetime]:
    """(sequenceNumber, timestamp) from a replication state.txt, or ValueError.

    The file is Java properties, so the timestamp's colons arrive escaped
    (`2026-10-18T00\\:00\\:00Z`).
    """
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = re.sub(r"\\(.)", r"\1", value.strip())
    try:
        return int(values["sequenceNumber"]), parse_timestamp(values["timestamp"])
    except (KeyError, ValueError) as exc:
        raise ValueError(f"unreadable replication state ({exc}): {text[:200]!r}") from exc


def parse_timestamp(value: str) -> datetime:
    """An ISO 8601 instant with its zone, in UTC; ValueError without a zone."""
    stamp = datetime.fromisoformat(value.strip())
    if stamp.tzinfo is None:
        raise ValueError(f"timestamp without a zone: {value!r}")
    return stamp.astimezone(UTC)


def change_path(sequence: int) -> str:
    """A change file's path under the replication URL: 4567 is `000/004/567.osc.gz`."""
    digits = f"{sequence:09d}"
    return f"{digits[0:3]}/{digits[3:6]}/{digits[6:9]}.osc.gz"
