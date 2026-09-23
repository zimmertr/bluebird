"""Per-client rate limits and pod-wide upstream budgets (issue #75).

Every analysis fans out to shared free APIs (Overpass, Open-Meteo) and the
search box proxies Nominatim, all from one egress IP. These guards bound how
fast any one client can spend that shared quota and how much can be in flight
upstream at once, so an abusive client or an organic spike degrades into
clear 429/503 responses instead of getting the egress IP banned and breaking
the site for everyone.

Two mechanisms:

- ``RateLimiter``: per-client-address token buckets, enforced as route
  dependencies on the expensive endpoints only. Over the limit: 429 with a
  ``Retry-After`` header.
- ``UpstreamBudget`` / ``MinIntervalGate``: pod-wide caps on in-flight calls
  (or call spacing) per upstream operator, shared by every concurrent
  request in the pod. Overpass gets one budget per mirror (built in osm/mirrors.py
  next to the mirror table, since each mirror is a separate operator with
  its own per-IP policy). Saturation queues briefly, then sheds with
  ``BudgetExhausted`` (surfaced as 503, or degraded to null for best-effort
  air quality).

Both are in-memory and per-pod on purpose: with R replicas the effective
ceiling is about R times the configured value, and a restart forgets
history. The goal is a bound, not precision; the shared datastore planned in
#65 can make them exact later. Every knob reads its env var once at import,
mirroring how LOG_LEVEL works.

The two live in ``client`` and ``upstream`` beside this file, and this file
re-exports them so ``ratelimit.X`` keeps working, with one exception: the five
per-client limiters are read only as ``ratelimit.client.X``. The route
dependencies read them inside ``client``, so a limiter patched here would never
reach them, and leaving the name out makes that patch fail rather than pass
silently. The upstream budgets are the other way round: the services read them
through this file, so this file is where a test replaces one.
"""

from __future__ import annotations

from app.ratelimit.client import (
    RATE_LIMIT_ANALYZE_BURST,
    RATE_LIMIT_ANALYZE_PER_MINUTE,
    RATE_LIMIT_DESTINATIONS_BURST,
    RATE_LIMIT_DESTINATIONS_PER_MINUTE,
    RATE_LIMIT_GEOCODE_BURST,
    RATE_LIMIT_GEOCODE_PER_MINUTE,
    RATE_LIMIT_SMOKE_BURST,
    RATE_LIMIT_SMOKE_PER_MINUTE,
    RATE_LIMIT_WILDFIRES_BURST,
    RATE_LIMIT_WILDFIRES_PER_MINUTE,
    RateLimiter,
    _throttle,
    _TokenBucket,
    analyze_rate_limit,
    client_key,
    destinations_rate_limit,
    geocode_rate_limit,
    smoke_rate_limit,
    wildfires_rate_limit,
)
from app.ratelimit.upstream import (
    AQI_BUDGET,
    AQI_WEIGHT,
    NOMINATIM_GATE,
    NOMINATIM_MIN_INTERVAL_MS,
    SHED_RETRY_AFTER_S,
    UPSTREAM_BUDGET_WAIT_S,
    UPSTREAM_CONCURRENCY_AQI,
    UPSTREAM_CONCURRENCY_OVERPASS,
    UPSTREAM_CONCURRENCY_WEATHER,
    UPSTREAM_WEIGHT_MAX_WAIT_S,
    UPSTREAM_WEIGHT_PER_MINUTE_AQI,
    UPSTREAM_WEIGHT_PER_MINUTE_WEATHER,
    WEATHER_BUDGET,
    WEATHER_WEIGHT,
    BudgetExhausted,
    MinIntervalGate,
    UpstreamBudget,
    WeightedBudget,
)

__all__ = [
    "RATE_LIMIT_ANALYZE_PER_MINUTE",
    "RATE_LIMIT_ANALYZE_BURST",
    "RATE_LIMIT_DESTINATIONS_PER_MINUTE",
    "RATE_LIMIT_DESTINATIONS_BURST",
    "RATE_LIMIT_GEOCODE_PER_MINUTE",
    "RATE_LIMIT_GEOCODE_BURST",
    "RATE_LIMIT_WILDFIRES_PER_MINUTE",
    "RATE_LIMIT_WILDFIRES_BURST",
    "RATE_LIMIT_SMOKE_PER_MINUTE",
    "RATE_LIMIT_SMOKE_BURST",
    "UPSTREAM_CONCURRENCY_WEATHER",
    "UPSTREAM_CONCURRENCY_AQI",
    "UPSTREAM_CONCURRENCY_OVERPASS",
    "NOMINATIM_MIN_INTERVAL_MS",
    "UPSTREAM_WEIGHT_PER_MINUTE_WEATHER",
    "UPSTREAM_WEIGHT_PER_MINUTE_AQI",
    "UPSTREAM_WEIGHT_MAX_WAIT_S",
    "UPSTREAM_BUDGET_WAIT_S",
    "SHED_RETRY_AFTER_S",
    "client_key",
    "_TokenBucket",
    "RateLimiter",
    "BudgetExhausted",
    "UpstreamBudget",
    "MinIntervalGate",
    "WeightedBudget",
    "WEATHER_BUDGET",
    "AQI_BUDGET",
    "WEATHER_WEIGHT",
    "AQI_WEIGHT",
    "NOMINATIM_GATE",
    "_throttle",
    "analyze_rate_limit",
    "destinations_rate_limit",
    "geocode_rate_limit",
    "wildfires_rate_limit",
    "smoke_rate_limit",
]
