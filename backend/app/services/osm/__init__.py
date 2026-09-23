"""Overpass: discovery, the mirror chain, and custom-destination enrichment.

The three live in ``query``, ``mirrors`` and ``enrich`` beside this file, and
this file re-exports them so ``osm.X`` keeps working for a reader. A test that
replaces a name patches the module that reads it: the mirror table and
``_post_with_fallback`` are read inside ``mirrors``, which is also where
``enrich`` reaches them, so ``osm.mirrors`` is the one place to patch either.
"""

from __future__ import annotations

from app.services.osm.enrich import (
    _EARTH_RADIUS_M,
    CUSTOM_ENRICH_CHUNK,
    CUSTOM_MATCH_RADIUS_M,
    _distance_m,
    _lookup_peaks,
    _point_key,
    enrich_custom,
)
from app.services.osm.mirrors import (
    OVERPASS_MIRRORS,
    PROVIDER,
    OverpassMirror,
    StatusCallback,
    _attempt_outcome,
    _post_with_fallback,
    query_osm,
)
from app.services.osm.query import (
    _CLAUSES,
    _QUERY,
    _UNNAMED_PEAK_CLAUSES,
    IMPLEMENTED_TYPES,
    _build_query,
    _classify,
    _ele_ft,
    _polygon_to_overpass,
)

__all__ = [
    "PROVIDER",
    "StatusCallback",
    "OverpassMirror",
    "OVERPASS_MIRRORS",
    "_CLAUSES",
    "_UNNAMED_PEAK_CLAUSES",
    "_QUERY",
    "_build_query",
    "_classify",
    "IMPLEMENTED_TYPES",
    "_polygon_to_overpass",
    "_ele_ft",
    "query_osm",
    "CUSTOM_MATCH_RADIUS_M",
    "CUSTOM_ENRICH_CHUNK",
    "_EARTH_RADIUS_M",
    "_point_key",
    "_distance_m",
    "_lookup_peaks",
    "enrich_custom",
    "_attempt_outcome",
    "_post_with_fallback",
]
