"""The Overpass query: which clauses each destination type adds, and how a returned element is read.

Apart from the mirror chain because it is pure text in and rows out, with no
network, and both discovery and enrichment read an element's elevation the
same way through it.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.models import DestinationType, GeoPolygon
from app.services.osm import rules

# The Overpass clauses each destination type contributes, as *fragments*
# rather than whole queries, because an analysis can ask for several types at
# once and the union has to be one request: Overpass is a donated public API
# and the query is the slowest step of an analysis, so three checked boxes must
# cost one request rather than three. Overpass unions natively, `( … );`, so
# combining types is concatenating their clauses.
#
# The selectors themselves are `rules.CLAUSES`, the one definition the planet
# fill and the daily update read too (#760), so a deployment without the
# shared cache asks Overpass for exactly what the cache holds. This path is
# that deployment's, and the cache's while it is filling.
_CLAUSES: dict[DestinationType, tuple[str, ...]] = {
    DestinationType(kind): clauses for kind, clauses in rules.CLAUSES.items()
}
_UNNAMED_PEAK_CLAUSES: tuple[str, ...] = rules.UNNAMED_PEAK_CLAUSES

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
out center;
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
    return _QUERY.format(clauses="\n".join(clauses))


# Which type a returned element actually is, and whether it is named. A
# single-type query could assume the answer from the request; a union cannot,
# and the row's type decides its badge and where its name links. None for an
# element no clause asked for, which a tagging change upstream could hand back.
def _classify(element_type: str, tags: dict[str, Any]) -> tuple[str, bool] | None:
    return rules.classify(element_type, tags)


# Public because GET /api/capabilities publishes it: DestinationType carries
# every type the API models, but only these are actually discoverable via
# Overpass, and a caller has no other way to tell the difference.
IMPLEMENTED_TYPES = {
    DestinationType.peak,
    DestinationType.trailhead,
    DestinationType.lake,
    DestinationType.crag,
}


def check_implemented(types: Sequence[DestinationType]) -> None:
    """Refuse a type discovery does not carry, the same way on either path."""
    for t in types:
        if t not in IMPLEMENTED_TYPES:
            raise NotImplementedError(f"Destination type '{t.value}' is not yet implemented.")


def _polygon_to_overpass(polygon: GeoPolygon) -> str:
    # GeoJSON coordinates are [lon, lat]; Overpass expects "lat lon lat lon ..."
    coords = polygon.coordinates[0]
    return " ".join(f"{lat} {lon}" for lon, lat in coords)


_ele_ft = rules.ele_ft
