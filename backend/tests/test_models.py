from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

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


def _now() -> datetime:
    return datetime.now(UTC)


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
    # The value is a measurement (see the dated note in limits.py); re-measure
    # before editing this number, and edit it here deliberately.
    assert MAX_POLYGON_AREA_KM2 == 100_000


def test_polygon_exactly_at_the_cap_is_accepted(monkeypatch):
    # The comparison is `>`, not `>=`: an area landing exactly on the ceiling
    # is inside it. The area is stubbed rather than drawn, because no ring's
    # bbox math lands on exactly 100,000.0 km² reliably enough to pin a
    # boundary — bbox_area_km2 has its own tests above.
    monkeypatch.setattr(models.common, "bbox_area_km2", lambda ring: float(MAX_POLYGON_AREA_KM2))
    at_cap = GeoPolygon(type="Polygon", coordinates=[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])
    req = _valid_request(
        destination_types=[DestinationType.peak], polygon=at_cap, custom_destinations=None
    )
    assert req.polygon is not None


def test_polygon_a_hair_over_the_cap_is_rejected(monkeypatch):
    # The other side of the same boundary, so the pair pins `>` exactly.
    monkeypatch.setattr(
        models.common, "bbox_area_km2", lambda ring: float(MAX_POLYGON_AREA_KM2) + 0.5
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


def test_window_naive_datetimes_are_read_as_utc():
    # A direct API caller may send a stamp with no offset (the web app sends no
    # window at all); the validator reads it as UTC rather than raising.
    naive_start = datetime.now(UTC).replace(tzinfo=None)
    req = _valid_request(start_datetime=naive_start, end_datetime=naive_start + timedelta(hours=6))
    assert req.start_datetime == naive_start.replace(tzinfo=UTC)
    assert req.start_datetime.tzinfo is UTC


def test_window_offsets_are_converted_to_the_utc_instant():
    # An offset names an instant, and every reader downstream formats the
    # wall clock it is handed, so the validator hands them all UTC (#564).
    utc = (_now() + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
    minus_seven = timezone(timedelta(hours=-7))
    req = _valid_request(
        start_datetime=utc.astimezone(minus_seven),
        end_datetime=(utc + timedelta(hours=3)).astimezone(minus_seven),
    )
    assert (req.start_datetime, req.end_datetime) == (utc, utc + timedelta(hours=3))
    assert req.start_datetime.tzinfo is UTC
    assert req.end_datetime.tzinfo is UTC


def test_window_point_sample_floors_the_utc_hour_under_a_half_hour_offset():
    # Floored after the conversion, so a +05:30 moment samples the UTC hour it
    # falls in rather than the hour its local wall clock shows.
    utc = (_now() + timedelta(days=1)).replace(minute=45, second=0, microsecond=0)
    moment = utc.astimezone(timezone(timedelta(hours=5, minutes=30)))
    req = _valid_request(start_datetime=moment, end_datetime=moment)
    assert req.start_datetime == utc.replace(minute=0)
    assert req.end_datetime == utc.replace(minute=0) + timedelta(minutes=1)


def test_window_mixed_naive_and_aware_ends_compare():
    # One end with an offset and one without once reached the routes' ordering
    # guard as an aware and a naive datetime, which raised a TypeError (#564).
    start = _now() + timedelta(days=1)
    req = _valid_request(
        start_datetime=start, end_datetime=(start + timedelta(hours=3)).replace(tzinfo=None)
    )
    assert req.end_datetime - req.start_datetime == timedelta(hours=3)


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



def test_resolved_window_is_the_validated_pair():
    # Every mode leaves both fields set, so the routes can read one pair of
    # real instants. "current" sends no timestamps at all and is the case the
    # optional fields exist for.
    req = _valid_request(start_datetime=None, end_datetime=None, forecast_mode="current")
    start, end = req.resolved_window()
    assert (start, end) == (req.start_datetime, req.end_datetime)
    assert end == start + timedelta(minutes=1)


def test_resolved_window_refuses_a_request_that_skipped_validation():
    # model_construct bypasses the validators, which is the one way a request
    # reaches a route with its window unfilled. Failing loudly there beats a
    # None comparison deep inside the analysis.
    req = AnalyzeRequest.model_construct(start_datetime=None, end_datetime=None)
    with pytest.raises(RuntimeError):
        req.resolved_window()

# ── helpers / enums ────────────────────────────────────────────────────────


def test_as_utc_adds_timezone_to_naive():
    naive = datetime(2026, 1, 1, 12, 0, 0)  # noqa: DTZ001 — naive input under test
    assert _as_utc(naive).tzinfo is UTC


def test_as_utc_preserves_aware():
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
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

_SOURCE_NOW = datetime(2026, 9, 12, 18, 0, tzinfo=UTC)

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
        datetime.fromisoformat(start).replace(tzinfo=UTC),
        datetime.fromisoformat(end).replace(tzinfo=UTC),
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
    assert boundary == datetime(2026, 7, 19, tzinfo=UTC)
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


# ── The request contract version 1.0 freezes (issue #563) ──────────────────


def _polygon() -> dict:
    return {"type": "Polygon", "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0]]]}


# Every request body and every shape nested in one. A typo in any of them used
# to be dropped without a word, so a misspelled bound read as an unfiltered 200.
@pytest.mark.parametrize(
    "build",
    [
        lambda: _valid_request(max_wind=20),
        lambda: DestinationsRequest(destination_types=[], custom_destinations=[_cd()], stray=1),
        lambda: CustomDestination(**_cd(elevation=4000)),
        lambda: GeoPolygon(**_polygon(), crs={"type": "name"}),
        lambda: _valid_request(custom_destinations=[_cd(elev_ft=4000)]),
        lambda: _valid_request(destination_types=["peak"], polygon={**_polygon(), "crs": "x"}),
        lambda: _valid_request(destination_types=["peak"], polygon={**_polygon(), "bbox": [0, 0, 1, 1], "crs": "x"}),
    ],
)
def test_every_request_shape_refuses_a_field_it_does_not_declare(build):
    with pytest.raises(ValidationError) as caught:
        build()
    assert [e["type"] for e in caught.value.errors()] == ["extra_forbidden"]


@pytest.mark.parametrize(
    "field",
    ["min_cloud_base_ft", "max_cloud_base_ft", "min_cloud_cover_pct", "max_cloud_cover_pct"],
)
def test_the_retired_cloud_bounds_are_refused(field):
    # The cloud deck replaced #117's two families (#670). A caller still
    # sending one learns so rather than having the bound silently ignored.
    with pytest.raises(ValidationError) as caught:
        _valid_request(**{field: 10})
    assert [e["type"] for e in caught.value.errors()] == ["extra_forbidden"]


@pytest.mark.parametrize("sort_by", ["cloud_base_min_ft", "cloud_cover_max_pct"])
def test_the_retired_cloud_sort_keys_are_refused(sort_by):
    with pytest.raises(ValidationError):
        _valid_request(sort_by=sort_by)


# The ranges moved onto the fields so the schema publishes them. The sentence a
# person reads when one refuses a value is still the approved one, not
# Pydantic's "Input should be less than or equal to 90".
@pytest.mark.parametrize(
    "build, message",
    [
        (lambda: _valid_request(limit=0), f"limit must be between {models.MIN_LIMIT} and {models.MAX_LIMIT}"),
        (
            lambda: _valid_request(limit=models.MAX_LIMIT + 1),
            f"limit must be between {models.MIN_LIMIT} and {models.MAX_LIMIT}",
        ),
        (lambda: CustomDestination(**_cd(latitude=95)), "Latitude 95.0 is outside the valid -90 to 90 range."),
        (lambda: CustomDestination(**_cd(latitude="-90.5")), "Latitude -90.5 is outside the valid -90 to 90 range."),
        (
            lambda: CustomDestination(**_cd(longitude=-181)),
            "Longitude -181.0 is outside the valid -180 to 180 range.",
        ),
        (
            lambda: CustomDestination(**_cd(elevation_ft=40_000)),
            "Elevation 40000.0 ft is outside the plausible -1,500 to 30,000 ft range.",
        ),
        (
            lambda: CustomDestination(**_cd(elevation_ft=-2_000.5)),
            "Elevation -2000.5 ft is outside the plausible -1,500 to 30,000 ft range.",
        ),
        (lambda: CustomDestination(**_cd(name="")), "Custom destination names cannot be empty."),
        (lambda: CustomDestination(**_cd(name="   ")), "Custom destination names cannot be empty."),
        (lambda: CustomDestination(**_cd(name="x" * 256)), "Custom destination names are limited to 255 characters."),
    ],
)
def test_a_bound_on_a_field_still_answers_in_its_own_words(build, message):
    with pytest.raises(ValidationError) as caught:
        build()
    [error] = caught.value.errors()
    assert (error["type"], error["msg"]) == ("value_error", f"Value error, {message}")


def test_a_value_that_does_not_parse_keeps_pydantics_own_message():
    with pytest.raises(ValidationError) as caught:
        CustomDestination(**_cd(latitude="north"))
    assert [e["type"] for e in caught.value.errors()] == ["float_parsing"]


# A polygon's RFC 7946 bbox is the one member beyond the two the API reads, and
# it is accepted and dropped on the floor: the ring alone is the search area.
@pytest.mark.parametrize("bbox", [[0, 0, 0.1, 0.1], [0, 0, -10, 0.1, 0.1, 4000]])
def test_a_polygon_may_carry_a_bbox_that_nothing_reads(bbox):
    polygon = GeoPolygon(**_polygon(), bbox=bbox)
    assert polygon.coordinates == GeoPolygon(**_polygon()).coordinates
    # Wildly wrong for the ring, and still only accepted: nothing reads it.
    _valid_request(destination_types=["peak"], polygon={**_polygon(), "bbox": [-180, -90, 180, 90]})


def test_a_bbox_must_be_a_list_of_numbers():
    with pytest.raises(ValidationError) as caught:
        GeoPolygon(**_polygon(), bbox=["west", 0, 1, 1])
    assert [e["type"] for e in caught.value.errors()] == ["float_parsing"]


# ── An inverted bound pair (issue #563) ────────────────────────────────────

# The pairs as the ranking reads them, plus the elevation band. Spelled out here
# so a pair the derivation misses, or invents, fails by name.
_EXPECTED_PAIRS = {
    "AnalyzeRequest": {
        ("min_elevation_ft", "max_elevation_ft"),
        ("min_precip_total_in", "max_precip_total_in"),
        ("min_temp_f", "max_temp_f"),
        ("min_wind_mph", "max_wind_mph"),
        ("min_freeze_ft", "max_freeze_ft"),
        ("min_snow_depth_in", "max_snow_depth_in"),
        ("min_aqi", "max_aqi"),
        ("min_cloud_deck_ft", "max_cloud_deck_ft"),
    },
    "DestinationsRequest": {("min_elevation_ft", "max_elevation_ft")},
}


def test_every_bound_pair_is_found():
    from app.services.ranking import _LOWER_BOUNDS, _UPPER_BOUNDS

    assert set(AnalyzeRequest._range_pairs()) == _EXPECTED_PAIRS["AnalyzeRequest"]
    assert set(DestinationsRequest._range_pairs()) == _EXPECTED_PAIRS["DestinationsRequest"]
    ranked = {(low, high) for (low, _), (high, _) in zip(_LOWER_BOUNDS, _UPPER_BOUNDS, strict=True)}
    assert ranked <= _EXPECTED_PAIRS["AnalyzeRequest"]


def _build(model: str, **fields):
    if model == "AnalyzeRequest":
        return _valid_request(**fields)
    return DestinationsRequest(destination_types=[], custom_destinations=[_cd()], **fields)


@pytest.mark.parametrize(
    "model, low, high",
    [(model, low, high) for model, pairs in _EXPECTED_PAIRS.items() for low, high in sorted(pairs)],
)
def test_a_minimum_above_its_maximum_is_refused_by_name(model, low, high):
    # 5 and 10 sit inside every bound's own range, so only the order can fail.
    with pytest.raises(ValidationError) as caught:
        _build(model, **{low: 10, high: 5})
    [error] = caught.value.errors()
    assert (error["type"], error["msg"]) == ("value_error", f"Value error, {low} must not be above {high}.")
    # An equal pair asks for exactly that value, and one side alone is no pair.
    _build(model, **{low: 5, high: 5})
    _build(model, **{low: 10})
    _build(model, **{high: 5})
