"""NOAA HMS smoke plumes: one dated KML file per day.

The pod asks for today's file in America/New_York and falls back to
yesterday's on a 404 (`services/hms.py`), because the real file does not exist
until the day's first analyst pass. The sim has files for yesterday, today and
tomorrow by the UTC date, which covers the Eastern date at every hour, and
answers 404 for every other day; an `hms` fault of status 404 with `times: 1`
takes today's away for one request, which is the morning path.

A file holds a few dozen plumes over the western US, 20 to 80 km across, their
densities cycling Light, Medium, Heavy, in the shape the live file used on
2026-08-04: a `Document` with one `Style` per density, and a `Placemark` per
plume with a `styleUrl`, a CDATA description of `Start Time`, `End Time`,
`Density` and `Satellite`, and an outer ring of `lon,lat,0` triples. Where the
plumes stand and when they were seen are a pure function of the file's date,
so a day's file is the same bytes every time it is asked for. The one clock
read is which days have a file at all, because that is what the real server's
answer depends on.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Response
from fastapi.responses import PlainTextResponse

from app.control import fault
from app.nifc import grid, ring
from app.values import unit_hash

DENSITIES = ("Light", "Medium", "Heavy")

# The western US, south, west, north, east.
WEST_BOX = (31.0, -125.0, 49.0, -102.0)
_PITCH = (3.0, 3.5)
_KEEP = 0.8
_SEED = 50_000

_FILE = re.compile(r"^hms_smoke(\d{4})(\d{2})(\d{2})\.kml$")

_STYLE = (
    '<Style id="Smoke_{density}_style"><LineStyle><color>ff000000</color></LineStyle>'
    "<PolyStyle><color>{color}</color></PolyStyle></Style>"
)
_COLORS = {"Light": "7f00ffff", "Medium": "7f0080ff", "Heavy": "7f0000ff"}

_PLACEMARK = (
    "<Placemark>\n"
    '<description><![CDATA[<div style="width:170px;">Start Time: {start}<br>End Time: {end}<br>'
    "Density: {density}<br>Satellite: GOES-EAST</div>]]></description>\n"
    "<styleUrl>#Smoke_{density}_style</styleUrl>\n"
    "<Polygon>\n<tessellate>1</tessellate>\n<outerBoundaryIs>\n<LinearRing>\n"
    "<coordinates>\n{coordinates}\n</coordinates>\n"
    "</LinearRing>\n</outerBoundaryIs>\n</Polygon>\n"
    "</Placemark>\n"
)


def has_file(day: date, today: date) -> bool:
    """Whether the server holds a file for `day`, given today's UTC date."""
    return abs((day - today).days) <= 1


def _stamp(day: date, minutes: int) -> str:
    """HMS's own time format: year, day of year, then a UTC clock, `2026216 1200UTC`."""
    return f"{day:%Y}{day.timetuple().tm_yday:03d} {minutes // 60:02d}{minutes % 60:02d}UTC"


def kml(day: date) -> str:
    """One day's file, the same text every time for the same date."""
    seed = _SEED + day.toordinal()
    placemarks = []
    for k, lat, lon in grid(seed, WEST_BOX, _PITCH, _KEEP):
        density = DENSITIES[k % len(DENSITIES)]
        radius = 10 + 30 * unit_hash(seed, k, 3)
        corners = 8 + int(unit_hash(seed, k, 4) * 7)
        points = ring(seed + k, lat, lon, radius, corners)
        start = 12 * 60 + int(unit_hash(seed, k, 5) * 7 * 60)
        end = min(23 * 60 + 59, start + 60 + int(unit_hash(seed, k, 6) * 4 * 60))
        placemarks.append(
            _PLACEMARK.format(
                start=_stamp(day, start),
                end=_stamp(day, end),
                density=density,
                coordinates=" ".join(f"{p[0]:.6f},{p[1]:.6f},0" for p in points),
            )
        )
    styles = "".join(_STYLE.format(density=d, color=_COLORS[d]) for d in DENSITIES)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">\n'
        f"<Document><name>HMS Smoke Mapping-{day:%Y%m%d}</name>\n{styles}\n"
        + "".join(placemarks)
        + "</Document></kml>\n"
    )


router = APIRouter(prefix="/hms", dependencies=[Depends(fault("hms"))], include_in_schema=False)


@router.get("/{yyyy}/{mm}/{filename}")
def get_kml(yyyy: str, mm: str, filename: str) -> Response:
    match = _FILE.match(filename)
    try:
        day = date(int(match[1]), int(match[2]), int(match[3])) if match else None
    except ValueError:
        day = None
    if day is None or yyyy != f"{day:%Y}" or mm != f"{day:%m}":
        return PlainTextResponse("Not Found", status_code=404)
    # The real server publishes by the clock; the one place this module reads it.
    if not has_file(day, datetime.now(UTC).date()):
        return PlainTextResponse("Not Found", status_code=404)
    return Response(kml(day).encode(), media_type="application/vnd.google-earth.kml+xml")
