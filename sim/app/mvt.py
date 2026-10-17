"""A Mapbox Vector Tile writer: a port of `frontend/src/testSupport/mvt.ts`.

Points and polygons, which is everything the sim's tiles carry. The field
numbers and geometry commands are the specification's (vector_tile.proto,
version 2), and the order fields are written in is the TypeScript writer's,
so the two produce the same bytes for the same layers. Protobuf by hand
(varints, zigzag, length-delimited fields) because a tile needs four of its
wire rules and a protobuf dependency would bring the rest.
"""

from __future__ import annotations

import struct
from collections.abc import Sequence
from dataclasses import dataclass, field

Value = str | int | float | bool


@dataclass(frozen=True)
class Point:
    # Tile-local coordinates, 0 to the layer's extent.
    x: int
    y: int
    properties: dict[str, Value]
    id: int | None = None


@dataclass(frozen=True)
class Polygon:
    # Each ring in tile units, without its closing repeat. The exterior ring
    # winds clockwise in tile space (y down), which the specification reads
    # as a positive area.
    rings: Sequence[Sequence[tuple[int, int]]]
    properties: dict[str, Value]
    id: int | None = None


@dataclass(frozen=True)
class Layer:
    name: str
    points: Sequence[Point] = field(default_factory=tuple)
    polygons: Sequence[Polygon] = field(default_factory=tuple)
    extent: int = 4096


def varint(n: int) -> bytes:
    if n < 0:
        # Protobuf writes a negative int64 as its two's complement, ten bytes.
        n += 1 << 64
    out = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def zigzag(n: int) -> int:
    return (n << 1) ^ (n >> 63)


def _key(number: int, wire: int) -> bytes:
    return varint(number << 3 | wire)


def _varint_field(number: int, n: int) -> bytes:
    return _key(number, 0) + varint(n)


def _bytes_field(number: int, payload: bytes) -> bytes:
    return _key(number, 2) + varint(len(payload)) + payload


def _packed(number: int, items: Sequence[int]) -> bytes:
    return _bytes_field(number, b"".join(varint(i) for i in items))


def _value(v: Value) -> bytes:
    # The TypeScript writer's choice of field per value, in its order: bool
    # before int (a Python bool is an int), and an integral float as an int,
    # since JavaScript cannot tell 3.0 from 3.
    if isinstance(v, str):
        return _bytes_field(1, v.encode())
    if isinstance(v, bool):
        return _varint_field(7, int(v))
    if isinstance(v, float) and not v.is_integer():
        return _key(3, 1) + struct.pack("<d", v)
    n = int(v)
    if n < 0:
        return _varint_field(6, zigzag(n))
    return _varint_field(5, n)


def _polygon_commands(rings: Sequence[Sequence[tuple[int, int]]]) -> list[int]:
    # Per ring a MoveTo, a LineTo over the rest and a ClosePath (command 7,
    # count 1, packed as 15); every coordinate is a delta from the cursor,
    # which carries over from one ring to the next.
    out: list[int] = []
    cx = cy = 0
    for ring in rings:
        for i, (x, y) in enumerate(ring):
            if i == 0:
                out.append(9)
            if i == 1:
                out.append(2 | ((len(ring) - 1) << 3))
            out += [zigzag(x - cx), zigzag(y - cy)]
            cx, cy = x, y
        out.append(15)
    return out


def _layer(layer: Layer) -> bytes:
    keys: list[str] = []
    values: list[Value] = []

    def index_of(items: list, v: object) -> int:
        # Matched by type as well as value, so True and 1 stay two values.
        for i, existing in enumerate(items):
            if type(existing) is type(v) and existing == v:
                return i
        items.append(v)
        return len(items) - 1

    def tags(properties: dict[str, Value]) -> list[int]:
        out: list[int] = []
        for k, v in properties.items():
            # JavaScript has one number type, so 3.0 and 3 are one value there.
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            out += [index_of(keys, k), index_of(values, v)]
        return out

    body = _varint_field(15, 2) + _bytes_field(1, layer.name.encode())
    for p in layer.points:
        # Geometry type 1 is a point: one MoveTo (command 1, count 1, packed
        # as 9) and the zigzagged coordinates.
        feature = b"" if p.id is None else _varint_field(1, p.id)
        feature += _packed(2, tags(p.properties)) + _varint_field(3, 1) + _packed(4, [9, zigzag(p.x), zigzag(p.y)])
        body += _bytes_field(2, feature)
    for poly in layer.polygons:
        feature = b"" if poly.id is None else _varint_field(1, poly.id)
        feature += _packed(2, tags(poly.properties)) + _varint_field(3, 3) + _packed(4, _polygon_commands(poly.rings))
        body += _bytes_field(2, feature)
    for k in keys:
        body += _bytes_field(3, k.encode())
    for v in values:
        body += _bytes_field(4, _value(v))
    return body + _varint_field(5, layer.extent)


def encode_tile(layers: Sequence[Layer]) -> bytes:
    """The tile's bytes. Planetiler writes no empty layer, so neither does this."""
    return b"".join(_bytes_field(3, _layer(layer)) for layer in layers if layer.points or layer.polygons)


def encode_glyphs(fontstack: str, glyph_range: str) -> bytes:
    """A glyphs PBF holding one font stack and no glyphs.

    MapLibre's `glyphs.proto`: a `glyphs` message whose field 1 is a `fontstack`
    with `name` (1) and `range` (2). With no glyph in it MapLibre draws no
    text and reports no error, which is how the sim's map carries no labels.
    """
    stack = _bytes_field(1, fontstack.encode()) + _bytes_field(2, glyph_range.encode())
    return _bytes_field(1, stack)
