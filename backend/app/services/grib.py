"""Just enough GRIB2 to read one HRRR field, without a C library.

The obvious way to read GRIB2 is ecCodes. This module exists because
**Alpine ships no ``eccodes`` package**, so taking that road means compiling C
in the image build for the sake of one variable, and carrying the result's CVE
surface forever. The alternative is small: HRRR encodes this field one way, and
that one way is about a hundred lines of numpy.

So this is deliberately **not** a GRIB library. It reads the exact shapes NOAA
sends for the surface files and refuses everything else loudly, because a
decoder that guesses at a layout it has never seen returns plausible numbers
rather than an error, and plausible numbers would be drawn on a map as smoke.

Two facts were measured against the live archive on 2026-08-23 and are the
whole reason this works.

**The packing is template 5.3**, complex packing with second-order spatial
differencing, on 1,905,141 points at 17 bits. Undoing it is two running sums,
not a loop over two million points.

**The group arrays are byte-aligned.** After the group references, the widths
and the lengths, the encoder pads to the next byte boundary. This is the one
detail that cannot be reasoned out and had to be measured: seven hours were
decoded both ways and checked against ecCodes, and the six whose arrays did not
happen to land on a boundary decoded correctly **only** with the padding, while
without it the group lengths failed to sum to the point count. That checksum is
kept below as :func:`decode_values`'s guard, because it is what turns a wrong
layout into an exception instead of a picture.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np

# The templates HRRR uses for these files. Anything else is refused rather than
# attempted; see the module docstring.
GRID_TEMPLATE_LAMBERT = 30
DRS_TEMPLATE_COMPLEX_SPATIAL = 3
NO_BITMAP = 255

# Fancy-indexing the bit buffer builds an (n, width) index array of int64, so a
# field whose values all share one width would allocate hundreds of megabytes at
# once. Reading in chunks bounds that at a few tens of megabytes and costs
# nothing measurable, since the work per chunk is the same.
_GATHER_CHUNK = 1 << 18


class GribError(ValueError):
    """The bytes are not the GRIB2 this module knows how to read."""


@dataclass(frozen=True)
class LambertGrid:
    """A tangent Lambert conformal conic grid, as GRIB template 3.30 states it.

    Angles are degrees and spacings are metres. ``lo1`` is normalized to
    [-180, 180) because GRIB states longitudes eastward from Greenwich and every
    consumer here wants signed degrees.
    """

    nx: int
    ny: int
    la1: float
    lo1: float
    lad: float
    lov: float
    dx_m: float
    dy_m: float
    latin1: float
    latin2: float
    scan_mode: int

    @property
    def size(self) -> int:
        return self.nx * self.ny


def split_sections(message: bytes) -> dict[int, bytes]:
    """Map section number to section bytes for one GRIB2 message.

    A message carries each of these sections once, so a dict is the right shape;
    a file of many messages is not something this module accepts.
    """
    if len(message) < 16 or message[:4] != b"GRIB":
        raise GribError("not a GRIB message")
    if message[7] != 2:
        raise GribError(f"GRIB edition {message[7]}, expected 2")

    out: dict[int, bytes] = {}
    pos = 16
    while pos < len(message) - 4:
        if message[pos : pos + 4] == b"7777":
            break
        length = int.from_bytes(message[pos : pos + 4], "big")
        # A zero length would spin forever on a truncated download, which is the
        # failure mode a byte-range fetch actually has.
        if length < 5 or pos + length > len(message):
            raise GribError("truncated or malformed section")
        out[message[pos + 4]] = message[pos : pos + length]
        pos += length
    return out


def _signed(raw: bytes) -> int:
    """A GRIB sign-magnitude integer. The top bit is the sign, not a two's
    complement bit, so a plain int conversion reads negatives as huge positives."""
    value = int.from_bytes(raw, "big")
    top = 1 << (len(raw) * 8 - 1)
    return -(value & (top - 1)) if value & top else value


def lambert_grid(section3: bytes) -> LambertGrid:
    """The grid definition, refusing any projection but the one HRRR uses."""
    template = int.from_bytes(section3[12:14], "big")
    if template != GRID_TEMPLATE_LAMBERT:
        raise GribError(f"grid template 3.{template}, expected 3.{GRID_TEMPLATE_LAMBERT}")

    u32 = lambda octet: int.from_bytes(section3[octet - 1 : octet + 3], "big")
    lo1 = _signed(section3[42:46]) / 1e6
    return LambertGrid(
        nx=u32(31),
        ny=u32(35),
        la1=_signed(section3[38:42]) / 1e6,
        lo1=(lo1 + 180.0) % 360.0 - 180.0,
        lad=_signed(section3[47:51]) / 1e6,
        lov=_signed(section3[51:55]) / 1e6,
        dx_m=u32(56) / 1e3,
        dy_m=u32(60) / 1e3,
        latin1=_signed(section3[65:69]) / 1e6,
        latin2=_signed(section3[69:73]) / 1e6,
        scan_mode=section3[64],
    )


@dataclass(frozen=True)
class _Packing:
    """Template 5.3's parameters, named as the WMO manual names them."""

    count: int
    reference: float
    binary_scale: int
    decimal_scale: int
    bits: int
    groups: int
    width_reference: int
    width_bits: int
    length_reference: int
    length_increment: int
    last_group_length: int
    length_bits: int
    order: int
    extra_octets: int


def _packing(section5: bytes) -> _Packing:
    template = int.from_bytes(section5[9:11], "big")
    if template != DRS_TEMPLATE_COMPLEX_SPATIAL:
        raise GribError(f"data template 5.{template}, expected 5.{DRS_TEMPLATE_COMPLEX_SPATIAL}")

    octet = lambda n: section5[n - 1]
    u32 = lambda n: int.from_bytes(section5[n - 1 : n + 3], "big")
    return _Packing(
        count=u32(6),
        reference=struct.unpack(">f", section5[11:15])[0],
        binary_scale=_signed(section5[15:17]),
        decimal_scale=_signed(section5[17:19]),
        bits=octet(20),
        groups=u32(32),
        width_reference=octet(36),
        width_bits=octet(37),
        length_reference=u32(38),
        length_increment=octet(42),
        last_group_length=u32(43),
        length_bits=octet(47),
        order=octet(48),
        extra_octets=octet(49),
    )


class _BitReader:
    """MSB-first reader over the data section."""

    def __init__(self, buffer: bytes):
        self.bits = np.unpackbits(np.frombuffer(buffer, dtype=np.uint8))
        self.pos = 0

    def array(self, width: int, count: int) -> np.ndarray:
        if width == 0:
            return np.zeros(count, dtype=np.int64)
        end = self.pos + width * count
        if end > self.bits.size:
            raise GribError("data section ended early")
        block = self.bits[self.pos : end].reshape(count, width)
        self.pos = end
        return block.astype(np.int64) @ _weights(width)

    def value(self, width: int) -> int:
        return int(self.array(width, 1)[0])

    def signed_value(self, width: int) -> int:
        raw = self.value(width)
        top = 1 << (width - 1)
        return -(raw & (top - 1)) if raw & top else raw

    def align(self) -> None:
        """Pad to the next byte boundary. See the module docstring: this is
        measured behaviour, not a guess, and dropping it silently corrupts every
        field whose group arrays do not happen to end on a boundary."""
        self.pos = (self.pos + 7) // 8 * 8


def _weights(width: int) -> np.ndarray:
    return (1 << np.arange(width - 1, -1, -1)).astype(np.int64)


def _gather(bits: np.ndarray, starts: np.ndarray, width: int) -> np.ndarray:
    """Read `width` bits at each bit offset in `starts`, in bounded chunks."""
    out = np.empty(starts.size, dtype=np.int64)
    span = np.arange(width)
    weights = _weights(width)
    for begin in range(0, starts.size, _GATHER_CHUNK):
        chunk = starts[begin : begin + _GATHER_CHUNK]
        out[begin : begin + chunk.size] = bits[chunk[:, None] + span].astype(np.int64) @ weights
    return out


def decode_values(section5: bytes, section6: bytes, section7: bytes) -> np.ndarray:
    """One field's values, in the units the product declares.

    The returned array is in grid order as the scan mode states it, which for
    these files means west to east then south to north. Callers reshape it.
    """
    if section6[5] != NO_BITMAP:
        # HRRR's surface fields carry every point. A bitmap would mean some are
        # absent, and silently treating the packed values as if they were dense
        # would shift every value after the first gap.
        raise GribError("field carries a bitmap, which is not supported")

    p = _packing(section5)
    reader = _BitReader(section7[5:])

    first: list[int] = []
    bias = 0
    if p.order:
        width = p.extra_octets * 8
        first = [reader.signed_value(width) for _ in range(p.order)]
        bias = reader.signed_value(width)

    references = reader.array(p.bits, p.groups)
    reader.align()
    widths = reader.array(p.width_bits, p.groups) + p.width_reference
    reader.align()
    lengths = reader.array(p.length_bits, p.groups) * p.length_increment + p.length_reference
    lengths[-1] = p.last_group_length
    reader.align()

    # The guard that makes a wrong layout an error rather than a picture.
    total = int(lengths.sum())
    if total != p.count:
        raise GribError(f"group lengths sum to {total}, expected {p.count}")

    value_widths = np.repeat(widths, lengths)
    starts = np.cumsum(value_widths) - value_widths + reader.pos
    # The values are read by fancy indexing, which reports running off the end
    # as an IndexError from deep inside numpy. Checked here so a short or
    # misread data section fails as this module's own error, like every other
    # malformed input.
    if starts.size and int(starts[-1]) + int(value_widths[-1]) > reader.bits.size:
        raise GribError("data section ended early")
    packed = np.zeros(p.count, dtype=np.int64)
    for width in np.unique(value_widths):
        if width == 0:
            continue
        where = np.flatnonzero(value_widths == width)
        packed[where] = _gather(reader.bits, starts[where], int(width))
    packed += np.repeat(references, lengths)

    packed = _undo_differencing(packed, p.order, first, bias)
    return (p.reference + packed.astype(np.float64) * 2.0**p.binary_scale) / 10.0**p.decimal_scale


def _undo_differencing(packed: np.ndarray, order: int, first: list[int], bias: int) -> np.ndarray:
    """Rebuild the field from its differences.

    Second order is the case HRRR uses. The packed values are second
    differences biased by their own minimum, so the field is two running sums
    over them: one rebuilds the step between neighbours, the other rebuilds the
    values. Written as cumulative sums rather than the textbook loop because the
    loop is two million iterations of Python.
    """
    if order == 0:
        return packed
    if order == 1:
        packed[1:] += bias
        packed[0] = first[0]
        return np.cumsum(packed)
    if order == 2:
        packed[2:] += bias
        steps = np.empty(packed.size, dtype=np.int64)
        steps[0] = 0
        steps[1] = first[1] - first[0]
        steps[2:] = steps[1] + np.cumsum(packed[2:])
        return first[0] + np.cumsum(steps)
    raise GribError(f"spatial differencing order {order} is not supported")
