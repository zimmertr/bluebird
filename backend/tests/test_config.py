from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from app import browser_upstreams
from app.main import app
from app.routes.config import _truthy

client = TestClient(app)


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on", "  on  "])
def test_truthy_accepts(value):
    assert _truthy(value) is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "  ", None])
def test_truthy_rejects(value):
    assert _truthy(value) is False


def test_config_disabled_by_default(monkeypatch):
    monkeypatch.delenv("PREVIEW_BANNER", raising=False)
    monkeypatch.delenv("PREVIEW_PR", raising=False)
    body = client.get("/api/config").json()
    assert body["preview"] == {"enabled": False, "pr": None, "commit": None}


def test_config_enabled_surfaces_pr_and_commit(monkeypatch):
    monkeypatch.setenv("PREVIEW_BANNER", "1")
    monkeypatch.setenv("PREVIEW_PR", "42")
    monkeypatch.setenv("PREVIEW_COMMIT", "abc123")
    body = client.get("/api/config").json()
    assert body["preview"] == {"enabled": True, "pr": "42", "commit": "abc123"}


def test_config_disabled_hides_pr_even_if_set(monkeypatch):
    # PR/commit only leak through when the banner is explicitly enabled.
    monkeypatch.delenv("PREVIEW_BANNER", raising=False)
    monkeypatch.setenv("PREVIEW_PR", "42")
    body = client.get("/api/config").json()
    assert body["preview"]["pr"] is None


_BROWSER_VARS = {
    "open_meteo_forecast": "BROWSER_OPEN_METEO_FORECAST_URL",
    "open_meteo_archive": "BROWSER_OPEN_METEO_ARCHIVE_URL",
    "open_meteo_air_quality": "BROWSER_OPEN_METEO_AIR_QUALITY_URL",
    "map_tiles": "BROWSER_MAP_TILES_URL",
    "radar": "BROWSER_RADAR_URL",
    "snow": "BROWSER_SNOW_URL",
}


def test_config_publishes_the_production_upstreams_unset():
    # The frontend compiles these same six in as its fallback, so an unset
    # deployment tells the browser what it would have called anyway.
    assert client.get("/api/config").json()["upstreams"] == {
        "open_meteo_forecast": "https://api.open-meteo.com/v1/forecast",
        "open_meteo_archive": "https://archive-api.open-meteo.com/v1/archive",
        "open_meteo_air_quality": "https://air-quality-api.open-meteo.com/v1/air-quality",
        "map_tiles": "https://tiles.openfreemap.org",
        "radar": "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0",
        "snow": (
            "https://mapservices.weather.noaa.gov/raster/rest/services/snow/"
            "NOHRSC_Snow_Analysis/MapServer"
        ),
    }


def test_config_publishes_the_upstreams_the_env_names(monkeypatch):
    # What the supplier simulator (#224) sets: every browser fetch to one origin.
    sim = {field: f"http://localhost:8080/{field}" for field in _BROWSER_VARS}
    for field, var in _BROWSER_VARS.items():
        monkeypatch.setenv(var, sim[field])
    try:
        # A leaf of strings and two pure functions, so a reload is safe here,
        # and the route reads it through the module.
        importlib.reload(browser_upstreams)
        assert client.get("/api/config").json()["upstreams"] == sim
    finally:
        for var in _BROWSER_VARS.values():
            monkeypatch.delenv(var, raising=False)
        importlib.reload(browser_upstreams)


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}
