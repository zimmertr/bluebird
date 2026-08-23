"""The metrics surface (issue #77): counters move on the paths they watch,
and the label vocabulary stays bounded.

Values are asserted as before/after deltas rather than absolutes, because the
registry is process-global and every other test in the run moves it.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from app import ratelimit, telemetry
from app.main import app
from app.routes import analyze as analyze_mod
from app.services import air_quality, cache, weather
from app.services import osm as osm_mod
from app.services.errors import UpstreamRateLimited
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

client = TestClient(app)


def _value(name: str, labels: dict[str, str] | None = None) -> float:
    v = REGISTRY.get_sample_value(name, labels or {})
    return 0.0 if v is None else v


def _request(path: str = "/api/analyze") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "query_string": b"",
        "headers": [],
        "client": ("198.51.100.7", 4242),
    }
    return Request(scope)


# ── HTTP middleware ────────────────────────────────────────────────────────


def test_http_request_counted_with_route_template():
    labels = {"route": "/api/capabilities", "method": "GET", "status": "200"}
    before = _value("bluebird_http_requests_total", labels)
    dur_before = _value(
        "bluebird_http_request_duration_seconds_count",
        {"route": "/api/capabilities", "method": "GET"},
    )
    assert client.get("/api/capabilities").status_code == 200
    assert _value("bluebird_http_requests_total", labels) == before + 1
    assert (
        _value(
            "bluebird_http_request_duration_seconds_count",
            {"route": "/api/capabilities", "method": "GET"},
        )
        == dur_before + 1
    )


def test_unknown_api_path_counts_under_the_catchall_template():
    # The 404 catch-all's template, never the raw path — a typo'd URL must not
    # mint a series.
    labels = {"route": "/api/{path:path}", "method": "GET", "status": "404"}
    before = _value("bluebird_http_requests_total", labels)
    assert client.get("/api/no-such-endpoint").status_code == 404
    assert _value("bluebird_http_requests_total", labels) == before + 1


def test_unhandled_exception_counts_as_500():
    boom = FastAPI()
    boom.middleware("http")(telemetry.metrics_middleware)

    @boom.get("/kaboom")
    async def kaboom():
        raise RuntimeError("unhandled")

    labels = {"route": "/kaboom", "method": "GET", "status": "500"}
    before = _value("bluebird_http_requests_total", labels)
    with pytest.raises(RuntimeError):
        TestClient(boom).get("/kaboom")
    assert _value("bluebird_http_requests_total", labels) == before + 1


def test_route_label_collapses_the_static_mount():
    class _Mount:
        path = ""

    class _ApiRoute:
        path = "/api/version"

    assert telemetry._route_label(_scope_request(None)) == "unmatched"
    assert telemetry._route_label(_scope_request(_Mount())) == "static"
    assert telemetry._route_label(_scope_request(_ApiRoute())) == "/api/version"


def _scope_request(route) -> Request:
    r = _request("/whatever")
    if route is not None:
        r.scope["route"] = route
    return r


# ── Analyses ───────────────────────────────────────────────────────────────


@pytest.fixture
def stub_upstreams(monkeypatch):
    async def fake_wx(destinations, start, end, on_progress=None, on_pace=None, model=None):
        return [
            {
                "precip_total_in": 0.1, "precip_avg_in_hr": 0.1,
                "precip_min_in_hr": 0.1, "precip_max_in_hr": 0.1,
                "temp_min_f": 40.0, "temp_max_f": 60.0, "temp_avg_f": 50.0,
                "wind_min_mph": 1.0, "wind_max_mph": 9.0, "wind_avg_mph": 5.0,
            }
            for _ in destinations
        ]

    async def fake_aqi(destinations, start, end):
        return [None] * len(destinations)

    monkeypatch.setattr(analyze_mod.weather, "fetch_weather_batch", fake_wx)
    monkeypatch.setattr(analyze_mod.air_quality, "fetch_aqi_batch", fake_aqi)


def test_analyze_observes_field_size_and_limit(stub_upstreams):
    now = datetime.now(timezone.utc)
    count_before = _value("bluebird_analyze_destinations_count")
    sum_before = _value("bluebird_analyze_destinations_sum")
    limit_sum_before = _value("bluebird_analyze_limit_sum")
    resp = client.post(
        "/api/analyze",
        json={
            "destination_types": [],
            "start_datetime": now.isoformat(),
            "end_datetime": (now + timedelta(days=1)).isoformat(),
            "limit": 7,
            "custom_destinations": [
                {"name": "a", "latitude": 1.0, "longitude": 0.0},
                {"name": "b", "latitude": 2.0, "longitude": 0.0},
            ],
        },
    )
    assert resp.status_code == 200
    assert _value("bluebird_analyze_destinations_count") == count_before + 1
    assert _value("bluebird_analyze_destinations_sum") == sum_before + 2
    assert _value("bluebird_analyze_limit_sum") == limit_sum_before + 7


def test_rejected_analyze_observes_nothing(stub_upstreams):
    # An inverted window 400s before discovery; a refusal is not an analysis.
    now = datetime.now(timezone.utc)
    before = _value("bluebird_analyze_destinations_count")
    resp = client.post(
        "/api/analyze",
        json={
            "destination_types": [],
            "start_datetime": (now + timedelta(days=1)).isoformat(),
            "end_datetime": now.isoformat(),
            "custom_destinations": [{"name": "a", "latitude": 1.0, "longitude": 0.0}],
        },
    )
    assert resp.status_code == 400
    assert _value("bluebird_analyze_destinations_count") == before


# ── Throttles, sheds, pacing ───────────────────────────────────────────────


def test_throttle_increments_the_named_bucket():
    limiter = ratelimit.RateLimiter(1, 1, name="test-bucket")
    before = _value("bluebird_ratelimit_throttled_total", {"bucket": "test-bucket"})
    ratelimit._throttle(limiter, _request())
    with pytest.raises(HTTPException) as exc_info:
        ratelimit._throttle(limiter, _request())
    assert exc_info.value.status_code == 429
    assert (
        _value("bluebird_ratelimit_throttled_total", {"bucket": "test-bucket"})
        == before + 1
    )


def test_weighted_budget_counts_spend_and_shed():
    budget = ratelimit.WeightedBudget("test-provider", 60, max_wait_s=0.5)
    spent_before = _value(
        "bluebird_openmeteo_weight_spent_total", {"provider": "test-provider"}
    )
    shed_before = _value(
        "bluebird_upstream_shed_total", {"provider": "test-provider", "mechanism": "weight"}
    )
    asyncio.run(budget.acquire(10))
    assert (
        _value("bluebird_openmeteo_weight_spent_total", {"provider": "test-provider"})
        == spent_before + 10
    )
    # The bucket holds 50 more; asking for far past max_wait's worth sheds.
    with pytest.raises(ratelimit.BudgetExhausted):
        asyncio.run(budget.acquire(1000))
    assert (
        _value(
            "bluebird_upstream_shed_total",
            {"provider": "test-provider", "mechanism": "weight"},
        )
        == shed_before + 1
    )


def test_weighted_budget_counts_pace_time():
    # Capacity 6000/min = 100/s: draining it then asking for 10 more paces
    # ~0.1s, long enough to count and short enough to sleep for real.
    budget = ratelimit.WeightedBudget("test-pacer", 6000, max_wait_s=5)
    before = _value("bluebird_upstream_pace_seconds_total", {"provider": "test-pacer"})

    async def drain_then_pace():
        await budget.acquire(6000)
        await budget.acquire(10)

    asyncio.run(drain_then_pace())
    assert (
        _value("bluebird_upstream_pace_seconds_total", {"provider": "test-pacer"})
        > before
    )


def test_upstream_budget_counts_queue_shed():
    async def scenario():
        budget = ratelimit.UpstreamBudget("test-queue", 1, wait_s=0.05)
        async with budget.slot():
            with pytest.raises(ratelimit.BudgetExhausted):
                async with budget.slot():
                    pass

    before = _value(
        "bluebird_upstream_shed_total", {"provider": "test-queue", "mechanism": "queue"}
    )
    asyncio.run(scenario())
    assert (
        _value(
            "bluebird_upstream_shed_total",
            {"provider": "test-queue", "mechanism": "queue"},
        )
        == before + 1
    )


def test_min_interval_gate_counts_gate_shed():
    gate = ratelimit.MinIntervalGate("test-gate", 100.0, max_wait_s=0.01)
    before = _value(
        "bluebird_upstream_shed_total", {"provider": "test-gate", "mechanism": "gate"}
    )

    async def scenario():
        await gate.acquire()
        with pytest.raises(ratelimit.BudgetExhausted):
            await gate.acquire()

    asyncio.run(scenario())
    assert (
        _value(
            "bluebird_upstream_shed_total",
            {"provider": "test-gate", "mechanism": "gate"},
        )
        == before + 1
    )


# ── Caches ─────────────────────────────────────────────────────────────────


def test_cache_collector_reads_the_existing_counters():
    misses_before = _value("bluebird_cache_misses_total", {"cache": "discovery"})
    hits_before = _value("bluebird_cache_hits_total", {"cache": "discovery"})
    key = cache.discovery_key([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]], "telemetry-test")
    cache.DISCOVERY_CACHE.get(key)  # miss
    cache.DISCOVERY_CACHE.put(key, [])
    cache.DISCOVERY_CACHE.get(key)  # hit
    assert _value("bluebird_cache_misses_total", {"cache": "discovery"}) == misses_before + 1
    assert _value("bluebird_cache_hits_total", {"cache": "discovery"}) == hits_before + 1


# ── Open-Meteo fetch outcomes ──────────────────────────────────────────────


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _stub_openmeteo(monkeypatch, module, behaviors: list):
    calls = []

    class _Client:
        async def get(self, url, params=None):
            behavior = behaviors[len(calls)]
            calls.append(params or {})
            if isinstance(behavior, Exception):
                raise behavior
            return _FakeResponse(behavior)

    monkeypatch.setattr(module.http, "client", lambda: _Client())
    return calls


def _rate_limited(url: str, scope: str) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", url)
    response = httpx.Response(
        429, request=request, json={"reason": f"{scope} API request limit exceeded"}
    )
    return httpx.HTTPStatusError("429", request=request, response=response)


WINDOW = (
    datetime(2026, 7, 21, 0, 0, tzinfo=timezone.utc),
    datetime(2026, 7, 21, 3, 0, tzinfo=timezone.utc),
)


def test_weather_success_counts_request_and_duration(monkeypatch):
    hourly = {
        "hourly": {
            "time": ["2026-07-21T00:00"],
            "precipitation": [0.1],
            "temperature_2m": [50.0],
            "wind_speed_10m": [5.0],
        }
    }
    _stub_openmeteo(monkeypatch, weather, [[hourly]])
    ok_before = _value(
        "bluebird_openmeteo_requests_total", {"service": "weather", "outcome": "success"}
    )
    dur_before = _value(
        "bluebird_openmeteo_request_duration_seconds_count", {"service": "weather"}
    )
    cache.FORECAST_CACHE.clear()
    result = asyncio.run(
        weather.fetch_weather_batch([{"latitude": 47.1, "longitude": -121.1}], *WINDOW)
    )
    assert result[0] is not None
    assert (
        _value(
            "bluebird_openmeteo_requests_total",
            {"service": "weather", "outcome": "success"},
        )
        == ok_before + 1
    )
    assert (
        _value(
            "bluebird_openmeteo_request_duration_seconds_count", {"service": "weather"}
        )
        == dur_before + 1
    )


def test_weather_terminal_429_counts_scope(monkeypatch):
    _stub_openmeteo(monkeypatch, weather, [_rate_limited(weather.FORECAST_URL, "Hourly")])
    before = _value(
        "bluebird_openmeteo_rate_limited_total", {"service": "weather", "scope": "hourly"}
    )
    cache.FORECAST_CACHE.clear()
    with pytest.raises(UpstreamRateLimited):
        asyncio.run(
            weather.fetch_weather_batch(
                [{"latitude": 47.2, "longitude": -121.2}], *WINDOW
            )
        )
    assert (
        _value(
            "bluebird_openmeteo_rate_limited_total",
            {"service": "weather", "scope": "hourly"},
        )
        == before + 1
    )


def test_aqi_failure_counts_a_degraded_batch(monkeypatch):
    request = httpx.Request("GET", air_quality.AIR_QUALITY_URL)
    boom = httpx.ConnectError("nope", request=request)
    _stub_openmeteo(monkeypatch, air_quality, [boom])
    degraded_before = _value("bluebird_aqi_degraded_total", {"reason": "error"})
    err_before = _value(
        "bluebird_openmeteo_requests_total",
        {"service": "aqi", "outcome": "network_error"},
    )
    cache.FORECAST_CACHE.clear()
    result = asyncio.run(
        air_quality.fetch_aqi_batch(
            [{"latitude": 47.3, "longitude": -121.3}],
            datetime.now(timezone.utc),
            datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    assert result == [None]
    assert _value("bluebird_aqi_degraded_total", {"reason": "error"}) == degraded_before + 1
    assert (
        _value(
            "bluebird_openmeteo_requests_total",
            {"service": "aqi", "outcome": "network_error"},
        )
        == err_before + 1
    )


# ── Overpass outcomes ──────────────────────────────────────────────────────


def test_attempt_outcome_classification():
    from app.services.errors import PartialResultError

    request = httpx.Request("POST", "https://overpass-api.de/api/interpreter")
    response = httpx.Response(504, request=request)
    assert osm_mod._attempt_outcome(PartialResultError("remark")) == "partial"
    assert (
        osm_mod._attempt_outcome(httpx.ConnectTimeout("t", request=request)) == "timeout"
    )
    assert (
        osm_mod._attempt_outcome(
            httpx.HTTPStatusError("504", request=request, response=response)
        )
        == "http_error"
    )
    assert (
        osm_mod._attempt_outcome(httpx.ConnectError("refused", request=request))
        == "network_error"
    )
    assert osm_mod._attempt_outcome(ValueError("bad json")) == "error"


def test_overpass_failure_counts_fallback_and_success_counts_mirror(monkeypatch):
    # First mirror times out, second answers: one fallback on the first host,
    # one success on the second, a duration observation for each attempt.
    first = urlhost(osm_mod.OVERPASS_MIRRORS[0].url)
    second = urlhost(osm_mod.OVERPASS_MIRRORS[1].url)

    calls = {"n": 0}

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, data=None, timeout=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ConnectTimeout("slow", request=httpx.Request("POST", url))
            return _FakeResponse({"elements": []})

    monkeypatch.setattr(osm_mod.httpx, "AsyncClient", _Client)

    fallback_before = _value("bluebird_overpass_fallback_total", {"mirror": first})
    timeout_before = _value(
        "bluebird_overpass_requests_total", {"mirror": first, "outcome": "timeout"}
    )
    ok_before = _value(
        "bluebird_overpass_requests_total", {"mirror": second, "outcome": "success"}
    )
    data = asyncio.run(osm_mod._post_with_fallback("[out:json];"))
    assert data == {"elements": []}
    assert _value("bluebird_overpass_fallback_total", {"mirror": first}) == fallback_before + 1
    assert (
        _value(
            "bluebird_overpass_requests_total", {"mirror": first, "outcome": "timeout"}
        )
        == timeout_before + 1
    )
    assert (
        _value(
            "bluebird_overpass_requests_total", {"mirror": second, "outcome": "success"}
        )
        == ok_before + 1
    )


def urlhost(url: str) -> str:
    from urllib.parse import urlparse

    return urlparse(url).hostname or url


# ── The label contract ─────────────────────────────────────────────────────

# The whole point of bounding labels: no coordinates, no client identity.
# Every bluebird metric family must draw its label NAMES from this set, and
# no label VALUE may look like an IP address or a bare coordinate.
ALLOWED_LABEL_NAMES = {
    "route", "method", "status",          # HTTP surface
    "mirror", "service", "outcome", "scope",  # suppliers
    "reason", "bucket", "provider", "mechanism",  # degradation and pacing
    "cache",                               # caches
    "version", "commit",                   # build info
    "le",                                  # histogram bucket bound
}

_IP_RE = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
_COORD_RE = re.compile(r"^-?\d{1,3}\.\d{3,}$")


def test_no_label_carries_coordinates_or_client_identity():
    seen_any = False
    for metric in REGISTRY.collect():
        if not metric.name.startswith("bluebird_"):
            continue
        for sample in metric.samples:
            seen_any = True
            assert set(sample.labels) <= ALLOWED_LABEL_NAMES, (
                f"{sample.name} grew a label outside the allowlist: "
                f"{set(sample.labels) - ALLOWED_LABEL_NAMES}"
            )
            for label_name, value in sample.labels.items():
                if label_name == "le":
                    continue  # histogram bounds are numbers by design
                assert not _IP_RE.search(value), (
                    f"{sample.name} label {label_name}={value!r} looks like an IP"
                )
                assert not _COORD_RE.match(value), (
                    f"{sample.name} label {label_name}={value!r} looks like a coordinate"
                )
    assert seen_any, "no bluebird_* samples in the registry — wiring is gone"


# ── The metrics server itself ──────────────────────────────────────────────


def test_metrics_port_zero_disables_the_server(monkeypatch):
    monkeypatch.setattr(telemetry, "METRICS_PORT", 0)
    telemetry.start_metrics_server()
    assert telemetry._server is None


def test_metrics_server_starts_and_serves_the_registry(monkeypatch):
    # Port 0 would disable, so pick an ephemeral port by binding one first.
    import socket

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    monkeypatch.setattr(telemetry, "METRICS_PORT", port)
    telemetry.start_metrics_server()
    try:
        body = httpx.get(f"http://127.0.0.1:{port}/metrics").text
        assert "bluebird_http_requests_total" in body
        assert "bluebird_build_info" in body
    finally:
        telemetry.stop_metrics_server()
    assert telemetry._server is None
