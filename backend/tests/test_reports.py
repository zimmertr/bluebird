"""The browser's run reports (record 0339): counted, bounded, and identity-free."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from app import ratelimit
from app.main import app

client = TestClient(app)


def _count(**labels: str) -> float:
    return REGISTRY.get_sample_value("bluebird_forecast_run_reports_total", labels) or 0.0


def _observed(**labels: str) -> float:
    return REGISTRY.get_sample_value("bluebird_forecast_run_duration_seconds_count", labels) or 0.0


def test_a_failed_analysis_is_counted_by_stage_source_size_and_model():
    labels = {
        "kind": "analysis",
        "outcome": "failed",
        "stage": "weather",
        "source": "open-meteo",
        "size": "typical",
        "model": "gfs_seamless",
    }
    before = _count(**labels)
    timed = _observed(kind="analysis", outcome="failed", size="typical")
    res = client.post(
        "/api/reports",
        json={
            "kind": "analysis",
            "outcome": "failed",
            "stage": "weather",
            "source": "open-meteo",
            "duration_ms": 61_000,
            "destinations": 120,
            "model": "gfs_seamless",
        },
    )
    assert res.status_code == 204
    assert res.content == b""
    assert _count(**labels) == before + 1
    assert _observed(kind="analysis", outcome="failed", size="typical") == timed + 1


def test_a_run_over_200_destinations_is_large_and_a_map_load_has_no_size():
    large = {
        "kind": "analysis", "outcome": "success", "stage": "none", "source": "none", "size": "large", "model": "none"
    }
    before = _count(**large)
    assert client.post(
        "/api/reports", json={"kind": "analysis", "outcome": "success", "duration_ms": 9_000, "destinations": 201}
    ).status_code == 204
    assert _count(**large) == before + 1

    load = {
        "kind": "map", "outcome": "failed", "stage": "basemap", "source": "basemap", "size": "none", "model": "none"
    }
    before = _count(**load)
    assert client.post(
        "/api/reports",
        json={"kind": "map", "outcome": "failed", "stage": "basemap", "source": "basemap", "duration_ms": 4_000},
    ).status_code == 204
    assert _count(**load) == before + 1


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "analysis", "outcome": "exploded", "duration_ms": 1},
        {"kind": "analysis", "outcome": "failed", "stage": "the moon", "duration_ms": 1},
        {"kind": "analysis", "outcome": "failed", "source": "example.com", "duration_ms": 1},
        {"kind": "analysis", "outcome": "failed", "duration_ms": -1},
        {"kind": "analysis", "outcome": "failed", "duration_ms": 1, "latitude": 47.5},
        {"kind": "analysis", "outcome": "failed", "duration_ms": 1, "model": "my_model"},
    ],
)
def test_a_report_outside_the_closed_sets_is_refused(body):
    # A value nothing validates would be a new series a script could grow,
    # and an unknown field (a coordinate, say) must not be silently dropped.
    assert client.post("/api/reports", json=body).status_code == 422


def test_reports_have_a_bucket_of_their_own(monkeypatch):
    # The suite turns every bucket off (conftest); this one gets a real one.
    limiter = ratelimit.RateLimiter(60, 3)
    monkeypatch.setattr(ratelimit.client, "REPORTS_LIMITER", limiter)
    statuses = [
        client.post("/api/reports", json={"kind": "map", "outcome": "success", "duration_ms": 1}).status_code
        for _ in range(limiter.burst + 1)
    ]
    assert statuses[: limiter.burst] == [204] * limiter.burst
    assert statuses[-1] == 429


def test_capabilities_publishes_the_reports_bucket():
    body = client.get("/api/capabilities").json()
    rate = body["limits"]["rate"]
    assert rate["reports_per_minute"] == ratelimit.client.REPORTS_LIMITER.per_minute
    assert rate["reports_burst"] == ratelimit.client.REPORTS_LIMITER.burst
