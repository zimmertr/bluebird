"""The GRIB2 reader behind the forecast-smoke overlay.

Two fixtures, because two different things can be wrong.

``hrrr_massden_header.grib2`` is **real NOAA bytes**: one HRRR message with its
data section removed, 211 bytes of it, so the octet arithmetic that reads the
grid and the packing parameters is checked against the thing it will actually
meet rather than against a description of it.

The bit-level fixture below is hand-assembled here, and it is written out step
by step on purpose. It states the layout as data — where the padding goes, how
a negative is signed, which values the extra descriptors overwrite — so a
decoder that quietly changed one of those would fail rather than agree with
itself. The layout it states was validated against ecCodes on seven real HRRR
hours on 2026-08-23; six of those had group arrays that did not land on byte
boundaries, and they decoded correctly only with the padding.
"""

from __future__ import annotations

import struct
from pathlib import Path

import numpy as np
import pytest
from app.services.grib import (
    GribError,
    decode_values,
    lambert_grid,
    split_sections,
)

FIXTURE = Path(__file__).parent / "data" / "hrrr_massden_header.grib2"


# ── The real header ───────────────────────────────────────────────────────────


def test_real_header_splits_into_its_sections():
    sections = split_sections(FIXTURE.read_bytes())
    # The data section is what was stripped to keep the fixture small.
    assert sorted(sections) == [1, 3, 4, 5, 6]


def test_real_header_describes_the_hrrr_conus_grid():
    grid = lambert_grid(split_sections(FIXTURE.read_bytes())[3])
    assert (grid.nx, grid.ny) == (1799, 1059)
    assert grid.dx_m == grid.dy_m == 3000.0
    # Tangent cone: both standard parallels are the same latitude.
    assert grid.latin1 == grid.latin2 == 38.5
    assert grid.lov == 262.5
    # The south-west corner, as a signed longitude rather than the eastward
    # degrees GRIB states.
    assert grid.la1 == pytest.approx(21.138123)
    assert grid.lo1 == pytest.approx(-122.719528)
    # +i, +j: west to east, then south to north.
    assert grid.scan_mode == 64
    assert grid.size == 1799 * 1059


def test_real_header_refuses_a_projection_it_does_not_know():
    section3 = bytearray(split_sections(FIXTURE.read_bytes())[3])
    section3[12:14] = (20).to_bytes(2, "big")  # polar stereographic
    with pytest.raises(GribError, match="grid template"):
        lambert_grid(bytes(section3))


# ── A hand-built message ──────────────────────────────────────────────────────


class _Bits:
    """Writes MSB-first, so the fixture can state its own padding."""

    def __init__(self):
        self.bits: list[int] = []

    def add(self, value: int, width: int) -> _Bits:
        self.bits.extend((value >> shift) & 1 for shift in range(width - 1, -1, -1))
        return self

    def signed(self, value: int, width: int) -> _Bits:
        """GRIB sign-magnitude: the top bit is the sign, not two's complement."""
        magnitude = abs(value) | (1 << (width - 1) if value < 0 else 0)
        return self.add(magnitude, width)

    def pad_to_byte(self) -> _Bits:
        while len(self.bits) % 8:
            self.bits.append(0)
        return self

    def bytes(self) -> bytes:
        self.pad_to_byte()
        return bytes(
            int("".join(str(b) for b in self.bits[i : i + 8]), 2)
            for i in range(0, len(self.bits), 8)
        )


# The case the fixture encodes. Three groups, one of them zero-width, lengths
# that do not divide by eight, and a negative bias.
COUNT = 10
FIRST = (5, 7)
BIAS = -1
REFERENCES = (1, 4, 0)
WIDTHS = (2, 0, 3)
LENGTHS = (3, 3, 4)
PACKED = ((1, 2, 0), (), (0, 1, 2, 7))

# Worked by hand from the WMO rules: add the bias to everything after the
# leading values, put the leading values back, then two running sums.
EXPECTED = [5, 7, 9, 14, 22, 33, 43, 53, 64, 81]


def _section5(**overrides) -> bytes:
    fields = {
        "count": COUNT,
        "template": 3,
        "reference": 0.0,
        "binary_scale": 0,
        "decimal_scale": 0,
        "bits": 4,
        "groups": len(REFERENCES),
        "width_reference": 0,
        "width_bits": 3,
        "length_reference": 1,
        "length_increment": 1,
        "last_group_length": LENGTHS[-1],
        "length_bits": 3,
        "order": 2,
        "extra_octets": 2,
    }
    fields.update(overrides)
    body = b"".join(
        [
            fields["count"].to_bytes(4, "big"),
            fields["template"].to_bytes(2, "big"),
            struct.pack(">f", fields["reference"]),
            fields["binary_scale"].to_bytes(2, "big"),
            fields["decimal_scale"].to_bytes(2, "big"),
            bytes([fields["bits"], 0, 1, 0]),
            (0).to_bytes(4, "big"),
            (0).to_bytes(4, "big"),
            fields["groups"].to_bytes(4, "big"),
            bytes([fields["width_reference"], fields["width_bits"]]),
            fields["length_reference"].to_bytes(4, "big"),
            bytes([fields["length_increment"]]),
            fields["last_group_length"].to_bytes(4, "big"),
            bytes([fields["length_bits"], fields["order"], fields["extra_octets"]]),
        ]
    )
    return (len(body) + 5).to_bytes(4, "big") + bytes([5]) + body


def _section6(indicator: int = 255) -> bytes:
    return (6).to_bytes(4, "big") + bytes([6, indicator])


def _section7(*, lengths=LENGTHS, align=True, leading=FIRST) -> bytes:
    writer = _Bits()
    # Extra descriptors: one per differencing order, then the bias.
    for value in leading:
        writer.signed(value, 16)
    writer.signed(BIAS, 16)

    for reference in REFERENCES:
        writer.add(reference, 4)
    if align:
        writer.pad_to_byte()
    for width in WIDTHS:
        writer.add(width, 3)
    if align:
        writer.pad_to_byte()
    for length in lengths:
        writer.add(length - 1, 3)  # length_reference 1, increment 1
    if align:
        writer.pad_to_byte()

    for index, group in enumerate(PACKED):
        for value in group:
            writer.add(value, WIDTHS[index])

    body = writer.bytes()
    return (len(body) + 5).to_bytes(4, "big") + bytes([7]) + body


def test_decodes_second_order_differencing():
    values = decode_values(_section5(), _section6(), _section7())
    assert values.tolist() == EXPECTED


def test_scaling_is_applied():
    """Y = (R + X * 2^E) / 10^D, which is where the units come from."""
    values = decode_values(
        _section5(reference=1.0, binary_scale=1, decimal_scale=1), _section6(), _section7()
    )
    expected = [(1.0 + x * 2) / 10 for x in EXPECTED]
    assert values == pytest.approx(expected)


def test_padding_between_the_group_arrays_is_required():
    """The one detail that had to be measured rather than reasoned out.

    Written without the padding, the same values no longer decode: the group
    arrays are read from the wrong bits, and the message dies on one of this
    module's guards rather than producing a plausible picture.
    """
    with pytest.raises(GribError, match="group lengths sum to|data section ended early"):
        decode_values(_section5(), _section6(), _section7(align=False))


def test_group_lengths_must_account_for_every_point():
    with pytest.raises(GribError, match="group lengths sum to"):
        decode_values(
            _section5(last_group_length=3), _section6(), _section7(lengths=(3, 3, 3))
        )


def test_refuses_a_packing_it_does_not_know():
    with pytest.raises(GribError, match="data template"):
        decode_values(_section5(template=2), _section6(), _section7())


def test_refuses_a_field_with_a_bitmap():
    """A bitmap means some points are absent, and reading the packed values as
    if they were dense would shift everything after the first gap."""
    with pytest.raises(GribError, match="bitmap"):
        decode_values(_section5(), _section6(indicator=0), _section7())


def test_refuses_an_unsupported_differencing_order():
    """Third order is well-formed GRIB that this module has never seen, so it
    must say so rather than fall through and return the differences."""
    with pytest.raises(GribError, match="spatial differencing order"):
        decode_values(
            _section5(order=3), _section6(), _section7(leading=(*FIRST, 9))
        )


def test_first_order_differencing_is_one_running_sum():
    values = decode_values(_section5(order=1, extra_octets=2), _section6(), _section7_first_order())
    assert values.tolist() == [5, 7, 7, 10, 13, 16, 15, 15, 16, 22]


def _section7_first_order() -> bytes:
    """The same groups, read as first differences instead of second."""
    writer = _Bits()
    writer.signed(FIRST[0], 16)
    writer.signed(BIAS, 16)
    for reference in REFERENCES:
        writer.add(reference, 4)
    writer.pad_to_byte()
    for width in WIDTHS:
        writer.add(width, 3)
    writer.pad_to_byte()
    for length in LENGTHS:
        writer.add(length - 1, 3)
    writer.pad_to_byte()
    for index, group in enumerate(PACKED):
        for value in group:
            writer.add(value, WIDTHS[index])
    body = writer.bytes()
    return (len(body) + 5).to_bytes(4, "big") + bytes([7]) + body


# ── Malformed input ───────────────────────────────────────────────────────────


def test_rejects_bytes_that_are_not_grib():
    with pytest.raises(GribError, match="not a GRIB message"):
        split_sections(b"HELLO" + bytes(20))


def test_rejects_grib1():
    message = bytearray(FIXTURE.read_bytes())
    message[7] = 1
    with pytest.raises(GribError, match="edition"):
        split_sections(bytes(message))


def test_rejects_a_truncated_section():
    """A byte-range fetch that comes back short must raise rather than spin."""
    message = FIXTURE.read_bytes()
    with pytest.raises(GribError, match="truncated"):
        split_sections(message[:45])


def test_zero_width_groups_repeat_their_reference():
    """The middle group has width zero, so all three of its values are the
    group reference and nothing is read from the data for them."""
    values = decode_values(_section5(), _section6(), _section7())
    # Values 3, 4 and 5 come from that group, through the differencing.
    assert np.diff(values[3:6]).tolist() == [8, 11]
