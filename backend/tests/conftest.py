"""Shared fixtures, and the two builders every upstream stub is made of.

Rate limiting is disabled for every test by default: the route suites hammer
the endpoints far past any real burst, and the Nominatim gate would insert
multi-second sleeps between geocode tests. Tests that exercise limiting patch
in their own strict instances explicitly (see test_ratelimit.py).
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

# Imported for its import-time side effect: main.py is where the custom TRACE
# level is attached to logging.Logger, and services call log.trace freely. Most
# test modules import the app anyway and got this for free, so a single-file
# run like `pytest tests/test_osm.py` used to fail on the missing attribute.
from app import main as _main  # noqa: F401
from app import ratelimit
from app.services import cache, hms, nifc, osm, snodas

# ── Builders ───────────────────────────────────────────────────────────────
#
# Plain functions rather than fixtures, imported as `from conftest import ...`:
# the stubs that need them are module-level helpers (`_stub_openmeteo` and
# friends), which take no fixtures and would otherwise have to be threaded
# through every caller.


def fake_response(payload: Any, status: int = 200) -> httpx.Response:
    """The answer an HTTP stub hands back where the real client would.

    A real httpx.Response rather than a stand-in class, because the services
    read `.json()`, `.raise_for_status()` and `exc.response.status_code` off
    it: a double whose `raise_for_status` passed on every status would make an
    error answer look healthy. The URL is a placeholder — nothing reads it, but
    `raise_for_status` builds its message from a request.
    """
    return httpx.Response(
        status, json=payload, request=httpx.Request("GET", "https://stub.invalid")
    )


def dest(lat: float, lon: float, **extra: Any) -> dict[str, Any]:
    """One destination in the shape the services take: the coordinate pair
    they fetch on, plus whatever else an assertion needs beside it."""
    return {"latitude": lat, "longitude": lon, **extra}


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
def _no_live_snow(monkeypatch):
    """The snow grid reaches NSIDC on its first miss and the lifespan warms it
    up on startup, so both are neutered by default: a route test would
    otherwise pull a 4.9 MB archive over the network, and `test_main.py` would
    do it on every run of the app's own lifespan. A refusing fetch leaves the
    cache on its never-fetched path, where every row's snow depth is null and
    no analysis date is reported. Tests that mean to exercise it install their
    own cache (test_snodas.py)."""

    async def refuse():
        raise AssertionError("test reached NSIDC; install a stub snow cache")

    async def no_warm_up():
        return None

    monkeypatch.setattr(snodas, "GRID", snodas.snow_cache(fetch=refuse))
    monkeypatch.setattr(snodas, "warm_up", no_warm_up)


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
