"""OpenFreeMap: the style, its TileJSON, the vector tiles, glyphs and sprite.

The basemap is a blank ground with the sim's lattice on it (`lattice.py`), in
the OpenMapTiles layers the app reads (decision 5 of #224): `mountain_peak`,
`water_name`, `place`, `poi` class `climbing`, `landcover` class `ice` and the
`water` fill a clicked lake is poled from. The feature ids are Planetiler's,
the OSM id times ten plus one for a node and two for a way, so `peakTiles.ts`
and `tileDiscovery.ts` read node and way ids the Overpass sim also reports
(record 0115 lists the five schema facts the app relies on).

Glyph answers are valid and empty, so the map draws no text. The sprite holds
a plain disc for every icon the app's own layers name, so peaks, lakes and
towns draw as dots and the app's click layers have a symbol to place. The base URL in the style and the TileJSON is the
one the browser reached the sim on, because the browser follows it.
"""

from __future__ import annotations

import math
import os
from functools import lru_cache

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from app import lattice, mvt, png
from app.control import fault

# Where the browser reaches these routes when no request says otherwise.
DEFAULT_PUBLIC_URL = "http://localhost:8080/tiles"
EXTENT = 4096
PROTOBUF = "application/x-protobuf"

# The deepest zoom the tile set carries, and the one every peak and crag is
# in: Planetiler thins `mountain_peak` below it and keeps `poi` climbing at it
# alone (`peakTiles.ts`, `basemap.ts`).
MAX_ZOOM = 14
# The zooms below which a layer is left out, read off where the app first
# draws or reads it: POI_MINZOOM (9) for peaks, lakes and places, a little
# deeper for the fills, which are only scenery here.
_PEAK_MINZOOM = 9
_PLACE_MINZOOM = 6
_FILL_MINZOOM = 10
_LAKE_RADIUS_M = 250
_GLACIER_RADIUS_M = 600
# A summit this high wears a glacier, so the snow card's glacier check
# (`glacierCell.ts`, which reads `landcover` class `ice` at zoom 12) has some
# cells to say yes to.
_GLACIER_FLOOR_M = 2900

_SLATE = "#e2e6ea"


def public_url(request: Request) -> str:
    """The tiles' base URL as the browser can follow it.

    `SIM_PUBLIC_URL` wins when it is set; otherwise the scheme and host the
    request came in on, through a proxy's `X-Forwarded-*` if there is one.
    """
    configured = os.environ.get("SIM_PUBLIC_URL")
    if configured:
        return configured.rstrip("/")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if not host:
        return DEFAULT_PUBLIC_URL
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{scheme}://{host}/tiles"


def style(base: str) -> dict:
    return {
        "version": 8,
        "name": "Bluebird Forecast supplier sim",
        "sources": {"openmaptiles": {"type": "vector", "url": f"{base}/planet"}},
        "glyphs": f"{base}/fonts/{{fontstack}}/{{range}}.pbf",
        "sprite": f"{base}/sprites/ofm_f384/ofm",
        "layers": [
            {"id": "background", "type": "background", "paint": {"background-color": _SLATE}},
            {
                "id": "landcover_ice",
                "type": "fill",
                "source": "openmaptiles",
                "source-layer": "landcover",
                "filter": ["==", ["get", "class"], "ice"],
                "paint": {"fill-color": "#f5f8fa"},
            },
            # `water` is the id `basemap.ts` reads a clicked lake's outline from
            # (WATER_FILL_LAYER).
            {
                "id": "water",
                "type": "fill",
                "source": "openmaptiles",
                "source-layer": "water",
                "paint": {"fill-color": "#a9c6de"},
            },
            # Two of Liberty's place labels, by Liberty's ids, which `basemap.ts`
            # patches for clicks (PLACE_LAYERS), giving each its town disc from
            # zoom 9. No text draws while the glyphs are empty.
            _place_label("label_town", "town", 14),
            _place_label("label_village", "village", 12),
        ],
    }


def _place_label(layer_id: str, kind: str, size: int) -> dict:
    return {
        "id": layer_id,
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "minzoom": _PLACE_MINZOOM,
        "filter": ["==", ["get", "class"], kind],
        "layout": {"text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": size},
        "paint": {"text-color": "#334155"},
    }


def tilejson(base: str) -> dict:
    def layer(layer_id: str, minzoom: int, *fields: str) -> dict:
        # Every field the sim writes is a string but the elevations.
        types = {f: "Number" if f in ("ele", "ele_ft", "id") else "String" for f in fields}
        return {"id": layer_id, "fields": types, "minzoom": minzoom, "maxzoom": MAX_ZOOM}

    return {
        "tilejson": "2.2.0",
        "name": "Bluebird Forecast supplier sim",
        "tiles": [f"{base}/planet/latest/{{z}}/{{x}}/{{y}}.pbf"],
        "minzoom": 0,
        "maxzoom": MAX_ZOOM,
        "bounds": [-180, -85.0511, 180, 85.0511],
        "vector_layers": [
            layer("mountain_peak", _PEAK_MINZOOM, "class", "name", "ele", "ele_ft"),
            layer("water_name", _PEAK_MINZOOM, "class", "name"),
            layer("water", _FILL_MINZOOM, "class", "id"),
            layer("landcover", _FILL_MINZOOM, "class", "subclass"),
            layer("place", _PLACE_MINZOOM, "class", "name"),
            layer("poi", MAX_ZOOM, "class", "subclass", "name"),
        ],
    }


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """(south, west, north, east) of a web-mercator tile."""
    n = 2**z

    def lat(row: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * row / n))))

    return lat(y + 1), x / n * 360 - 180, lat(y), (x + 1) / n * 360 - 180


def _to_tile(z: int, x: int, y: int, lat: float, lon: float) -> tuple[int, int]:
    n = 2**z
    rad = math.radians(lat)
    fx = (lon + 180) / 360 * n
    fy = (1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2 * n
    return round((fx - x) * EXTENT), round((fy - y) * EXTENT)


def _disc(z: int, x: int, y: int, lat: float, lon: float, radius_m: float) -> list[tuple[int, int]]:
    """An octagon around a point in tile units, wound clockwise in tile space."""
    dlat = radius_m / 111_320
    dlon = dlat / max(0.01, math.cos(math.radians(lat)))
    return [
        _to_tile(z, x, y, lat - dlat * math.sin(a), lon + dlon * math.cos(a))
        for a in (k * math.pi / 4 for k in range(8))
    ]


def _stride(z: int, full_at: int) -> int:
    # Every other cell per zoom level out from `full_at`, which keeps the
    # count per tile about constant as each tile covers four times the ground.
    return max(1, 2 ** (full_at - z))


def _peak_properties(p: lattice.Peak) -> dict[str, mvt.Value]:
    props: dict[str, mvt.Value] = {"class": "peak"}
    if p.name:
        props["name"] = p.name
    props["ele"] = round(p.elevation_m)
    # The pod's own arithmetic (`_ele_ft` in osm/query.py), so a tile and the
    # Overpass sim report one number for one node.
    props["ele_ft"] = int(round(p.elevation_m * 3.28084, 0))
    return props


@lru_cache(maxsize=4096)
def tile(z: int, x: int, y: int) -> bytes:
    """One tile's bytes. Empty bytes, a valid empty tile, where nothing is drawn."""
    south, west, north, east = tile_bounds(z, x, y)
    layers: list[mvt.Layer] = []

    if z >= _PEAK_MINZOOM:
        peaks = lattice.peaks_in_bbox(south, west, north, east, stride=_stride(z, 12))
        if z == MAX_ZOOM:
            peaks += lattice.unnamed_peaks_in_bbox(south, west, north, east)
        layers.append(
            mvt.Layer(
                "mountain_peak",
                points=[
                    mvt.Point(*_to_tile(z, x, y, p.lat, p.lon), properties=_peak_properties(p), id=p.osm_id * 10 + 1)
                    for p in peaks
                ],
            )
        )
        lakes = lattice.lakes_in_bbox(south, west, north, east, stride=_stride(z, 10))
        layers.append(
            mvt.Layer(
                "water_name",
                points=[
                    mvt.Point(
                        *_to_tile(z, x, y, lake.lat, lake.lon),
                        properties={"class": "lake", "name": lake.name},
                        id=lake.osm_id * 10 + 2,
                    )
                    for lake in lakes
                ],
            )
        )

    if z >= _FILL_MINZOOM:
        # A fill reaches past its point, so the box is widened by the largest
        # radius and an outline that crosses into this tile is drawn here too.
        pad = 0.012
        box = (south - pad, west - pad, north + pad, east + pad)
        layers.append(
            mvt.Layer(
                "water",
                polygons=[
                    mvt.Polygon(
                        [_disc(z, x, y, lake.lat, lake.lon, _LAKE_RADIUS_M)],
                        properties={"class": "lake", "id": lake.osm_id * 10 + 2},
                        id=lake.osm_id * 10 + 2,
                    )
                    for lake in lattice.lakes_in_bbox(*box)
                ],
            )
        )
        layers.append(
            mvt.Layer(
                "landcover",
                polygons=[
                    mvt.Polygon(
                        [_disc(z, x, y, p.lat, p.lon, _GLACIER_RADIUS_M)],
                        properties={"class": "ice", "subclass": "glacier"},
                    )
                    for p in lattice.peaks_in_bbox(*box)
                    if p.elevation_m >= _GLACIER_FLOOR_M
                ],
            )
        )

    if z >= _PLACE_MINZOOM:
        layers.append(
            mvt.Layer(
                "place",
                points=[
                    mvt.Point(
                        *_to_tile(z, x, y, t.lat, t.lon),
                        properties={"class": t.kind, "name": t.name},
                        id=t.osm_id * 10 + 1,
                    )
                    for t in lattice.towns_in_bbox(south, west, north, east, stride=_stride(z, 9))
                ],
            )
        )

    if z == MAX_ZOOM:
        layers.append(
            mvt.Layer(
                "poi",
                points=[
                    mvt.Point(
                        *_to_tile(z, x, y, c.lat, c.lon),
                        properties={"class": "climbing", "subclass": "climbing", "name": c.name},
                        id=c.osm_id * 10 + 1,
                    )
                    for c in lattice.crags_in_bbox(south, west, north, east)
                ],
            )
        )

    return mvt.encode_tile(layers)


router = APIRouter(prefix="/tiles", dependencies=[Depends(fault("tiles"))], include_in_schema=False)


@router.get("/styles/{name}")
async def get_style(name: str, request: Request) -> JSONResponse:
    return JSONResponse(style(public_url(request)))


@router.get("/planet")
async def get_tilejson(request: Request) -> JSONResponse:
    return JSONResponse(tilejson(public_url(request)))


@router.get("/planet/{build}/{z}/{x}/{y}.pbf")
def get_tile(build: str, z: int, x: int, y: int) -> Response:
    # Any build name is answered: the real host's TileJSON names a dated one,
    # and `peakTiles.ts` falls back to `latest`.
    if not (0 <= z <= MAX_ZOOM and 0 <= x < 2**z and 0 <= y < 2**z):
        return Response(status_code=404)
    return Response(tile(z, x, y), media_type=PROTOBUF)


@router.get("/fonts/{fontstack}/{glyph_range}.pbf")
async def get_glyphs(fontstack: str, glyph_range: str) -> Response:
    return Response(mvt.encode_glyphs(fontstack, glyph_range), media_type=PROTOBUF)


# Every sprite icon `basemap.ts` names, as a disc in a quiet slate. Without one
# a symbol with no glyphs has nothing to place, so a peak would neither draw
# nor take a click. A test reads the ids off basemap.ts. Each kind its own
# shade, so a peak, a lake and a town tell apart without a label.
SPRITE_ICONS: dict[str, tuple[str, bool]] = {
    # id: (colour, ring rather than filled disc)
    "mountain_11": ("334155", False),
    "water_11": ("64748b", False),
    "town_hall_11": ("94a3b8", False),
    "circle_11_black": ("1e293b", False),
    "circle_stroked_11": ("475569", True),
}
# The box of one icon at 1x; the disc sits inside it with a pixel to spare.
_ICON_PX = 13


@lru_cache(maxsize=2)
def sprite(ratio: int) -> tuple[dict[str, dict[str, int]], bytes]:
    """The sprite's index and its image at a pixel ratio, icons in one row."""
    size = _ICON_PX * ratio
    radius = (size - 2 * ratio) / 2
    index: dict[str, dict[str, int]] = {}
    pixels = bytearray(size * size * len(SPRITE_ICONS))
    width = size * len(SPRITE_ICONS)
    for k, (icon, (_, ring)) in enumerate(SPRITE_ICONS.items()):
        index[icon] = {"x": k * size, "y": 0, "width": size, "height": size, "pixelRatio": ratio}
        for py in range(size):
            for px in range(size):
                d = math.hypot(px + 0.5 - size / 2, py + 0.5 - size / 2)
                if d <= radius and not (ring and d < radius - 1.5 * ratio):
                    pixels[py * width + k * size + px] = k + 1
    palette = [png.TRANSPARENT] + [png.hex_rgba(colour) for colour, _ in SPRITE_ICONS.values()]
    return index, png.encode_indexed(width, size, palette, bytes(pixels))


@router.get("/sprites/{name:path}")
async def get_sprite(name: str) -> Response:
    # `ofm_f384/ofm.json`, `ofm_f384/ofm@2x.png` and so on: MapLibre asks for
    # the @2x pair on a high-density screen.
    stem, _, ext = name.rpartition(".")
    index, image = sprite(2 if stem.endswith("@2x") else 1)
    if ext == "json":
        return JSONResponse(index)
    if ext == "png":
        return Response(image, media_type="image/png")
    return Response(status_code=404)
