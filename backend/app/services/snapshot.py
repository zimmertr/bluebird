"""One national snapshot per upstream, refreshed on demand and kept past its date.

Three map overlays answer from a dataset this pod fetches once for everyone
rather than once per visitor: wildfire perimeters (``nifc.py``), smoke plumes
(``hms.py``) and Forest Service closure orders (``usfs_closures.py``). All
three want the same cache and none wants the
:class:`~app.services.cache.TTLCache`, which deletes an entry the moment it
expires — exactly the value these need to hold on to.

The reason is the same for both, and it is why this is stale-tolerant rather
than merely long-lived. A perimeter measured 40 minutes ago still answers "is
this trailhead within 10 miles of a fire" correctly, and a smoke plume analyzed
this morning is the only analysis there will be until an analyst draws the next
one. An expired snapshot is a far better answer than the honest-but-useless
"unavailable" a hard expiry produces whenever the upstream happens to refuse.
The only state that means "we cannot answer" is having never fetched at all.

Aging out therefore blocks nobody: an aged snapshot is served immediately and
refreshed *behind* the request. Only a cache that has never been filled makes a
caller wait, or fail.

The tolerance has a limit, though. A snapshot older than ``MAX_STALE_S`` is no
longer served: past it a fire map can be days out of date with nothing on
screen saying so, and the honest answer is the "unavailable" a cold cache
gives. Every refresh is also bounded as a whole by ``REFRESH_DEADLINE_S``,
because a caller waiting on a cold cache is a request the edge gives up on.

The cache is not all the overlays share. Each wires the cache to its own
upstream the same way, and each route answers a cold cache with the same 503,
so those live here too rather than as copies that can drift into different
answers to the same question (issue #388).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from app import telemetry
from app.error_codes import ApiError, ErrorCode
from app.services.errors import UpstreamError, classify_http_error

log = logging.getLogger(__name__)


# What a caller is asked to wait when the failure itself names no interval.
# Matches the failure backoff the overlays configure, so a retry lands about
# when the next refresh is allowed rather than before it.
DEFAULT_RETRY_AFTER_S = 60

# The oldest snapshot `get()` still serves when every refresh since it has
# failed: 24 hours, one value for every overlay and no env knob (decided by the
# maintainer, 2026-10-01, #580; record 0077). A day covers an upstream's
# ordinary bad night with nobody noticing, and a fire perimeter or a closure
# order older than that is a picture of a different day. Past it the route
# answers the same 503 a cold pod does, so the map shows the overlay as
# unavailable rather than as current.
MAX_STALE_S = 24 * 60 * 60

# The whole of one refresh, every page and every feed of it, from the first
# request to the parsed snapshot. A caller on a cold cache waits this long at
# most, and Cloudflare closes a proxied request at 100 s (its 524), after which
# the answer reaches nobody. Each upstream's own REQUEST_TIMEOUT_S bounds one
# operation only (60 to 120 s), and a paged feed is several of them in series.
# Measured 2026-10-01 from a home network, cold, three runs each: perimeters
# 1.2 to 5.5 s (6.7 s when #203 measured it), smoke 0.1 to 0.4 s, closures 0.5
# to 1.1 s, the snow grid 1.1 to 1.3 s. 60 s is about ten times the slowest of
# those, and leaves the edge 40 s for the lock wait and the response itself.
REFRESH_DEADLINE_S = 60.0


class SnapshotCache[T]:
    """Singleflight, stale-tolerant holder for one periodically refetched value.

    ``label`` names the upstream in log lines. ``describe`` turns a fresh
    snapshot into the one-line summary a successful refresh logs; it exists
    because "232 perimeters" and "18 plumes" are the facts worth seeing in a
    pod's logs and neither is derivable from here.
    """

    def __init__(
        self,
        *,
        label: str,
        fetch: Callable[[], Awaitable[T]],
        ttl_s: float,
        retry_after_failure_s: float,
        describe: Callable[[T], str] = lambda _: "ok",
        clock: Callable[[], float] = time.monotonic,
        max_stale_s: float = MAX_STALE_S,
        refresh_deadline_s: float = REFRESH_DEADLINE_S,
    ) -> None:
        self._label = label
        self._fetch = fetch
        self._ttl_s = ttl_s
        self._retry_after_failure_s = retry_after_failure_s
        self._describe = describe
        self._clock = clock
        self._max_stale_s = max_stale_s
        self._refresh_deadline_s = refresh_deadline_s
        self._lock = asyncio.Lock()
        self._snapshot: T | None = None
        # When the held snapshot landed, on `clock`. Its age is what
        # `MAX_STALE_S` is measured against; `_fresh_until` cannot say it,
        # because every failed refresh pushes that out by the backoff.
        self._fetched_at = 0.0
        # No refresh is started before this instant: the TTL after a success,
        # the backoff after a failure.
        self._fresh_until = 0.0
        self._refresh_task: asyncio.Task[None] | None = None
        self._last_error: Exception | None = None
        self.refreshes = 0
        # Created at 0 so the first failure is an increase an alert can see,
        # for the reason `telemetry.init_canary_series` gives.
        telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=label)

    @property
    def label(self) -> str:
        """The upstream this cache speaks for, as a person reads it."""
        return self._label

    @property
    def snapshot_or_none(self) -> T | None:
        """Whatever is held, without triggering a refresh. For diagnostics."""
        return self._snapshot

    def _servable(self) -> T | None:
        """The held snapshot, unless it is older than `MAX_STALE_S`."""
        if self._snapshot is not None and self._clock() - self._fetched_at <= self._max_stale_s:
            return self._snapshot
        return None

    def _current(self) -> T | None:
        if self._clock() < self._fresh_until:
            return self._servable()
        return None

    async def get(self) -> T:
        """The best snapshot available now, refreshing behind the request if aged.

        Raises when there is nothing servable: never fetched, or every refresh
        has failed for longer than `MAX_STALE_S`. Both raise the error the
        last refresh failed with, so the route's 503 says why.
        """
        fresh = self._current()
        if fresh is not None:
            return fresh

        aged = self._servable()
        if aged is not None:
            # Aged, not absent. Refresh behind the caller rather than in front
            # of it: a national fetch measured 6.7 seconds for perimeters, and
            # making one unlucky visitor per TTL wait that long to learn what
            # the previous visitor already knew is a bad trade for shapes that
            # move on a human timescale. The stamp travels with the data, so a
            # reader can still see exactly how old this answer is.
            self._schedule_refresh()
            return aged

        # Nothing servable: never fetched, or held past `MAX_STALE_S`. This is
        # the only path that can fail, and the only one a caller has to wait
        # on, for one refresh at most (`REFRESH_DEADLINE_S`).
        async with self._lock:
            held = self._servable()
            if held is not None:
                return held
            # A failed cold fetch sets the same backoff a failed refresh does,
            # and it has to be honoured here too: without this check every
            # request during an outage on a pod that never filled became its
            # own upstream attempt, in series behind the lock, which is the
            # hammering the backoff exists to stop (review of #552). The
            # caller answers 503 with the error's own Retry-After instead.
            if self._last_error is not None and self._clock() < self._fresh_until:
                raise self._last_error
            await self._refresh_locked()
            held = self._servable()
            if held is None:
                raise self._last_error or UpstreamError(f"{self._label} is unavailable.")
            return held

    def current_or_schedule(self) -> T | None:
        """The best snapshot available right now, without ever waiting for one.

        The counterpart to :meth:`get` for a caller that has something useful
        to say about "no answer yet". ``get`` makes the first caller after a
        cold start wait out the whole fetch, which is the right trade for an
        overlay whose only other answer is a blank map; it is the wrong one for
        a value attached to rows a request is already assembling, where the
        column simply reads as unknown and the next request has a grid.

        A refresh is scheduled whenever the freshness window has passed, which
        covers both the aged case and the never-fetched one, and the same
        window is what a failed refresh pushes out — so an outage is retried on
        its backoff rather than once per request.

        `MAX_STALE_S` does not apply here. The one caller is the snow depth
        fill, whose answer carries the grid's own analysis date onto the
        screen, so an old grid is a dated answer rather than a hidden one.
        """
        if self._clock() >= self._fresh_until:
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                # No loop to schedule on, which is a caller outside the server
                # rather than a failure: the contract here is to answer with
                # whatever is held, and a refresh that cannot be started is one
                # the next request inside the app starts instead. Asked before
                # the task is built, so no coroutine is left unawaited.
                log.debug("%s refresh not scheduled: no running event loop", self._label)
            else:
                self._schedule_refresh()
        return self._snapshot

    def _schedule_refresh(self) -> None:
        """Start a background refresh unless one is already running.

        The task reference is held because asyncio only weakly references
        running tasks, and a garbage-collected refresh would leave the snapshot
        aging forever while every request happily served it.
        """
        if self._refresh_task is not None and not self._refresh_task.done():
            return
        self._refresh_task = asyncio.create_task(self._refresh_guarded())

    async def _refresh_guarded(self) -> None:
        async with self._lock:
            # The refresh that just finished may already have satisfied this,
            # or failed and set the backoff this one has to wait out.
            if self._clock() < self._fresh_until:
                return
            await self._refresh_locked()

    async def _refresh_locked(self) -> None:
        """One upstream fetch. Caller holds the lock, which is what makes this
        singleflight: without it, the first request after a TTL boundary
        multiplied by every visitor is a thundering herd against the quota this
        class exists to stop spending."""
        try:
            # The deadline is asyncio's, the mechanism the elevation lookup's
            # `ENRICH_DEADLINE_S` uses; it ends in TimeoutError, which the
            # except below treats as any other failed refresh.
            async with asyncio.timeout(self._refresh_deadline_s):
                snapshot = await self._fetch()
        except Exception as exc:  # noqa: BLE001 — a refresh must never take the pod with it
            self._last_error = exc
            self._fresh_until = self._clock() + self._retry_after_failure_s
            telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=self._label).inc()
            # A deadline's TimeoutError has no message of its own.
            reason = str(exc) or f"no answer within {self._refresh_deadline_s:.0f}s"
            if self._snapshot is None:
                log.warning("%s fetch failed with nothing cached to fall back on: %s", self._label, reason)
            elif self._servable() is None:
                log.warning("%s refresh failed (%s); the last good snapshot is too old to serve", self._label, reason)
            else:
                log.warning("%s refresh failed (%s); still serving the last good snapshot", self._label, reason)
            return
        self._last_error = None
        self.refreshes += 1
        self._snapshot = snapshot
        self._fetched_at = self._clock()
        self._fresh_until = self._fetched_at + self._ttl_s
        log.info("%s snapshot refreshed: %s", self._label, self._describe(snapshot))

    async def settle(self) -> None:
        """Await any background refresh. For tests and for orderly shutdown."""
        task = self._refresh_task
        if task is not None:
            await asyncio.gather(task, return_exceptions=True)

    def clear(self) -> None:
        self._snapshot = None
        self._fetched_at = 0.0
        self._fresh_until = 0.0
        self._last_error = None


def cache_factory[T](
    *,
    label: str,
    fetch: Callable[[], Awaitable[T]],
    ttl_s: float,
    retry_after_failure_s: float,
    describe: Callable[[T], str],
) -> Callable[..., SnapshotCache[T]]:
    """One overlay's own cache factory, wired to its upstream and its knobs.

    A factory rather than a subclass, because nothing about the caching is any
    one overlay's: the singleflight, the serve-stale-and-refresh-behind, and
    the failure backoff are this module's. What a caller owns is which upstream
    it calls, what a successful refresh is worth saying in a pod's log, and its
    own defaults.

    The built callable takes every knob again, which is what lets a test swap
    the fetch, the clock or the TTL without restating the wiring. Its defaults
    are the wired values: a default expression is read in this scope, so the
    names below the ``def`` are the caller's arguments and the names to the
    right of the ``=`` are the ones passed here.
    """

    def build(
        *,
        ttl_s: float = ttl_s,
        retry_after_failure_s: float = retry_after_failure_s,
        clock: Callable[[], float] = time.monotonic,
        fetch: Callable[[], Awaitable[T]] = fetch,
        max_stale_s: float = MAX_STALE_S,
        refresh_deadline_s: float = REFRESH_DEADLINE_S,
    ) -> SnapshotCache[T]:
        return SnapshotCache(
            label=label,
            fetch=fetch,
            ttl_s=ttl_s,
            retry_after_failure_s=retry_after_failure_s,
            describe=describe,
            clock=clock,
            max_stale_s=max_stale_s,
            refresh_deadline_s=refresh_deadline_s,
        )

    return build


def unavailable_message(exc: Exception, provider: str) -> str:
    """The user-facing sentence for a cold-start failure."""
    if isinstance(exc, UpstreamError):
        return exc.message
    return classify_http_error(exc, provider)


async def snapshot_or_503[T](cache: SnapshotCache[T], *, event: str) -> T:
    """The snapshot to answer with, or the 503 that says why there is none.

    Every failure that reaches here means the cache holds nothing it may
    serve: never fetched, or older than `MAX_STALE_S`. Short of that,
    :meth:`SnapshotCache.get` serves what it holds rather than raising. ``event`` is the token a pod's logs are searched
    by, and is the only part of this an overlay still owns.
    """
    try:
        return await cache.get()
    except Exception as exc:
        retry_after = getattr(exc, "retry_after_s", DEFAULT_RETRY_AFTER_S)
        log.warning("event=%s error=%s", event, exc)
        raise ApiError(
            status_code=503,
            detail=unavailable_message(exc, cache.label),
            code=ErrorCode.snapshot_unavailable,
            headers={"Retry-After": str(retry_after)},
        ) from exc
