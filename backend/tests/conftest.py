"""Shared fixtures.

Rate limiting is disabled for every test by default: the route suites hammer
the endpoints far past any real burst, and the Nominatim gate would insert
multi-second sleeps between geocode tests. Tests that exercise limiting patch
in their own strict instances explicitly (see test_ratelimit.py).
"""

from __future__ import annotations

import pytest
from app import ratelimit
from app.services import cache


@pytest.fixture(autouse=True)
def _rate_limiting_off(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "DESTINATIONS_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "GEOCODE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(
        ratelimit,
        "NOMINATIM_GATE",
        ratelimit.MinIntervalGate("Nominatim (place search)", 0.0),
    )
    # Weighted pacing off (0 disables), so no test ever sleeps off a deficit;
    # pacing behavior is tested against explicit instances in test_ratelimit.
    monkeypatch.setattr(
        ratelimit, "WEATHER_WEIGHT", ratelimit.WeightedBudget("Open-Meteo (weather service)", 0)
    )
    monkeypatch.setattr(
        ratelimit, "AQI_WEIGHT", ratelimit.WeightedBudget("Open-Meteo (air quality)", 0)
    )


@pytest.fixture(autouse=True)
def _caches_clear():
    # Module-level TTL caches would otherwise leak state between tests (a
    # stubbed discovery cached in one test answering the next).
    cache.DISCOVERY_CACHE.clear()
    cache.FORECAST_CACHE.clear()
    yield
    cache.DISCOVERY_CACHE.clear()
    cache.FORECAST_CACHE.clear()
