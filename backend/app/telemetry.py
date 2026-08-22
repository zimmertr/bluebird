"""Prometheus metrics for the service and its data suppliers (issue #77).

One module owns every metric family, so the label vocabulary stays in one
place and the cardinality test can police it. Two label vocabularies name the
upstreams, on purpose:

- The fetch layers (``osm.py``, ``weather.py``, ``air_quality.py``) use short
  slugs: ``service`` is ``weather``/``aqi``, ``mirror`` is the Overpass host.
- The pacing layer (``ratelimit.py``) uses each budget's ``provider`` string
  verbatim ("Open-Meteo (air quality)", …). Those strings already uniquely
  name every budget instance, and mapping them to slugs here would be a
  parallel table that drifts the first time a display name changes.

Label values are bounded by construction: routes are FastAPI route templates,
mirrors come from the static mirror table, outcomes and reasons are closed
sets. Never coordinates and never client identity — ``test_telemetry.py``
fails any sample that grows a label outside the allowlist.

The registry is served on its own port (``METRICS_PORT``, default 9464, 0
disables), started by the app lifespan. Deliberately NOT a route on the main
app: the public gateway allowlist filters ``/api/*`` only (bluebird#240), so
a ``/metrics`` route on port 8000 would be publicly reachable — and a second
port keeps the OpenAPI document untouched. In Kubernetes the scrape reaches
the pod port directly via a PodMonitor; the Service never exposes it.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Awaitable, Callable, Iterator
from typing import Any

from fastapi import Request, Response
from prometheus_client import (
    REGISTRY,
    Counter,
    Gauge,
    Histogram,
    start_http_server,
)
from prometheus_client.core import CounterMetricFamily
from prometheus_client.registry import Collector

from app.services import cache
from app.version import get_commit, get_version

log = logging.getLogger("bluebird.telemetry")


def _env_int(name: str, default: int) -> int:
    # Same env-at-import idiom as ratelimit.py; a local copy because that
    # module imports this one, and this module must import nothing of it.
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Ignoring non-integer %s=%r; using default %d", name, raw, default)
        return default


METRICS_PORT = _env_int("METRICS_PORT", 9464)


# ── HTTP surface ──────────────────────────────────────────────────────────────

# Buckets reach 120s because a full server-side analysis (Overpass discovery
# plus a paced Open-Meteo fan-out) legitimately runs minutes-scale under load;
# the default buckets top out at 10s and would flatten exactly the tail this
# exists to see.
_HTTP_BUCKETS = (0.005, 0.025, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0)

HTTP_REQUESTS = Counter(
    "bluebird_http_requests_total",
    "Requests served, by route template, method, and status code.",
    ["route", "method", "status"],
)
HTTP_DURATION = Histogram(
    "bluebird_http_request_duration_seconds",
    "Wall-clock request duration, by route template and method.",
    ["route", "method"],
    buckets=_HTTP_BUCKETS,
)

# ── Analyses ──────────────────────────────────────────────────────────────────

# Candidate counts and limits share one bucket ladder: both live in
# [1, MAX_ANALYZE_PEAKS] and the interesting question is the same shape —
# how big are the analyses people actually run.
_FIELD_BUCKETS = (1, 5, 10, 25, 50, 100, 250, 500, 1000, 1500)

ANALYZE_DESTINATIONS = Histogram(
    "bluebird_analyze_destinations",
    "Candidate destinations per analysis, after the elevation band and cap.",
    buckets=_FIELD_BUCKETS,
)
ANALYZE_LIMIT = Histogram(
    "bluebird_analyze_limit",
    "Requested result limit per analysis.",
    buckets=_FIELD_BUCKETS,
)
DESTINATIONS_RETURNED = Histogram(
    "bluebird_destinations_returned",
    "Rows returned per POST /api/destinations discovery.",
    buckets=_FIELD_BUCKETS,
)

# ── Overpass (discovery) ──────────────────────────────────────────────────────

OVERPASS_REQUESTS = Counter(
    "bluebird_overpass_requests_total",
    "Overpass HTTP attempts, by mirror host and outcome.",
    ["mirror", "outcome"],
)
# Reaches past the slowest mirror's 45s client timeout, because the point of
# this family (per the mirror-table comment in osm.py) is re-tuning those
# timeouts from measurement instead of a one-day sample.
OVERPASS_DURATION = Histogram(
    "bluebird_overpass_request_duration_seconds",
    "Overpass HTTP attempt duration, by mirror host.",
    ["mirror"],
    buckets=(0.5, 1.0, 2.5, 5.0, 10.0, 15.0, 25.0, 45.0, 60.0, 90.0, 120.0),
)
OVERPASS_FALLBACK = Counter(
    "bluebird_overpass_fallback_total",
    "Times the mirror chain moved past a failed mirror, by the mirror it left.",
    ["mirror"],
)

# ── Open-Meteo (weather + air quality) ────────────────────────────────────────

OPENMETEO_REQUESTS = Counter(
    "bluebird_openmeteo_requests_total",
    "Open-Meteo batch HTTP attempts, by service and outcome.",
    ["service", "outcome"],
)
OPENMETEO_DURATION = Histogram(
    "bluebird_openmeteo_request_duration_seconds",
    "Open-Meteo batch HTTP attempt duration, by service.",
    ["service"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)
OPENMETEO_RATE_LIMITED = Counter(
    "bluebird_openmeteo_rate_limited_total",
    "Open-Meteo 429s, by service and the quota scope the response named.",
    ["service", "scope"],
)
AQI_DEGRADED = Counter(
    "bluebird_aqi_degraded_total",
    "AQI batches degraded to null rows instead of failing the analysis.",
    ["reason"],
)

# ── Pacing, budgets, and per-client limits (ratelimit.py wires these) ────────

THROTTLED = Counter(
    "bluebird_ratelimit_throttled_total",
    "Requests refused with 429 by a per-client bucket.",
    ["bucket"],
)
UPSTREAM_SHED = Counter(
    "bluebird_upstream_shed_total",
    "Work shed by a saturated upstream guard, by provider and mechanism.",
    ["provider", "mechanism"],
)
UPSTREAM_PACE_SECONDS = Counter(
    "bluebird_upstream_pace_seconds_total",
    "Seconds spent sleeping to pace upstream spend, by provider.",
    ["provider"],
)
UPSTREAM_QUEUE_SECONDS = Histogram(
    "bluebird_upstream_queue_seconds",
    "Time spent queued for an in-flight slot, by provider.",
    ["provider"],
    buckets=(0.01, 0.1, 0.5, 1.0, 5.0, 15.0, 30.0),
)
WEIGHT_SPENT = Counter(
    "bluebird_openmeteo_weight_spent_total",
    "Weighted Open-Meteo calls spent, in the provider's own billing unit.",
    ["provider"],
)

BUILD_INFO = Gauge(
    "bluebird_build_info",
    "Build identity of the running image; value is always 1.",
    ["version", "commit"],
)


# ── Cache counters ────────────────────────────────────────────────────────────


class _CacheCollector(Collector):
    """Reads the hit/miss counters ``TTLCache`` already keeps.

    A collector rather than incrementing counters inside ``TTLCache.get``,
    because the issue's ground rule is wiring what the code already counts,
    not adding parallel bookkeeping.
    """

    _CACHES = (
        ("discovery", cache.DISCOVERY_CACHE),
        ("custom_enrich", cache.ENRICH_CACHE),
        ("forecast", cache.FORECAST_CACHE),
    )

    def collect(self) -> Iterator[CounterMetricFamily]:
        hits = CounterMetricFamily(
            "bluebird_cache_hits", "Cache hits, by cache.", labels=["cache"]
        )
        misses = CounterMetricFamily(
            "bluebird_cache_misses", "Cache misses (including expiries), by cache.", labels=["cache"]
        )
        for name, store in self._CACHES:
            hits.add_metric([name], store.hits)
            misses.add_metric([name], store.misses)
        yield hits
        yield misses


REGISTRY.register(_CacheCollector())


# ── Middleware ────────────────────────────────────────────────────────────────


def _route_label(request: Request) -> str:
    """The route template the request matched, never the raw path.

    Raw paths are unbounded (every SPA asset, every typo'd URL would mint a
    series). The static mount collapses to one label because its contents are
    the unbounded part; API routes keep their templates, including the
    notfound catch-all's ``/api/{path:path}``.

    FastAPI (0.14x) holds an ``include_router`` prefix in a wrapper, so the
    matched route's own ``path`` is only the suffix (``/capabilities``, not
    ``/api/capabilities``). The prefix the request actually took is recovered
    by rendering the template's concrete form from ``path_params`` and
    trimming it off the request path — labels stay templates either way.
    """
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    if template is None:
        return "unmatched"
    if template in ("", "/"):
        return "static"
    template = str(template)
    path = request.scope.get("path", "")
    fmt = str(getattr(route, "path_format", template))
    try:
        concrete = fmt.format(**(request.scope.get("path_params") or {}))
    except (KeyError, IndexError):
        concrete = fmt
    if concrete and path.endswith(concrete) and path != concrete:
        return path[: len(path) - len(concrete)] + template
    return template


async def metrics_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # An exception no handler converted becomes a 500 upstream of here;
        # count it as one so error rate never under-reports crashes.
        elapsed = time.perf_counter() - start
        route = _route_label(request)
        HTTP_REQUESTS.labels(route=route, method=request.method, status="500").inc()
        HTTP_DURATION.labels(route=route, method=request.method).observe(elapsed)
        raise
    elapsed = time.perf_counter() - start
    route = _route_label(request)
    HTTP_REQUESTS.labels(
        route=route, method=request.method, status=str(response.status_code)
    ).inc()
    HTTP_DURATION.labels(route=route, method=request.method).observe(elapsed)
    return response


# ── The metrics server ────────────────────────────────────────────────────────

_server: Any = None


def start_metrics_server() -> None:
    """Serve the registry on METRICS_PORT; called once from the app lifespan."""
    global _server
    if METRICS_PORT <= 0:
        log.info("Metrics server disabled (METRICS_PORT=0)")
        return
    BUILD_INFO.labels(version=get_version(), commit=get_commit()).set(1)
    _server, _ = start_http_server(METRICS_PORT)
    log.info("Metrics server listening on port %d", METRICS_PORT)


def stop_metrics_server() -> None:
    global _server
    if _server is not None:
        _server.shutdown()
        _server = None
