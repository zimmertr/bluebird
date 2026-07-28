"""Shared fixtures.

Rate limiting is disabled for every test by default: the route suites hammer
the endpoints far past any real burst, and the Nominatim gate would insert
multi-second sleeps between geocode tests. Tests that exercise limiting patch
in their own strict instances explicitly (see test_ratelimit.py).
"""

from __future__ import annotations

import pytest
from app import ratelimit


@pytest.fixture(autouse=True)
def _rate_limiting_off(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "GEOCODE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(
        ratelimit,
        "NOMINATIM_GATE",
        ratelimit.MinIntervalGate("Nominatim (place search)", 0.0),
    )
