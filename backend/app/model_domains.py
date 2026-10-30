"""Where each regional forecast model has data, as GeoJSON MultiPolygons (#803).

Open-Meteo refuses a whole batch when one of its locations is outside a
regional model's grid, so an analysis that names the model for a ring or a list
that crosses the edge fails after it has spent. Publishing the grid on
`/api/capabilities` lets the browser refuse that analysis before Analyze, with
the coverage sentence it already shows after the fact. The pod still lets
Open-Meteo decide on its own path (`_coverage_guard` in `services/weather.py`).

Apart from `forecast_models.py` because that table is the picker's editorial
data, and this is geometry computed from a grid definition, with the projection
arithmetic that produces it.

Coordinates are GeoJSON MultiPolygon nesting, as `wfigs_coverage.py` writes
them: polygons, then rings, then [lon, lat], so the browser casts against these
with the code it already has (`pointInRing` in `fireProximity.ts`).
"""

from __future__ import annotations

import math
from typing import Any

from app.forecast_models import ForecastModel

# NOAA HRRR's CONUS grid, as every HRRR CONUS GRIB2 file NCEP distributes on
# NOMADS defines it (grid definition template 3.30, Lambert conformal): 1799 by
# 1059 points 3 km apart, the first at 21.138123 N 122.719528 W, the projection
# tangent at 38.5 N with 97.5 W as its central meridian, on a sphere of radius
# 6,371,229 m. NOAA GSL's HRRR pages (rapidrefresh.noaa.gov/hrrr) describe the
# same 3 km CONUS domain. The corners this gives are the ones quoted for the
# grid: 21.14 N 122.72 W, 21.14 N 72.29 W, 47.84 N 60.92 W and
# 47.84 N 134.10 W.
#
# Checked against Open-Meteo on 2026-10-27 with five single-location
# `models=gfs_hrrr` requests at 113 W, where the north edge crosses Alberta.
# The two points inside the grid answered, and Open-Meteo moved each to a point
# these parameters put on grid node (535, 1053) and (535, 1058), the last row,
# within 0.02 of a cell. The point 0.8 of a cell past that row, one 5 cells
# past it and Edmonton (67 cells past it) answered "No data is available for
# this location". So Open-Meteo serves exactly this grid, its outermost row
# included.
_HRRR_NX = 1799
_HRRR_NY = 1059
_HRRR_DX_M = 3000.0
_HRRR_FIRST = (21.138123, -122.719528)
_HRRR_TANGENT_LAT = 38.5
_HRRR_CENTRAL_LON = -97.5
_EARTH_RADIUS_M = 6_371_229.0

# Every 50th grid point along each edge, plus the four corners. The edges of a
# Lambert grid are curves in longitude and latitude and a ray cast reads straight
# lines between vertices, so a chord can stand outside the grid where an edge
# bends. At 50 points the worst chord stands 0.1 of a cell outside (about 300 m,
# measured 2026-10-27 by `test_model_domains.py`), inside the half cell past the
# last row that Open-Meteo still rounds onto it. At 100 it was 0.4 of a cell.
_EDGE_STEP = 50


def _lcc_inverse(x: float, y: float) -> tuple[float, float]:
    """Latitude and longitude of a point in the HRRR projection's plane, in metres."""
    phi1 = math.radians(_HRRR_TANGENT_LAT)
    n = math.sin(phi1)
    f = math.cos(phi1) * math.tan(math.pi / 4 + phi1 / 2) ** n / n
    rho0 = _EARTH_RADIUS_M * f / math.tan(math.pi / 4 + phi1 / 2) ** n
    rho = math.copysign(math.hypot(x, rho0 - y), n)
    theta = math.atan2(x, rho0 - y)
    lat = 2 * math.atan((_EARTH_RADIUS_M * f / rho) ** (1 / n)) - math.pi / 2
    return math.degrees(lat), _HRRR_CENTRAL_LON + math.degrees(theta / n)


def _lcc_forward(lat: float, lon: float) -> tuple[float, float]:
    """A latitude and longitude in the HRRR projection's plane, in metres."""
    phi1 = math.radians(_HRRR_TANGENT_LAT)
    n = math.sin(phi1)
    f = math.cos(phi1) * math.tan(math.pi / 4 + phi1 / 2) ** n / n
    rho0 = _EARTH_RADIUS_M * f / math.tan(math.pi / 4 + phi1 / 2) ** n
    rho = _EARTH_RADIUS_M * f / math.tan(math.pi / 4 + math.radians(lat) / 2) ** n
    theta = n * math.radians(lon - _HRRR_CENTRAL_LON)
    return rho * math.sin(theta), rho0 - rho * math.cos(theta)


_ORIGIN = _lcc_forward(*_HRRR_FIRST)


def hrrr_grid_position(lat: float, lon: float) -> tuple[float, float]:
    """Where a point falls on the HRRR grid, as fractional (column, row) indices."""
    x, y = _lcc_forward(lat, lon)
    return (x - _ORIGIN[0]) / _HRRR_DX_M, (y - _ORIGIN[1]) / _HRRR_DX_M


def _hrrr_node(i: int, j: int) -> list[float]:
    lat, lon = _lcc_inverse(_ORIGIN[0] + i * _HRRR_DX_M, _ORIGIN[1] + j * _HRRR_DX_M)
    # Five decimals is a metre, which no grid of 3 km cells can tell apart.
    return [round(lon, 5), round(lat, 5)]


def _hrrr_outline() -> dict[str, Any]:
    last_i, last_j = _HRRR_NX - 1, _HRRR_NY - 1
    # Counter-clockwise from the south-west corner, the winding RFC 7946 asks of
    # an outer ring: east along the south edge, north up the east edge, west
    # along the north edge, south down the west edge.
    nodes = (
        [(i, 0) for i in range(0, last_i, _EDGE_STEP)]
        + [(last_i, j) for j in range(0, last_j, _EDGE_STEP)]
        + [(i, last_j) for i in range(last_i, 0, -_EDGE_STEP)]
        + [(0, j) for j in range(last_j, 0, -_EDGE_STEP)]
    )
    ring = [_hrrr_node(i, j) for i, j in nodes]
    ring.append(ring[0])
    return {"type": "MultiPolygon", "coordinates": [[ring]]}


HRRR_DOMAIN = _hrrr_outline()

# Every regional model's outline. A model absent here is global, and is
# published with a null domain.
DOMAINS: dict[ForecastModel, dict[str, Any]] = {
    ForecastModel.gfs_hrrr: HRRR_DOMAIN,
}
