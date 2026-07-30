"""WeightedBudget pacing and Open-Meteo 429 parsing (issue #180)."""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import pytest
from app import ratelimit
from app.services import weather
from app.services.errors import parse_rate_limit, rate_limit_message
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

    monkeypatch.setattr(ratelimit.asyncio, "sleep", fake_sleep)
    return slept


async def test_burst_within_one_minute_of_budget_is_instant(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 600, clock=_Clock())
    for _ in range(12):
        await budget.acquire(50)  # exactly the full 600 capacity
    assert slept == []


async def test_deficit_paces_at_the_refill_rate(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, clock=_Clock())  # 1 token/s
    await budget.acquire(60)  # drains the bucket, instant
    await budget.acquire(30)  # 30-token deficit at 1/s
    assert slept == [pytest.approx(30.0)]


async def test_concurrent_callers_serialize_through_negative_tokens(monkeypatch):
    slept = _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, clock=_Clock())
    await budget.acquire(60)
    await budget.acquire(10)
    await budget.acquire(10)  # arrives behind the first deficit
    assert slept == [pytest.approx(10.0), pytest.approx(20.0)]


async def test_waits_beyond_max_wait_shed_instead(monkeypatch):
    _sleep_recorder(monkeypatch)
    budget = ratelimit.WeightedBudget("test", 60, max_wait_s=15, clock=_Clock())
    await budget.acquire(60)
    with pytest.raises(ratelimit.BudgetExhausted) as exc:
        await budget.acquire(30)  # would wait 30s > 15s bound
    assert exc.value.retry_after_s == 30


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
    assert budget.wait_estimate_s(30) == pytest.approx(30.0)
    # Estimating twice changes nothing: only acquire spends.
    assert budget.wait_estimate_s(30) == pytest.approx(30.0)


def test_refill_restores_capacity_over_time(monkeypatch):
    _sleep_recorder(monkeypatch)
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 60, clock=clock)
    asyncio.run(budget.acquire(60))
    clock.t = 30.0  # half a minute refills half the bucket
    assert budget.wait_estimate_s(30) == 0.0


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
    assert "hourly" in rate_limit_message("Open-Meteo (weather service)", "hourly")
    assert "top of the hour" in rate_limit_message("Open-Meteo (weather service)", "hourly")
    assert "daily" in rate_limit_message("Open-Meteo (weather service)", "daily")
    assert "minute" in rate_limit_message("Open-Meteo (weather service)", None)


def test_backwards_clock_never_manufactures_a_deficit():
    # time.monotonic cannot regress, but a clock that did must not drain
    # tokens: without the refill clamp this estimate read ~51s, punishing
    # clients for time that never passed.
    clock = _Clock()
    budget = ratelimit.WeightedBudget("test", 60, clock=clock)
    asyncio.run(budget.acquire(60))
    clock.t = -50.0
    assert budget.wait_estimate_s(1) == pytest.approx(1.0)


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
    # The invariant that rules out dividing the budget by replica count:
    # WeightedBudget capacity IS per_minute, so a budget below one batch's cost
    # can never hold enough tokens for it and would pace every batch even on a
    # completely idle pod. A 1/10 share (55) sits under the 57.1 a full 50-
    # location 16-day batch costs; the undivided 550 clears it outright.
    worst_batch = call_weight(
        weather.BATCH_SIZE, date(2026, 1, 1), date(2026, 1, 16), weather.N_VARIABLES
    )
    assert worst_batch == pytest.approx(57.14, abs=0.01)

    idle = ratelimit.WeightedBudget("test", ratelimit.UPSTREAM_WEIGHT_PER_MINUTE_WEATHER)
    assert idle.wait_estimate_s(worst_batch) == 0.0

    rationed = ratelimit.WeightedBudget("test", 550 // 10)
    assert rationed.wait_estimate_s(worst_batch) > 0.0
