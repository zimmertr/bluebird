"""Elevation and OSM identity for caller-supplied destinations.

Apart from discovery because it asks Overpass a different question (the peak
nearest each pasted point) and degrades to the rows as sent rather than failing.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from app import ratelimit
from app.services import cache
from app.services.errors import UpstreamError
from app.services.osm import mirrors
from app.services.osm.query import _ele_ft

# The service's one logger name, kept across the split so a log query written
# against it still matches every line.
log = logging.getLogger("app.services.osm")


# A custom destination arrives as a bare coordinate, so there is no OSM
# element to read an `ele` tag off the way discovery has. Resolving the point
# to the peak standing on it is what gives a pasted list the same elevation
# the other two ingest paths get for free: Nominatim's extratags for a
# searched place, the discovery query's own tags for a polygon row.
#
# 150 m, measured 2026-07-30 against the bundled 100-peak Smoot list: 97/100
# matched, every match was the intended peak by name (including the "Mix-up
# Peak" spelling variant), and every matched node carried `ele`. 50 m lost
# four more to no-match; 300 m bought one more at the cost of reaching further
# for it. Re-measure before changing.
CUSTOM_MATCH_RADIUS_M = 150.0

# One Overpass request per this many points. A realistic list is a single
# query (the bundled examples are 100 rows each); only a list approaching the
# analysis cap splits, and those chunks run in sequence rather than racing
# each other for the same 2-slot mirror budget.
CUSTOM_ENRICH_CHUNK = 500

_EARTH_RADIUS_M = 6_371_000.0


def _point_key(lat: float, lon: float) -> str:
    """~1 m identity for a coordinate, matching the frontend's ``geoKey``."""
    return f"{lat:.5f},{lon:.5f}"


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle metres between two coordinates."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


async def _lookup_peaks(points: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """The nearest peak node within the match radius of each point.

    Keyed by the point's own coordinate key, so a caller looks its answer up
    by where it asked rather than by position in a list.
    """
    matches: dict[str, dict[str, Any]] = {}
    for start in range(0, len(points), CUSTOM_ENRICH_CHUNK):
        chunk = points[start : start + CUSTOM_ENRICH_CHUNK]
        # natural=volcano is unioned in for the same reason the peaks
        # discovery query does it: OSM tags volcanic summits as volcano
        # INSTEAD of peak, so Rainier, Baker and Adams are invisible without it.
        clauses = "".join(
            f"  node(around:{CUSTOM_MATCH_RADIUS_M:.0f},"
            f'{d["latitude"]:.6f},{d["longitude"]:.6f})'
            '["natural"~"^(peak|volcano)$"];\n'
            for d in chunk
        )
        query = f"[out:json][timeout:60];\n(\n{clauses});\nout;\n"
        log.trace("Overpass enrichment query:\n%s", query)  # type: ignore[attr-defined]
        data = await mirrors._post_with_fallback(query)

        # Overpass returns the union of every around clause, deduplicated, so
        # the nearest node per point has to be picked back out here.
        nodes = [
            e
            for e in data.get("elements", [])
            if e.get("type") == "node"
            and e.get("lat") is not None
            and e.get("lon") is not None
        ]
        for d in chunk:
            best: dict[str, Any] | None = None
            best_m = math.inf
            for node in nodes:
                dist = _distance_m(
                    d["latitude"], d["longitude"], node["lat"], node["lon"]
                )
                if dist <= CUSTOM_MATCH_RADIUS_M and dist < best_m:
                    best, best_m = node, dist
            if best is None:
                continue
            matches[_point_key(d["latitude"], d["longitude"])] = {
                "elevation_ft": _ele_ft(best.get("tags", {})),
                "osm_id": f"node/{best['id']}",
            }
    return matches


async def enrich_custom(destinations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Resolve elevation and OSM identity for caller-supplied destinations.

    Returns a new list; the rows passed in are never mutated. Only rows whose
    elevation is unknown are looked up — a searched place already carries
    Nominatim's answer, and a caller who sent an explicit ``elevation_ft``
    outranks anything a coordinate match could infer.

    Best-effort in the same sense air quality is: every failure path returns
    the rows unchanged. An elevation nobody could resolve is the status quo
    (a blank column), whereas raising would fail an entire analysis over a
    column that is not what was asked for.
    """
    pending = [d for d in destinations if d.get("elevation_ft") is None]
    if not pending:
        return [dict(d) for d in destinations]

    cache_key = cache.custom_enrich_key(
        [(d["latitude"], d["longitude"]) for d in pending]
    )
    matches = cache.ENRICH_CACHE.get(cache_key)
    if matches is None:
        log.info("Resolving elevation for %d custom destination(s) via OSM", len(pending))
        try:
            matches = await _lookup_peaks(pending)
        except (UpstreamError, ratelimit.BudgetExhausted) as exc:
            # Ordinary weather for a donated upstream. Degrade quietly: the
            # rows come back exactly as sent, which is what they looked like
            # before any of this existed.
            log.warning("Custom destination elevation lookup unavailable: %s", exc)
            return [dict(d) for d in destinations]
        except Exception:
            # Not an upstream problem, so it is a bug here. Still not fatal —
            # an optional column must not take an analysis down — but logged
            # with a traceback so it cannot hide behind the quiet path above.
            log.exception("Custom destination elevation lookup failed unexpectedly")
            return [dict(d) for d in destinations]
        # No deep copy, unlike DISCOVERY_CACHE: the matches are read into
        # freshly built rows below and never handed to a caller, so there is
        # nothing shared for a caller to mutate.
        cache.ENRICH_CACHE.put(cache_key, matches)
        log.info("OSM resolved %d of %d custom destination(s)", len(matches), len(pending))

    enriched: list[dict[str, Any]] = []
    for d in destinations:
        row = dict(d)
        match = (
            matches.get(_point_key(d["latitude"], d["longitude"]))
            if d.get("elevation_ft") is None
            else None
        )
        if match is not None:
            # A matched node with no `ele` tag still yields identity: the row
            # keeps its null elevation but gains the OSM id.
            row["elevation_ft"] = match["elevation_ft"]
            row["osm_id"] = row.get("osm_id") or match["osm_id"]
        enriched.append(row)
    return enriched
