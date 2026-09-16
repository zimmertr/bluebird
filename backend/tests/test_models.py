from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app import models
from app.models import (
    ARCHIVE_DATA_DAYS,
    MAX_ANALYZE_PEAKS,
    MAX_POLYGON_AREA_KM2,
    PAST_DATA_DAYS,
    PAST_LIMIT_SLACK_DAYS,
    AnalyzeRequest,
    CustomDestination,
    DestinationResult,
    DestinationsRequest,
    DestinationType,
    GeoPolygon,
    SortBy,
    _as_utc,
    bbox_area_km2,
)
from pydantic import ValidationError


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _valid_request(**overrides):
    """A minimal, in-range custom-destination request; override any field."""
    base = {
        "destination_types": [],
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


@pytest.mark.parametrize("limit", [1, 10, 1500])
def test_limit_accepts_in_range(limit):
    assert _valid_request(limit=limit).limit == limit


@pytest.mark.parametrize("limit", [0, -1, 1501, 5000])
def test_limit_rejects_out_of_range(limit):
    with pytest.raises(ValidationError):
        _valid_request(limit=limit)


# ── AnalyzeRequest.polygon area ────────────────────────────────────────────


def test_polygon_within_limit_is_accepted():
    small = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]])
    req = _valid_request(destination_types=[DestinationType.peak], polygon=small, custom_destinations=None)
    assert req.polygon is not None


def test_polygon_over_limit_is_rejected():
    huge = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]])
    with pytest.raises(ValidationError) as exc:
        _valid_request(destination_types=[DestinationType.peak], polygon=huge, custom_destinations=None)
    # Ring area is well over the ceiling, and the message names the max.
    assert bbox_area_km2(huge.coordinates[0]) > MAX_POLYGON_AREA_KM2
    assert "too large" in str(exc.value)


def test_polygon_area_cap_is_the_measured_ceiling():
    # Spelled as a literal on purpose. Every other assertion about the cap
    # compares something against the imported constant, which moves with it —
    # so before this test, changing 100,000 to 90,000 passed the whole suite.
    # The value is a measurement (see the dated note in models.py); re-measure
    # before editing this number, and edit it here deliberately.
    assert MAX_POLYGON_AREA_KM2 == 100_000


def test_polygon_exactly_at_the_cap_is_accepted(monkeypatch):
    # The comparison is `>`, not `>=`: an area landing exactly on the ceiling
    # is inside it. The area is stubbed rather than drawn, because no ring's
    # bbox math lands on exactly 100,000.0 km² reliably enough to pin a
    # boundary — bbox_area_km2 has its own tests above.
    monkeypatch.setattr(models, "bbox_area_km2", lambda ring: float(MAX_POLYGON_AREA_KM2))
    at_cap = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])
    req = _valid_request(
        destination_types=[DestinationType.peak], polygon=at_cap, custom_destinations=None
    )
    assert req.polygon is not None


def test_polygon_a_hair_over_the_cap_is_rejected(monkeypatch):
    # The other side of the same boundary, so the pair pins `>` exactly.
    monkeypatch.setattr(
        models, "bbox_area_km2", lambda ring: float(MAX_POLYGON_AREA_KM2) + 0.5
    )
    over = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])
    with pytest.raises(ValidationError) as exc:
        _valid_request(
            destination_types=[DestinationType.peak], polygon=over, custom_destinations=None
        )
    assert "too large" in str(exc.value)


def test_polygon_none_passes_validator():
    # Custom analyses carry no polygon; the validator must allow None.
    assert _valid_request().polygon is None


# ── AnalyzeRequest.window ──────────────────────────────────────────────────


def test_window_far_in_past_is_rejected():
    with pytest.raises(ValidationError) as exc:
        _valid_request(
            start_datetime=_now() - timedelta(days=PAST_LIMIT_SLACK_DAYS + 5),
            end_datetime=_now() - timedelta(days=PAST_LIMIT_SLACK_DAYS + 4),
        )
    assert "history limit" in str(exc.value)


def test_window_a_year_back_is_accepted_now_that_the_archive_answers_it():
    # The wall #123 removed: a year back used to fail this validator, and the
    # calendar never offered it. Both ends sit in the archive's range, so this
    # is an ordinary window rather than an edge case.
    req = _valid_request(
        start_datetime=_now() - timedelta(days=ARCHIVE_DATA_DAYS),
        end_datetime=_now() - timedelta(days=ARCHIVE_DATA_DAYS) + timedelta(hours=6),
    )
    assert req.start_datetime is not None


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


def test_window_equal_start_end_normalizes_to_point_sample():
    # A zero-length window is a point sample: the model floors the moment to
    # its hour and spans one minute, so the inclusive hourly filter downstream
    # matches exactly one timestamp — the hour containing the request.
    t = _now().replace(minute=30, second=15, microsecond=250)
    req = _valid_request(start_datetime=t, end_datetime=t)
    floored = t.replace(minute=0, second=0, microsecond=0)
    assert req.start_datetime == floored
    assert req.end_datetime == floored + timedelta(minutes=1)


def test_window_equal_on_the_hour_stays_that_hour():
    # A moment exactly on an hour boundary — the common case for the Future
    # Day/Time picker — must sample that hour, not spill into the next one
    # (the old +1h normalization caught two hourly stamps here).
    t = _now().replace(minute=0, second=0, microsecond=0) + timedelta(hours=30)
    req = _valid_request(start_datetime=t, end_datetime=t)
    assert req.start_datetime == t
    assert req.end_datetime == t + timedelta(minutes=1)


# ── helpers / enums ────────────────────────────────────────────────────────


def test_as_utc_adds_timezone_to_naive():
    naive = datetime(2026, 1, 1, 12, 0, 0)  # noqa: DTZ001 — naive input under test
    assert _as_utc(naive).tzinfo is timezone.utc


def test_as_utc_preserves_aware():
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert _as_utc(aware) is aware


def test_sortby_values_match_result_fields():
    # The frontend ranks by these string values; they must equal DestinationResult
    # attribute names so _sort_key's getattr resolves. Checked for every member,
    # because #291 made the whole enum reachable from the UI's aggregate pickers.
    for member in SortBy:
        assert member.value in DestinationResult.model_fields, member
    assert SortBy.precip_total.value == "precip_total_in"
    assert SortBy.precip_avg.value == "precip_avg_in_hr"
    assert SortBy.wind_min.value == "wind_min_mph"
    assert SortBy.aqi_max.value == "aqi_max"


def test_destination_type_membership():
    assert {t.value for t in DestinationType} == {"peak", "trailhead", "lake", "custom"}


# ── CustomDestination validation ───────────────────────────────────────────


def _cd(**overrides):
    base = {"name": "X", "latitude": 47.0, "longitude": -121.0}
    base.update(overrides)
    return base


def test_custom_destination_rejects_out_of_range_coordinates():
    for bad in [{"latitude": 99.0}, {"latitude": -90.5}, {"longitude": 199.0}, {"longitude": -180.5}]:
        with pytest.raises(ValidationError):
            CustomDestination(**_cd(**bad))


def test_custom_destination_accepts_boundary_coordinates():
    CustomDestination(**_cd(latitude=90.0, longitude=-180.0))
    CustomDestination(**_cd(latitude=-90.0, longitude=180.0))


def test_custom_destination_name_rules():
    with pytest.raises(ValidationError):
        CustomDestination(**_cd(name=""))
    with pytest.raises(ValidationError):
        CustomDestination(**_cd(name="   "))
    with pytest.raises(ValidationError):
        CustomDestination(**_cd(name="x" * 256))
    # Whitespace trims; a max-length name passes.
    assert CustomDestination(**_cd(name="  Peak  ")).name == "Peak"
    CustomDestination(**_cd(name="x" * 255))


def test_custom_destination_elevation_bounds():
    with pytest.raises(ValidationError):
        CustomDestination(**_cd(elevation_ft=99_999.0))
    with pytest.raises(ValidationError):
        CustomDestination(**_cd(elevation_ft=-2_000.0))
    CustomDestination(**_cd(elevation_ft=None))
    CustomDestination(**_cd(elevation_ft=-1_500.0))
    CustomDestination(**_cd(elevation_ft=30_000.0))


def test_analyze_request_caps_custom_destination_list():
    rows = [{"name": f"P{i}", "latitude": 1.0, "longitude": 2.0} for i in range(MAX_ANALYZE_PEAKS + 1)]
    with pytest.raises(ValidationError, match="Too many custom destinations"):
        _valid_request(custom_destinations=rows)
    # Exactly at the cap is allowed at the model layer.
    _valid_request(custom_destinations=rows[:MAX_ANALYZE_PEAKS])


def test_the_two_discovery_requests_keep_their_own_wording():
    """`_DiscoveryFields` shares the checks, not the sentences (issue #388).

    Both endpoints validate a caller's list the same way and say different
    things about it, because one analyzes the list and the other resolves it.
    Both sentences are approved copy, so a shared validator that reworded
    either would be a copy change nobody asked for.
    """
    rows = [{"name": f"P{i}", "latitude": 1.0, "longitude": 2.0} for i in range(MAX_ANALYZE_PEAKS + 1)]
    with pytest.raises(ValidationError, match="to analyze a caller-supplied list"):
        _valid_request(destination_types=[DestinationType.custom])
    with pytest.raises(ValidationError, match="to resolve a caller-supplied list"):
        DestinationsRequest(destination_types=[DestinationType.custom])
    with pytest.raises(ValidationError, match="split it into multiple analyses"):
        _valid_request(custom_destinations=rows)
    with pytest.raises(ValidationError, match="split it into multiple requests"):
        DestinationsRequest(custom_destinations=rows)


# ── window_source (issue #123) ─────────────────────────────────────────────
#
# The table below is the CONTRACT between the two implementations: the same
# rows, the same expectations, live in `windowSource`'s test in
# frontend/src/utils/forecastWindow.test.ts. Change one, change both.
#
# `NOW` is 18:00 UTC, so the boundary (NOW - PAST_DATA_DAYS, floored to the UTC
# day) is 2026-07-19T00:00Z and the straddle floor a day before it.

_SOURCE_NOW = datetime(2026, 9, 12, 18, 0, tzinfo=timezone.utc)

_SOURCE_CASES = [
    # (start, end, expected, why)
    ("2026-09-10T00:00", "2026-09-11T23:59", "forecast", "an ordinary recent window"),
    ("2026-09-12T18:00", "2026-09-12T18:01", "forecast", "the current hour"),
    ("2026-07-19T00:00", "2026-07-19T23:59", "forecast", "starts exactly at the boundary"),
    ("2026-07-18T07:00", "2026-07-19T06:59", "forecast", "a Pacific day straddling it"),
    ("2026-07-18T00:00", "2026-07-18T23:59", "archive", "ends before the boundary"),
    ("2026-07-01T00:00", "2026-07-01T23:59", "archive", "a month past it"),
    ("2025-09-12T00:00", "2025-09-12T23:59", "archive", "a year back"),
    ("2026-07-17T00:00", "2026-07-19T12:00", "spanning", "crosses the boundary"),
    ("2026-07-01T00:00", "2026-09-12T18:00", "spanning", "crosses it by weeks"),
]

# Both 'spanning' rows describe a window that IS served: two fetches, one per
# endpoint, split at the boundary below and joined before the aggregation.


@pytest.mark.parametrize(("start", "end", "expected", "why"), _SOURCE_CASES)
def test_window_source_classification_table(start, end, expected, why):
    got = models.window_source(
        datetime.fromisoformat(start).replace(tzinfo=timezone.utc),
        datetime.fromisoformat(end).replace(tzinfo=timezone.utc),
        _SOURCE_NOW,
    )
    assert got == expected, why


def test_window_source_boundary_is_the_forecast_endpoints_own_data_edge():
    # One boundary, and it is PAST_DATA_DAYS rather than a second constant: the
    # archive takes over exactly where the forecast endpoint's data stops.
    just_inside = _SOURCE_NOW - timedelta(days=PAST_DATA_DAYS)
    assert models.window_source(just_inside, just_inside, _SOURCE_NOW) == "forecast"
    older = _SOURCE_NOW - timedelta(days=PAST_DATA_DAYS + 2)
    assert models.window_source(older, older, _SOURCE_NOW) == "archive"


def test_archive_boundary_is_one_instant_on_the_utc_day():
    # The seam a spanning window is cut at, and the instant `window_source`
    # classifies against: the same value, from one function, because a second
    # spelling could split a window an hour from where it was classified.
    boundary = models.archive_boundary(_SOURCE_NOW)
    assert boundary == datetime(2026, 7, 19, tzinfo=timezone.utc)
    assert models.window_source(
        boundary - timedelta(minutes=1), boundary - timedelta(minutes=1), _SOURCE_NOW
    ) == "archive"
    assert models.window_source(boundary, boundary, _SOURCE_NOW) == "forecast"


def test_archive_boundary_reads_a_naive_now_as_utc():
    naive = _SOURCE_NOW.replace(tzinfo=None)
    assert models.archive_boundary(naive) == models.archive_boundary(_SOURCE_NOW)


def test_window_source_reads_a_naive_timestamp_as_utc():
    # The API accepts naive timestamps and the whole pipeline reads them as UTC;
    # a boundary that read them as local would classify a window differently
    # from the fetch that follows it.
    naive = datetime(2026, 7, 1, 0, 0)  # noqa: DTZ001 — naive on purpose
    assert models.window_source(naive, naive, _SOURCE_NOW) == "archive"
