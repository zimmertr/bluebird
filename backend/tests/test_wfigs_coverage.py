"""The WFIGS coverage geometry (#256): pinned to named places.

The geometry is coarse by design, so these tests pin the *decisions* rather
than the vertices: places WFIGS can speak about must be inside, places it is
silent about must be outside, and the antimeridian split must hold the whole
Aleutian chain without any ring wrapping 180°.
"""

from __future__ import annotations

import json

from app.services import wfigs_coverage

COVERED = {
    "Mount Rainier": (46.8523, -121.7603),
    "Denver Front Range": (39.7, -105.3),
    "northern Maine": (46.8, -69.0),
    "Key West": (24.55, -81.78),
    "Brownsville TX": (25.9, -97.5),
    "Anchorage": (61.2, -149.9),
    "Juneau (panhandle)": (58.3, -134.4),
    "Kodiak": (57.5, -153.4),
    "Adak (Aleutians, west of -169.5)": (51.88, -176.65),
    "Attu (Aleutians, east of 180)": (52.85, 173.2),
    "Honolulu": (21.3, -157.85),
    "San Juan PR": (18.4, -66.06),
}

NOT_COVERED = {
    "Mount Robson BC": (53.1, -119.2),
    "Banff": (51.18, -115.57),
    "Vancouver BC": (49.28, -123.12),
    "Toronto": (43.65, -79.38),
    "Montreal": (45.5, -73.57),
    "the Alps (Zermatt)": (46.02, 7.75),
    "Mexico City": (19.43, -99.13),
    "Whitehorse YT": (60.72, -135.05),
    "Prince Rupert BC": (54.31, -130.32),
}


def test_covered_places_are_inside():
    for name, (lat, lon) in COVERED.items():
        assert wfigs_coverage.covers(lat, lon), f"{name} should be covered"


def test_uncovered_places_are_outside():
    for name, (lat, lon) in NOT_COVERED.items():
        assert not wfigs_coverage.covers(lat, lon), f"{name} should not be covered"


def test_no_ring_wraps_the_antimeridian():
    # The whole point of the split: every ring stays inside one hemisphere's
    # longitude range, so a plain lon/lat ray cast needs no wraparound case.
    for polygon in wfigs_coverage.COVERAGE["coordinates"]:
        lons = [lon for lon, _lat in polygon[0]]
        assert max(lons) - min(lons) < 180


def test_coverage_json_matches_the_object():
    assert json.loads(wfigs_coverage.COVERAGE_JSON) == wfigs_coverage.COVERAGE


def test_geometry_is_valid_geojson_nesting():
    body = wfigs_coverage.COVERAGE
    assert body["type"] == "MultiPolygon"
    for polygon in body["coordinates"]:
        for ring in polygon:
            assert ring[0] == ring[-1], "rings must close"
            assert len(ring) >= 4
            for lon, lat in ring:
                assert -180 <= lon <= 180
                assert -90 <= lat <= 90
