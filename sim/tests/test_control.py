"""The switchboard: faults fire when asked, count down, and clear."""

from __future__ import annotations

import time

import httpx
from conftest import as_json

from app.services import errors

FORECAST = {
    "latitude": "47",
    "longitude": "-121",
    "hourly": "temperature_2m",
    "start_hour": "2026-10-17T00:00",
    "end_hour": "2026-10-17T01:00",
}


def _status_error(response) -> httpx.HTTPStatusError:
    real = httpx.Response(
        response.status_code,
        content=response.content,
        headers=response.headers,
        request=httpx.Request("GET", "http://x"),
    )
    return httpx.HTTPStatusError("sim", request=real.request, response=real)


def test_a_429_counts_down_and_carries_retry_after(client):
    document = {"faults": {"forecast": {"status": 429, "times": 2, "retry_after_s": 30}}}
    assert client.put("/control", json=document).status_code == 200
    for remaining in (1, None):
        r = client.get("/open-meteo/v1/forecast", params=FORECAST)
        assert r.status_code == 429
        assert r.headers["Retry-After"] == "30"
        assert errors.parse_rate_limit(_status_error(r)) == ("minutely", 30)
        faults = as_json(client.get("/control"))["faults"]
        assert faults.get("forecast", {}).get("times") == remaining
    assert client.get("/open-meteo/v1/forecast", params=FORECAST).status_code == 200


def test_the_scope_word_is_the_documents(client):
    reason = "Hourly API request limit exceeded. Please try again in the next hour."
    client.put("/control", json={"faults": {"forecast": {"status": 429, "reason": reason}}})
    r = client.get("/open-meteo/v1/forecast", params=FORECAST)
    assert errors.parse_rate_limit(_status_error(r))[0] == "hourly"
    # No `times` is every request until the document changes.
    assert client.get("/open-meteo/v1/forecast", params=FORECAST).status_code == 429


def test_a_fault_reaches_its_endpoint_alone(client):
    client.put("/control", json={"faults": {"air_quality": {"status": 503}}})
    assert client.get("/open-meteo/v1/forecast", params=FORECAST).status_code == 200
    aqi = client.get("/open-meteo/v1/air-quality", params=FORECAST | {"hourly": "us_aqi"})
    assert aqi.status_code == 503
    assert as_json(aqi)["error"] is True


def test_out_of_domain_reads_as_the_pod_expects(client):
    reason = "No data is available for this location"
    client.put("/control", json={"faults": {"forecast": {"status": 400, "reason": reason, "times": 1}}})
    r = client.get("/open-meteo/v1/forecast", params=FORECAST)
    assert errors.is_out_of_domain(_status_error(r))


def test_a_delay_alone_is_a_slow_success(client):
    client.put("/control", json={"faults": {"forecast": {"delay_s": 0.2, "times": 1}}})
    began = time.monotonic()
    assert client.get("/open-meteo/v1/forecast", params=FORECAST).status_code == 200
    assert time.monotonic() - began >= 0.2
    assert as_json(client.get("/control"))["faults"] == {}


def test_an_arcgis_supplier_fails_in_its_own_shape(client):
    client.put("/control", json={"faults": {"snow": {"status": 500, "reason": "Down"}}})
    r = client.get("/snow/identify", params={"geometry": "-121,47"})
    assert as_json(r) == {"error": {"code": 500, "message": "Down", "details": []}}


def test_delete_resets_and_put_refuses_what_it_cannot_read(client):
    client.put("/control", json={"faults": {"tiles": {"status": 500}}, "overpass": {"candidates": 1600}})
    assert as_json(client.get("/control"))["overpass"] == {"candidates": 1600}
    assert as_json(client.delete("/control")) == {"faults": {}, "overpass": {"candidates": None}}
    assert client.put("/control", json={"faults": {"weather": {"status": 429}}}).status_code == 422
    assert client.put("/control", json={"faults": {"forecast": {"status": 429, "tims": 1}}}).status_code == 422


def test_the_browser_can_read_retry_after(client):
    client.put("/control", json={"faults": {"forecast": {"status": 429, "retry_after_s": 5}}})
    r = client.get("/open-meteo/v1/forecast", params=FORECAST, headers={"Origin": "http://localhost:8000"})
    assert r.headers["access-control-allow-origin"] == "*"
    assert "retry-after" in r.headers["access-control-expose-headers"].lower()
