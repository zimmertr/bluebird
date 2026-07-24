from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.models import (
    MAX_POLYGON_AREA_KM2,
    AnalyzeRequest,
    DestinationType,
    GeoPolygon,
    SortBy,
    _as_utc,
    bbox_area_km2,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _valid_request(**overrides):
    """A minimal, in-range custom-destination request; override any field."""
    base = {
        "destination_type": DestinationType.custom,
        "start_datetime": _now(),
        "end_datetime": _now() + timedelta(days=1),
        "custom_destinations": [{"name": "X", "latitude": 47.0, "longitude": -121.0}],
    }
    base.update(overrides)
    return AnalyzeRequest(**base)


# ── bbox_area_km2 ──────────────────────────────────────────────────────────


def test_bbox_area_unit_square_near_equator():
    # 1° x 1° box at the equator ≈ 111 km x ~111 km.
    ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
    assert bbox_area_km2(ring) == pytest.approx(12320.5, abs=1.0)


def test_bbox_area_degenerate_point_is_zero():
    ring = [[5, 5], [5, 5], [5, 5]]
    assert bbox_area_km2(ring) == 0.0


def test_bbox_area_shrinks_with_latitude():
    # The same lon-span covers less ground the farther it is from the equator
    # (cos(lat) factor), so a high-latitude box is smaller than an equatorial one.
    equ = bbox_area_km2([[0, 0], [1, 0], [1, 1], [0, 1]])
    high = bbox_area_km2([[0, 60], [1, 60], [1, 61], [0, 61]])
    assert high < equ


# ── AnalyzeRequest.limit ───────────────────────────────────────────────────


@pytest.mark.parametrize("limit", [1, 10, 200])
def test_limit_accepts_in_range(limit):
    assert _valid_request(limit=limit).limit == limit


@pytest.mark.parametrize("limit", [0, -1, 201, 1000])
def test_limit_rejects_out_of_range(limit):
    with pytest.raises(ValidationError):
        _valid_request(limit=limit)


# ── AnalyzeRequest.polygon area ────────────────────────────────────────────


def test_polygon_within_limit_is_accepted():
    small = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]])
    req = _valid_request(destination_type=DestinationType.peak, polygon=small, custom_destinations=None)
    assert req.polygon is not None


def test_polygon_over_limit_is_rejected():
    huge = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]])
    with pytest.raises(ValidationError) as exc:
        _valid_request(destination_type=DestinationType.peak, polygon=huge, custom_destinations=None)
    # Ring area is well over the ceiling, and the message names the max.
    assert bbox_area_km2(huge.coordinates[0]) > MAX_POLYGON_AREA_KM2
    assert "too large" in str(exc.value)


def test_polygon_none_passes_validator():
    # Custom analyses carry no polygon; the validator must allow None.
    assert _valid_request().polygon is None


# ── AnalyzeRequest.window ──────────────────────────────────────────────────


def test_window_far_in_past_is_rejected():
    with pytest.raises(ValidationError) as exc:
        _valid_request(
            start_datetime=_now() - timedelta(days=200),
            end_datetime=_now() - timedelta(days=199),
        )
    assert "history limit" in str(exc.value)


def test_window_far_in_future_is_rejected():
    with pytest.raises(ValidationError) as exc:
        _valid_request(
            start_datetime=_now() + timedelta(days=1),
            end_datetime=_now() + timedelta(days=60),
        )
    assert "forecast horizon" in str(exc.value)


def test_window_naive_datetimes_are_accepted():
    # Frontend sends local wall-clock strings with no offset; the validator
    # treats naive datetimes as UTC rather than raising.
    naive_start = datetime.now().replace(tzinfo=None)  # noqa: DTZ005 — naive is the point of this test
    req = _valid_request(start_datetime=naive_start, end_datetime=naive_start + timedelta(hours=6))
    assert req.start_datetime.replace(tzinfo=None) == naive_start


# ── helpers / enums ────────────────────────────────────────────────────────


def test_as_utc_adds_timezone_to_naive():
    naive = datetime(2026, 1, 1, 12, 0, 0)  # noqa: DTZ001 — naive input under test
    assert _as_utc(naive).tzinfo is timezone.utc


def test_as_utc_preserves_aware():
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert _as_utc(aware) is aware


def test_sortby_values_match_result_fields():
    # The frontend ranks by these string values; they must equal DestinationResult
    # attribute names so _sort_key's getattr resolves.
    assert SortBy.precip_total.value == "precip_total_in"
    assert SortBy.aqi_max.value == "aqi_max"


def test_destination_type_membership():
    assert {t.value for t in DestinationType} == {"peak", "trailhead", "lake", "custom"}
