from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app import ratelimit
from app.main import app
from app.models import (
    FUTURE_LIMIT_SLACK_DAYS,
    MAX_ANALYZE_PEAKS,
    MAX_LIMIT,
    MAX_POLYGON_AREA_KM2,
    MIN_LIMIT,
    PAST_LIMIT_SLACK_DAYS,
    AnalyzeRequest,
    DestinationType,
    SortBy,
)
from app.services.air_quality import MAX_FORECAST_DAYS
from app.services.osm import IMPLEMENTED_TYPES
from fastapi.testclient import TestClient
from pydantic import ValidationError

client = TestClient(app)


def _capabilities() -> dict:
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    return response.json()


def test_limits_mirror_the_constants_the_validators_enforce():
    # The endpoint's entire value is that a client can trust it instead of
    # hardcoding. A number here that differs from the enforced one is worse
    # than no endpoint at all, so compare the whole object rather than spot
    # checks: a newly added limit fails this until it is asserted too.
    assert _capabilities()["limits"] == {
        "max_polygon_area_km2": MAX_POLYGON_AREA_KM2,
        "max_destinations": MAX_ANALYZE_PEAKS,
        "min_limit": MIN_LIMIT,
        "max_limit": MAX_LIMIT,
        "max_past_days": PAST_LIMIT_SLACK_DAYS,
        "max_future_days": FUTURE_LIMIT_SLACK_DAYS,
        "aqi_forecast_days": MAX_FORECAST_DAYS,
        # Rate limits come from the live limiter instances (patched off in
        # conftest), not env constants — value plumbing is asserted with real
        # numbers in test_ratelimit.py.
        "rate": {
            "analyze_per_minute": ratelimit.ANALYZE_LIMITER.per_minute,
            "analyze_burst": ratelimit.ANALYZE_LIMITER.burst,
            "destinations_per_minute": ratelimit.DESTINATIONS_LIMITER.per_minute,
            "destinations_burst": ratelimit.DESTINATIONS_LIMITER.burst,
            "geocode_per_minute": ratelimit.GEOCODE_LIMITER.per_minute,
            "geocode_burst": ratelimit.GEOCODE_LIMITER.burst,
            "wildfires_per_minute": ratelimit.WILDFIRES_LIMITER.per_minute,
            "wildfires_burst": ratelimit.WILDFIRES_LIMITER.burst,
        },
    }


def test_destination_types_are_the_discoverable_ones_plus_custom():
    assert set(_capabilities()["destination_types"]) == {
        t.value for t in IMPLEMENTED_TYPES
    } | {DestinationType.custom.value}


def test_unimplemented_enum_members_are_not_advertised():
    # DestinationType models types Overpass cannot yet discover. Advertising one
    # would walk a caller straight into a 400, which is the exact confusion this
    # endpoint exists to remove.
    advertised = set(_capabilities()["destination_types"])
    unimplemented = {
        t.value
        for t in DestinationType
        if t not in IMPLEMENTED_TYPES and t is not DestinationType.custom
    }
    assert advertised.isdisjoint(unimplemented)


def test_sort_keys_match_the_accepted_enum():
    assert _capabilities()["sort_keys"] == [s.value for s in SortBy]


def _request(**overrides) -> AnalyzeRequest:
    now = datetime.now(timezone.utc)
    base = {
        "destination_types": [],
        "start_datetime": now,
        "end_datetime": now + timedelta(days=1),
        "custom_destinations": [{"name": "X", "latitude": 47.0, "longitude": -121.0}],
    }
    base.update(overrides)
    return AnalyzeRequest(**base)


def test_advertised_limit_ceiling_is_the_one_actually_enforced():
    # Ties the advertisement to real behavior. Asserting the payload against the
    # constant only proves the endpoint reads the right name; this proves the
    # validator agrees on what that name means.
    ceiling = _capabilities()["limits"]["max_limit"]
    assert _request(limit=ceiling).limit == ceiling
    with pytest.raises(ValidationError):
        _request(limit=ceiling + 1)


def test_advertised_limit_floor_is_the_one_actually_enforced():
    floor = _capabilities()["limits"]["min_limit"]
    assert _request(limit=floor).limit == floor
    with pytest.raises(ValidationError):
        _request(limit=floor - 1)


def test_data_sources_are_named_and_linked():
    sources = _capabilities()["data_sources"]
    assert sources
    for source in sources:
        assert source["name"]
        assert source["url"].startswith("https://")
        assert source["provides"]


def test_capabilities_is_documented_and_tagged():
    operation = app.openapi()["paths"]["/api/capabilities"]["get"]
    assert operation["tags"] == ["metadata"]
    assert operation["summary"]
