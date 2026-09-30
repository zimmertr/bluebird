"""The one reading of a ``bbox`` query parameter.

Two map overlays take a bounding box as ``west,south,east,north``
(``/api/wildfires`` and ``/api/closures``). FastAPI cannot parse that shape as
a typed parameter, so it is parsed by hand, and a hand-parsed 422 must carry
the same ``validation`` code a route-level one does. One function, so the two
routes cannot answer the same malformed box two ways.
"""

from __future__ import annotations

from app.error_codes import ApiError, ErrorCode

_SHAPE = "bbox must be four comma-separated numbers: west,south,east,north."


def parse_bbox(raw: str) -> tuple[float, float, float, float]:
    """``west,south,east,north`` in decimal degrees, or the 422 that says why not."""
    parts = raw.split(",")
    if len(parts) != 4:
        raise ApiError(status_code=422, detail=_SHAPE, code=ErrorCode.validation)
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError:
        raise ApiError(status_code=422, detail=_SHAPE, code=ErrorCode.validation) from None
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise ApiError(
            status_code=422,
            detail="bbox longitudes must be between -180 and 180.",
            code=ErrorCode.validation,
        )
    if not (-90 <= south <= 90 and -90 <= north <= 90):
        raise ApiError(
            status_code=422,
            detail="bbox latitudes must be between -90 and 90.",
            code=ErrorCode.validation,
        )
    if south > north:
        raise ApiError(
            status_code=422,
            detail="bbox south must not exceed north.",
            code=ErrorCode.validation,
        )
    return west, south, east, north
