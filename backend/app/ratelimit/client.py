"""Per-client token buckets, enforced as route dependencies.

Apart from the upstream budgets because the two answer different questions:
these bound one client address, and those bound the whole pod's spend.
"""

from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable

from fastapi import Request

from app import telemetry
from app.env import env_int
from app.error_codes import ApiError, ErrorCode

log = logging.getLogger("bluebird_forecast.ratelimit")


# Per-client limits. A per-minute value of 0 disables that limiter outright
# (the dev/preview escape hatch). Defaults are generous for a human iterating
# on a map and hostile to a hammering script. Destinations (one Overpass
# query, no forecasts) is far cheaper than a full analysis, so it gets its own
# bucket instead of starving analyses from the shared one (issue #180).
RATE_LIMIT_ANALYZE_PER_MINUTE = env_int("RATE_LIMIT_ANALYZE_PER_MINUTE", 12)
RATE_LIMIT_ANALYZE_BURST = env_int("RATE_LIMIT_ANALYZE_BURST", 6)
RATE_LIMIT_DESTINATIONS_PER_MINUTE = env_int("RATE_LIMIT_DESTINATIONS_PER_MINUTE", 30)
RATE_LIMIT_DESTINATIONS_BURST = env_int("RATE_LIMIT_DESTINATIONS_BURST", 10)
RATE_LIMIT_GEOCODE_PER_MINUTE = env_int("RATE_LIMIT_GEOCODE_PER_MINUTE", 30)
RATE_LIMIT_GEOCODE_BURST = env_int("RATE_LIMIT_GEOCODE_BURST", 10)
# Wildfire perimeters are the loosest bucket because they are the cheapest
# request the API serves: it answers from a national snapshot this pod already
# holds and never touches NIFC on the request path. The overlay refetches on
# every map pan (debounced 400 ms), so a user dragging across a state legitimately
# spends a request per second, and throttling that would only make the map
# stutter while saving nothing upstream (issue #203).
RATE_LIMIT_WILDFIRES_PER_MINUTE = env_int("RATE_LIMIT_WILDFIRES_PER_MINUTE", 90)
RATE_LIMIT_WILDFIRES_BURST = env_int("RATE_LIMIT_WILDFIRES_BURST", 30)
# Smoke is the same kind of request as wildfires — a filter over a national
# snapshot this pod already holds — so it gets the same looseness. Its own
# bucket rather than a shared one because the two overlays toggle
# independently, and a user turning both on should not spend one budget twice
# (issue #121).
RATE_LIMIT_SMOKE_PER_MINUTE = env_int("RATE_LIMIT_SMOKE_PER_MINUTE", 90)
RATE_LIMIT_SMOKE_BURST = env_int("RATE_LIMIT_SMOKE_BURST", 30)


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

    def __init__(self, capacity: float, rate_per_s: float, now: float) -> None:
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
        name: str = "",
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._per_minute = per_minute
        self._burst = max(1, burst)
        # The bucket's name in the throttle metric; keyword-only so the many
        # anonymous instances tests build stay valid.
        self.name = name
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


# ── Instances ─────────────────────────────────────────────────────────────────

ANALYZE_LIMITER = RateLimiter(
    RATE_LIMIT_ANALYZE_PER_MINUTE, RATE_LIMIT_ANALYZE_BURST, name="analyze"
)
DESTINATIONS_LIMITER = RateLimiter(
    RATE_LIMIT_DESTINATIONS_PER_MINUTE, RATE_LIMIT_DESTINATIONS_BURST, name="destinations"
)
GEOCODE_LIMITER = RateLimiter(
    RATE_LIMIT_GEOCODE_PER_MINUTE, RATE_LIMIT_GEOCODE_BURST, name="geocode"
)
WILDFIRES_LIMITER = RateLimiter(
    RATE_LIMIT_WILDFIRES_PER_MINUTE, RATE_LIMIT_WILDFIRES_BURST, name="wildfires"
)
SMOKE_LIMITER = RateLimiter(RATE_LIMIT_SMOKE_PER_MINUTE, RATE_LIMIT_SMOKE_BURST, name="smoke")


# ── Route dependencies ────────────────────────────────────────────────────────


def _throttle(limiter: RateLimiter, request: Request) -> None:
    key = client_key(request)
    allowed, retry_after = limiter.check(key)
    if allowed:
        return
    seconds = max(1, math.ceil(retry_after))
    telemetry.THROTTLED.labels(bucket=limiter.name or "unnamed").inc()
    log.warning(
        "event=rate_limited path=%s client=%s retry_after_s=%d",
        request.url.path,
        key,
        seconds,
    )
    raise ApiError(
        status_code=429,
        detail="Too many requests from this connection. Try again later.",
        code=ErrorCode.rate_limited,
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


async def smoke_rate_limit(request: Request) -> None:
    """Route dependency: the smoke-overlay bucket, independent of wildfires."""
    _throttle(SMOKE_LIMITER, request)
