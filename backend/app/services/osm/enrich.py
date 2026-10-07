"""Elevation and OSM identity for caller-supplied destinations.

Apart from discovery because it asks Overpass a different question (the peak
nearest each pasted point) and degrades to the rows as sent rather than failing.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any

from app import ratelimit
from app.services import cache
from app.services.errors import UpstreamError
from app.services.osm import mirrors
from app.services.osm.query import SERVER_TIMEOUT_TOKEN, _ele_ft

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

# How long one lookup may wait on the mirror chain before the rows go on
# without it. A pasted list or a clicked peak waits on this before any forecast
# is fetched, and the elevation it buys is an optional column. Measured
# 2026-09-30 (#545): the primary answers a healthy query in under 5s about half
# the time and says "too busy" only after 8-16s, so 8s kept the fast answers
# and dropped the wait on a busy server, which used to reach a minute. Since
# #673 no row waits on this lookup (the report lands when the forecasts do and
# takes the answer when it comes), so the deadline bounds how long a row's
# elevation cells tick rather than how long the reader waits for any row, and
# 24s gives each of the two mirrors (#655) the 12s a busy one measured at
# (15.3s, 11.4s and 9s on 2026-10-06) rather than a slice neither met.
ENRICH_DEADLINE_S = 24.0


def _attempt_timeout_s() -> float:
    """Each mirror's slice of the lookup's deadline: equal shares, one per mirror.

    The deadline is shorter than one mirror's own 25 s timeout, so without a
    slice it fired inside the first attempt and the backup was never asked
    (#655, measured 2026-10-06: a busy primary blanked every pasted list for
    over an hour). With two mirrors this is 4 s each. The primary's 4 s keeps
    the half of its healthy answers that land under 5 s (#545). The backup's
    4 s is NOT measured: on 2026-10-06 it sent nothing back inside 8 s in three
    tries, and no figure supports any other number either. The `path` label on
    the Overpass metrics is what will retune both: the `enrichment` series give
    each mirror's success rate inside its slice and its latency when it answers.

    Read at call time rather than bound at import, so the slices follow the
    deadline and the mirror table wherever either is set. The deadline stays
    the ceiling around the whole chain: a wait for a mirror's slot is outside
    any slice, and the last attempt usually ends on the ceiling rather than on
    its own slice.
    """
    return ENRICH_DEADLINE_S / len(mirrors.OVERPASS_MIRRORS)

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
        query = f"[out:json][timeout:{SERVER_TIMEOUT_TOKEN}];\n(\n{clauses});\nout;\n"
        log.trace("Overpass enrichment query:\n%s", query)  # type: ignore[attr-defined]
        # Per request rather than per list: the measurement behind the deadline
        # is how long one query takes, and a list long enough to split is rare.
        async with asyncio.timeout(ENRICH_DEADLINE_S):
            data = await mirrors._post_with_fallback(
                query, path="enrichment", attempt_timeout_s=_attempt_timeout_s()
            )

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
    rows, _complete = await enrich_custom_reporting(destinations)
    return rows


async def enrich_custom_reporting(
    destinations: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    """`enrich_custom`, and whether the lookup finished.

    A row the lookup could not place and a row the lookup never reached look
    the same in the rows alone: a null elevation. The flag tells them apart
    for a caller that asks again later only when asking again can help (#673):
    True when every row sent without an elevation was looked up, matched or
    not, and False when the lookup gave up or failed and those rows came back
    as sent.
    """
    pending = [d for d in destinations if d.get("elevation_ft") is None]
    if not pending:
        return [dict(d) for d in destinations], True

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
            return [dict(d) for d in destinations], False
        except TimeoutError:
            # Only the deadline raises this here (httpx's own timeouts are a
            # different class and end in UpstreamError above), and a busy
            # donated server is not a bug, so it degrades the same quiet way.
            log.warning(
                "Custom destination elevation lookup gave up after %.0fs",
                ENRICH_DEADLINE_S,
            )
            return [dict(d) for d in destinations], False
        except Exception:
            # Not an upstream problem, so it is a bug here. Still not fatal —
            # an optional column must not take an analysis down — but logged
            # with a traceback so it cannot hide behind the quiet path above.
            log.exception("Custom destination elevation lookup failed unexpectedly")
            return [dict(d) for d in destinations], False
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
    return enriched, True
