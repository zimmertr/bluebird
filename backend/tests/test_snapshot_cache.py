"""`SnapshotCache` on a pod that has never filled (review of #552).

A failed refresh sets a backoff, and `get()` honoured it only once a snapshot
existed. On a cold pod every request during an outage became its own upstream
attempt, in series behind the lock. These pin that the cold path waits out the
same backoff and then tries again.
"""

from __future__ import annotations

import pytest

from app.services.errors import UpstreamError
from app.services.snapshot import SnapshotCache


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _cache(clock: _Clock, answers: list[object]) -> tuple[SnapshotCache[str], list[int]]:
    calls: list[int] = []

    async def fetch() -> str:
        calls.append(1)
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return str(answer)

    cache = SnapshotCache(
        label="test", fetch=fetch, ttl_s=600, retry_after_failure_s=60, clock=clock
    )
    return cache, calls


async def test_a_cold_cache_waits_out_the_failure_backoff():
    clock = _Clock()
    cache, calls = _cache(clock, [UpstreamError("down"), "ok"])

    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 1

    # Inside the backoff: the same error, and no second upstream attempt.
    clock.now += 30
    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 1

    # Past it: one more attempt, which lands.
    clock.now += 31
    assert await cache.get() == "ok"
    assert len(calls) == 2


async def test_a_filled_cache_still_serves_through_a_failed_refresh():
    clock = _Clock()
    cache, calls = _cache(clock, ["first", UpstreamError("down")])
    assert await cache.get() == "first"
    clock.now += 601
    assert await cache.get() == "first"
    await cache.settle()
    assert len(calls) == 2
    assert await cache.get() == "first"
