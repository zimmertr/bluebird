"""One national snapshot per upstream, refreshed on demand and kept past its date.

Two map overlays answer from a country-sized dataset this pod fetches once for
everyone rather than once per visitor: wildfire perimeters (``nifc.py``) and
smoke plumes (``hms.py``). Both want the same cache and neither wants the
:class:`~app.services.cache.TTLCache`, which deletes an entry the moment it
expires — exactly the value these two need to hold on to.

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
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Generic, TypeVar

from app.services.errors import UpstreamError

log = logging.getLogger(__name__)

T = TypeVar("T")


class SnapshotCache(Generic[T]):
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
    ):
        self._label = label
        self._fetch = fetch
        self._ttl_s = ttl_s
        self._retry_after_failure_s = retry_after_failure_s
        self._describe = describe
        self._clock = clock
        self._lock = asyncio.Lock()
        self._snapshot: T | None = None
        self._fresh_until = 0.0
        self._refresh_task: asyncio.Task[None] | None = None
        self._last_error: Exception | None = None
        self.refreshes = 0

    @property
    def snapshot_or_none(self) -> T | None:
        """Whatever is held, without triggering a refresh. For diagnostics."""
        return self._snapshot

    def _current(self) -> T | None:
        if self._snapshot is not None and self._clock() < self._fresh_until:
            return self._snapshot
        return None

    async def get(self) -> T:
        """The best snapshot available now, refreshing behind the request if aged.

        Raises :class:`UpstreamError` only when there is nothing at all to
        serve, which after one successful fetch means never.
        """
        fresh = self._current()
        if fresh is not None:
            return fresh

        if self._snapshot is not None:
            # Aged, not absent. Refresh behind the caller rather than in front
            # of it: a national fetch measured 6.7 seconds for perimeters, and
            # making one unlucky visitor per TTL wait that long to learn what
            # the previous visitor already knew is a bad trade for shapes that
            # move on a human timescale. The stamp travels with the data, so a
            # reader can still see exactly how old this answer is.
            self._schedule_refresh()
            return self._snapshot

        # Nothing at all. This is the only path that can fail, and the only one
        # a caller has to wait on.
        async with self._lock:
            if self._snapshot is not None:
                return self._snapshot
            await self._refresh_locked()
            if self._snapshot is None:
                raise self._last_error or UpstreamError(f"{self._label} is unavailable.")
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
            # The refresh that just finished may already have satisfied this.
            if self._current() is not None:
                return
            await self._refresh_locked()

    async def _refresh_locked(self) -> None:
        """One upstream fetch. Caller holds the lock, which is what makes this
        singleflight: without it, the first request after a TTL boundary
        multiplied by every visitor is a thundering herd against the quota this
        class exists to stop spending."""
        try:
            snapshot = await self._fetch()
        except Exception as exc:  # noqa: BLE001 — a refresh must never take the pod with it
            self._last_error = exc
            self._fresh_until = self._clock() + self._retry_after_failure_s
            if self._snapshot is None:
                log.warning("%s fetch failed with nothing cached to fall back on: %s", self._label, exc)
            else:
                log.warning("%s refresh failed (%s); still serving the last good snapshot", self._label, exc)
            return
        self._last_error = None
        self.refreshes += 1
        self._snapshot = snapshot
        self._fresh_until = self._clock() + self._ttl_s
        log.info("%s snapshot refreshed: %s", self._label, self._describe(snapshot))

    async def settle(self) -> None:
        """Await any background refresh. For tests and for orderly shutdown."""
        task = self._refresh_task
        if task is not None:
            await asyncio.gather(task, return_exceptions=True)

    def clear(self) -> None:
        self._snapshot = None
        self._fresh_until = 0.0
        self._last_error = None
