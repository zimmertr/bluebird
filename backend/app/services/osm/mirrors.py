"""Discovery against Overpass, and the chain of public mirrors every Overpass request fails over through.

Apart from the query text because this half is the network: the mirror table,
its per-mirror budgets and timeouts, and the failover that reads them.
"""

from __future__ import annotations

import copy
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from app import ratelimit, telemetry
from app.models import DestinationType, GeoPolygon
from app.services import cache
from app.services.errors import PartialResultError, UpstreamError, classify_http_error
from app.services.http import HEADERS
from app.services.osm.query import (
    IMPLEMENTED_TYPES,
    _build_query,
    _classify,
    _ele_ft,
    _polygon_to_overpass,
)

# The service's one logger name, kept across the split so a log query written
# against it still matches every line.
log = logging.getLogger("app.services.osm")

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


async def query_osm(
    polygon: GeoPolygon,
    destination_types: Sequence[DestinationType],
    on_status: StatusCallback | None = None,
    include_unnamed_peaks: bool = False,
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
    # Part of the key, not a filter on the result: the two questions return
    # different sets, so they cannot share a cache entry.
    if include_unnamed_peaks:
        type_key += "+unnamed"
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
    query = _build_query(types, poly_str, include_unnamed_peaks)

    log.info("Querying OSM Overpass for types=%s", type_key)
    log.trace("Overpass query:\n%s", query)  # type: ignore[attr-defined]
    # Budgets are per mirror and acquired per attempt inside the failover
    # chain, so a failover releases mirror A before it queues on mirror B.
    data = await _post_with_fallback(query, on_status)

    results: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    seen_generated: set[Any] = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        elevation_ft = _ele_ft(tags)
        name = tags.get("name")
        generated = False
        if not name:
            # An unnamed summit is named for the height it is drawn with, the
            # same way the map labels it and the same string the browser builds
            # for a clicked one (basemapPoi.ts) — so a peak added both ways is
            # one destination rather than two spellings of it.
            if not include_unnamed_peaks or elevation_ft is None:
                continue
            if _classify(tags) != DestinationType.peak.value:
                continue
            name = f"Peak {round(elevation_ft)}"
            generated = True
        # Name is the identity rule for mapped features, and it has to stay
        # that way: OSM carries duplicate nodes for the same summit. It cannot
        # apply to a generated name, though — every unnamed 5,961 ft peak in a
        # range would collapse into one row — so those dedup by OSM id, which
        # is the only identity they actually have.
        if generated:
            if element["id"] in seen_generated:
                continue
        elif name in seen_names:
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

        if generated:
            seen_generated.add(element["id"])
        else:
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


def _attempt_outcome(exc: Exception) -> str:
    """The metric outcome for one failed mirror attempt. Timeout is split from
    the other transport errors because it is the one this table's timeouts are
    retuned from (TimeoutException must be tested first: it IS an HTTPError)."""
    if isinstance(exc, PartialResultError):
        return "partial"
    if isinstance(exc, httpx.TimeoutException):
        return "timeout"
    if isinstance(exc, httpx.HTTPStatusError):
        return "http_error"
    if isinstance(exc, httpx.HTTPError):
        return "network_error"
    return "error"


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
            host = urlparse(mirror.url).hostname or mirror.url
            # Failover is news the user can act on (the wait just got longer);
            # the healthy first attempt needs no narration.
            if i > 1 and on_status is not None:
                await on_status(f"Trying backup map server {i} of {total}…")
            outcome = "error"
            elapsed: float | None = None
            try:
                log.info("Trying Overpass endpoint: %s", mirror.url)
                # The slot is held only while this mirror's request is in
                # flight; parsing and validation happen after release. The
                # duration is timed the same way — inside the slot, so a queue
                # wait never inflates a mirror's measured latency.
                async with mirror.budget.slot():
                    attempt_start = time.perf_counter()
                    try:
                        resp = await client.post(
                            mirror.url, data={"data": query}, timeout=mirror.timeout_s
                        )
                    finally:
                        elapsed = time.perf_counter() - attempt_start
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
                outcome = "success"
                log.info("Overpass query succeeded via %s", mirror.url)
                return data
            except ratelimit.BudgetExhausted:
                # This mirror is saturated pod-wide, but the next one is a
                # different operator with its own capacity. Only the LAST
                # mirror's saturation is terminal, preserving the 503 +
                # Retry-After mapping the routes already apply. No request was
                # made, so only the failover is counted (the shed itself is
                # already counted where it happened, in ratelimit).
                if i == total:
                    raise
                telemetry.OVERPASS_FALLBACK.labels(mirror=host).inc()
                log.warning(
                    "Overpass mirror %s budget saturated; trying next mirror", mirror.url
                )
            except Exception as exc:  # noqa: BLE001 — try the next mirror on any failure
                outcome = _attempt_outcome(exc)
                if i < total:
                    telemetry.OVERPASS_FALLBACK.labels(mirror=host).inc()
                log.warning("Overpass endpoint %s failed: %s", mirror.url, exc)
                last_exc = exc
            finally:
                # `elapsed` stays None when the budget shed before any HTTP
                # left the pod — nothing was asked, so nothing is recorded.
                if elapsed is not None:
                    telemetry.OVERPASS_DURATION.labels(mirror=host).observe(elapsed)
                    telemetry.OVERPASS_REQUESTS.labels(mirror=host, outcome=outcome).inc()
    # Every mirror failed — surface the last failure as an actionable message.
    raise UpstreamError(classify_http_error(last_exc, PROVIDER)) from last_exc
