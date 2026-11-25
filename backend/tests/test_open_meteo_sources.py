"""The weather source list a deployment publishes (record 0345)."""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from app import open_meteo_sources, security_headers
from app.main import app
from app.open_meteo_sources import PUBLIC_SOURCE, mirror_origins, read_sources

client = TestClient(app)


def test_with_nothing_configured_the_list_is_the_public_hosts_alone():
    # Exactly how the app behaved before the list existed: one source, paced.
    assert read_sources(None) == (PUBLIC_SOURCE,)
    assert read_sources("") == (PUBLIC_SOURCE,)
    assert PUBLIC_SOURCE.paced is True
    assert PUBLIC_SOURCE.forecast_url == "https://api.open-meteo.com/v1/forecast"
    assert PUBLIC_SOURCE.archive_url == "https://archive-api.open-meteo.com/v1/archive"
    assert PUBLIC_SOURCE.air_quality_url == "https://air-quality-api.open-meteo.com/v1/air-quality"


def test_mirrors_come_first_in_their_order_and_the_public_hosts_last():
    sources = read_sources("https://om-a.example.org, https://om-b.example.org/")
    assert [s.name for s in sources] == ["mirror", "mirror", "open-meteo"]
    a, b, public = sources
    assert a.forecast_url == "https://om-a.example.org/v1/forecast"
    assert a.air_quality_url == "https://om-a.example.org/v1/air-quality"
    # Past windows stay on Open-Meteo's archive host, and a mirror has no
    # free-tier quota to pace under.
    assert a.archive_url is None
    assert a.paced is False
    assert b.forecast_url == "https://om-b.example.org/v1/forecast"
    assert public == PUBLIC_SOURCE


@pytest.mark.parametrize(
    "value",
    [
        "http://om.example.org",
        "https://om.example.org/v1",
        "https://om.example.org?x=1",
        "om.example.org",
        "https://",
    ],
)
def test_an_entry_that_is_not_an_https_origin_is_logged_and_skipped(value, caplog):
    # A pod that refuses to start over one mistyped value is a worse failure
    # than one that skips it and says so (the same rule `env.py` keeps).
    with caplog.at_level(logging.WARNING, logger="app.open_meteo_sources"):
        assert read_sources(value) == (PUBLIC_SOURCE,)
    assert "OPEN_METEO_MIRRORS" in caplog.text


def test_the_policy_lets_the_page_reach_every_mirror_it_is_told_to_ask():
    sources = read_sources("https://om-a.example.org,https://om-b.example.org")
    origins = mirror_origins(sources)
    assert origins == ("https://om-a.example.org", "https://om-b.example.org")
    connect = next(
        part for part in security_headers.app_csp(origins).split("; ") if part.startswith("connect-src")
    )
    # Whole tokens of the directive, compared as a set, never as substrings.
    assert set(origins) <= set(connect.split()[1:])


def test_without_mirrors_the_policy_is_the_one_every_response_carries():
    assert mirror_origins((PUBLIC_SOURCE,)) == ()
    assert security_headers.app_csp(()) == security_headers.APP_CSP


def test_capabilities_publishes_the_list_the_policy_was_built_from(monkeypatch):
    sources = read_sources("https://om.example.org")
    monkeypatch.setattr("app.routes.capabilities.OPEN_METEO_SOURCES", sources)
    body = client.get("/api/capabilities").json()
    assert body["open_meteo_sources"] == [s.model_dump() for s in sources]


def test_capabilities_publishes_the_public_hosts_by_default():
    assert open_meteo_sources.SOURCES == (PUBLIC_SOURCE,)
    body = client.get("/api/capabilities").json()
    assert body["open_meteo_sources"] == [PUBLIC_SOURCE.model_dump()]
