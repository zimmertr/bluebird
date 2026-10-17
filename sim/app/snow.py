"""NOAA NOHRSC's snow analysis: the rendered depth tiles and the point identify.

Both read one depth field (`values.snow_depth_m`, a function of latitude and
the ground's height), so the colour a tile paints under a click and the
number the card then shows agree. The tiles paint every cell in one of NOAA's
legend colours, fully opaque, and nothing under the first band, which is how
the real renders look and what the snow card reads a band off before the
identify answers (`snowPoint.ts`). The colours are `SNOW_BANDS` in
snowDepth.ts, and a test holds the two to each other.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from app import png, values
from app.control import fault

# NOAA's legend, in inches of depth at the bottom of each band, with the colour
# it paints. Under the first boundary nothing is painted.
BANDS: tuple[tuple[float, str], ...] = (
    (0.39, "abc1bf"),
    (2.0, "66c1c4"),
    (3.9, "63a9cb"),
    (9.8, "5079c8"),
    (20, "3c3fc2"),
    (39, "5720c3"),
    (59, "7d01bb"),
    (98, "b404b1"),
    (197, "a91377"),
    (295, "992b50"),
    (394, "8b4545"),
)
_PALETTE = [png.TRANSPARENT] + [png.hex_rgba(colour) for _, colour in BANDS]
_INCHES_PER_M = 39.3701
_MERCATOR_R = 6378137.0
# The analysis is a 1 km grid, so the field is sampled once per block of
# pixels rather than per pixel: at the deepest zoom the app asks for, one cell
# is already 38 pixels across (SNOW_MAX_ZOOM in snowDepth.ts).
_BLOCK = 8
_MAX_SIDE = 2048


def band_index(depth_in: float) -> int:
    """The palette index a depth paints: 0 (nothing) under the first band."""
    index = 0
    for k, (floor, _) in enumerate(BANDS):
        if depth_in >= floor:
            index = k + 1
    return index


def _lonlat(x: float, y: float) -> tuple[float, float]:
    lon = math.degrees(x / _MERCATOR_R)
    lat = math.degrees(math.atan(math.sinh(y / _MERCATOR_R)))
    return lon, lat


@lru_cache(maxsize=512)
def render(bbox: tuple[float, float, float, float], width: int, height: int, mercator: bool) -> bytes:
    min_x, min_y, max_x, max_y = bbox
    pixels = bytearray(width * height)
    for by in range(0, height, _BLOCK):
        for bx in range(0, width, _BLOCK):
            fx = min_x + (bx + _BLOCK / 2) / width * (max_x - min_x)
            fy = max_y - (by + _BLOCK / 2) / height * (max_y - min_y)
            lon, lat = _lonlat(fx, fy) if mercator else (fx, fy)
            index = band_index(values.snow_depth_m(lat, lon) * _INCHES_PER_M)
            if not index:
                continue
            for row in range(by, min(by + _BLOCK, height)):
                start = row * width + bx
                end = row * width + min(bx + _BLOCK, width)
                pixels[start:end] = bytes([index]) * (end - start)
    return png.encode_indexed(width, height, _PALETTE, bytes(pixels))


def valid_time(now: datetime) -> str:
    """The analysis's valid time as NOAA writes it: the latest 12:00 UTC.

    The one clock read on this path, because the real answer is dated.
    """
    day = now.date() if now.hour >= 12 else now.date() - timedelta(days=1)
    return f"{day.month}/{day.day}/{day.year} 12:00:00 PM"


def identify(lon: float, lat: float, now: datetime) -> dict:
    depth_m = values.snow_depth_m(lat, lon)
    swe_mm = values.snow_water_mm(lat, lon)
    # ArcGIS writes every attribute as a string, numbers included.
    return {
        "results": [
            {
                "layerId": 2,
                "layerName": "Analysis Valid Time",
                "displayFieldName": "idp_validtime",
                "attributes": {"idp_validtime": valid_time(now)},
            },
            {
                "layerId": 3,
                "layerName": "Snow Depth",
                "displayFieldName": "",
                "attributes": {"Service Pixel Value": f"{depth_m:.3f}"},
            },
            {
                "layerId": 7,
                "layerName": "Snow Water Equivalent",
                "displayFieldName": "",
                "attributes": {"Service Pixel Value": f"{swe_mm:.0f}"},
            },
        ]
    }


def _arcgis_error(message: str) -> JSONResponse:
    # ArcGIS reports a bad request inside a 200.
    return JSONResponse({"error": {"code": 400, "message": message, "details": []}})


router = APIRouter(prefix="/snow", dependencies=[Depends(fault("snow"))], include_in_schema=False)


@router.get("/export")
def get_export(request: Request) -> Response:
    params = request.query_params
    try:
        bbox = tuple(float(v) for v in params.get("bbox", "").split(","))
        width, height = (int(v) for v in params.get("size", "400,400").split(","))
    except ValueError:
        return _arcgis_error("Invalid bbox or size")
    if len(bbox) != 4 or not (1 <= width <= _MAX_SIDE and 1 <= height <= _MAX_SIDE):
        return _arcgis_error("Invalid bbox or size")
    mercator = params.get("bboxSR", "3857") in ("3857", "102100")
    min_x, min_y, max_x, max_y = bbox
    return Response(render((min_x, min_y, max_x, max_y), width, height, mercator), media_type="image/png")


@router.get("/identify")
def get_identify(request: Request) -> JSONResponse:
    try:
        lon, lat = (float(v) for v in request.query_params.get("geometry", "").split(","))
    except ValueError:
        return _arcgis_error("Invalid geometry")
    return JSONResponse(identify(lon, lat, datetime.now(UTC)))
