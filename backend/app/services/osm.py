from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
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

# Overpass QL templates per destination type.
# Peaks query uses nodes only — the vast majority of OSM peaks are nodes,
# and node-only queries are significantly faster on the public API.
# natural=volcano is unioned in because OSM tags volcanic summits as volcano
# INSTEAD of peak — without it, Baker, Rainier, Glacier Peak, Adams, and
# St. Helens are all invisible to a Cascades polygon search.
_QUERIES: dict[DestinationType, str] = {
    DestinationType.peak: """\
[out:json][timeout:60];
(
  node["natural"="peak"]["name"](poly:"{poly}");
  node["natural"="volcano"]["name"](poly:"{poly}");
);
out;
""",
    DestinationType.trailhead: """\
[out:json][timeout:60];
(
  node["highway"="trailhead"]["name"](poly:"{poly}");
  way["highway"="trailhead"]["name"](poly:"{poly}");
);
out center;
""",
    DestinationType.lake: """\
[out:json][timeout:60];
(
  node["natural"="water"]["water"="lake"]["name"](poly:"{poly}");
  way["natural"="water"]["water"="lake"]["name"](poly:"{poly}");
  relation["natural"="water"]["water"="lake"]["name"](poly:"{poly}");
);
out center;
""",
}

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


async def query_osm(
    polygon: GeoPolygon,
    destination_type: DestinationType,
    on_status: StatusCallback | None = None,
) -> list[dict[str, Any]]:
    """Return every named destination of the given type inside the polygon.

    Deliberately uncapped: the ranking is only exact if every candidate gets a
    forecast, so the analysis-size ceiling lives in the route (loud refusal),
    not here (silent truncation).
    """
    if destination_type not in IMPLEMENTED_TYPES:
        raise NotImplementedError(
            f"Destination type '{destination_type.value}' is not yet implemented."
        )

    # Discovery is cached post-parse for ~10 minutes: the browser flow calls
    # /api/destinations and its server fallback re-runs the identical query
    # seconds later, and repeat Analyze clicks re-run it every minute. Only
    # complete results can land here — a partial (remark) response raises in
    # _post_with_fallback before this point. The cached list is returned as a
    # copy so callers' filtering never mutates the shared entry.
    cache_key = cache.discovery_key(
        polygon.coordinates[0], destination_type.value
    )
    cached = cache.DISCOVERY_CACHE.get(cache_key)
    if cached is not None:
        log.info(
            "OSM discovery served from cache: %d destination(s) for type=%s",
            len(cached),
            destination_type.value,
        )
        return list(cached)

    poly_str = _polygon_to_overpass(polygon)
    query = _QUERIES[destination_type].format(poly=poly_str)

    log.info("Querying OSM Overpass for type=%s", destination_type.value)
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

        elevation_ft: float | None = None
        ele = tags.get("ele")
        if ele:
            try:
                elevation_ft = round(float(ele) * 3.28084, 0)
            except (ValueError, TypeError):
                pass

        seen_names.add(name)
        results.append(
            {
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "elevation_ft": elevation_ft,
                "osm_id": f"{element['type']}/{element['id']}",
            }
        )
        log.trace("  OSM element: %s (%.4f, %.4f) ele=%s", name, lat, lon, elevation_ft)  # type: ignore[attr-defined]

    log.info("OSM returned %d named destination(s)", len(results))
    cache.DISCOVERY_CACHE.put(cache_key, list(results))
    return results


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
