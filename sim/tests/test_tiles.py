"""The basemap: the encoder's bytes, the tiles' schema, glyphs, sprite, style.

There is no Python MVT reader in the repo, so the encoder is held to a tile
computed by hand, and the tiles are read back with the dozen lines of
protobuf walking below, which follow `peakTiles.ts` `decodePeaks` and
`tileDiscovery.ts` `decodeLakes` in what they read.
"""

from __future__ import annotations

import math
import re
import struct

import pytest
from conftest import as_json, read_source
from test_rasters import decode

from app import lattice, mvt, tiles


def _fields(buf: bytes):
    """(field number, wire type, value) for each field of one message."""
    i = 0
    while i < len(buf):
        key, i = _varint(buf, i)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, i = _varint(buf, i)
        elif wire == 1:
            value, i = buf[i : i + 8], i + 8
        elif wire == 2:
            size, i = _varint(buf, i)
            value, i = buf[i : i + size], i + size
        else:
            raise AssertionError(f"wire type {wire}")
        yield number, wire, value


def _varint(buf: bytes, i: int) -> tuple[int, int]:
    shift = result = 0
    while True:
        byte = buf[i]
        i += 1
        result |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            return result, i


def _packed(buf: bytes) -> list[int]:
    out, i = [], 0
    while i < len(buf):
        v, i = _varint(buf, i)
        out.append(v)
    return out


def _unzig(n: int) -> int:
    return (n >> 1) ^ -(n & 1)


def _read_value(buf: bytes):
    for number, _, value in _fields(buf):
        if number == 1:
            return value.decode()
        if number == 3:
            return struct.unpack("<d", value)[0]
        if number == 5:
            return value
        if number == 6:
            return _unzig(value)
        if number == 7:
            return bool(value)
    raise AssertionError("empty value")


def read_tile(data: bytes) -> dict[str, list[dict]]:
    """Layer name to features, each {id, type, props, geometry}."""
    layers: dict[str, list[dict]] = {}
    for number, _, layer_buf in _fields(data):
        assert number == 3
        name, keys, vals, raw, extent = "", [], [], [], None
        for n, _, v in _fields(layer_buf):
            if n == 1:
                name = v.decode()
            elif n == 2:
                raw.append(v)
            elif n == 3:
                keys.append(v.decode())
            elif n == 4:
                vals.append(_read_value(v))
            elif n == 5:
                extent = v
            elif n == 15:
                assert v == 2
        assert extent == tiles.EXTENT
        features = []
        for f in raw:
            feature = {"id": None, "props": {}}
            for n, _, v in _fields(f):
                if n == 1:
                    feature["id"] = v
                elif n == 2:
                    tags = _packed(v)
                    feature["props"] = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags), 2)}
                elif n == 3:
                    feature["type"] = v
                elif n == 4:
                    feature["geometry"] = _packed(v)
            features.append(feature)
        layers[name] = features
    return layers


def test_the_encoder_writes_the_hand_computed_tile():
    layer = mvt.Layer("a", points=[mvt.Point(1, 2, {"k": "v"}, id=11)])
    feature = bytes([0x08, 0x0B, 0x12, 0x02, 0x00, 0x00, 0x18, 0x01, 0x22, 0x03, 0x09, 0x02, 0x04])
    body = (
        bytes([0x78, 0x02, 0x0A, 0x01, 0x61, 0x12, len(feature)])
        + feature
        + bytes([0x1A, 0x01, 0x6B, 0x22, 0x03, 0x0A, 0x01, 0x76, 0x28, 0x80, 0x20])
    )
    assert mvt.encode_tile([layer]) == bytes([0x1A, len(body)]) + body


def test_polygon_commands_are_the_typescript_writers():
    square = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert mvt._polygon_commands([square]) == [9, 0, 0, 26, 20, 0, 0, 20, 19, 0, 15]


def test_values_take_the_typescript_writers_fields():
    assert mvt._value(True) == bytes([0x38, 0x01])
    assert mvt._value(-3) == bytes([0x30, 0x05])
    assert mvt._value(3.0) == bytes([0x28, 0x03])
    assert mvt._value(1.5) == bytes([0x19]) + struct.pack("<d", 1.5)


def test_an_empty_layer_is_not_written():
    assert mvt.encode_tile([mvt.Layer("empty")]) == b""


def _tile_of(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2**z
    rad = math.radians(lat)
    return int((lon + 180) / 360 * n), int((1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2 * n)


def _peak_tile() -> tuple[int, int, bytes]:
    """The first zoom-14 tile near Rainier with a named peak in it."""
    x0, y0 = _tile_of(46.85, -121.76, 14)
    for dx in range(6):
        data = tiles.tile(14, x0 + dx, y0)
        names = [f["props"].get("name") for f in read_tile(data).get("mountain_peak", [])]
        if any(names):
            return x0 + dx, y0, data
    raise AssertionError("no named peak in six tiles")


def test_a_zoom_14_tile_carries_what_the_app_reads(client):
    x, y, _ = _peak_tile()
    r = client.get(f"/tiles/planet/latest/14/{x}/{y}.pbf")
    assert r.headers["content-type"] == "application/x-protobuf"
    layers = read_tile(r.content)
    # `isTile`: non-empty bytes with at least one layer.
    assert r.content and layers
    south, west, north, east = tiles.tile_bounds(14, x, y)
    box = (south, west, north, east)
    expected = {p.osm_id: p for p in lattice.peaks_in_bbox(*box) + lattice.unnamed_peaks_in_bbox(*box)}
    seen = {}
    for f in layers["mountain_peak"]:
        assert f["type"] == 1 and f["props"]["class"] == "peak"
        # Planetiler's id for a node, which `osmIdOf` reads back.
        assert f["id"] % 10 == 1
        peak = expected[(f["id"] - 1) // 10]
        assert f["props"].get("name") == peak.name
        assert f["props"]["ele_ft"] == round(peak.elevation_m * 3.28084)
        cmd, px, py = f["geometry"]
        assert cmd == 9
        n = 2**14
        lon = (x + _unzig(px) / tiles.EXTENT) / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + _unzig(py) / tiles.EXTENT) / n))))
        assert (lat, lon) == pytest.approx((peak.lat, peak.lon), abs=1e-5)
        seen[peak.osm_id] = peak
    assert seen.keys() == expected.keys()
    assert any(p.name is None for p in seen.values()) or not lattice.unnamed_peaks_in_bbox(*box)


def test_lakes_climbing_and_glaciers_take_their_classes():
    found: dict[str, set] = {}
    x0, y0 = _tile_of(46.85, -121.76, 14)
    for dx in range(40):
        for name, features in read_tile(tiles.tile(14, x0 + dx, y0 + dx % 7)).items():
            found.setdefault(name, set()).update(f["props"].get("class") for f in features)
    assert found["water_name"] == {"lake"}
    assert found["poi"] == {"climbing"}
    assert found["water"] == {"lake"}
    glacier_tiles = [read_tile(tiles.tile(12, x, y)) for x in range(650, 670) for y in range(1430, 1436)]
    assert any(f["props"]["class"] == "ice" for t in glacier_tiles for f in t.get("landcover", []))


def test_a_lake_label_carries_a_way_id():
    x0, y0 = _tile_of(46.85, -121.76, 11)
    labels = [f for dx in range(4) for f in read_tile(tiles.tile(11, x0 + dx, y0)).get("water_name", [])]
    assert labels and all(f["id"] % 10 == 2 and f["props"]["name"].endswith(" Lake") for f in labels)


def test_neighbouring_tiles_share_no_point():
    ids: list[int] = []
    x0, y0 = _tile_of(46.85, -121.76, 14)
    for dx in range(8):
        for dy in range(8):
            ids += [f["id"] for f in read_tile(tiles.tile(14, x0 + dx, y0 + dy)).get("mountain_peak", [])]
    assert len(ids) == len(set(ids)) > 10


def test_low_zooms_stay_small_and_valid():
    assert tiles.tile(0, 0, 0) == b""
    for z in (6, 9, 11, 13):
        x, y = _tile_of(46.85, -121.76, z)
        data = tiles.tile(z, x, y)
        assert len(data) < 20_000
        read_tile(data)


def test_the_style_points_the_browser_back_at_the_sim(client, monkeypatch):
    monkeypatch.delenv("SIM_PUBLIC_URL", raising=False)
    style = as_json(client.get("/tiles/styles/liberty", headers={"host": "localhost:8080"}))
    assert style["version"] == 8
    assert style["sources"]["openmaptiles"] == {"type": "vector", "url": "http://localhost:8080/tiles/planet"}
    assert style["glyphs"] == "http://localhost:8080/tiles/fonts/{fontstack}/{range}.pbf"
    assert style["sprite"] == "http://localhost:8080/tiles/sprites/ofm_f384/ofm"
    # The fill a clicked lake is poled from, by the id `basemap.ts` reads.
    assert "water" in [layer["id"] for layer in style["layers"]]
    proxied = as_json(
        client.get("/tiles/planet", headers={"x-forwarded-host": "dev.example", "x-forwarded-proto": "https"})
    )
    assert proxied["tiles"] == ["https://dev.example/tiles/planet/latest/{z}/{x}/{y}.pbf"]
    monkeypatch.setenv("SIM_PUBLIC_URL", "http://sim.test/tiles/")
    assert as_json(client.get("/tiles/planet"))["tiles"][0].startswith("http://sim.test/tiles/planet/")


def test_the_style_names_the_place_layers_the_app_patches():
    source = read_source("frontend/src/utils/basemapPoi.ts")
    ids = {layer["id"] for layer in tiles.style("http://x")["layers"]}
    for layer_id in ("label_town", "label_village"):
        assert f"'{layer_id}'" in source
        assert layer_id in ids


def test_the_glyphs_are_a_valid_empty_font(client):
    r = client.get("/tiles/fonts/Noto%20Sans%20Regular/0-255.pbf")
    [(number, wire, stack)] = list(_fields(r.content))
    assert (number, wire) == (1, 2)
    assert [(n, v) for n, _, v in _fields(stack)] == [(1, b"Noto Sans Regular"), (2, b"0-255")]


def test_the_sprite_holds_every_icon_the_app_names(client):
    # Liberty's sprite ids all end in a size, `_11`; the app's own drawn icons
    # (`ofm-poi-glow`, `ofm-climbing-icon`) are added at run time instead.
    named = set(re.findall(r"'([a-z_]+_\d+(?:_[a-z]+)?)'", read_source("frontend/src/map/basemap.ts")))
    assert {"mountain_11", "water_11", "town_hall_11"} <= named
    for name, ratio in (("ofm.json", 1), ("ofm@2x.json", 2)):
        index = as_json(client.get(f"/tiles/sprites/ofm_f384/{name}"))
        assert named <= set(index)
        assert {entry["pixelRatio"] for entry in index.values()} == {ratio}
    for name, ratio in (("ofm.png", 1), ("ofm@2x.png", 2)):
        r = client.get(f"/tiles/sprites/ofm_f384/{name}")
        assert r.headers["content-type"] == "image/png"
        width, height, palette, pixels = decode(r.content)
        index = tiles.sprite(ratio)[0]
        assert width == max(e["x"] + e["width"] for e in index.values())
        assert height == max(e["height"] for e in index.values())
        # Every icon paints something inside its own box, and in its own colour.
        for k, entry in enumerate(index.values()):
            columns = range(entry["x"], entry["x"] + entry["width"])
            box = {pixels[y * width + x] for y in range(entry["height"]) for x in columns}
            assert box == {0, k + 1}
        assert len(set(palette[1:])) == len(index)
