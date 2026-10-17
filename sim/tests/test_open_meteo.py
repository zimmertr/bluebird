"""The Open-Meteo answers, read by the pod's own parsers.

A drift guard rather than a test of the sim's numbers: if the sim answers a
shape the app's aggregation refuses or reads as empty, a dev stack would look
broken for a reason production never has.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from conftest import as_json

from app import values
from app.services import aggregation, errors, weather

START = "2026-10-17T00:00"
END = "2026-10-19T23:00"
START_DT = datetime(2026, 10, 17, tzinfo=UTC)
END_DT = datetime(2026, 10, 19, 23, tzinfo=UTC)
# A summit-like coordinate and a second one, so the answer is an array.
LATS, LONS = "46.853,47.42", "-121.76,-121.1"

# The browser asks for the pod's variables plus the wind bearing (row 8 of the
# mirror table in the root CLAUDE.md).
BROWSER_VARIABLES = aggregation.HOURLY_VARIABLES + ",wind_direction_10m"


def _forecast(client, path: str = "/open-meteo/v1/forecast", **extra: str):
    params = {
        "latitude": LATS,
        "longitude": LONS,
        "hourly": BROWSER_VARIABLES,
        "start_hour": START,
        "end_hour": END,
        "timezone": "UTC",
        **weather._WEATHER_UNITS,
    }
    params.update(extra)
    return client.get(path, params=params)


def test_a_forecast_answer_passes_the_unit_check_and_aggregates(client):
    r = _forecast(client, models="gfs_seamless", timeformat="unixtime")
    assert r.status_code == 200
    items = as_json(r)
    assert isinstance(items, list) and len(items) == 2
    for item in items:
        aggregation._check_units(item, aggregation._DECLARED_UNITS)
        assert set(BROWSER_VARIABLES.split(",")) <= set(item["hourly"])
        assert all(len(column) == 72 for column in item["hourly"].values())


def test_the_pods_iso_answer_aggregates_to_numbers_everywhere(client):
    items = as_json(_forecast(client, models="gfs_seamless"))
    item = items[0]
    assert item["hourly"]["time"][0] == START
    # A summit's height, so the wind and temperature read the levels.
    metrics = aggregation._weather_metrics(item, START_DT, END_DT, 14_000.0)
    assert metrics is not None
    assert {k: v for k, v in metrics.items() if v is None} == {}


def test_one_location_is_an_object(client):
    r = _forecast(client, latitude="46.853", longitude="-121.76", models="gfs_seamless")
    assert isinstance(as_json(r), dict)


def test_the_cloud_request_finds_a_deck_somewhere(client):
    # Humidity crosses the saturation threshold for a few hours a day at some
    # level in the wetter places, so a few points over a few days must find a
    # deck and a clear column both.
    lats = ",".join(str(46 + k * 0.37) for k in range(12))
    lons = ",".join(str(-122 + k * 0.29) for k in range(12))
    r = client.get(
        "/open-meteo/v1/forecast",
        params={
            "latitude": lats,
            "longitude": lons,
            "hourly": aggregation.CLOUD_VARIABLES,
            "start_hour": START,
            "end_hour": END,
            "timezone": "UTC",
            "models": "gfs_seamless",
        },
    )
    decks = []
    for item in as_json(r):
        metrics = aggregation._cloud_metrics(item, START_DT, END_DT, 6000.0)
        assert metrics is not None
        decks.append(metrics["cloud_deck_min_ft"])
    assert any(d is not None and d < aggregation.CLOUD_DECK_CEILING_FT for d in decks)
    assert any(d == aggregation.CLOUD_DECK_CEILING_FT for d in decks)


def test_the_archive_answers_levels_and_freezing_as_undefined_nulls(client):
    r = _forecast(client, path="/open-meteo/v1/archive")
    item = as_json(r)[0]
    aggregation._check_units(item, aggregation._DECLARED_UNITS)
    for name in ("wind_speed_700hPa", "temperature_500hPa", "freezing_level_height"):
        assert item["hourly_units"][name] == "undefined"
        assert set(item["hourly"][name]) == {None}
    metrics = aggregation._weather_metrics(item, START_DT, END_DT, 9000.0)
    assert metrics is not None
    assert metrics["temp_min_f"] is not None
    assert metrics["freeze_min_ft"] is None


def test_the_archive_ignores_the_model(client):
    named = _forecast(client, path="/open-meteo/v1/archive", models="ecmwf_ifs025")
    unnamed = _forecast(client, path="/open-meteo/v1/archive")
    assert named.content == unnamed.content


def test_the_same_request_twice_is_byte_identical(client):
    assert _forecast(client, models="gfs_seamless").content == _forecast(client, models="gfs_seamless").content


def test_two_models_draw_two_lines(client):
    a = as_json(_forecast(client, models="gfs_seamless"))[0]["hourly"]["temperature_2m"]
    b = as_json(_forecast(client, models="ecmwf_ifs025"))[0]["hourly"]["temperature_2m"]
    assert a != b


def test_a_model_the_sim_does_not_know_is_still_answered(client):
    assert _forecast(client, models="not_a_model").status_code == 200


def test_five_models_serve_no_freezing_level(client):
    item = as_json(_forecast(client, models="ukmo_seamless"))[0]
    assert set(item["hourly"]["freezing_level_height"]) == {None}
    served = as_json(_forecast(client, models="gfs_hrrr"))[0]
    assert None not in served["hourly"]["freezing_level_height"]


def test_the_freezing_level_follows_precipitation_unit(client):
    feet = as_json(_forecast(client, models="gfs_seamless"))[0]
    metres = as_json(_forecast(client, models="gfs_seamless", precipitation_unit="mm"))[0]
    assert (feet["hourly_units"]["freezing_level_height"], metres["hourly_units"]["freezing_level_height"]) == (
        "ft",
        "m",
    )
    unit = aggregation._freeze_unit(metres)
    converted = aggregation._freeze_to_ft(metres["hourly"]["freezing_level_height"][0], unit)
    assert converted == pytest.approx(feet["hourly"]["freezing_level_height"][0], abs=1)


def test_the_terrain_height_is_echoed(client):
    item = as_json(_forecast(client, latitude="46.853", longitude="-121.76", models="gfs_seamless"))
    assert item["elevation"] == values.terrain_m(46.853, -121.76)


def test_an_unknown_variable_is_refused_like_open_meteo(client):
    r = _forecast(client, hourly="precipitation,cape")
    assert r.status_code == 400
    assert as_json(r)["error"] is True


def test_air_quality_aggregates(client):
    r = client.get(
        "/open-meteo/v1/air-quality",
        params={"latitude": LATS, "longitude": LONS, "hourly": "us_aqi", "start_hour": START, "end_hour": END},
    )
    for item in as_json(r):
        assert item["hourly_units"]["us_aqi"] == "USAQI"
        metrics = aggregation._aqi_metrics(item, START_DT, END_DT)
        assert metrics is not None
        assert 10 <= metrics["aqi_min"] <= metrics["aqi_max"] <= 150


def test_air_quality_is_null_past_its_horizon(client):
    r = client.get(
        "/open-meteo/v1/air-quality",
        params={
            "latitude": "47",
            "longitude": "-121",
            "hourly": "us_aqi",
            "start_hour": "2099-01-01T00:00",
            "end_hour": "2099-01-01T02:00",
        },
    )
    assert as_json(r)["hourly"]["us_aqi"] == [None, None, None]


def _status_error(response) -> httpx.HTTPStatusError:
    real = httpx.Response(response.status_code, content=response.content, request=httpx.Request("GET", "http://x"))
    return httpx.HTTPStatusError("sim", request=real.request, response=real)


def test_the_customer_hosts_want_a_key(client):
    path = "/open-meteo-customer/v1/forecast"
    assert _forecast(client, path=path, models="gfs_seamless").status_code == 401
    invalid = _forecast(client, path=path, models="gfs_seamless", apikey="invalid")
    assert invalid.status_code == 400
    assert errors.is_invalid_api_key(_status_error(invalid))
    keyed = _forecast(client, path=path, models="gfs_seamless", apikey="anything")
    assert keyed.content == _forecast(client, models="gfs_seamless").content
    for service in ("archive", "air-quality"):
        assert client.get(f"/open-meteo-customer/v1/{service}").status_code == 401
