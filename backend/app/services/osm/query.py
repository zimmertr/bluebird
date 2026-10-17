"""The Overpass query: which clauses each destination type adds, and how a returned element is read.

Apart from the mirror chain because it is pure text in and rows out, with no
network, and both discovery and enrichment read an element's elevation the
same way through it.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from app.models import DestinationType, GeoPolygon

# The Overpass clauses each destination type contributes, as *fragments*
# rather than whole queries, because an analysis can now ask for several types
# at once and the union has to be one request.
#
# That is the whole reason for the shape: Overpass is a donated public API and
# the query is the slowest step of an analysis, so three checked boxes must
# cost one request rather than three. Overpass unions natively — `( … );` — so
# combining types is concatenating their clauses.
#
# Each clause is the tag selector alone, with no spatial filter: `_build_query`
# appends the polygon, and `build_world_query` appends nothing, because the
# worldwide snapshot behind `GET /api/landmarks` (#734) asks for every named
# trailhead and crag there is. One list of selectors, so the map's markers and a
# polygon search cannot disagree about what a crag is.
#
# Peaks are nodes only: the vast majority of OSM peaks are nodes, and node-only
# clauses are significantly faster on the public API. natural=volcano is in
# because OSM tags volcanic summits as volcano INSTEAD of peak — without it,
# Baker, Rainier, Glacier Peak, Adams and St. Helens are all invisible to a
# Cascades search.
# Overpass regexes are POSIX extended and `re` is Python's; this pattern means
# the same in both. English only on purpose: mappers elsewhere use the tag.
_TRAILHEAD_LOT_NAME = r"[Tt]rail ?[Hh]ead"

_CLAUSES: dict[DestinationType, tuple[str, ...]] = {
    DestinationType.peak: (
        'node["natural"="peak"]["name"];',
        'node["natural"="volcano"]["name"];',
    ),
    # A trailhead is the tag, or a named parking lot whose name says so: much
    # of the US maps the lot and never adds the node (Issaquah, 2026-10-17: 2
    # of 14 named trailheads were `highway=trailhead`, Poo Poo Trailhead among
    # the parking lots), and the name pattern is cheap (3,540 worldwide, the
    # count measured at 66 s). The pattern is spelled once, in
    # `_TRAILHEAD_LOT_NAME`, so `_classify` reads the same words.
    DestinationType.trailhead: (
        'node["highway"="trailhead"]["name"];',
        'way["highway"="trailhead"]["name"];',
        f'node["amenity"="parking"]["name"~"{_TRAILHEAD_LOT_NAME}"];',
        f'way["amenity"="parking"]["name"~"{_TRAILHEAD_LOT_NAME}"];',
        f'relation["amenity"="parking"]["name"~"{_TRAILHEAD_LOT_NAME}"];',
    ),
    DestinationType.lake: (
        'node["natural"="water"]["water"="lake"]["name"];',
        'way["natural"="water"]["water"="lake"]["name"];',
        'relation["natural"="water"]["water"="lake"]["name"];',
    ),
    # A crag is `sport=climbing` with `climbing=crag`, `area` or `boulder`, or
    # a climbable stone with no `climbing=` key at all, and nothing wider. Bare
    # `sport=climbing` also tags every route: measured 2026-10-15 over 47.0 to
    # 48.0 N, 121.8 to 120.8 W, it found 183 named features, of which 82 were
    # crags, 22 areas and 4 boulders, and 67 routes and 5 route bottoms would
    # each have become a row. Areas stay in because some places are mapped
    # only as one (Index is an area holding Lower Town Wall). Boulders are in
    # because the maintainer wants them as destinations, however many a
    # boulder field adds (2026-10-15). A boulder is as often a
    # `natural=stone` with `sport=climbing` and no subtype (Midnite Boulder at
    # Index), which the last two clauses take; `[!"climbing"]` keeps a stone
    # tagged as a route out. All three element kinds for the subtyped
    # clauses, because the 104 crags and areas in that box were 45 nodes, 9
    # ways and 50 relations; a stone is a node or, rarely, a way.
    DestinationType.crag: (
        'node["sport"="climbing"]["climbing"~"^(crag|area|boulder)$"]["name"];',
        'way["sport"="climbing"]["climbing"~"^(crag|area|boulder)$"]["name"];',
        'relation["sport"="climbing"]["climbing"~"^(crag|area|boulder)$"]["name"];',
        'node["natural"="stone"]["sport"="climbing"][!"climbing"]["name"];',
        'way["natural"="stone"]["sport"="climbing"][!"climbing"]["name"];',
    ),
}

# The same summits without the name filter, for callers that opt in. Kept apart
# from the clauses above rather than folded into them because this is a
# different question with a different cost: measured over one 8x10 km box in
# the Alpine Lakes, 7 peaks are named and 13 are not, so asking for both roughly
# triples the candidate count — and every candidate is a weighted Open-Meteo
# call and a step closer to the analysis cap. `["ele"]` is required because an
# unnamed summit with no elevation has nothing to call itself.
_UNNAMED_PEAK_CLAUSES: tuple[str, ...] = (
    'node["natural"="peak"]["ele"];',
    'node["natural"="volcano"]["ele"];',
)

# Stands where a query's server timeout goes. The number belongs to the mirror
# that sends the query, not to the query, so the mirror chain fills it in per
# attempt (osm/mirrors.py) and the server gives up when the pod does. No braces,
# so it survives the str.format that builds _QUERY below.
SERVER_TIMEOUT_TOKEN = "__SERVER_TIMEOUT_S__"

# `out center` for every query, where peaks alone used to use bare `out`. It is
# the same output for a node — Overpass only adds a center to ways and
# relations — so one form serves a union that may contain all three.
_QUERY = (
    f"[out:json][timeout:{SERVER_TIMEOUT_TOKEN}];\n"
    """\
(
{clauses}
);
out {out};
"""
)


def _inside(clause: str, poly_str: str) -> str:
    """The selector with the polygon filter in front of its semicolon."""
    return f'{clause[:-1]}(poly:"{poly_str}");'


def _build_query(
    types: Sequence[DestinationType], poly_str: str, include_unnamed_peaks: bool = False
) -> str:
    """One Overpass document covering every requested type."""
    clauses = [
        "  " + _inside(clause, poly_str)
        # Sorted so the same set of types always produces the same query text,
        # which is what lets the cache key below be order-independent.
        for t in sorted(types, key=lambda t: t.value)
        for clause in _CLAUSES[t]
    ]
    if include_unnamed_peaks and DestinationType.peak in types:
        clauses += ["  " + _inside(c, poly_str) for c in _UNNAMED_PEAK_CLAUSES]
    return _QUERY.format(clauses="\n".join(clauses), out="center")


def build_world_query(destination_type: DestinationType) -> str:
    """Every named feature of one type, worldwide, for the landmark snapshot (#734).

    No spatial filter, and `out tags center` rather than `out center`: the
    members of 6,400 crag relations were most of a 9.0 MB answer that `tags`
    cuts to the id, the tags and the centre, which is all the snapshot keeps
    (measured 2026-10-16: 7.4 MB for every trailhead and crag together).
    """
    clauses = ["  " + clause for clause in _CLAUSES[destination_type]]
    return _QUERY.format(clauses="\n".join(clauses), out="tags center")


# Which type a returned element actually is. A single-type query could assume
# the answer from the request; a union cannot, and the row's type decides its
# badge and where its name links. Read from the same tags the
# clauses above match on, so the two cannot disagree.
def _classify(tags: dict[str, Any]) -> str:
    natural = tags.get("natural")
    if natural in ("peak", "volcano"):
        return DestinationType.peak.value
    if tags.get("highway") == "trailhead":
        return DestinationType.trailhead.value
    if tags.get("amenity") == "parking" and re.search(_TRAILHEAD_LOT_NAME, tags.get("name") or ""):
        return DestinationType.trailhead.value
    if natural == "water" and tags.get("water") == "lake":
        return DestinationType.lake.value
    if tags.get("sport") == "climbing":
        climbing = tags.get("climbing")
        if climbing in ("crag", "area", "boulder") or (climbing is None and natural == "stone"):
            return DestinationType.crag.value
    # Unreachable for anything the clauses asked for, but a tagging change
    # upstream should degrade to an unbadged row rather than raise.
    return DestinationType.custom.value

# Public because GET /api/capabilities publishes it: DestinationType carries
# every type the API models, but only these are actually discoverable via
# Overpass, and a caller has no other way to tell the difference.
IMPLEMENTED_TYPES = {
    DestinationType.peak,
    DestinationType.trailhead,
    DestinationType.lake,
    DestinationType.crag,
}


def _polygon_to_overpass(polygon: GeoPolygon) -> str:
    # GeoJSON coordinates are [lon, lat]; Overpass expects "lat lon lat lon ..."
    coords = polygon.coordinates[0]
    return " ".join(f"{lat} {lon}" for lon, lat in coords)


def _ele_ft(tags: dict[str, Any]) -> float | None:
    """Feet from an OSM ``ele`` tag (metres), or None if absent or unparseable.

    Shared by discovery and custom-list enrichment so the two cannot disagree
    about what an elevation read off OSM means.
    """
    ele = tags.get("ele")
    if not ele:
        return None
    try:
        return round(float(ele) * 3.28084, 0)
    except (ValueError, TypeError):
        return None
