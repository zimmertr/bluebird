"""Pod-wide caps on in-flight upstream calls, call spacing, and weighted spend.

Apart from the per-client buckets because every concurrent request in the pod
shares these, and the services acquire them rather than the routes.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from app import telemetry
from app.env import env_int

log = logging.getLogger("bluebird_forecast.ratelimit")


# Pod-wide upstream caps. Weather/AQI count in-flight Open-Meteo batches
# across every concurrent analysis; the Overpass value is applied PER MIRROR
# (osm/mirrors.py builds one budget per endpoint from it), since ~2-slots-per-IP is
# each operator's own policy, not a shared pool across operators; the
# Nominatim spacing honors their absolute ~1 req/s policy (3.5s per pod x 3
# replicas ≈ 0.86/s aggregate from our one IP; the previous 2s x 3 ≈ 1.5/s
# quietly exceeded the policy).
#
# The in-flight caps are fairness/latency knobs, not the rate protection: the
# weighted budgets below are what actually bound spend per minute (issue #180
# — Open-Meteo bills weighted calls per location, not HTTP requests, so a
# concurrency semaphore alone cannot bound the thing they meter).
UPSTREAM_CONCURRENCY_WEATHER = env_int("UPSTREAM_CONCURRENCY_WEATHER", 4)
UPSTREAM_CONCURRENCY_AQI = env_int("UPSTREAM_CONCURRENCY_AQI", 4)
UPSTREAM_CONCURRENCY_OVERPASS = env_int("UPSTREAM_CONCURRENCY_OVERPASS", 2)
NOMINATIM_MIN_INTERVAL_MS = env_int("NOMINATIM_MIN_INTERVAL_MS", 3500)

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
UPSTREAM_WEIGHT_PER_MINUTE_WEATHER = env_int("UPSTREAM_WEIGHT_PER_MINUTE_WEATHER", 550)
UPSTREAM_WEIGHT_PER_MINUTE_AQI = env_int("UPSTREAM_WEIGHT_PER_MINUTE_AQI", 550)
# A single acquire that would have to wait longer than this sheds instead —
# at the default refill (550/min ≈ 9.2/s) even a worst-case 50-location batch
# behind a full queue clears in well under this bound, so tripping it means
# something is genuinely wedged, not merely busy.
UPSTREAM_WEIGHT_MAX_WAIT_S = env_int("UPSTREAM_WEIGHT_MAX_WAIT_S", 120)

# How long a request may queue for a saturated budget before shedding, and
# the Retry-After a shed suggests. The wait keeps ordinary contention
# invisible (batches just interleave); the shed keeps a stampede from
# stacking unbounded waiters.
UPSTREAM_BUDGET_WAIT_S = env_int("UPSTREAM_BUDGET_WAIT_S", 30)
SHED_RETRY_AFTER_S = 15


# ── Pod-wide upstream budgets ─────────────────────────────────────────────────


class BudgetExhausted(Exception):
    """A pod-wide upstream budget stayed saturated past its queue bound.

    Routes surface this as 503 with ``Retry-After`` (or degrade to null for
    best-effort air quality). Never a 500: saturation is expected behavior
    under load, not a bug.
    """

    def __init__(self, provider: str, retry_after_s: int = SHED_RETRY_AFTER_S) -> None:
        self.provider = provider
        self.retry_after_s = retry_after_s
        self.message = "Bluebird Forecast is busy. Try again later."
        super().__init__(self.message)


class UpstreamBudget:
    """Cap on in-flight calls to one upstream provider, shared pod-wide.

    Callers queue (FIFO) for a slot up to ``wait_s``; a budget saturated
    that long sheds with ``BudgetExhausted`` instead of stacking waiters.
    """

    def __init__(self, provider: str, capacity: int, *, wait_s: float | None = None) -> None:
        self.provider = provider
        self.capacity = max(1, capacity)
        self._wait_s = float(UPSTREAM_BUDGET_WAIT_S if wait_s is None else wait_s)
        self._sem = asyncio.Semaphore(self.capacity)

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        queued_from = time.perf_counter()
        try:
            await asyncio.wait_for(self._sem.acquire(), timeout=self._wait_s)
        except TimeoutError:
            log.warning(
                "event=budget_exhausted provider=%s capacity=%d waited_s=%.0f",
                self.provider,
                self.capacity,
                self._wait_s,
            )
            telemetry.UPSTREAM_SHED.labels(
                provider=self.provider, mechanism="queue"
            ).inc()
            raise BudgetExhausted(self.provider) from None
        telemetry.UPSTREAM_QUEUE_SECONDS.labels(provider=self.provider).observe(
            time.perf_counter() - queued_from
        )
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
    ) -> None:
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
            telemetry.UPSTREAM_SHED.labels(
                provider=self.provider, mechanism="gate"
            ).inc()
            raise BudgetExhausted(self.provider, retry_after_s=math.ceil(wait))
        self._next_free = start + self._interval
        if wait > 0:
            telemetry.UPSTREAM_PACE_SECONDS.labels(provider=self.provider).inc(wait)
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
    ) -> None:
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
            telemetry.UPSTREAM_SHED.labels(
                provider=self.provider, mechanism="weight"
            ).inc()
            raise BudgetExhausted(self.provider, retry_after_s=math.ceil(wait))
        self._tokens -= weight
        telemetry.WEIGHT_SPENT.labels(provider=self.provider).inc(weight)
        if wait > 0:
            log.info(
                "event=weight_pace provider=%s weight=%.0f wait_s=%.1f",
                self.provider,
                weight,
                wait,
            )
            telemetry.UPSTREAM_PACE_SECONDS.labels(provider=self.provider).inc(wait)
            await asyncio.sleep(wait)


# ── Instances ─────────────────────────────────────────────────────────────────

WEATHER_BUDGET = UpstreamBudget("Open-Meteo", UPSTREAM_CONCURRENCY_WEATHER)
AQI_BUDGET = UpstreamBudget("Open-Meteo (air quality)", UPSTREAM_CONCURRENCY_AQI)
WEATHER_WEIGHT = WeightedBudget(
    "Open-Meteo", UPSTREAM_WEIGHT_PER_MINUTE_WEATHER
)
AQI_WEIGHT = WeightedBudget("Open-Meteo (air quality)", UPSTREAM_WEIGHT_PER_MINUTE_AQI)
# Overpass budgets are per mirror and live in osm/mirrors.py's OVERPASS_MIRRORS table,
# built from UPSTREAM_CONCURRENCY_OVERPASS above.
NOMINATIM_GATE = MinIntervalGate("Nominatim (place search)", NOMINATIM_MIN_INTERVAL_MS / 1000.0)
