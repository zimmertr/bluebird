from __future__ import annotations

import pytest

from app.forecast_models import MODEL_INFO
from app.model_domains import _HRRR_NX, _HRRR_NY, DOMAINS, HRRR_DOMAIN, hrrr_grid_position

# The backend's copy of the browser's ray cast (mirror row 31), so the outline
# is tested the way the browser will read it.
from app.services.wfigs_coverage import _in_ring


def _ring() -> list[list[float]]:
    (polygon,) = HRRR_DOMAIN["coordinates"]
    (ring,) = polygon
    return ring


def test_every_regional_model_has_a_domain_and_no_global_one_does():
    assert {m for m, info in MODEL_INFO.items() if info.regional} == set(DOMAINS)


def test_the_hrrr_outline_is_a_closed_counter_clockwise_ring():
    ring = _ring()
    assert ring[0] == ring[-1]
    # Shoelace: positive area is counter-clockwise, RFC 7946's outer winding.
    area = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False))
    assert area > 0


@pytest.mark.parametrize(
    ("corner", "lat", "lon"),
    [
        # The corners quoted for NOAA's HRRR CONUS grid, to the hundredth.
        ("south-west", 21.14, -122.72),
        ("south-east", 21.14, -72.29),
        ("north-east", 47.84, -60.92),
        ("north-west", 47.84, -134.10),
    ],
)
def test_the_hrrr_corners_are_noaas(corner, lat, lon):
    ring = _ring()
    assert any(abs(p[1] - lat) < 0.01 and abs(p[0] - lon) < 0.01 for p in ring), corner


def test_every_vertex_is_a_grid_point_on_the_edge():
    for lon, lat in _ring():
        i, j = hrrr_grid_position(lat, lon)
        on_x_edge = abs(i) < 1e-3 or abs(i - (_HRRR_NX - 1)) < 1e-3
        on_y_edge = abs(j) < 1e-3 or abs(j - (_HRRR_NY - 1)) < 1e-3
        assert on_x_edge or on_y_edge, (lon, lat, i, j)
        assert -1e-3 < i < _HRRR_NX - 1 + 1e-3 and -1e-3 < j < _HRRR_NY - 1 + 1e-3


def test_no_chord_stands_more_than_a_tenth_of_a_cell_outside_the_grid():
    # A ray cast reads straight lines between vertices where the grid's edges
    # curve. Open-Meteo still answers half a cell past the last row (probed
    # 2026-10-27), so a chord bulging less than that admits only points it
    # answers for. Measured 0.10 of a cell at a vertex every 50 grid points.
    ring = _ring()
    worst = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False):
        for t in (0.25, 0.5, 0.75):
            i, j = hrrr_grid_position(y1 + (y2 - y1) * t, x1 + (x2 - x1) * t)
            worst = max(worst, -i, i - (_HRRR_NX - 1), -j, j - (_HRRR_NY - 1))
    assert worst < 0.15


@pytest.mark.parametrize(
    ("place", "lat", "lon", "inside"),
    [
        # Probed against Open-Meteo with `models=gfs_hrrr` on 2026-10-27: the
        # first two answered, the next three said "No data is available for
        # this location".
        ("5 cells inside the north edge, Alberta", 51.68227, -112.97146, True),
        ("0.4 of a cell inside the last row", 51.80113, -113.00407, True),
        ("0.8 of a cell past the last row", 51.83213, -113.01260, False),
        ("5 cells past the last row", 51.94057, -113.04252, False),
        ("Edmonton", 53.55, -113.49, False),
        # The places the model's own comment names, by the grid arithmetic.
        ("Mount Rainier", 46.853, -121.760, True),
        ("Banff", 51.18, -115.57, True),
        ("Monterrey", 25.67, -100.31, True),
        ("Anchorage", 61.2, -149.9, False),
        ("Honolulu", 21.3, -157.8, False),
        ("San Juan", 18.47, -66.1, False),
        ("St. John's", 47.56, -52.71, False),
        ("Prince George", 53.92, -122.75, False),
        # Lower than Banff and outside, which is why no lat/lon box will do.
        ("Port Hardy", 50.72, -127.5, False),
    ],
)
def test_the_outline_holds_the_places_the_grid_does(place, lat, lon, inside):
    i, j = hrrr_grid_position(lat, lon)
    on_grid = 0 <= i <= _HRRR_NX - 1 and 0 <= j <= _HRRR_NY - 1
    assert on_grid is inside, (place, i, j)
    assert _in_ring(lon, lat, _ring()) is inside, place
