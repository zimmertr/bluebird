from __future__ import annotations

import copy
import logging
import math
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any

import httpx

from app import ratelimit
from app.models import DestinationType, GeoPolygon
from app.services import cache
from app.services.errors import PartialResultError, UpstreamError, classify_http_error

log = logging.getLogger(__name__)

PROVIDER = "OpenStreetMap (Overpass)"

# Called with a user-facing detail line when the chain falls over to a backup
# mirror. Overpass is a single opaque request per mirror, so failover is the
# only progress signal available for the search phase.
StatusCallback = Callable[[str], Awaitable[None]]


@dataclass(frozen=True)
class OverpassMirror:
    """One public Overpass endpoint and the per-mirror beliefs that go with it.

    Order, timeout, and concurrency cap live together on purpose: issue #177
    traced a 30s-per-analysis tax to these beliefs drifting apart from the
    endpoint list they described.
    """

    url: str
    # Per-request timeout. The primary gets a tight leash (it is fast or it is
    # broken); fallbacks get a generous one (by the time one is tried, a slow
    # answer beats no answer, and the overlay is narrating the wait).
    timeout_s: float
    # Pod-wide cap on in-flight calls to THIS mirror. Limits are per operator,
    # not per provider: overpass-api.de documents ~2 slots per IP, and the
    # other mirrors are separate operators with separate capacity.
    budget: ratelimit.UpstreamBudget


# Measured 2026-07-28 (issue #177): single sequential requests, the exact peaks
# query, over an 18,700 km2 Cascades polygon. Re-measure before reordering;
# #77's per-provider latency telemetry is the durable fix for this comment
# rotting silently, and should retune the timeouts when it lands.
#
#   overpass-api.de  12.0 / 15.0 / 17.4s -> 200   primary: ~1.5x observed p95
#   maps.mail.ru     38.8s -> 200                  fallback: slow but real
#   kumi.systems     77-108s, sometimes 504        hail-mary: last resort
#
# kumi previously sat FIRST on the belief that overpass-api.de was the
# overloaded one. At 77-108s against a 30s client timeout it could never
# succeed, so every polygon analysis paid the full timeout as a fixed tax.
OVERPASS_MIRRORS = [
    OverpassMirror(
        url="https://overpass-api.de/api/interpreter",
        timeout_s=25.0,
        budget=ratelimit.UpstreamBudget(
            "OpenStreetMap (overpass-api.de)", ratelimit.UPSTREAM_CONCURRENCY_OVERPASS
        ),
    ),
    OverpassMirror(
        url="https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        timeout_s=45.0,
        budget=ratelimit.UpstreamBudget(
            "OpenStreetMap (maps.mail.ru)", ratelimit.UPSTREAM_CONCURRENCY_OVERPASS
        ),
    ),
    OverpassMirror(
        url="https://overpass.kumi.systems/api/interpreter",
        timeout_s=45.0,
        budget=ratelimit.UpstreamBudget(
            "OpenStreetMap (kumi.systems)", ratelimit.UPSTREAM_CONCURRENCY_OVERPASS
        ),
    ),
]
HEADERS = {"User-Agent": "Bluebird/1.0 (bluebirdforecast.com; personal weather tool)"}

# The Overpass clauses each destination type contributes, as *fragments*
# rather than whole queries, because an analysis can now ask for several types
# at once and the union has to be one request.
#
# That is the whole reason for the shape: Overpass is a donated public API and
# the query is the slowest step of an analysis, so three checked boxes must
# cost one request rather than three. Overpass unions natively — `( … );` — so
# combining types is concatenating their clauses.
#
# Peaks are nodes only: the vast majority of OSM peaks are nodes, and node-only
# clauses are significantly faster on the public API. natural=volcano is in
# because OSM tags volcanic summits as volcano INSTEAD of peak — without it,
# Baker, Rainier, Glacier Peak, Adams and St. Helens are all invisible to a
# Cascades search.
_CLAUSES: dict[DestinationType, tuple[str, ...]] = {
    DestinationType.peak: (
        'node["natural"="peak"]["name"](poly:"{poly}");',
        'node["natural"="volcano"]["name"](poly:"{poly}");',
    ),
    DestinationType.trailhead: (
        'node["highway"="trailhead"]["name"](poly:"{poly}");',
        'way["highway"="trailhead"]["name"](poly:"{poly}");',
    ),
    DestinationType.lake: (
        'node["natural"="water"]["water"="lake"]["name"](poly:"{poly}");',
        'way["natural"="water"]["water"="lake"]["name"](poly:"{poly}");',
        'relation["natural"="water"]["water"="lake"]["name"](poly:"{poly}");',
    ),
}

# `out center` for every query, where peaks alone used to use bare `out`. It is
# the same output for a node — Overpass only adds a center to ways and
# relations — so one form serves a union that may contain all three.
_QUERY = """\
[out:json][timeout:60];
(
{clauses}
);
out center;
"""


def _build_query(types: Sequence[DestinationType], poly_str: str) -> str:
    """One Overpass document covering every requested type."""
    clauses = [
        "  " + clause.format(poly=poly_str)
        # Sorted so the same set of types always produces the same query text,
        # which is what lets the cache key below be order-independent.
        for t in sorted(types, key=lambda t: t.value)
        for clause in _CLAUSES[t]
    ]
    return _QUERY.format(clauses="\n".join(clauses))


# Which type a returned element actually is. A single-type query could assume
# the answer from the request; a union cannot, and the row's type decides its
# badge and whether it links to Peakbagger. Read from the same tags the
# clauses above match on, so the two cannot disagree.
def _classify(tags: dict[str, Any]) -> str:
    natural = tags.get("natural")
    if natural in ("peak", "volcano"):
        return DestinationType.peak.value
    if tags.get("highway") == "trailhead":
        return DestinationType.trailhead.value
    if natural == "water" and tags.get("water") == "lake":
        return DestinationType.lake.value
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


async def query_osm(
    polygon: GeoPolygon,
    destination_types: Sequence[DestinationType],
    on_status: StatusCallback | None = None,
) -> list[dict[str, Any]]:
    """Return every named destination of the given types inside the polygon.

    One Overpass request however many types are asked for, and every row comes
    back tagged with the type it actually is rather than the type that was
    requested.

    Deliberately uncapped: the ranking is only exact if every candidate gets a
    forecast, so the analysis-size ceiling lives in the route (loud refusal),
    not here (silent truncation).
    """
    # Order never changes the answer, so it must not change the cache key
    # either — a peaks+lakes analysis and a lakes+peaks one are one query.
    types = sorted(set(destination_types), key=lambda t: t.value)
    if not types:
        return []
    for t in types:
        if t not in IMPLEMENTED_TYPES:
            raise NotImplementedError(
                f"Destination type '{t.value}' is not yet implemented."
            )

    # Discovery is cached post-parse for ~10 minutes: the browser flow calls
    # /api/destinations and its server fallback re-runs the identical query
    # seconds later, and repeat Analyze clicks re-run it every minute. Only
    # complete results can land here — a partial (remark) response raises in
    # _post_with_fallback before this point. Hits are DEEP copies: a shallow
    # list copy would share the destination dicts, and the first caller to
    # mutate one in place would silently corrupt every response served from
    # this entry for the rest of its TTL.
    type_key = ",".join(t.value for t in types)
    cache_key = cache.discovery_key(polygon.coordinates[0], type_key)
    cached = cache.DISCOVERY_CACHE.get(cache_key)
    if cached is not None:
        log.info(
            "OSM discovery served from cache: %d destination(s) for types=%s",
            len(cached),
            type_key,
        )
        return copy.deepcopy(cached)

    poly_str = _polygon_to_overpass(polygon)
    query = _build_query(types, poly_str)

    log.info("Querying OSM Overpass for types=%s", type_key)
    log.trace("Overpass query:\n%s", query)  # type: ignore[attr-defined]
    # Budgets are per mirror and acquired per attempt inside the failover
    # chain, so a failover releases mirror A before it queues on mirror B.
    data = await _post_with_fallback(query, on_status)

    results: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name or name in seen_names:
            continue

        if element["type"] == "node":
            lat = element.get("lat")
            lon = element.get("lon")
        else:
            center = element.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")

        if lat is None or lon is None:
            continue

        elevation_ft = _ele_ft(tags)

        seen_names.add(name)
        results.append(
            {
                "name": name,
                # Carried per row rather than applied by the caller: a union
                # response holds several types at once, and this is what the
                # row's badge and its Peakbagger link are chosen from.
                "type": _classify(tags),
                "latitude": lat,
                "longitude": lon,
                "elevation_ft": elevation_ft,
                "osm_id": f"{element['type']}/{element['id']}",
            }
        )
        log.trace("  OSM element: %s (%.4f, %.4f) ele=%s", name, lat, lon, elevation_ft)  # type: ignore[attr-defined]

    log.info("OSM returned %d named destination(s)", len(results))
    # Deep copy on store too: the fresh path returns `results` to its caller,
    # so a shallow-stored entry would share dicts with that caller the same
    # way a shallow hit would.
    cache.DISCOVERY_CACHE.put(cache_key, copy.deepcopy(results))
    return results


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
    """~1 m identity for a coordinate, matching the frontend's ``pinKey``."""
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
        data = await _post_with_fallback(query)

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


async def _post_with_fallback(
    query: str,
    on_status: StatusCallback | None = None,
) -> dict[str, Any]:
    last_exc: Exception = RuntimeError("No Overpass mirrors configured")
    total = len(OVERPASS_MIRRORS)
    # No client-level timeout: each attempt sets its own from the mirror table
    # (httpx would otherwise apply its 5s default to any request that missed one).
    async with httpx.AsyncClient(timeout=None, headers=HEADERS) as client:
        for i, mirror in enumerate(OVERPASS_MIRRORS, start=1):
            # Failover is news the user can act on (the wait just got longer);
            # the healthy first attempt needs no narration.
            if i > 1 and on_status is not None:
                await on_status(f"Trying backup map server {i} of {total}…")
            try:
                log.info("Trying Overpass endpoint: %s", mirror.url)
                # The slot is held only while this mirror's request is in
                # flight; parsing and validation happen after release.
                async with mirror.budget.slot():
                    resp = await client.post(
                        mirror.url, data={"data": query}, timeout=mirror.timeout_s
                    )
                resp.raise_for_status()
                data = resp.json()
                # Overpass reports mid-query timeouts/errors via `remark` on an
                # otherwise-200 response carrying PARTIAL elements. Accepting it
                # would present a truncated candidate list as a complete ranking
                # (a Ptarmigan Traverse box came back 19 of 29 named peaks this
                # way), so a remark fails this mirror and the chain moves on.
                remark = data.get("remark")
                if remark:
                    raise PartialResultError(f"Overpass returned a partial result: {remark}")
                log.info("Overpass query succeeded via %s", mirror.url)
                return data
            except ratelimit.BudgetExhausted:
                # This mirror is saturated pod-wide, but the next one is a
                # different operator with its own capacity. Only the LAST
                # mirror's saturation is terminal, preserving the 503 +
                # Retry-After mapping the routes already apply.
                if i == total:
                    raise
                log.warning(
                    "Overpass mirror %s budget saturated; trying next mirror", mirror.url
                )
            except Exception as exc:  # noqa: BLE001 — try the next mirror on any failure
                log.warning("Overpass endpoint %s failed: %s", mirror.url, exc)
                last_exc = exc
    # Every mirror failed — surface the last failure as an actionable message.
    raise UpstreamError(classify_http_error(last_exc, PROVIDER)) from last_exc
