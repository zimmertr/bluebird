"""WeightedBudget pacing and Open-Meteo 429 parsing (issue #180)."""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import pytest

from app import ratelimit
from app.services import weather
from app.services.errors import parse_rate_limit, rate_limit_message
from app.services.openmeteo_fetch import BATCH_SIZE
from app.services.openmeteo_weight import call_weight


class _Clock:
    def __init__(self, t: float = 0.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def _sleep_recorder(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(ratelimit.upstream.asyncio, "sleep", fake_sleep)
    return slept


async def test_burst_within_one_minute_of_budget_is_instant(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 600, clock=_Clock())
    for _ in range(12):
        await budget.acquire(50)  # exactly the full 600 capacity
    assert slept == []


async def test_no_sixty_seconds_spend_more_than_the_budget(monkeypatch):
    # Issue #581: the token bucket this replaced started full AND refilled at
    # the full rate, so an idle budget of 550 spent ~1,100 in its first minute
    # against a provider that counts 600 a minute. Every start a run of
    # acquires is booked at, and the window behind it, must hold the line.
    _sleep_recorder(monkeypatch)
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 550, max_wait_s=3600, clock=clock)
    starts: list[tuple[float, float]] = []
    for _ in range(40):
        before = budget.wait_estimate_s(80.0)
        await budget.acquire(80.0)
        starts.append((clock.t + before, 80.0))
        clock.t += 1.0  # callers arrive a second apart, faster than it pays
    for t, _ in starts:
        in_window = sum(w for s, w in starts if t - 60 < s <= t)
        assert in_window <= 550
    # And it still spends the whole budget: six 80s fit in every minute.
    assert sum(w for s, w in starts if s < 60) == 480


async def test_a_full_window_waits_for_the_oldest_spend_to_leave(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, clock=_Clock())
    await budget.acquire(60)  # fills the window, instant
    await budget.acquire(30)  # fits only once the first spend is 60 s old
    assert slept == [pytest.approx(60.0)]


async def test_concurrent_callers_serialize_in_booking_order(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, clock=_Clock())
    await budget.acquire(60)
    await budget.acquire(40)
    await budget.acquire(10)  # would fit beside the 40, never ahead of it
    await budget.acquire(20)  # 40 + 10 + 20 is over: waits for the 40 to leave
    assert slept == [pytest.approx(60.0), pytest.approx(60.0), pytest.approx(120.0)]


async def test_an_oversized_spend_holds_the_window_for_its_share(monkeypatch):
    # A batch priced above a whole minute's budget starts alone and keeps the
    # average at the budget: 120 against 60 a minute holds two minutes.
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, clock=_Clock())
    await budget.acquire(120)
    await budget.acquire(1)
    assert slept == [pytest.approx(120.0)]


async def test_waits_beyond_max_wait_shed_instead(monkeypatch):
    _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, max_wait_s=15, clock=_Clock())
    await budget.acquire(60)
    with pytest.raises(ratelimit.BudgetExhausted) as exc:
        await budget.acquire(30)  # would wait 60s > 15s bound
    assert exc.value.retry_after_s == 60
    # A shed books nothing, so the window is exactly as full as before it.
    assert budget.wait_estimate_s(30) == pytest.approx(60.0)


async def test_zero_per_minute_disables(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 0, clock=_Clock())
    await budget.acquire(10_000)
    assert slept == []


def test_wait_estimate_reads_without_spending():
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 60, clock=clock)
    assert budget.wait_estimate_s(60) == 0.0
    asyncio.run(budget.acquire(60))
    assert budget.wait_estimate_s(30) == pytest.approx(60.0)
    # Estimating twice changes nothing: only acquire spends.
    assert budget.wait_estimate_s(30) == pytest.approx(60.0)


def test_a_spend_leaves_the_window_after_sixty_seconds(monkeypatch):
    _sleep_recorder(monkeypatch)
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 60, clock=clock)
    asyncio.run(budget.acquire(60))
    clock.t = 30.0  # half a minute later the spend still counts
    assert budget.wait_estimate_s(30) == pytest.approx(30.0)
    clock.t = 60.0
    assert budget.wait_estimate_s(60) == 0.0


def _http_429(body: dict | str, headers: dict | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://api.open-meteo.com/v1/forecast")
    if isinstance(body, dict):
        response = httpx.Response(429, json=body, headers=headers, request=request)
    else:
        response = httpx.Response(429, text=body, headers=headers, request=request)
    return httpx.HTTPStatusError("429", request=request, response=response)


def test_parse_rate_limit_reads_the_scope_word():
    scope, retry = parse_rate_limit(
        _http_429({"error": True, "reason": "Minutely API request limit exceeded."})
    )
    assert scope == "minutely"
    assert retry == 60
    scope, retry = parse_rate_limit(
        _http_429({"error": True, "reason": "Hourly API request limit exceeded."})
    )
    assert scope == "hourly"
    assert retry == 900


def test_parse_rate_limit_prefers_retry_after_header():
    scope, retry = parse_rate_limit(
        _http_429(
            {"reason": "Minutely API request limit exceeded."},
            headers={"Retry-After": "42"},
        )
    )
    assert scope == "minutely"
    assert retry == 42


def test_parse_rate_limit_degrades_on_garbage():
    scope, retry = parse_rate_limit(_http_429("<html>busy</html>"))
    assert scope is None
    assert retry == 60


def test_rate_limit_messages_state_the_horizon():
    assert "quota reached" in rate_limit_message("Open-Meteo (weather service)", "hourly")
    assert "quota reached" in rate_limit_message("Open-Meteo (weather service)", "daily")
    assert "rate-limiting" in rate_limit_message("Open-Meteo (weather service)", None)


def test_backwards_clock_never_manufactures_a_wait():
    # time.monotonic cannot regress, but a clock that did must not lengthen a
    # wait: read naively, a booking 60 s out would sit 110 s out after a 50 s
    # regression, punishing clients for time that never passed.
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 60, clock=clock)
    asyncio.run(budget.acquire(60))
    clock.t = -50.0
    assert budget.wait_estimate_s(1) == pytest.approx(60.0)


def test_token_bucket_backwards_clock_keeps_tokens():
    clock = _Clock(t=100.0)
    bucket = ratelimit._TokenBucket(capacity=5, rate_per_s=1.0, now=clock.t)
    clock.t = 0.0  # clock regresses a full 100 seconds
    assert bucket.try_acquire(clock.t) is True  # still spends from a full bucket


# ── Undivided per-pod budget ───────────────────────────────────────────────


def test_weight_budget_default_is_the_full_undivided_safe_rate():
    # 550 on every pod, not 550/replicas. One analysis runs end to end on a
    # single pod, so the budget has to cover one request's whole fan-out.
    assert ratelimit.UPSTREAM_WEIGHT_PER_MINUTE_WEATHER == 550
    assert ratelimit.UPSTREAM_WEIGHT_PER_MINUTE_AQI == 550


def test_default_budget_clears_a_worst_case_batch_without_pacing():
    # The invariant that rules out dividing the budget by replica count: a
    # budget below one batch's cost cannot fit two batches in a minute and
    # would pace every batch after the first even on a completely idle pod.
    # A 1/10 share (55) sits under the 80.0 a full 50-location 16-day batch
    # costs; the undivided 550 clears it outright.
    #
    # 80.0 rather than the 57.1 this read before #443: the five level
    # temperatures take the variable factor from 1 to 1.4, and every capacity
    # number that reads N_VARIABLES moves with it.
    worst_batch = call_weight(
        BATCH_SIZE, date(2026, 1, 1), date(2026, 1, 16), weather.N_VARIABLES
    )
    assert worst_batch == pytest.approx(80.0, abs=0.01)

    idle = ratelimit.WeightedBudget("test", ratelimit.UPSTREAM_WEIGHT_PER_MINUTE_WEATHER)
    assert idle.wait_estimate_s(worst_batch) == 0.0

    rationed = ratelimit.WeightedBudget("test", 550 // 10)
    asyncio.run(rationed.acquire(worst_batch))
    assert rationed.wait_estimate_s(worst_batch) > 0.0


# ── An analysis's own plan, from idle (#581) ───────────────────────────────


def test_plan_reads_the_longest_wait_a_run_of_batches_would_meet():
    budget = ratelimit.WeightedBudget("test", 60)
    # One at a time: 60 fills the minute, so the next 30 waits for it to leave.
    assert budget.plan_max_wait_s([[60], [30]], concurrency=1) == pytest.approx(60.0)
    # Nothing that fits a full budget waits.
    assert budget.plan_max_wait_s([[20], [20], [20]], concurrency=3) == 0.0


def test_plan_never_touches_the_live_budget():
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 60, clock=clock)
    budget.plan_max_wait_s([[60], [60], [60]], concurrency=4)
    assert budget.wait_estimate_s(60) == 0.0


def test_a_disabled_budget_plans_no_wait():
    assert ratelimit.WeightedBudget("test", 0).plan_max_wait_s([[10_000]], 4) == 0.0
