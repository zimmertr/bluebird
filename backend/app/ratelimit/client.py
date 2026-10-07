"""Per-client token buckets, enforced as route dependencies.

Apart from the upstream budgets because the two answer different questions:
these bound one client address, and those bound the whole pod's spend.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import math
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import Request

from app import telemetry
from app.env import env_int
from app.error_codes import ApiError, ErrorCode
from app.ratelimit.upstream import SHED_RETRY_AFTER_S, UPSTREAM_BUDGET_WAIT_S

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
# Geocode is sized under the pod-wide Nominatim gate it sits in front of, not
# by how cheap the request is. The gate opens one slot per
# NOMINATIM_MIN_INTERVAL_MS (about 17 a minute at 3.5 s) and sheds a caller
# booked more than 5 s out, so a bucket that let one address spend faster than
# the gate serves let that address keep it booked ahead and shed every other
# visitor's search on the pod (#627). A bucket's first minute spends its burst
# plus a minute's refill, 13 here, which leaves the gate a third of its slots
# for everyone else. The search box searches on submit only, so a person
# typing place names never meets 10 a minute; the burst of 3 covers a quick
# retype. Decided by the maintainer, 2026-10-06 (record 0103).
RATE_LIMIT_GEOCODE_PER_MINUTE = env_int("RATE_LIMIT_GEOCODE_PER_MINUTE", 10)
RATE_LIMIT_GEOCODE_BURST = env_int("RATE_LIMIT_GEOCODE_BURST", 3)
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
# Closures are the same kind of request again, a filter over a snapshot this pod
# already holds, and the overlay refetches on every pan like the wildfire one.
# Its own bucket because it is two layers that toggle apart from the other
# overlays, and a user with every layer on should not spend one budget three
# times (issue #550).
RATE_LIMIT_CLOSURES_PER_MINUTE = env_int("RATE_LIMIT_CLOSURES_PER_MINUTE", 90)
RATE_LIMIT_CLOSURES_BURST = env_int("RATE_LIMIT_CLOSURES_BURST", 30)

# Discoveries one client key may have in flight at once. A bucket bounds how
# often an address starts a discovery, not how many it holds open, and one
# Overpass query runs 5 to 25 s against slots the whole pod shares (two per
# mirror). Inside its bucket one address could hold every one of them and make
# other visitors queue and then shed (#627). One is the per-address share the
# maintainer decided, 2026-10-06 (record 0103): the web app sends one discovery
# per Analyze and waits for it, so a person never has two. A second waits its
# turn rather than being refused, because a cancelled Analyze leaves its first
# request running on the pod and the retry should not read as a rate limit.
# The wait is the same bound a request waits for a saturated Overpass slot.
DISCOVERY_IN_FLIGHT_PER_CLIENT = 1


# ── Client identity ───────────────────────────────────────────────────────────


# An IPv6 client is counted by the network its provider assigned rather than by
# one address in it. Every IPv6 client holds at least a /64 and picks any
# address inside it at will, so a key per address handed it a fresh, full bucket
# per request (#627). /64 is the smallest block a provider assigns and the
# common practice for per-client IPv6 limits; it groups a household, which is
# how one IPv4 address behind its router is already counted. Decided by the
# maintainer, 2026-10-06 (record 0103).
IPV6_CLIENT_PREFIX = 64


def client_address(request: Request) -> str:
    """The address a request came from, as the access log prints it.

    ``CF-Connecting-IP`` wins when present: Cloudflare overwrites it, so
    traffic that really came through Cloudflare cannot forge it. Otherwise
    the rightmost ``X-Forwarded-For`` hop: every proxy appends to the right,
    so the rightmost entry is the peer our own edge actually saw, while the
    leftmost is whatever the client typed (rotating it must not mint a fresh
    bucket per request). The Cloudflare Tunnel (#148) is the only inbound
    path from the internet, so no request from outside reaches a pod without
    Cloudflare overwriting the header. The gateway removes it from every
    request that did not come through the tunnel, so a device on the home
    network that sends its request straight to the gateway is counted under
    the address the gateway saw (#631, record 0109). Only a caller inside
    the cluster, or one routed into the pod network, can still set it, which
    is why the pod-wide upstream budgets stay a backstop: they do not care
    who a caller claims to be (``docs/TRAFFIC.md``).
    """
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.rsplit(",", 1)[-1].strip()
    return request.client.host if request.client else "-"


def bucket_key(address: str) -> str:
    """The identity an address is counted under.

    Parsed rather than compared as text, so every spelling of one address is
    one client (``2001:DB8::1`` and ``2001:db8:0::1``), an IPv4 client written
    in IPv6's mapped form is its IPv4 address, and an IPv6 address is its
    ``IPV6_CLIENT_PREFIX`` network. Anything that does not parse (a test
    client's host name, ``-``) is counted as written.
    """
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return address
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return str(ipaddress.IPv6Network((ip, IPV6_CLIENT_PREFIX), strict=False))
    return str(ip)


def client_key(request: Request) -> str:
    """The client identity rate limiting keys on: its address, counted by ``bucket_key``."""
    return bucket_key(client_address(request))


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


@dataclass
class _Lane:
    """One client key's in-flight slots, and how many requests hold or await one."""

    slots: asyncio.Semaphore
    users: int = 0


class InFlightLimiter:
    """At most ``per_client`` requests in flight per client key; later ones queue.

    A token bucket bounds how often a client starts a request; this bounds how
    many it holds open at once, which is what a pod-wide upstream slot is
    spent on. A request past the share waits for one of its own to finish, up
    to ``wait_s``, and is refused after that. A key's lane exists only while
    something holds or awaits it, so memory follows the requests in flight
    rather than every address ever seen. A ``per_client`` of 0 disables it.
    """

    def __init__(self, per_client: int, *, name: str = "", wait_s: float | None = None) -> None:
        self._per_client = per_client
        self.name = name
        self._wait_s = float(UPSTREAM_BUDGET_WAIT_S if wait_s is None else wait_s)
        self._lanes: dict[str, _Lane] = {}

    @property
    def enabled(self) -> bool:
        return self._per_client > 0

    @asynccontextmanager
    async def slot(self, key: str) -> AsyncIterator[bool]:
        """Hold one of ``key``'s slots; yields False when the wait ran out."""
        if not self.enabled:
            yield True
            return
        lane = self._lanes.get(key)
        if lane is None:
            lane = self._lanes[key] = _Lane(asyncio.Semaphore(self._per_client))
        lane.users += 1
        try:
            try:
                await asyncio.wait_for(lane.slots.acquire(), timeout=self._wait_s)
            except TimeoutError:
                yield False
                return
            try:
                yield True
            finally:
                lane.slots.release()
        finally:
            lane.users -= 1
            if lane.users == 0:
                del self._lanes[key]


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
CLOSURES_LIMITER = RateLimiter(
    RATE_LIMIT_CLOSURES_PER_MINUTE, RATE_LIMIT_CLOSURES_BURST, name="closures"
)
DESTINATIONS_IN_FLIGHT = InFlightLimiter(
    DISCOVERY_IN_FLIGHT_PER_CLIENT, name="destinations_in_flight"
)


# ── Route dependencies ────────────────────────────────────────────────────────


def _throttle(limiter: RateLimiter, request: Request) -> None:
    key = client_key(request)
    allowed, retry_after = limiter.check(key)
    if allowed:
        return
    _refuse(limiter.name, request, key, max(1, math.ceil(retry_after)))


def _refuse(bucket: str, request: Request, key: str, seconds: int) -> None:
    """Raise the one 429 a per-client limit answers, whichever limit refused."""
    raise _refusal(bucket, request, key, seconds)


def _refusal(bucket: str, request: Request, key: str, seconds: int) -> ApiError:
    """The one 429 a per-client limit answers, counted and logged."""
    telemetry.THROTTLED.labels(bucket=bucket or "unnamed").inc()
    # The address as the access log prints it, and the key it was counted
    # under, so a throttle line finds its request and its neighbours in a /64.
    log.warning(
        "event=rate_limited path=%s client=%s key=%s retry_after_s=%d",
        request.url.path,
        client_address(request),
        key,
        seconds,
    )
    return ApiError(
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


@asynccontextmanager
async def discovery_in_flight(request: Request) -> AsyncIterator[ApiError | None]:
    """Hold the client's one discovery slot; yields the 429 when the wait ran out.

    One slot per key across every route that discovers, so a discovery from
    `POST /api/destinations` and one from an analyze route queue behind each
    other: both spend the same pod-wide Overpass slots. Yielded rather than
    raised because an analyze stream is already open when its discovery
    starts, and it reports the refusal as its terminal event.
    """
    key = client_key(request)
    async with DESTINATIONS_IN_FLIGHT.slot(key) as admitted:
        if admitted:
            yield None
        else:
            yield _refusal(DESTINATIONS_IN_FLIGHT.name, request, key, SHED_RETRY_AFTER_S)


async def destinations_in_flight(request: Request) -> AsyncIterator[None]:
    """Route dependency: one discovery in flight per client key.

    Listed after the bucket, so a request the bucket refuses never queues.
    Held for the whole request because custom destinations are resolved
    against Overpass too, not only a polygon's discovery.
    """
    async with discovery_in_flight(request) as refused:
        if refused is not None:
            raise refused
        yield


async def geocode_rate_limit(request: Request) -> None:
    """Route dependency: the geocode bucket, independent of analyze."""
    _throttle(GEOCODE_LIMITER, request)


async def wildfires_rate_limit(request: Request) -> None:
    """Route dependency: the wildfire-overlay bucket, independent of analyze."""
    _throttle(WILDFIRES_LIMITER, request)


async def smoke_rate_limit(request: Request) -> None:
    """Route dependency: the smoke-overlay bucket, independent of wildfires."""
    _throttle(SMOKE_LIMITER, request)


async def closures_rate_limit(request: Request) -> None:
    """Route dependency: the closure-overlay bucket, independent of the other overlays."""
    _throttle(CLOSURES_LIMITER, request)
