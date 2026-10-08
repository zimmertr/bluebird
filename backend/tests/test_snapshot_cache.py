"""`SnapshotCache` on a pod that has never filled (review of #552), and on one
whose refreshes have failed for a day or hang (#580).

A failed refresh sets a backoff, and `get()` honoured it only once a snapshot
existed. On a cold pod every request during an outage became its own upstream
attempt, in series behind the lock. These pin that the cold path waits out the
same backoff and then tries again.
"""

from __future__ import annotations

import asyncio

import pytest
from prometheus_client import REGISTRY

from app.error_codes import ApiError
from app.services.errors import UpstreamError
from app.services.snapshot import MAX_STALE_S, SnapshotCache, snapshot_or_503


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


# ── The age limit and the deadline (#580) ────────────────────────────────────

def _failures(label: str) -> float:
    value = REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": label}
    )
    return value or 0.0


async def test_a_snapshot_past_the_age_limit_raises_the_held_error():
    # Every refresh after the first fails. Up to the limit the old snapshot is
    # served; past it the route answers the cold cache's 503 with the error the
    # refreshes failed with, rather than a fire map days out of date.
    clock = _Clock()
    down = UpstreamError("down")
    cache, calls = _cache(clock, ["first"] + [down] * 50)
    assert await cache.get() == "first"

    clock.now += MAX_STALE_S - 1
    assert await cache.get() == "first"
    await cache.settle()

    clock.now += 2
    with pytest.raises(UpstreamError) as raised:
        await cache.get()
    assert raised.value is down
    with pytest.raises(ApiError) as answered:
        await snapshot_or_503(cache, event="test")
    assert answered.value.status_code == 503
    assert answered.value.detail == "down"


async def test_an_old_snapshot_with_no_failure_is_refreshed_in_front_of_the_caller():
    # Nobody asked for a day, so nothing has failed: the caller waits for the
    # one refresh rather than being handed yesterday.
    clock = _Clock()
    cache, calls = _cache(clock, ["first", "second"])
    assert await cache.get() == "first"
    clock.now += MAX_STALE_S + 1
    assert await cache.get() == "second"
    assert len(calls) == 2


async def test_the_age_limit_respects_the_failure_backoff():
    clock = _Clock()
    cache, calls = _cache(clock, ["first", UpstreamError("down"), "second"])
    assert await cache.get() == "first"
    clock.now += MAX_STALE_S + 1
    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 2
    # Inside the backoff: the held error again, and no upstream attempt.
    clock.now += 30
    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 2
    clock.now += 31
    assert await cache.get() == "second"


async def test_a_cold_refresh_ends_at_its_deadline_with_the_timeout_sentence():
    async def hang() -> str:
        await asyncio.sleep(30)
        return "never"

    cache = SnapshotCache(
        label="Hanging upstream",
        fetch=hang,
        ttl_s=600,
        retry_after_failure_s=60,
        refresh_deadline_s=0.05,
    )
    before = _failures("Hanging upstream")
    with pytest.raises(ApiError) as answered:
        await asyncio.wait_for(snapshot_or_503(cache, event="test"), timeout=5)
    assert answered.value.status_code == 503
    assert answered.value.detail == "Hanging upstream took too long. Try again later."
    assert _failures("Hanging upstream") == before + 1


async def test_a_background_refresh_past_its_deadline_keeps_serving_the_snapshot():
    clock = _Clock()
    answers: list[str] = ["first"]

    async def fetch() -> str:
        if answers:
            return answers.pop(0)
        await asyncio.sleep(30)
        return "never"

    cache = SnapshotCache(
        label="Slow refresh", fetch=fetch, ttl_s=600, retry_after_failure_s=60,
        clock=clock, refresh_deadline_s=0.05,
    )
    assert await cache.get() == "first"
    clock.now += 601
    assert await cache.get() == "first"
    await asyncio.wait_for(cache.settle(), timeout=5)
    assert await cache.get() == "first"
    assert _failures("Slow refresh") == 1


def test_a_new_cache_starts_its_failure_series_at_zero():
    # Born at 0, so the first failure is an increase an alert can see.
    SnapshotCache(label="Fresh series", fetch=_never, ttl_s=1, retry_after_failure_s=1)
    assert REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": "Fresh series"}
    ) == 0.0


async def _never() -> str:
    raise AssertionError("not fetched")
