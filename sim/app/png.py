"""A PNG writer on the standard library: paletted images, which is all the
sim's rasters need.

Paletted (colour type 3, eight bits) with a `tRNS` chunk for the alpha, so a
pixel is one byte and every colour the app reads back off a tile (the radar's
reflectivity palette, NOAA's snow bands) arrives exactly as written. `zlib`
and `struct` do the rest.
"""

from __future__ import annotations

import struct
import zlib
from collections.abc import Sequence

Rgba = tuple[int, int, int, int]
_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def encode_indexed(width: int, height: int, palette: Sequence[Rgba], pixels: bytes) -> bytes:
    """`pixels` is one palette index per pixel, row by row."""
    if len(pixels) != width * height or not 1 <= len(palette) <= 256:
        raise ValueError("pixels must fill the image and the palette hold 1 to 256 colours")
    # Filter type 0 (none) before every row.
    raw = b"".join(b"\x00" + pixels[row * width : (row + 1) * width] for row in range(height))
    return (
        _SIGNATURE
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0))
        + _chunk(b"PLTE", b"".join(bytes(c[:3]) for c in palette))
        + _chunk(b"tRNS", bytes(c[3] for c in palette))
        + _chunk(b"IDAT", zlib.compress(raw, 6))
        + _chunk(b"IEND", b"")
    )


def hex_rgba(colour: str, alpha: int = 255) -> Rgba:
    """`#rrggbb` or `rrggbb` as an RGBA tuple."""
    h = colour.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha


TRANSPARENT: Rgba = (0, 0, 0, 0)
TRANSPARENT_1X1 = encode_indexed(1, 1, [TRANSPARENT], b"\x00")
