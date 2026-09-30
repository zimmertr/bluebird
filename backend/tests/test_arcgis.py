"""The ArcGIS habits both overlays share (#203, #550).

Each case here is a way the two services have already surprised a reader: a
refusal inside an HTTP 200, and a page flag that moves with the format.
"""

from __future__ import annotations

import pytest

from app.services import arcgis
from app.services.errors import UpstreamError, UpstreamRateLimited


def _raise(body):
    arcgis.raise_for_arcgis_error(body, "Test provider", rate_limited="slow down", rejected="no")


def test_a_quota_refusal_inside_http_200_is_rate_limited():
    body = {"error": {"code": 429, "message": "Unable to perform query. Too many requests."}}
    with pytest.raises(UpstreamRateLimited) as excinfo:
        _raise(body)
    assert excinfo.value.provider == "Test provider"
    assert excinfo.value.retry_after_s == 60
    # The caller's own sentence, never one this module writes for it.
    assert excinfo.value.message == "slow down"


def test_an_overloaded_service_is_rate_limited_too():
    with pytest.raises(UpstreamRateLimited):
        _raise({"error": {"code": 503, "message": "busy"}})


def test_any_other_error_is_a_plain_rejection():
    with pytest.raises(UpstreamError) as excinfo:
        _raise({"error": {"code": 400, "details": ["'outFields' parameter is invalid"]}})
    assert not isinstance(excinfo.value, UpstreamRateLimited)
    assert excinfo.value.message == "no"


def test_a_feature_collection_raises_nothing():
    assert _raise({"type": "FeatureCollection", "features": []}) is None


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        # f=json places the flag at the top level.
        ({"exceededTransferLimit": True, "features": []}, True),
        # f=geojson places it under the collection's properties (2026-09-30).
        ({"type": "FeatureCollection", "properties": {"exceededTransferLimit": True}}, True),
        ({"type": "FeatureCollection", "properties": {"exceededTransferLimit": False}}, False),
        ({"type": "FeatureCollection", "features": []}, False),
        ({"type": "FeatureCollection", "properties": None}, False),
        ([], False),
    ],
)
def test_page_flag_reads_both_placements(body, expected):
    assert arcgis.page_flag(body) is expected


def test_bounds_walks_multipolygon_rings():
    coordinates = [
        [[[-120.0, 45.0], [-119.0, 45.0], [-119.0, 46.0], [-120.0, 45.0]]],
        [[[-118.0, 44.0], [-117.5, 44.0], [-117.5, 44.5], [-118.0, 44.0]]],
    ]
    assert arcgis.bounds(coordinates) == (-120.0, 44.0, -117.5, 46.0)


def test_bounds_of_a_point_has_zero_width():
    assert arcgis.bounds([-121.7, 45.37]) == (-121.7, 45.37, -121.7, 45.37)


def test_bounds_of_nothing_is_none():
    assert arcgis.bounds([]) is None
    assert arcgis.bounds(None) is None
