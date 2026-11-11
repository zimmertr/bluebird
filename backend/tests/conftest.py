"""Shared fixtures, the builders every upstream stub is made of (an HTTP
answer and its refusal, a destination, one location's weather metrics and an Open-Meteo hourly
block), the one Open-Meteo client stub and the pacer and sleep doubles the
fetch tests share, and the made-up key the keyed tests send.

Rate limiting is disabled for every test by default: the route suites hammer
the endpoints far past any real burst, and the Nominatim gate would insert
multi-second sleeps between geocode tests. Tests that exercise limiting patch
in their own strict instances explicitly (see test_ratelimit.py).
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app import db, ratelimit

# Imported for its import-time side effect: main.py is where the custom TRACE
# level is attached to logging.Logger, and services call log.trace freely. Most
# test modules import the app anyway and got this for free, so a single-file
# run like `pytest tests/test_osm.py` used to fail on the missing attribute.
from app import main as _main  # noqa: F401
from app.services import aggregation, cache, fire_activity, hms, http, nifc, osm, usfs_closures

# The loop's own sleep, held before any test patches `asyncio.sleep`: the stub
# below yields through it, so a test that records sleeps records the code's
# waits and never the stub's own turns.
_real_sleep = asyncio.sleep

# ── Builders ───────────────────────────────────────────────────────────────
#
# Plain functions rather than fixtures, imported as `from conftest import ...`:
# the stubs that need them are module-level helpers, which take no fixtures
# and would otherwise have to be threaded through every caller.


def fake_response(
    payload: Any,
    status: int = 200,
    *,
    url: str = "https://stub.invalid",
    params: dict[str, Any] | None = None,
    text: str | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """The answer an HTTP stub hands back where the real client would.

    A real httpx.Response rather than a stand-in class, because the services
    read `.json()`, `.raise_for_status()` and `exc.response.status_code` off
    it: a double whose `raise_for_status` passed on every status would make an
    error answer look healthy. The URL is a placeholder unless a stub passes
    the `url` and `params` it was called with: `raise_for_status` builds its
    message from the request, so only then does an error's text carry the
    query string, and any key in it, the way the real client's does.

    `text` replaces the JSON body with raw text, for the answer an upstream
    gives when something in front of it is not the API: an HTML error page
    from a proxy, served with a 200. `payload` is ignored when it is given.
    """
    request = httpx.Request("GET", url, params=params)
    if text is not None:
        return httpx.Response(status, text=text, headers=headers, request=request)
    return httpx.Response(status, json=payload, headers=headers, request=request)


def status_error(status: int, payload: Any = None, **answer: Any) -> httpx.HTTPStatusError:
    """`fake_response`'s refusal as the client raises it.

    Raised by `raise_for_status` itself, so its text names the request the way
    the client's does. `answer` is `fake_response`'s keywords.
    """
    response = fake_response(payload, status, **answer)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        return exc
    raise AssertionError(f"HTTP {status} is not an error status")


def answered(status: int, body: dict[str, Any]) -> Callable[[str, dict[str, Any]], httpx.Response]:
    """A `stub_openmeteo` step that answers on the request the service made.

    The service's own `raise_for_status` then reads it, and the text it gives
    names the keyed URL the way a real one does.
    """
    return lambda url, params: fake_response(body, status, url=url, params=params)


# A caller's Open-Meteo key for tests, made up. It holds `+`, `/` and `=`
# because httpx percent-encodes those in a query string, so a check that looks
# only for the key as typed would pass over the form a URL carries it in.
FAKE_API_KEY = "not+a/real=key"


def assert_no_key_logged(records: list[logging.LogRecord], key: str = FAKE_API_KEY) -> None:
    """No record holds `key`, raw or as httpx encodes it.

    Each record is formatted whole, so a traceback is read as well as the
    message: asyncio's "exception was never retrieved" line is one ERROR
    record whose message names nothing, and its key is in the chained
    `HTTPStatusError` the traceback prints.
    """
    assert records, "nothing was logged, so nothing was checked"
    forms = {key, str(httpx.QueryParams({"apikey": key})).removeprefix("apikey=")}
    formatter = logging.Formatter("%(name)s %(levelname)s %(message)s")
    for record in records:
        text = formatter.format(record)
        for form in forms:
            assert form not in text, f"{record.name} {record.levelname} logged the key:\n{text}"


def dest(lat: float, lon: float, **extra: Any) -> dict[str, Any]:
    """One destination in the shape the services take: the coordinate pair
    they fetch on, plus whatever else an assertion needs beside it."""
    return {"latitude": lat, "longitude": lon, **extra}


def weather_metrics(precip: float = 0.0, **overrides: float) -> dict[str, float]:
    """One location's weather aggregates, the answer a stubbed weather fetch
    gives. Every precipitation key carries `precip`; `overrides` replace any
    key by its full name."""
    return {
        "precip_total_in": precip,
        "precip_avg_in_hr": precip,
        "precip_min_in_hr": precip,
        "precip_max_in_hr": precip,
        "temp_min_f": 40.0,
        "temp_max_f": 60.0,
        "temp_avg_f": 50.0,
        "wind_min_mph": 1.0,
        "wind_max_mph": 9.0,
        "wind_avg_mph": 5.0,
        **overrides,
    }


def weather_hourly(
    times: list[str],
    precip: list[Any],
    temp: list[Any],
    wind: list[Any],
    freeze: list[Any] | None = None,
    freeze_unit: str | None = "m",
    snowfall: list[Any] | None = None,
) -> dict[str, Any]:
    """One location's block of a weather answer, as Open-Meteo sends it."""
    hourly: dict[str, Any] = {
        "time": times,
        "precipitation": precip,
        "temperature_2m": temp,
        "wind_speed_10m": wind,
    }
    # Every column is declared in the unit the request asked for, as a real
    # response declares it: the aggregation refuses a number it cannot
    # confirm the unit of.
    units: dict[str, str] = {
        "precipitation": "inch",
        "snowfall": "inch",
        "temperature_2m": "°F",
        "wind_speed_10m": "mp/h",
        **{name: "mp/h" for name, _ in aggregation._WIND_LEVELS},
        **{name: "°F" for name, _ in aggregation._TEMP_LEVELS},
    }
    # Omitted rather than nulled by default: a payload with no
    # `freezing_level_height` key at all is what five of the eight models
    # return, so it is the shape most tests should exercise.
    payload: dict[str, Any] = {"hourly": hourly, "hourly_units": units}
    if freeze is not None:
        hourly["freezing_level_height"] = freeze
        # A real response always declares the unit, so the payload carries it
        # whenever it carries the column. `freeze_unit=None` is the malformed
        # body the aggregation must refuse rather than guess at.
        if freeze_unit is not None:
            units["freezing_level_height"] = freeze_unit
    if snowfall is not None:
        hourly["snowfall"] = snowfall
    return payload


def stub_openmeteo(
    monkeypatch: pytest.MonkeyPatch,
    behaviors: list[Any],
    urls: list[str] | None = None,
    *,
    overlap: bool = False,
) -> list[dict[str, Any]]:
    """Replay one scripted behavior per Open-Meteo GET, in call order, for
    every service: weather, air quality and the cloud column all ask through
    `app.services.http.client`.

    A behavior is an Exception (raised), a ``(ticks, payload)`` pair (yields to
    the event loop ``ticks`` times first, so completion order can be forced
    independent of start order), a callable (handed the call's url and params,
    so an error answer can be built on the request the service really made,
    and awaited when it returns a coroutine, an answer that takes real time),
    or a bare payload. Returns the params each call was made with, so batching
    can be asserted. Running off the end of the script is an IndexError, which
    is the point: a test that expects two upstream calls fails loudly on a
    third.

    Pass ``urls`` to collect the host each call went to as well, which is what
    a keyed request has to get right. ``overlap`` yields once before each
    answer, so concurrent batches are all in flight before the first one
    answers; without it a batch runs start to finish before its siblings
    begin, and a short-circuit across batches would look stronger than it is.
    """
    calls: list[dict[str, Any]] = []

    class _Client:
        async def get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
            if overlap:
                await _real_sleep(0)
            behavior = behaviors[len(calls)]
            calls.append(params or {})
            if urls is not None:
                urls.append(url)
            if isinstance(behavior, Exception):
                raise behavior
            if callable(behavior):
                answer = behavior(url, params or {})
                return await answer if inspect.isawaitable(answer) else answer
            if isinstance(behavior, tuple):
                ticks, payload = behavior
                for _ in range(ticks):
                    await _real_sleep(0)
                return fake_response(payload)
            return fake_response(behavior)

    stub = _Client()
    monkeypatch.setattr(http, "client", lambda: stub)
    return calls


class RecordingPacer:
    """Stands in for a weighted pacer: answers every wait estimate with
    `estimate_s` and records each weight it was asked to estimate and to
    acquire, so a test reads what a fetch would have spent."""

    def __init__(self, estimate_s: float = 0.0) -> None:
        self.estimate_s = estimate_s
        self.estimates: list[float] = []
        self.acquired: list[float] = []

    def wait_estimate_s(self, weight: float) -> float:
        self.estimates.append(weight)
        return self.estimate_s

    async def acquire(self, weight: float) -> None:
        self.acquired.append(weight)


def sleep_recorder(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """Replace `asyncio.sleep` with one that returns at once and records the
    seconds asked for. The pacers and the fetch pipeline read the module's
    `sleep` at call time, so one patch reaches every wait they take."""
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    return slept


@pytest.fixture(autouse=True)
def _rate_limiting_off(monkeypatch):
    monkeypatch.setattr(ratelimit.client, "ANALYZE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "DESTINATIONS_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "GEOCODE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "WILDFIRES_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "SMOKE_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "CLOSURES_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "LANDMARKS_LIMITER", ratelimit.RateLimiter(0, 1))
    monkeypatch.setattr(ratelimit.client, "FIRE_ACTIVITY_LIMITER", ratelimit.RateLimiter(0, 1))
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

    async def passthrough_reporting(destinations):
        return [dict(d) for d in destinations], True

    monkeypatch.setattr(osm, "enrich_custom", passthrough)
    monkeypatch.setattr(osm, "enrich_custom_reporting", passthrough_reporting)


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
def _no_live_fire_activity(monkeypatch):
    """The fire detection cache reaches NASA FIRMS on its first miss, for the
    same reason and with the same consequence as the wildfire one above. Tests
    that mean to exercise it install their own cache (test_fire_activity.py)."""

    async def refuse():
        raise AssertionError("test reached NASA FIRMS; install a stub detection cache")

    monkeypatch.setattr(fire_activity, "DETECTIONS", fire_activity.detection_cache(fetch=refuse))


@pytest.fixture(autouse=True)
def _no_live_closures(monkeypatch):
    """The closure cache reaches the Forest Service on its first miss, for the
    same reason and with the same consequence as the wildfire one above. Tests
    that mean to exercise it install their own cache (test_usfs_closures.py)."""

    async def refuse():
        raise AssertionError("test reached the Forest Service; install a stub closure cache")

    monkeypatch.setattr(usfs_closures, "CLOSURES", usfs_closures.closure_cache(fetch=refuse))


@pytest.fixture(autouse=True)
def _caches_clear():
    # Module-level TTL caches would otherwise leak state between tests (a
    # stubbed discovery cached in one test answering the next).
    cache.DISCOVERY_CACHE.clear()
    cache.ENRICH_CACHE.clear()
    cache.FORECAST_CACHE.clear()
    cache.GEOCODE_CACHE.clear()
    yield
    cache.DISCOVERY_CACHE.clear()
    cache.ENRICH_CACHE.clear()
    cache.FORECAST_CACHE.clear()
    cache.GEOCODE_CACHE.clear()


@pytest.fixture(autouse=True)
def _mirror_health_clear():
    # The mirror chain remembers failures for its cooldown, so one test's
    # failed mirror would otherwise reorder the chain for the next test.
    osm.mirrors.reset_mirror_health()
    yield
    osm.mirrors.reset_mirror_health()


# ── The shared cache (#760) ─────────────────────────────────────────────────

# Every table the app writes, emptied before each test that takes the database
# so no test sees another's rows. The schema itself is migrated once and kept.
_DB_TABLES = (
    "places", "places_pending", "snapshots", "refresh_state",
    "rate_buckets", "gates", "weight_bookings", "geocode_cache",
)


@pytest.fixture
async def database(monkeypatch):
    """The app's `db` module, connected to the suite's PostgreSQL.

    Skips without TEST_DATABASE_URL, which `make test-backend-db` and the
    Database Tests CI job set; plain `make test-backend` has no database, and
    every test that takes this fixture is marked `db` as well.
    """
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("needs TEST_DATABASE_URL (make test-backend-db)")
    monkeypatch.setattr(db, "DATABASE_URL", url)
    monkeypatch.setattr(db, "READ_ONLY", False)
    await db.start()
    assert await db.wait_ready(60), "the test database never became ready"
    async with db.connection() as conn:
        await conn.execute(f"TRUNCATE {', '.join(_DB_TABLES)}")
        await conn.execute(
            "UPDATE osm_state SET filled_at = NULL, planet_timestamp = NULL,"
            " rules_version = NULL, sequence = NULL, updated_at = NULL"
        )
    yield db
    await db.stop()
