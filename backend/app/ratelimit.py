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
# on a map and hostile to a hammering script.
RATE_LIMIT_ANALYZE_PER_MINUTE = _env_int("RATE_LIMIT_ANALYZE_PER_MINUTE", 12)
RATE_LIMIT_ANALYZE_BURST = _env_int("RATE_LIMIT_ANALYZE_BURST", 6)
RATE_LIMIT_GEOCODE_PER_MINUTE = _env_int("RATE_LIMIT_GEOCODE_PER_MINUTE", 30)
RATE_LIMIT_GEOCODE_BURST = _env_int("RATE_LIMIT_GEOCODE_BURST", 10)

# Pod-wide upstream caps. Weather/AQI count in-flight Open-Meteo batches
# across every concurrent analysis; the Overpass value is applied PER MIRROR
# (osm.py builds one budget per endpoint from it), since ~2-slots-per-IP is
# each operator's own policy, not a shared pool across operators; the
# Nominatim spacing honors their absolute ~1 req/s policy (2s per pod x 3
# replicas ≈ 1/s aggregate from our one IP).
UPSTREAM_CONCURRENCY_WEATHER = _env_int("UPSTREAM_CONCURRENCY_WEATHER", 8)
UPSTREAM_CONCURRENCY_AQI = _env_int("UPSTREAM_CONCURRENCY_AQI", 8)
UPSTREAM_CONCURRENCY_OVERPASS = _env_int("UPSTREAM_CONCURRENCY_OVERPASS", 2)
NOMINATIM_MIN_INTERVAL_MS = _env_int("NOMINATIM_MIN_INTERVAL_MS", 2000)

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
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate_per_s)
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


# ── Instances ─────────────────────────────────────────────────────────────────

ANALYZE_LIMITER = RateLimiter(RATE_LIMIT_ANALYZE_PER_MINUTE, RATE_LIMIT_ANALYZE_BURST)
GEOCODE_LIMITER = RateLimiter(RATE_LIMIT_GEOCODE_PER_MINUTE, RATE_LIMIT_GEOCODE_BURST)

WEATHER_BUDGET = UpstreamBudget("Open-Meteo (weather service)", UPSTREAM_CONCURRENCY_WEATHER)
AQI_BUDGET = UpstreamBudget("Open-Meteo (air quality)", UPSTREAM_CONCURRENCY_AQI)
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


async def geocode_rate_limit(request: Request) -> None:
    """Route dependency: the geocode bucket, independent of analyze."""
    _throttle(GEOCODE_LIMITER, request)
