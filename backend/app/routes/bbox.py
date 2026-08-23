"""One reading of a ``west,south,east,north`` query parameter.

Two overlay routes take a viewport and both must reject the same malformed
input the same way. Shared rather than copied, because a second copy is a second
answer to "what is a valid box" and the two would drift apart at the first fix.
"""

from __future__ import annotations

from fastapi import HTTPException

BBOX_DESCRIPTION = (
    "Bounding box as `west,south,east,north` in decimal degrees (EPSG:4326)."
)

_MALFORMED = "bbox must be four comma-separated numbers: west,south,east,north."


def parse_bbox(raw: str) -> tuple[float, float, float, float]:
    """The four corners, or a 422 naming what is wrong with them."""
    parts = raw.split(",")
    if len(parts) != 4:
        raise HTTPException(status_code=422, detail=_MALFORMED)
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError:
        raise HTTPException(status_code=422, detail=_MALFORMED) from None
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise HTTPException(status_code=422, detail="bbox longitudes must be between -180 and 180.")
    if not (-90 <= south <= 90 and -90 <= north <= 90):
        raise HTTPException(status_code=422, detail="bbox latitudes must be between -90 and 90.")
    if south > north:
        raise HTTPException(status_code=422, detail="bbox south must not exceed north.")
    return west, south, east, north
