"""Pod-wide caps on in-flight upstream calls, call spacing, and weighted spend.

Apart from the per-client buckets because every concurrent request in the pod
shares these, and the services acquire them rather than the routes.
"""

from __future__ import annotations

import asyncio
import heapq
import logging
import math
import time
from collections.abc import AsyncIterator, Callable, Sequence
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
# rather than read from a spec. `WeightedBudget` holds it as at most 550 in any
# 60 seconds, the provider's own shape for the limit, so a full burst never
# stacks on a full refill.
#
# Every pod gets the whole 550 rather than a 1/replicas share. Dividing was
# wrong in both directions. It under-serves, because one analysis is handled
# end to end by a single pod and can cost ~2,400 weighted calls (1,500
# locations across a 16-day window at the factor of 1.4), so the budget must
# cover one request's entire fan-out rather than a fair slice of aggregate
# traffic — and a divided share is floor-limited anyway, since 550/10 = 55 sits
# below the 80.0 a single 16-day batch costs, which would pace every batch on
# an otherwise idle pod. It also over-protects, because since the client path
# shipped the SPA fetches Open-Meteo from the browser on the visitor's own IP;
# the server path runs only for an unkeyed API caller, so pod-originated spend
# is the exception rather than the norm.
#
# The trade is that the cluster as a whole can exceed 550/min when several pods
# fetch at once. Accepted deliberately: this is a ceiling, not a reservation,
# and the per-minute pacer never protected the hourly (5,000) or daily (10,000)
# quotas anyway — even at 180 a pod exhausts a day's allowance in under an
# hour. What protects those is the browser-first split above. #65's shared
# store is the durable fix that makes this exact instead of approximate.
#
# 0 disables pacing, and is worse than any positive value: unpaced, four
# concurrent batches fire ~320 weighted calls at once, trip the minute ceiling,
# burn the single automatic resume in openmeteo_fetch.py and fail the analysis
# outright.
UPSTREAM_WEIGHT_PER_MINUTE_WEATHER = env_int("UPSTREAM_WEIGHT_PER_MINUTE_WEATHER", 550)
UPSTREAM_WEIGHT_PER_MINUTE_AQI = env_int("UPSTREAM_WEIGHT_PER_MINUTE_AQI", 550)
# A single acquire that would have to wait longer than this sheds instead, so
# a stampede cannot stack waiters without bound. It is passed in two ways, and
# only one of them is a wedge. A forecast window never passes it: a worst-case
# 16-day batch costs 80.0, six of them fit in one minute's 550, and an
# analysis's four in-flight batches are all booked inside that minute. A long
# ARCHIVE window does: past 55 days at the pod's fourteen variables a
# 50-location batch costs more than half of 550 (50 x 1.4 x 56/14 = 280), so
# only one fits in any 60 seconds, the fourth in-flight batch is booked three
# minutes out, and an analysis of more than 150 destinations over 56 days or
# more (111 at 101 to 150, 221 at 51 to 100) would shed on every retry, idle
# pod or not. So an unkeyed analysis is first run through `plan_max_wait_s`
# against this same bound and refused before it spends anything
# (`_check_pacing` in routes/analyze/phases.py), and a shed is left meaning
# other traffic.
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

    At most ``per_minute`` is spent in any 60 seconds, which is how Open-Meteo
    states its own limit. A token bucket cannot say that and still let a whole
    minute's budget through at once: one that starts full and refills at the
    same rate spends twice the budget in its first minute, and one that does not
    must either refill slower or start nearly empty. This is a sliding-window
    log instead. Each acquire books the earliest start, no earlier than the
    acquire booked before it, at which it and every booking still inside the 60
    seconds before that start fit under ``per_minute``; then it sleeps until that
    start. So a burst of up to a minute's budget passes instantly, and anything
    beyond it is *paced*, not refused. Booking in order is what serializes
    concurrent callers fairly on the single event loop; no lock is needed for
    the same reason the other classes here need none.

    One booking larger than ``per_minute`` (a long archive window can price a
    batch above it) starts only when nothing else is booked, and holds the
    window for ``weight / per_minute`` minutes rather than one, so the spend
    still averages ``per_minute`` a minute.

    An acquire whose wait would exceed ``max_wait_s`` sheds with
    :class:`BudgetExhausted` and books nothing. A ``per_minute`` of 0 disables
    the budget outright, mirroring the limiters' dev escape hatch.
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
        self._max_wait = float(
            UPSTREAM_WEIGHT_MAX_WAIT_S if max_wait_s is None else max_wait_s
        )
        self._clock = clock
        # (start, leaves_window_at, weight), in booking order.
        self._booked: list[tuple[float, float, float]] = []
        # The latest clock reading seen. A clock that runs backwards would
        # otherwise read a booking as further away than it was made, and wait
        # for time that never passed.
        self._now = clock()

    @property
    def enabled(self) -> bool:
        return self.per_minute > 0

    def _start_for(self, weight: float) -> tuple[float, float]:
        """(now, the earliest start a booking of ``weight`` may take)."""
        now = max(self._now, self._clock())
        self._now = now
        self._booked = [b for b in self._booked if b[1] > now]
        start = max([now] + [b[0] for b in self._booked])
        live = sorted((b for b in self._booked if b[1] > start), key=lambda b: b[1])
        total = sum(b[2] for b in live)
        for _, leaves, w in live:
            if total + weight <= self.per_minute:
                break
            start = max(start, leaves)
            total -= w
        return now, start

    def wait_estimate_s(self, weight: float) -> float:
        """Seconds a caller would wait to spend ``weight`` right now.

        Read-only: lets the fetch layer narrate an upcoming pace wait
        ("resuming in ~34s") without committing to the spend yet.
        """
        if not self.enabled:
            return 0.0
        now, start = self._start_for(weight)
        return start - now

    def _book(self, weight: float) -> None:
        """Book ``weight`` at its earliest start, with no shed."""
        _, start = self._start_for(weight)
        held_s = 60.0 * max(1.0, weight / self.per_minute)
        self._booked.append((start, start + held_s, weight))

    def plan_max_wait_s(
        self, chunks: Sequence[Sequence[float]], concurrency: int
    ) -> float:
        """The longest one acquire would wait if ``chunks`` ran alone, from idle.

        Each chunk is one batch's acquires, in order, and ``concurrency``
        batches run at once, each next one starting the moment an earlier one
        is through its waits. That is how `fetch_batched` spends, with every
        request taken to answer instantly, which is the case that waits
        longest: a slow answer only gives the budget time to refill. Run on a
        scratch copy with its own clock, so the live budget is never touched.

        This is what lets an analysis that its own batches would shed be
        refused before it spends anything (#581), where it used to spend its
        first batches and then shed with a 503 on every retry.
        """
        if not self.enabled:
            return 0.0
        clock = [0.0]
        idle = WeightedBudget(
            self.provider, self.per_minute, max_wait_s=math.inf, clock=lambda: clock[0]
        )
        free = [0.0] * max(1, concurrency)
        worst = 0.0
        for weights in chunks:
            t = heapq.heappop(free)
            for weight in weights:
                clock[0] = t
                wait = idle.wait_estimate_s(weight)
                idle._book(weight)
                worst = max(worst, wait)
                t += wait
            heapq.heappush(free, t)
        return worst

    async def acquire(self, weight: float) -> None:
        if not self.enabled or weight <= 0:
            return
        now, start = self._start_for(weight)
        wait = start - now
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
        self._book(weight)
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
