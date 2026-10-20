"""One national snapshot per upstream, refreshed on demand and kept past its date.

Three map overlays answer from a dataset fetched once for everyone rather than
once per visitor: wildfire perimeters (``nifc.py``), smoke plumes
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

With the shared cache on (#760), "once" means once for every pod. Each overlay
registers a refresh source whose run is :meth:`SnapshotCache.publish`: one pod
at a time fetches the upstream on the overlay's interval and writes the
snapshot to the ``snapshots`` table, and every pod's cache reads that row
instead of the upstream, read-only previews included. What a reader does with
it is everything above, with the row's age in place of the pod's own fetch
time: an aged copy is served while the row is read again behind the request,
and past ``MAX_STALE_S`` the answer is the same 503. With no database, or one
that cannot answer, each pod fetches for itself exactly as before.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app import db, telemetry
from app.db import refresh
from app.error_codes import ApiError, ErrorCode
from app.services.errors import UpstreamError, classify_http_error, log_reason

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
# operation only (60 s each), and a paged feed is several of them in series.
# Measured 2026-10-01 from a home network, cold, three runs each: perimeters
# 1.2 to 5.5 s (6.7 s when #203 measured it), smoke 0.1 to 0.4 s, closures 0.5
# to 1.1 s. 60 s is about ten times the slowest of those, and leaves the edge
# 40 s for the lock wait and the response itself.
REFRESH_DEADLINE_S = 60.0

# How long a pod serves the shared row it last read before asking whether a
# newer one has landed (#760). The refresh loop that writes the row looks for
# due work every `refresh.TICK_S`, so reading more often than that finds
# nothing new, and a new snapshot reaches every pod at most two ticks after
# it was fetched. The read is one primary-key lookup of a timestamp, made only
# while requests arrive, and the body crosses the wire only when that
# timestamp moved.
SHARED_POLL_S = refresh.TICK_S

# One read of the shared row, its body and its decoding included. A failed or
# hung read falls back to the per-pod upstream fetch, which has
# `REFRESH_DEADLINE_S` of its own, and a caller on a cold cache may wait for
# both: 30 + 60 s stays inside Cloudflare's 100 s.
SHARED_READ_DEADLINE_S = 30.0

# The whole of one shared refresh, from the first upstream request to the
# written row. No caller waits on it, so the 60 s that fits a cold caller
# inside the edge's 100 s does not bind here. 120 s is NIFC's own
# REQUEST_TIMEOUT_S, the longest single request any of the three feeds allows
# itself, so a slow but live full-resolution page can finish; it is about
# eighteen times the slowest cold fetch measured (6.7 s), and a fifth of the
# shortest interval (600 s), so a hung attempt is over long before the next
# one is due and the lock it holds is free again.
SHARED_REFRESH_DEADLINE_S = 120.0


class SharedSnapshotUnreadable(Exception):
    """A shared row this release cannot read: another format, or not a snapshot.

    A pod of the next release writes the next format while a canary rollout
    still runs this one, so a reader that meets one fetches for itself rather
    than misreading the row or failing the request.
    """


class SharedSnapshotMissing(UpstreamError):
    """The shared cache has no snapshot a reader may serve.

    Either none has been written yet, or the newest is older than
    `MAX_STALE_S`. The message and the wait are the shared refresh's own,
    from `refresh_state`, so every pod's 503 says what the refreshing pod
    learned.
    """

    def __init__(self, message: str, retry_after_s: int) -> None:
        super().__init__(message)
        self.retry_after_s = retry_after_s


@dataclass(frozen=True)
class Shared[T]:
    """How one overlay's snapshot is kept in the shared cache's `snapshots` table.

    ``source`` names the row and the refresh source both. ``encode`` turns a
    snapshot into plain JSON values and ``decode`` turns them back into an
    equal snapshot; ``format`` is bumped whenever that shape changes, so a pod
    of another release refuses the row instead of misreading it.
    """

    source: str
    format: int
    encode: Callable[[T], dict[str, Any]]
    decode: Callable[[dict[str, Any]], T]

    def pack(self, snapshot: T) -> bytes:
        """The row's body: the encoded snapshot in a versioned envelope, gzipped."""
        text = json.dumps(
            {"format": self.format, "snapshot": self.encode(snapshot)}, separators=(",", ":")
        )
        # Level 6 is zlib's default balance: the writer pays it once per
        # interval, and every pod downloads the result. `mtime=0` keeps equal
        # snapshots equal bytes.
        return gzip.compress(text.encode("utf-8"), compresslevel=6, mtime=0)

    def unpack(self, body: bytes) -> T:
        """A row's body back into a snapshot, or SharedSnapshotUnreadable."""
        try:
            envelope = json.loads(gzip.decompress(body))
            found = envelope.get("format")
            data = envelope["snapshot"]
        except Exception as exc:
            raise SharedSnapshotUnreadable(f"not a snapshot ({exc})") from exc
        if found != self.format:
            raise SharedSnapshotUnreadable(f"format {found!r}; this release reads {self.format}")
        try:
            return self.decode(data)
        except Exception as exc:
            raise SharedSnapshotUnreadable(f"format {found} did not decode ({exc!r})") from exc


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
        shared: Shared[T] | None = None,
    ) -> None:
        self._label = label
        self._fetch = fetch
        self._ttl_s = ttl_s
        self._retry_after_failure_s = retry_after_failure_s
        self._describe = describe
        self._clock = clock
        self._max_stale_s = max_stale_s
        self._refresh_deadline_s = refresh_deadline_s
        self._shared = shared
        self._lock = asyncio.Lock()
        self._snapshot: T | None = None
        # When the held snapshot landed, on `clock`. Its age is what
        # `MAX_STALE_S` is measured against; `_fresh_until` cannot say it,
        # because every failed refresh pushes that out by the backoff.
        self._fetched_at = 0.0
        # No refresh is started before this instant: the TTL after a success,
        # the backoff after a failure, `SHARED_POLL_S` after a shared read.
        self._fresh_until = 0.0
        self._refresh_task: asyncio.Task[None] | None = None
        self._last_error: Exception | None = None
        # The shared row's `fetched_at` the held snapshot was read from, or
        # None when this pod fetched it itself. While the row is unchanged the
        # held object is kept rather than decoded again, which is what keeps
        # `HeldBodies` to one gzip per snapshot per pod.
        self._row_stamp: datetime | None = None
        # Created at 0 so the first failure is an increase an alert can see,
        # for the reason `telemetry.init_canary_series` gives.
        telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=label)

    @property
    def label(self) -> str:
        """The upstream this cache speaks for, as a person reads it."""
        return self._label

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
                raise self._last_error or self._unavailable()
            return held

    def _unavailable(self) -> UpstreamError:
        return UpstreamError(f"{self._label} is unavailable.")

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
        """One refresh: a read of the shared row, or one upstream fetch.

        Caller holds the lock, which is what makes this singleflight: without
        it, the first request after a TTL boundary multiplied by every visitor
        is a thundering herd against the quota this class exists to stop
        spending. A shared cache that cannot answer, rather than one that has
        nothing to serve, sends this refresh to the upstream as if there were
        no database (#760).
        """
        if self._shared is not None and db.available():
            try:
                async with asyncio.timeout(SHARED_READ_DEADLINE_S):
                    await self._read_shared(self._shared)
                return
            except (db.DatabaseUnavailable, SharedSnapshotUnreadable, TimeoutError) as exc:
                log.warning(
                    "%s: the shared cache cannot answer (%s); fetching upstream",
                    self._label,
                    log_reason(exc, deadline_s=SHARED_READ_DEADLINE_S),
                )
                self._row_stamp = None
        await self._fetch_locked()

    async def _read_shared(self, shared: Shared[T]) -> None:
        """Serve the shared row: the same object while it is unchanged, a new one when not.

        The row's age comes from the database's own clock (`now() -
        fetched_at`), so it is the age of the fetch rather than of this pod's
        read, and a pod that reads a 23-hour-old row stops serving it an hour
        later, not a day. The held snapshot's landing time is set that far
        back on `clock`, which `_servable` then measures as it always has.
        """
        known = self._row_stamp if self._snapshot is not None else None
        async with db.connection() as conn:
            row = await (
                await conn.execute(
                    "SELECT fetched_at, extract(epoch FROM now() - fetched_at)::float8,"
                    " CASE WHEN fetched_at IS DISTINCT FROM %s::timestamptz THEN body END"
                    " FROM snapshots WHERE source = %s",
                    (known, shared.source),
                )
            ).fetchone()
        now = self._clock()
        self._fresh_until = now + SHARED_POLL_S
        if row is None or row[1] > self._max_stale_s:
            # Nothing a reader may serve. This pod does not fetch for itself:
            # the refreshing pod is already trying, on the shared backoff,
            # and ten pods each asking the upstream is what the database is
            # here to stop.
            self._last_error = await self._shared_missing(shared)
            log.info(
                "%s: the shared cache has no snapshot to serve (%s)",
                self._label,
                "none written yet" if row is None else f"the newest is {row[1] / 3600:.0f} h old",
            )
            return
        stamp, age_s, body = row
        if body is not None:
            # Decoded off the event loop: the national perimeters are about
            # 18 MB of JSON once unzipped.
            snapshot = await asyncio.to_thread(shared.unpack, body)
            self._snapshot = snapshot
            self._row_stamp = stamp
            log.info("%s snapshot read from the shared cache: %s", self._label, self._describe(snapshot))
        self._fetched_at = now - age_s
        self._last_error = None

    async def _shared_missing(self, shared: Shared[T]) -> SharedSnapshotMissing:
        """Why there is nothing to serve, in the refreshing pod's words when it has any."""
        state = await refresh.state(shared.source)
        if state is None:
            return SharedSnapshotMissing(self._unavailable().message, DEFAULT_RETRY_AFTER_S)
        return SharedSnapshotMissing(
            state.last_error or self._unavailable().message,
            state.retry_after_s or DEFAULT_RETRY_AFTER_S,
        )

    async def _fetch_locked(self) -> None:
        """One upstream fetch, this pod's own. Caller holds the lock."""
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
            # A deadline's TimeoutError has no message of its own, and nor
            # does a reset connection, which must not read as the deadline.
            reason = log_reason(exc, deadline_s=self._refresh_deadline_s)
            if self._snapshot is None:
                log.warning("%s fetch failed with nothing cached to fall back on: %s", self._label, reason)
            elif self._servable() is None:
                log.warning("%s refresh failed (%s); the last good snapshot is too old to serve", self._label, reason)
            else:
                log.warning("%s refresh failed (%s); still serving the last good snapshot", self._label, reason)
            return
        self._last_error = None
        self._snapshot = snapshot
        self._fetched_at = self._clock()
        self._fresh_until = self._fetched_at + self._ttl_s
        log.info("%s snapshot refreshed: %s", self._label, self._describe(snapshot))

    async def settle(self) -> None:
        """Await any background refresh, so a test can read what it left."""
        task = self._refresh_task
        if task is not None:
            await asyncio.gather(task, return_exceptions=True)

    async def publish(self) -> None:
        """Fetch the upstream once and write the snapshot for every pod (#760).

        The run of this overlay's refresh source, so one pod at a time runs it
        (`app/db/refresh.py`). A failure counts in the same metric a per-pod
        refresh does, and leaves as an `UpstreamError` whose message is the
        sentence a 503 carries, because the refresh records it in
        `refresh_state` for every reader to answer with. The snapshot keeps
        its own `fetched_at_ms`, the moment the upstream answered.
        """
        shared = self._shared
        if shared is None:
            raise RuntimeError(f"{self._label} is not kept in the shared cache")
        try:
            async with asyncio.timeout(SHARED_REFRESH_DEADLINE_S):
                snapshot = await self._fetch()
                body = await asyncio.to_thread(shared.pack, snapshot)
                async with db.connection() as conn:
                    await conn.execute(
                        "INSERT INTO snapshots (source, fetched_at, body) VALUES (%s, now(), %s)"
                        " ON CONFLICT (source) DO UPDATE"
                        " SET fetched_at = excluded.fetched_at, body = excluded.body",
                        (shared.source, body),
                    )
        except Exception as exc:
            telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=self._label).inc()
            if isinstance(exc, UpstreamError):
                raise
            raise UpstreamError(unavailable_message(exc, self._label)) from exc
        log.info(
            "%s snapshot written to the shared cache (%d bytes): %s",
            self._label,
            len(body),
            self._describe(snapshot),
        )

    def source(self) -> refresh.Source:
        """This overlay's shared refresh, registered by the module that wires it.

        The interval is the overlay's TTL, so every pod together fetches the
        upstream as often as one pod did on its own.
        """
        if self._shared is None:
            raise RuntimeError(f"{self._label} is not kept in the shared cache")
        return refresh.Source(
            name=self._shared.source,
            interval_s=self._ttl_s,
            run=self.publish,
            # A margin over `publish`'s own deadline, so that one, which counts
            # the failure and words it, always ends a hung refresh first.
            deadline_s=SHARED_REFRESH_DEADLINE_S + 15,
        )


def cache_factory[T](
    *,
    label: str,
    fetch: Callable[[], Awaitable[T]],
    ttl_s: float,
    retry_after_failure_s: float,
    describe: Callable[[T], str],
    shared: Shared[T] | None = None,
) -> Callable[..., SnapshotCache[T]]:
    """One overlay's own cache factory, wired to its upstream and its knobs.

    A factory rather than a subclass, because nothing about the caching is any
    one overlay's: the singleflight, the serve-stale-and-refresh-behind, and
    the failure backoff are this module's. What a caller owns is which upstream
    it calls, what a successful refresh is worth saying in a pod's log, and its
    own defaults, and how its snapshot is kept in the shared cache (#760).

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
            shared=shared,
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
        log.warning(
            "event=%s error=%s", event, log_reason(exc, deadline_s=cache._refresh_deadline_s)
        )
        raise unavailable_error(unavailable_message(exc, cache.label), retry_after) from exc


def unavailable_error(detail: str, retry_after_s: int) -> ApiError:
    """The 503 for a held set with nothing it may serve, worded by the caller.

    One home for its status, code and header, which the overlays and the map's
    trailhead and crag markers (`routes/landmarks.py`) all answer with.
    """
    return ApiError(
        status_code=503,
        detail=detail,
        code=ErrorCode.snapshot_unavailable,
        headers={"Retry-After": str(retry_after_s)},
    )
