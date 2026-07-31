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
  request in the pod. Overpass gets one budget per mirror (built in osm.py
  next to the mirror table, since each mirror is a separate operator with
  its own per-IP policy). Saturation queues briefly, then sheds with
  ``BudgetExhausted`` (surfaced as 503, or degraded to null for best-effort
  air quality).

Both are in-memory and per-pod on purpose: with R replicas the effective
ceiling is about R times the configured value, and a restart forgets
history. The goal is a bound, not precision; the shared datastore planned in
#65 can make them exact later. Every knob reads its env var once at import,
mirroring how LOG_LEVEL works.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import HTTPException, Request

log = logging.getLogger("bluebird.ratelimit")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Ignoring non-integer %s=%r; using default %d", name, raw, default)
        return default


# Per-client limits. A per-minute value of 0 disables that limiter outright
# (the dev/preview escape hatch). Defaults are generous for a human iterating
# on a map and hostile to a hammering script. Destinations (one Overpass
# query, no forecasts) is far cheaper than a full analysis, so it gets its own
# bucket instead of starving analyses from the shared one (issue #180).
RATE_LIMIT_ANALYZE_PER_MINUTE = _env_int("RATE_LIMIT_ANALYZE_PER_MINUTE", 12)
RATE_LIMIT_ANALYZE_BURST = _env_int("RATE_LIMIT_ANALYZE_BURST", 6)
RATE_LIMIT_DESTINATIONS_PER_MINUTE = _env_int("RATE_LIMIT_DESTINATIONS_PER_MINUTE", 30)
RATE_LIMIT_DESTINATIONS_BURST = _env_int("RATE_LIMIT_DESTINATIONS_BURST", 10)
RATE_LIMIT_GEOCODE_PER_MINUTE = _env_int("RATE_LIMIT_GEOCODE_PER_MINUTE", 30)
RATE_LIMIT_GEOCODE_BURST = _env_int("RATE_LIMIT_GEOCODE_BURST", 10)
# Wildfire perimeters are the loosest bucket because they are the cheapest
# request the API serves: it answers from a national snapshot this pod already
# holds and never touches NIFC on the request path. The overlay refetches on
# every map pan (debounced 400 ms), so a user dragging across a state legitimately
# spends a request per second, and throttling that would only make the map
# stutter while saving nothing upstream (issue #203).
RATE_LIMIT_WILDFIRES_PER_MINUTE = _env_int("RATE_LIMIT_WILDFIRES_PER_MINUTE", 90)
RATE_LIMIT_WILDFIRES_BURST = _env_int("RATE_LIMIT_WILDFIRES_BURST", 30)

# Pod-wide upstream caps. Weather/AQI count in-flight Open-Meteo batches
# across every concurrent analysis; the Overpass value is applied PER MIRROR
# (osm.py builds one budget per endpoint from it), since ~2-slots-per-IP is
# each operator's own policy, not a shared pool across operators; the
# Nominatim spacing honors their absolute ~1 req/s policy (3.5s per pod x 3
# replicas ≈ 0.86/s aggregate from our one IP; the previous 2s x 3 ≈ 1.5/s
# quietly exceeded the policy).
#
# The in-flight caps are fairness/latency knobs, not the rate protection: the
# weighted budgets below are what actually bound spend per minute (issue #180
# — Open-Meteo bills weighted calls per location, not HTTP requests, so a
# concurrency semaphore alone cannot bound the thing they meter).
UPSTREAM_CONCURRENCY_WEATHER = _env_int("UPSTREAM_CONCURRENCY_WEATHER", 4)
UPSTREAM_CONCURRENCY_AQI = _env_int("UPSTREAM_CONCURRENCY_AQI", 4)
UPSTREAM_CONCURRENCY_OVERPASS = _env_int("UPSTREAM_CONCURRENCY_OVERPASS", 2)
NOMINATIM_MIN_INTERVAL_MS = _env_int("NOMINATIM_MIN_INTERVAL_MS", 3500)

# Pod-wide Open-Meteo spend budgets, in the provider's own unit: weighted
# calls, where one location in a batch is one call (times a factor for >14-day
# windows or >10 variables — see services.openmeteo_weight). Their per-IP
# budget is 600/min per service; 550 leaves margin on accounting we infer
# rather than read from a spec.
#
# Every pod gets the whole 550 rather than a 1/replicas share. Dividing was
# wrong in both directions. It under-serves, because one analysis is handled
# end to end by a single pod and can cost ~1,713 weighted calls (30 batches of
# 50 across a 16-day window), so the budget must cover one request's entire
# fan-out rather than a fair slice of aggregate traffic — and a divided share
# is floor-limited anyway, since bucket capacity is per_minute and 550/10 = 55
# sits below the 57.1 a single batch costs, which would pace every batch on an
# otherwise idle pod. It also over-protects, because since the client path
# shipped the SPA fetches Open-Meteo from the browser on the visitor's own IP;
# the server path runs only when the browser cannot reach Open-Meteo, so
# pod-originated spend is the exception rather than the norm.
#
# The trade is that the cluster as a whole can exceed 550/min when several pods
# fetch at once. Accepted deliberately: this is a ceiling, not a reservation,
# and the per-minute pacer never protected the hourly (5,000) or daily (10,000)
# quotas anyway — even at 180 a pod exhausts a day's allowance in under an
# hour. What protects those is the browser-first split above. #65's shared
# store is the durable fix that makes this exact instead of approximate.
#
# 0 disables pacing, and is worse than any positive value: unpaced, four
# concurrent batches fire ~228 weighted calls at once, trip the minute ceiling,
# burn the single automatic retry in weather.py and fail the analysis outright.
UPSTREAM_WEIGHT_PER_MINUTE_WEATHER = _env_int("UPSTREAM_WEIGHT_PER_MINUTE_WEATHER", 550)
UPSTREAM_WEIGHT_PER_MINUTE_AQI = _env_int("UPSTREAM_WEIGHT_PER_MINUTE_AQI", 550)
# A single acquire that would have to wait longer than this sheds instead —
# at the default refill (550/min ≈ 9.2/s) even a worst-case 50-location batch
# behind a full queue clears in well under this bound, so tripping it means
# something is genuinely wedged, not merely busy.
UPSTREAM_WEIGHT_MAX_WAIT_S = _env_int("UPSTREAM_WEIGHT_MAX_WAIT_S", 120)

# How long a request may queue for a saturated budget before shedding, and
# the Retry-After a shed suggests. The wait keeps ordinary contention
# invisible (batches just interleave); the shed keeps a stampede from
# stacking unbounded waiters.
UPSTREAM_BUDGET_WAIT_S = _env_int("UPSTREAM_BUDGET_WAIT_S", 30)
SHED_RETRY_AFTER_S = 15


# ── Client identity ───────────────────────────────────────────────────────────


def client_key(request: Request) -> str:
    """The client identity rate limiting keys on (and the access log prints).

    ``CF-Connecting-IP`` wins when present: Cloudflare overwrites it, so
    traffic that really came through Cloudflare cannot forge it. Otherwise
    the rightmost ``X-Forwarded-For`` hop: every proxy appends to the right,
    so the rightmost entry is the peer our own edge actually saw, while the
    leftmost is whatever the client typed (rotating it must not mint a fresh
    bucket per request). Direct-to-origin traffic can still forge both
    headers until #148 puts the origin behind Cloudflare Tunnel; the
    upstream budgets bound what a spoofer gains in the meantime.
    """
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.rsplit(",", 1)[-1].strip()
    return request.client.host if request.client else "-"


# ── Per-client token buckets ──────────────────────────────────────────────────


class _TokenBucket:
    __slots__ = ("capacity", "rate_per_s", "tokens", "updated")

    def __init__(self, capacity: float, rate_per_s: float, now: float):
        self.capacity = capacity
        self.rate_per_s = rate_per_s
        self.tokens = capacity
        self.updated = now

    def _refill(self, now: float) -> None:
        # Elapsed time is clamped at zero: the production clock is monotonic,
        # but a clock that ever ran backwards would otherwise DRAIN tokens and
        # punish clients for time that never passed.
        self.tokens = min(
            self.capacity, self.tokens + max(0.0, now - self.updated) * self.rate_per_s
        )
        self.updated = now

    def try_acquire(self, now: float) -> bool:
        self._refill(now)
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False

    def retry_after_s(self, now: float) -> float:
        """Seconds until a full token is available again."""
        self._refill(now)
        if self.tokens >= 1.0:
            return 0.0
        return (1.0 - self.tokens) / self.rate_per_s

    def is_full(self, now: float) -> bool:
        self._refill(now)
        return self.tokens >= self.capacity


class RateLimiter:
    """Token buckets keyed by client address; in-memory, bounded in size.

    The bucket dict is capped at ``max_keys`` so an attacker cycling spoofed
    addresses cannot grow memory without bound. Eviction drops full buckets
    first: a full bucket is indistinguishable from a brand-new one, so
    dropping it loses no enforcement state. Only when every bucket is
    mid-refill (uniformly hostile traffic) does it fall back to dropping the
    longest-untouched half.

    No locking: mutation is synchronous within one event-loop callback, and
    uvicorn runs a single loop per process.
    """

    def __init__(
        self,
        per_minute: int,
        burst: int,
        *,
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._per_minute = per_minute
        self._burst = max(1, burst)
        self._max_keys = max(1, max_keys)
        self._clock = clock
        self._buckets: dict[str, _TokenBucket] = {}

    @property
    def per_minute(self) -> int:
        return self._per_minute

    @property
    def burst(self) -> int:
        return self._burst

    @property
    def enabled(self) -> bool:
        return self._per_minute > 0

    def check(self, key: str) -> tuple[bool, float]:
        """Spend one token for ``key``. Returns ``(allowed, retry_after_s)``."""
        if not self.enabled:
            return True, 0.0
        now = self._clock()
        bucket = self._buckets.get(key)
        if bucket is None:
            if len(self._buckets) >= self._max_keys:
                self._evict(now)
            bucket = _TokenBucket(self._burst, self._per_minute / 60.0, now)
            self._buckets[key] = bucket
        if bucket.try_acquire(now):
            return True, 0.0
        return False, bucket.retry_after_s(now)

    def reset(self) -> None:
        self._buckets.clear()

    def _evict(self, now: float) -> None:
        for key in [k for k, b in self._buckets.items() if b.is_full(now)]:
            del self._buckets[key]
        if len(self._buckets) < self._max_keys:
            return
        oldest_first = sorted(self._buckets, key=lambda k: self._buckets[k].updated)
        for key in oldest_first[: max(1, len(oldest_first) // 2)]:
            del self._buckets[key]


# ── Pod-wide upstream budgets ─────────────────────────────────────────────────


class BudgetExhausted(Exception):
    """A pod-wide upstream budget stayed saturated past its queue bound.

    Routes surface this as 503 with ``Retry-After`` (or degrade to null for
    best-effort air quality). Never a 500: saturation is expected behavior
    under load, not a bug.
    """

    def __init__(self, provider: str, retry_after_s: int = SHED_RETRY_AFTER_S):
        self.provider = provider
        self.retry_after_s = retry_after_s
        self.message = (
            "Bluebird is at capacity right now, with too many requests "
            "already in flight. Try again in a few seconds."
        )
        super().__init__(self.message)


class UpstreamBudget:
    """Cap on in-flight calls to one upstream provider, shared pod-wide.

    Callers queue (FIFO) for a slot up to ``wait_s``; a budget saturated
    that long sheds with ``BudgetExhausted`` instead of stacking waiters.
    """

    def __init__(self, provider: str, capacity: int, *, wait_s: float | None = None):
        self.provider = provider
        self.capacity = max(1, capacity)
        self._wait_s = float(UPSTREAM_BUDGET_WAIT_S if wait_s is None else wait_s)
        self._sem = asyncio.Semaphore(self.capacity)

    @asynccontextmanager
    async def slot(self):
        try:
            await asyncio.wait_for(self._sem.acquire(), timeout=self._wait_s)
        except TimeoutError:
            log.warning(
                "event=budget_exhausted provider=%s capacity=%d waited_s=%.0f",
                self.provider,
                self.capacity,
                self._wait_s,
            )
            raise BudgetExhausted(self.provider) from None
        try:
            yield
        finally:
            self._sem.release()


class MinIntervalGate:
    """Minimum spacing between calls to one provider, shared pod-wide.

    Each caller books the next free slot synchronously (no lock needed on a
    single event loop), then sleeps until it. A caller whose booked slot is
    already more than ``max_wait_s`` out sheds instead, with the real wait
    as its Retry-After. An ``interval_s`` of 0 disables the gate.
    """

    def __init__(
        self,
        provider: str,
        interval_s: float,
        *,
        max_wait_s: float = 5.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.provider = provider
        self._interval = max(0.0, interval_s)
        self._max_wait = max_wait_s
        self._clock = clock
        self._next_free = 0.0

    async def acquire(self) -> None:
        if self._interval <= 0:
            return
        now = self._clock()
        start = max(now, self._next_free)
        wait = start - now
        if wait > self._max_wait:
            log.warning(
                "event=gate_shed provider=%s queued_s=%.1f max_wait_s=%.1f",
                self.provider,
                wait,
                self._max_wait,
            )
            raise BudgetExhausted(self.provider, retry_after_s=math.ceil(wait))
        self._next_free = start + self._interval
        if wait > 0:
            await asyncio.sleep(wait)


class WeightedBudget:
    """Rolling spend budget for one provider, in weighted-call units.

    A token bucket holding one minute of budget: capacity ``per_minute``,
    refilled continuously at ``per_minute/60`` per second. ``acquire(weight)``
    deducts immediately and, when the bucket has gone negative (callers ahead
    in line already spent it), sleeps until the deficit refills — so bursts up
    to one minute of budget pass instantly and anything beyond is *paced*, not
    refused. Negative tokens are what serialize concurrent callers fairly on
    the single event loop; no lock is needed for the same reason the other
    classes here need none.

    An acquire whose wait would exceed ``max_wait_s`` sheds with
    :class:`BudgetExhausted` (something is wedged, not merely busy). A
    ``per_minute`` of 0 disables the budget outright, mirroring the limiters'
    dev escape hatch.
    """

    def __init__(
        self,
        provider: str,
        per_minute: int,
        *,
        max_wait_s: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.provider = provider
        self.per_minute = per_minute
        self._rate = per_minute / 60.0
        self._max_wait = float(
            UPSTREAM_WEIGHT_MAX_WAIT_S if max_wait_s is None else max_wait_s
        )
        self._clock = clock
        self._tokens = float(per_minute)
        self._updated = clock()

    @property
    def enabled(self) -> bool:
        return self.per_minute > 0

    def _refill(self, now: float) -> None:
        # Same zero-clamp as _TokenBucket._refill: a backwards clock must
        # never manufacture a deficit (it would compound here, since deficits
        # translate directly into sleep time for pace waits).
        self._tokens = min(
            float(self.per_minute),
            self._tokens + max(0.0, now - self._updated) * self._rate,
        )
        self._updated = now

    def wait_estimate_s(self, weight: float) -> float:
        """Seconds a caller would wait to spend ``weight`` right now.

        Read-only: lets the fetch layer narrate an upcoming pace wait
        ("resuming in ~34s") without committing to the spend yet.
        """
        if not self.enabled:
            return 0.0
        self._refill(self._clock())
        deficit = weight - self._tokens
        return max(0.0, deficit / self._rate)

    async def acquire(self, weight: float) -> None:
        if not self.enabled or weight <= 0:
            return
        now = self._clock()
        self._refill(now)
        deficit = weight - self._tokens
        wait = max(0.0, deficit / self._rate)
        if wait > self._max_wait:
            log.warning(
                "event=weight_shed provider=%s weight=%.0f wait_s=%.0f max_wait_s=%.0f",
                self.provider,
                weight,
                wait,
                self._max_wait,
            )
            raise BudgetExhausted(self.provider, retry_after_s=math.ceil(wait))
        self._tokens -= weight
        if wait > 0:
            log.info(
                "event=weight_pace provider=%s weight=%.0f wait_s=%.1f",
                self.provider,
                weight,
                wait,
            )
            await asyncio.sleep(wait)


# ── Instances ─────────────────────────────────────────────────────────────────

ANALYZE_LIMITER = RateLimiter(RATE_LIMIT_ANALYZE_PER_MINUTE, RATE_LIMIT_ANALYZE_BURST)
DESTINATIONS_LIMITER = RateLimiter(
    RATE_LIMIT_DESTINATIONS_PER_MINUTE, RATE_LIMIT_DESTINATIONS_BURST
)
GEOCODE_LIMITER = RateLimiter(RATE_LIMIT_GEOCODE_PER_MINUTE, RATE_LIMIT_GEOCODE_BURST)
WILDFIRES_LIMITER = RateLimiter(RATE_LIMIT_WILDFIRES_PER_MINUTE, RATE_LIMIT_WILDFIRES_BURST)

WEATHER_BUDGET = UpstreamBudget("Open-Meteo (weather service)", UPSTREAM_CONCURRENCY_WEATHER)
AQI_BUDGET = UpstreamBudget("Open-Meteo (air quality)", UPSTREAM_CONCURRENCY_AQI)
WEATHER_WEIGHT = WeightedBudget(
    "Open-Meteo (weather service)", UPSTREAM_WEIGHT_PER_MINUTE_WEATHER
)
AQI_WEIGHT = WeightedBudget("Open-Meteo (air quality)", UPSTREAM_WEIGHT_PER_MINUTE_AQI)
# Overpass budgets are per mirror and live in osm.py's OVERPASS_MIRRORS table,
# built from UPSTREAM_CONCURRENCY_OVERPASS above.
NOMINATIM_GATE = MinIntervalGate("Nominatim (place search)", NOMINATIM_MIN_INTERVAL_MS / 1000.0)


# ── Route dependencies ────────────────────────────────────────────────────────


def _throttle(limiter: RateLimiter, request: Request) -> None:
    key = client_key(request)
    allowed, retry_after = limiter.check(key)
    if allowed:
        return
    seconds = max(1, math.ceil(retry_after))
    log.warning(
        "event=rate_limited path=%s client=%s retry_after_s=%d",
        request.url.path,
        key,
        seconds,
    )
    plural = "s" if seconds != 1 else ""
    raise HTTPException(
        status_code=429,
        detail=f"Too many requests from your address. Try again in about {seconds} second{plural}.",
        headers={"Retry-After": str(seconds)},
    )


async def analyze_rate_limit(request: Request) -> None:
    """Route dependency: one shared per-address bucket for both analyze endpoints."""
    _throttle(ANALYZE_LIMITER, request)


async def destinations_rate_limit(request: Request) -> None:
    """Route dependency: the discovery bucket, independent of analyze.

    Discovery is one Overpass query with no forecasts attached, so the
    browser flow (discover, then fetch Open-Meteo itself) should never eat
    the analyze budget of someone running full server-side analyses.
    """
    _throttle(DESTINATIONS_LIMITER, request)


async def geocode_rate_limit(request: Request) -> None:
    """Route dependency: the geocode bucket, independent of analyze."""
    _throttle(GEOCODE_LIMITER, request)


async def wildfires_rate_limit(request: Request) -> None:
    """Route dependency: the wildfire-overlay bucket, independent of analyze."""
    _throttle(WILDFIRES_LIMITER, request)
