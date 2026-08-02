from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app import ratelimit
from app.main import app
from app.models import (
    DEFAULT_FORECAST_MODEL,
    FUTURE_LIMIT_SLACK_DAYS,
    MAX_ANALYZE_PEAKS,
    MAX_LIMIT,
    MAX_POLYGON_AREA_KM2,
    MIN_LIMIT,
    MODEL_INFO,
    PAST_DATA_DAYS,
    PAST_LIMIT_SLACK_DAYS,
    AnalyzeRequest,
    DestinationType,
    ForecastModel,
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
        "past_data_days": PAST_DATA_DAYS,
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


# ── forecast models ────────────────────────────────────────────────────────


def test_capabilities_publishes_every_selectable_model_with_its_reach():
    # Same contract as the limits above: a client picks a model from here rather
    # than hardcoding Open-Meteo's ids, and reads how far each reaches rather
    # than compiling its own calendar band.
    published = _capabilities()["forecast_models"]
    assert {m["id"] for m in published} == {m.value for m in ForecastModel}
    for entry in published:
        info = MODEL_INFO[ForecastModel(entry["id"])]
        assert entry["label"] == info.label
        assert entry["summary"] == info.summary
        assert entry["forecast_hours"] == info.forecast_hours
        assert entry["regional"] == info.regional


def test_every_model_carries_a_summary_the_picker_can_show():
    # These render as the line under each model name, so a blank one is a row
    # that says nothing about a choice the reader has to make. The length bound
    # is the panel column: measured, 80 characters wraps to two lines there and
    # anything longer takes three.
    for entry in _capabilities()["forecast_models"]:
        summary = entry["summary"]
        assert summary.strip(), entry["id"]
        assert summary.endswith("."), entry["id"]
        assert len(summary) <= 80, (entry["id"], len(summary))


def test_capabilities_flags_exactly_one_default_and_it_is_the_request_default():
    published = _capabilities()["forecast_models"]
    defaults = [m["id"] for m in published if m["default"]]
    assert defaults == [DEFAULT_FORECAST_MODEL.value]
    # And a request that names no model really does land on it, or the picker
    # would open on one model while the analysis ran another.
    assert AnalyzeRequest(destination_types=[]).forecast_model is DEFAULT_FORECAST_MODEL


def test_capabilities_publishes_models_in_the_declared_ranking_not_a_sort():
    # The order is editorial — a ranking for mountain terrain — so it must
    # survive to the client exactly as declared. Asserting it is not a sort on
    # reach is the guard that matters: reach is the field someone would reach
    # for, and it would invert the list, putting the coarsest global models
    # above a 2.5 km one.
    published = [m["id"] for m in _capabilities()["forecast_models"]]
    assert published == [m.value for m in MODEL_INFO]
    hours = [m["forecast_hours"] for m in _capabilities()["forecast_models"]]
    assert hours != sorted(hours, reverse=True)
    assert published[0] == DEFAULT_FORECAST_MODEL.value


def test_capabilities_omits_the_models_that_cannot_be_recommended():
    # best_match never reports which model it picked, which is the whole reason
    # this feature exists. ecmwf_aifs025 serves nulls everywhere. knmi_seamless
    # and metno_seamless are byte-identical to each other over North America and
    # match no ECMWF or GEM product, so neither can be placed in a list that
    # claims to be ranked.
    published = {m["id"] for m in _capabilities()["forecast_models"]}
    assert published.isdisjoint(
        {"best_match", "ecmwf_aifs025", "metno_seamless", "knmi_seamless"}
    )


def test_hrrr_is_the_only_regional_model_and_the_short_range_one():
    regional = [m for m in _capabilities()["forecast_models"] if m["regional"]]
    assert [m["id"] for m in regional] == [ForecastModel.gfs_hrrr.value]
    # Measured 2026-08-01: HRRR reached 42 usable hours where every global model
    # reached at least 72. The gap is the whole reason the calendar band moves.
    assert regional[0]["forecast_hours"] == 42
    others = [m["forecast_hours"] for m in _capabilities()["forecast_models"] if not m["regional"]]
    assert min(others) > regional[0]["forecast_hours"]


def test_past_data_days_sits_well_inside_the_date_the_api_merely_accepts():
    # The distinction the ~30-day empty-history bug turned on: the API accepts a
    # date for ~93 days, but past ~58 every model answers with nulls.
    limits = _capabilities()["limits"]
    assert limits["past_data_days"] < limits["max_past_days"]
    assert limits["past_data_days"] == 55
