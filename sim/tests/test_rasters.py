"""The radar and snow rasters, read back the way the app reads them."""

from __future__ import annotations

import math
import re
import struct
import zlib
from datetime import UTC, datetime

from conftest import as_json, read_source

from app import png, radar, snow, values


def decode(data: bytes) -> tuple[int, int, list[tuple[int, int, int, int]], bytes]:
    """(width, height, palette, pixels) of a paletted PNG, every CRC checked."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    i, chunks = 8, {}
    while i < len(data):
        (size,) = struct.unpack(">I", data[i : i + 4])
        kind, body = data[i + 4 : i + 8], data[i + 8 : i + 8 + size]
        (crc,) = struct.unpack(">I", data[i + 8 + size : i + 12 + size])
        assert crc == zlib.crc32(kind + body)
        chunks[kind] = body
        i += 12 + size
    width, height, depth, colour, *_ = struct.unpack(">IIBBBBB", chunks[b"IHDR"])
    assert (depth, colour) == (8, 3) and b"IEND" in chunks
    rgb, alpha = chunks[b"PLTE"], chunks[b"tRNS"]
    palette = [(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2], alpha[k]) for k in range(len(alpha))]
    raw = zlib.decompress(chunks[b"IDAT"])
    assert len(raw) == height * (width + 1)
    pixels = b"".join(raw[r * (width + 1) + 1 : (r + 1) * (width + 1)] for r in range(height))
    return width, height, palette, pixels


def test_the_one_pixel_png_parses():
    assert decode(png.TRANSPARENT_1X1) == (1, 1, [(0, 0, 0, 0)], b"\x00")


def _n0q_palette() -> str:
    source = read_source("frontend/src/utils/radarPoint.ts")
    block = re.search(r"const N0Q_PALETTE =\s*((?:'[0-9a-f]+'\s*\+?\s*)+)", source)
    assert block
    return "".join(re.findall(r"'([0-9a-f]+)'", block.group(1)))


def test_the_rings_are_iems_colours_for_their_reflectivity():
    palette = _n0q_palette()
    for _, dbz, colour in radar.RINGS:
        index = int((dbz + 32.5) / 0.5)
        assert palette[index * 6 : index * 6 + 6] == colour


def _storm_tile(age: int) -> bytes:
    # Zoom 5 over the Pacific Northwest, where the lattice puts storms.
    return radar.radar_tile(age, 5, 5, 11)


def test_a_radar_frame_paints_and_playback_moves_it(client):
    r = client.get("/radar/nexrad-n0q-900913/5/5/11.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    width, height, palette, pixels = decode(r.content)
    assert (width, height) == (radar.SIZE, radar.SIZE)
    painted = [p for p in pixels if p]
    assert 0 < len(painted) < len(pixels) // 2
    assert {palette[p][3] for p in painted} == {255}
    assert _storm_tile(0) != _storm_tile(30)
    assert client.get("/radar/nexrad-n0q-900913-m30m/5/5/11.png").content == _storm_tile(30)


def test_an_unknown_radar_product_is_404(client):
    assert client.get("/radar/nexrad-n0r-900913/5/5/11.png").status_code == 404


def test_the_snow_bands_are_noaas():
    source = read_source("frontend/src/utils/snowDepth.ts")
    bands = re.findall(r"\{ from: ([\d.]+), to: [\d.]+, color: '#([0-9a-f]{6})' \}", source)
    assert [(float(f), c) for f, c in bands] == [(float(f), c) for f, c in snow.BANDS]


def _mercator(lon: float, lat: float) -> tuple[float, float]:
    r = 6378137.0
    return math.radians(lon) * r, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * r


def test_a_snow_render_paints_noaa_colours_opaque_and_agrees_with_identify(client):
    # A box over high ground, where the field holds snow.
    lon, lat = -121.83, 48.77
    assert values.snow_depth_m(lat, lon) > 0.05
    x, y = _mercator(lon, lat)
    half = 20_000
    bbox = f"{x - half},{y - half},{x + half},{y + half}"
    r = client.get("/snow/export", params={"bbox": bbox, "bboxSR": "3857", "size": "512,512", "f": "image"})
    width, height, palette, pixels = decode(r.content)
    assert (width, height) == (512, 512)
    assert palette[0][3] == 0 and {a for *_, a in palette[1:]} == {255}
    centre = pixels[256 * 512 + 256]
    depth_in = values.snow_depth_m(lat, lon) * 39.3701
    # The block holding the centre is sampled a few pixels off it, so the
    # band may be its neighbour's at an edge.
    assert abs(centre - snow.band_index(depth_in)) <= 1


def test_identify_answers_what_snow_point_reads(client):
    source = read_source("frontend/src/utils/snowPoint.ts")
    spellings = ("attrs(3)?.['Service Pixel Value']", "attrs(7)?.['Service Pixel Value']", "attrs(2)?.idp_validtime")
    for spelling in spellings:
        assert spelling in source
    body = as_json(client.get("/snow/identify", params={"geometry": "-121.83,48.77", "f": "json"}))
    attrs = {r["layerId"]: r["attributes"] for r in body["results"]}
    assert float(attrs[3]["Service Pixel Value"]) == round(values.snow_depth_m(48.77, -121.83), 3)
    assert float(attrs[7]["Service Pixel Value"]) >= 0
    # `parseValidTime`'s pattern, ported.
    stamp = r"^(\d{1,2})/(\d{1,2})/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$"
    assert re.match(stamp, attrs[2]["idp_validtime"])


def test_the_valid_time_is_the_latest_noon():
    assert snow.valid_time(datetime(2026, 10, 17, 11, tzinfo=UTC)) == "10/16/2026 12:00:00 PM"
    assert snow.valid_time(datetime(2026, 10, 17, 13, tzinfo=UTC)) == "10/17/2026 12:00:00 PM"
