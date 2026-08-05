"""Shared fixtures.

Rate limiting is disabled for every test by default: the route suites hammer
the endpoints far past any real burst, and the Nominatim gate would insert
multi-second sleeps between geocode tests. Tests that exercise limiting patch
in their own strict instances explicitly (see test_ratelimit.py).
"""

from __future__ import annotations

import pytest

# Imported for its import-time side effect: main.py is where the custom TRACE
# level is attached to logging.Logger, and services call log.trace freely. Most
# test modules import the app anyway and got this for free, so a single-file
# run like `pytest tests/test_osm.py` used to fail on the missing attribute.
from app import main as _main  # noqa: F401
from app import ratelimit
from app.services import cache, hms, nifc, osm


@pytest.fixture(autouse=True)
def _rate_limiting_off(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "DESTINATIONS_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "GEOCODE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "WILDFIRES_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit, "SMOKE_LIMITER", ratelimit.RateLimiter(0, 1))
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
def _no_live_enrichment(monkeypatch):
    """Custom-destination enrichment reaches Overpass, so it is neutered by
    default: any route test that sends `custom_destinations` would otherwise
    make a live call and depend on the network to pass. Tests that mean to
    exercise it stub their own (test_destinations.py) or hold a reference to
    the real function taken before this fixture runs (test_osm.py)."""

    async def passthrough(destinations):
        return [dict(d) for d in destinations]

    monkeypatch.setattr(osm, "enrich_custom", passthrough)


@pytest.fixture(autouse=True)
def _no_live_wildfires(monkeypatch):
    """The wildfire cache reaches NIFC on its first miss, so it is neutered by
    default: a route test that forgot to stub would otherwise make a live call
    and pass or fail on the network. Failing the fetch leaves the route on its
    never-fetched path, which is a deterministic 503. Tests that mean to
    exercise it install their own cache (test_nifc.py)."""

    async def refuse():
        raise AssertionError("test reached NIFC; install a stub perimeter cache")

    monkeypatch.setattr(nifc, "PERIMETERS", nifc.perimeter_cache(fetch=refuse))


@pytest.fixture(autouse=True)
def _no_live_smoke(monkeypatch):
    """The smoke cache reaches NOAA on its first miss, for the same reason and
    with the same consequence as the wildfire one above. Tests that mean to
    exercise it install their own cache (test_hms.py)."""

    async def refuse():
        raise AssertionError("test reached NOAA HMS; install a stub smoke cache")

    monkeypatch.setattr(hms, "PLUMES", hms.smoke_cache(fetch=refuse))


@pytest.fixture(autouse=True)
def _caches_clear():
    # Module-level TTL caches would otherwise leak state between tests (a
    # stubbed discovery cached in one test answering the next).
    cache.DISCOVERY_CACHE.clear()
    cache.ENRICH_CACHE.clear()
    cache.FORECAST_CACHE.clear()
    yield
    cache.DISCOVERY_CACHE.clear()
    cache.ENRICH_CACHE.clear()
    cache.FORECAST_CACHE.clear()
