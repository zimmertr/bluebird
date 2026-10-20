"""The per-client buckets, the Nominatim gate, the Open-Meteo budgets and the
geocode cache, held in the shared cache (#760).

Two instances of a guard play two pods: each keeps its own in-memory state, so
the only way the second can see the first's spend is through the database.
Time is moved by rewriting the stored timestamps rather than by sleeping, and
the gate's and the budget's sleeps are recorded rather than slept.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from conftest import fake_response
from fastapi import Request

from app import db, ratelimit
from app.db import refresh
from app.error_codes import ApiError
from app.main import app
from app.ratelimit import shared
from app.routes import geocode as geocode_mod
from app.services import cache

pytestmark = pytest.mark.db


@pytest.fixture(autouse=True)
def _no_pause():
    shared.reset()
    yield
    shared.reset()


@pytest.fixture
def slept(monkeypatch) -> list[float]:
    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    monkeypatch.setattr(ratelimit.upstream.asyncio, "sleep", record)
    return waits


async def _scalar(sql: str, *params):
    async with db.connection() as conn:
        row = await (await conn.execute(sql, params)).fetchone()
    return row[0] if row else None


async def _run(sql: str, *params) -> None:
    async with db.connection() as conn:
        await conn.execute(sql, params)


# ── Per-client buckets ─────────────────────────────────────────────────────


async def test_two_pods_spend_one_bucket(database):
    pod_a = ratelimit.RateLimiter(60, 2, name="analyze")
    pod_b = ratelimit.RateLimiter(60, 2, name="analyze")
    assert (await pod_a.take("203.0.113.9"))[0]
    assert (await pod_b.take("203.0.113.9"))[0]
    assert not (await pod_a.take("203.0.113.9"))[0]
    assert not (await pod_b.take("203.0.113.9"))[0]
    # Neither pod spent from its own memory.
    assert pod_a._buckets == pod_b._buckets == {}


async def test_a_burst_then_a_refusal_that_says_when(database):
    limiter = ratelimit.RateLimiter(60, 3, name="geocode")
    assert [(await limiter.take("a"))[0] for _ in range(3)] == [True, True, True]
    allowed, retry_after = await limiter.take("a")
    # 60 a minute is a token a second, and the bucket has just been emptied.
    assert not allowed
    assert 0.9 < retry_after <= 1.0


async def test_a_refusal_answers_429_with_retry_after(database):
    limiter = ratelimit.RateLimiter(60, 1, name="analyze")
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/analyze",
            "query_string": b"",
            "headers": [],
            "client": ("198.51.100.7", 4242),
        }
    )
    await ratelimit._throttle(limiter, request)
    with pytest.raises(ApiError) as exc:
        await ratelimit._throttle(limiter, request)
    assert exc.value.status_code == 429
    assert exc.value.headers == {"Retry-After": "1"}


async def test_the_bucket_refills_with_time(database):
    limiter = ratelimit.RateLimiter(60, 1, name="smoke")
    assert (await limiter.take("a"))[0]
    _, at_empty = await limiter.take("a")
    await _run("UPDATE rate_buckets SET updated = updated - interval '0.5 seconds'")
    allowed, at_half = await limiter.take("a")
    assert not allowed and at_half < at_empty
    await _run("UPDATE rate_buckets SET updated = updated - interval '1 second'")
    assert (await limiter.take("a"))[0]


async def test_a_refill_never_passes_the_burst(database):
    limiter = ratelimit.RateLimiter(60, 2, name="closures")
    await limiter.take("a")
    await _run("UPDATE rate_buckets SET updated = updated - interval '1 hour'")
    assert [(await limiter.take("a"))[0] for _ in range(3)] == [True, True, False]


async def test_buckets_are_kept_apart_by_name_and_key(database):
    analyze = ratelimit.RateLimiter(60, 1, name="analyze")
    geocode = ratelimit.RateLimiter(60, 1, name="geocode")
    assert (await analyze.take("a"))[0]
    assert not (await analyze.take("a"))[0]
    assert (await analyze.take("b"))[0]
    assert (await geocode.take("a"))[0]


async def test_pods_checking_at_once_never_spend_past_the_burst(database):
    pods = [ratelimit.RateLimiter(60, 5, name="wildfires") for _ in range(2)]
    results = await asyncio.gather(*(pods[i % 2].take("a") for i in range(20)))
    assert sum(allowed for allowed, _ in results) == 5


async def test_a_read_only_pod_writes_no_bucket(database, monkeypatch):
    monkeypatch.setattr(db, "READ_ONLY", True)
    limiter = ratelimit.RateLimiter(60, 1, name="analyze")
    assert (await limiter.take("a"))[0]
    assert not (await limiter.take("a"))[0]
    assert await _scalar("SELECT count(*) FROM rate_buckets") == 0


async def test_a_statement_the_database_refuses_counts_per_pod(database):
    await _run("ALTER TABLE rate_buckets RENAME TO rate_buckets_away")
    try:
        limiter = ratelimit.RateLimiter(60, 1, name="analyze")
        assert (await limiter.take("a"))[0]
        assert not (await limiter.take("a"))[0]
        assert limiter._buckets  # this pod's own bucket did the counting
    finally:
        await _run("ALTER TABLE rate_buckets_away RENAME TO rate_buckets")


# ── The Nominatim gate ─────────────────────────────────────────────────────


async def test_two_pods_queue_for_one_gate(database, slept):
    pod_a = ratelimit.MinIntervalGate("Nominatim (place search)", 0.2, max_wait_s=5)
    pod_b = ratelimit.MinIntervalGate("Nominatim (place search)", 0.2, max_wait_s=5)
    await pod_a.acquire()
    await pod_b.acquire()
    await pod_a.acquire()
    assert len(slept) == 2
    # The second waits one interval behind the first and the third two, less
    # the moment that passed between their bookings.
    assert 0.15 < slept[0] <= 0.2
    assert 0.35 < slept[1] <= 0.4


async def test_the_gate_sheds_past_max_wait_and_books_nothing(database, slept):
    pod_a = ratelimit.MinIntervalGate("Nominatim (place search)", 10.0, max_wait_s=1)
    pod_b = ratelimit.MinIntervalGate("Nominatim (place search)", 10.0, max_wait_s=1)
    await pod_a.acquire()
    before = await _scalar("SELECT next_free FROM gates")
    with pytest.raises(ratelimit.BudgetExhausted) as exc:
        await pod_b.acquire()
    assert exc.value.retry_after_s == 10
    assert await _scalar("SELECT next_free FROM gates") == before
    assert slept == []


# ── The Open-Meteo budgets ─────────────────────────────────────────────────


async def test_two_pods_book_into_one_window(database, slept):
    pod_a = ratelimit.WeightedBudget("Open-Meteo", 60)
    pod_b = ratelimit.WeightedBudget("Open-Meteo", 60)
    await pod_a.acquire(60)
    await pod_b.acquire(30)
    assert slept == [pytest.approx(60.0, abs=0.5)]
    # The second pod's narration reads the window it booked into: another 30
    # fits beside its own once the first pod's 60 has left.
    assert pod_b.wait_estimate_s(30) == pytest.approx(60.0, abs=0.5)
    assert await _scalar("SELECT count(*) FROM weight_bookings") == 2


async def test_the_shared_budget_sheds_and_books_nothing(database, slept):
    pod_a = ratelimit.WeightedBudget("Open-Meteo", 60, max_wait_s=15)
    pod_b = ratelimit.WeightedBudget("Open-Meteo", 60, max_wait_s=15)
    await pod_a.acquire(60)
    with pytest.raises(ratelimit.BudgetExhausted) as exc:
        await pod_b.acquire(30)
    assert exc.value.retry_after_s == 60
    assert await _scalar("SELECT count(*) FROM weight_bookings") == 1
    assert slept == []


async def test_an_oversized_booking_holds_the_shared_window_for_its_share(database, slept):
    pod_a = ratelimit.WeightedBudget("Open-Meteo", 60)
    pod_b = ratelimit.WeightedBudget("Open-Meteo", 60)
    await pod_a.acquire(120)
    await pod_b.acquire(1)
    assert slept == [pytest.approx(120.0, abs=0.5)]


async def test_budgets_are_kept_apart_by_provider(database, slept):
    weather = ratelimit.WeightedBudget("Open-Meteo", 60)
    aqi = ratelimit.WeightedBudget("Open-Meteo (air quality)", 60)
    await weather.acquire(60)
    await aqi.acquire(60)
    assert slept == []


async def test_pods_booking_at_once_spend_no_more_than_the_budget(database, slept):
    pods = [ratelimit.WeightedBudget("Open-Meteo", 100, max_wait_s=0) for _ in range(2)]

    async def book(i: int) -> bool:
        try:
            await pods[i % 2].acquire(10)
        except ratelimit.BudgetExhausted:
            return False
        return True

    booked = await asyncio.gather(*(book(i) for i in range(20)))
    assert sum(booked) == 10


# ── The geocode cache ──────────────────────────────────────────────────────


class _Counting:
    calls: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None, headers=None):
        _Counting.calls.append(params["q"])
        return fake_response([{"display_name": params["q"]}])


# Taken before any test runs: the geocode stubs replace `httpx.AsyncClient`
# itself, which would otherwise answer these requests without the app.
_AppClient = httpx.AsyncClient


async def _search(q: str) -> httpx.Response:
    # In-process and on this test's event loop, which the database pool is
    # bound to; TestClient would run the app on a loop of its own.
    transport = httpx.ASGITransport(app=app)
    async with _AppClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/geocode", params={"q": q})


async def test_a_search_one_pod_made_is_answered_on_another(database, monkeypatch):
    _Counting.calls = []
    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _Counting())
    first = await _search("Mount Baker")
    # Another pod has none of this one's memory.
    cache.GEOCODE_CACHE.clear()
    second = await _search("Mount Baker")
    assert first.json() == second.json() == [{"display_name": "Mount Baker"}]
    assert _Counting.calls == ["Mount Baker"]
    assert cache.GEOCODE_CACHE.get(cache.geocode_key("Mount Baker", 5)) is None


async def test_an_expired_search_is_asked_again(database, monkeypatch):
    _Counting.calls = []
    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _Counting())
    await _search("Mount Baker")
    await _run("UPDATE geocode_cache SET expires_at = now() - interval '1 second'")
    await _search("Mount Baker")
    assert _Counting.calls == ["Mount Baker", "Mount Baker"]
    # The answer is stored again for the next ten minutes.
    remaining = await _scalar(
        "SELECT extract(epoch FROM expires_at - now())::float8 FROM geocode_cache"
    )
    assert cache.GEOCODE_TTL_S - 5 < remaining <= cache.GEOCODE_TTL_S


# ── Housekeeping ───────────────────────────────────────────────────────────


async def test_the_sweep_deletes_what_no_guard_reads(database):
    await _run(
        "INSERT INTO rate_buckets VALUES"
        " ('analyze', 'idle', 0, now() - interval '2 hours'),"
        " ('analyze', 'recent', 0, now() - interval '10 minutes')"
    )
    await _run(
        "INSERT INTO weight_bookings VALUES"
        " ('Open-Meteo', now() - interval '2 minutes', now() - interval '1 minute', 50),"
        " ('Open-Meteo', now(), now() + interval '1 minute', 50)"
    )
    await _run(
        "INSERT INTO geocode_cache VALUES"
        " ('old', '[]', now() - interval '1 second'),"
        " ('live', '[]', now() + interval '5 minutes')"
    )
    assert await refresh.run_if_due(shared.HOUSEKEEPING)
    assert await _scalar("SELECT array_agg(key) FROM rate_buckets") == ["recent"]
    assert await _scalar("SELECT count(*) FROM weight_bookings WHERE leaves_at > now()") == 1
    assert await _scalar("SELECT count(*) FROM weight_bookings") == 1
    assert await _scalar("SELECT array_agg(key) FROM geocode_cache") == ["live"]
