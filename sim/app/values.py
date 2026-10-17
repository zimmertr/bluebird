"""Every number the sim invents, in one place.

Each value is a pure function of a coordinate, an hour and, where it applies,
a model id: a latitude gradient plus a daily sine wave, the shape issue #224
settled on after #248's console stub showed it was enough to drive the
table, the markers, the grid and playback. Nothing here
reads the clock or a random source, so the same question gets the same bytes
forever, and nothing here is meteorology: a value only has to vary in space
and time so the app has something to rank and colour.

Kept apart from the routes so a formula is changed in one place, and so the
geography in `lattice.py` and the rasters agree on the ground they stand on.
"""

from __future__ import annotations

import math
import zlib

# ISA standard-atmosphere heights of the pressure levels, in metres. The app's
# own table (`ISA_HEIGHT_M` in aggregation.py and openMeteoAggregate.ts); the
# sim makes each level colder and windier by its height so the app's
# interpolation to a destination's elevation has a gradient to read.
ISA_HEIGHT_M: dict[int, int] = {1000: 111, 925: 762, 850: 1457, 700: 3012, 600: 4206, 500: 5574, 400: 7185, 300: 9164}
WIND_TEMP_LEVELS = (925, 850, 700, 600, 500)
RH_LEVELS = (1000, 925, 850, 700, 600, 500, 400, 300)

# The models Open-Meteo serves a freezing level for (measured 2026-09-12, see
# `docs/DATA.md`). The other five answer a column of nulls, and the sim does
# the same so the table's N/A path is reachable offline.
FREEZING_LEVEL_MODELS = frozenset({"gfs_seamless", "gfs_hrrr", "icon_seamless"})

_FT_PER_M = 1 / 0.3048
# The standard lapse rate, about 3.6 °F per 1,000 ft.
_LAPSE_F_PER_M = 6.5 * 9 / 5 / 1000


def unit_hash(*parts: int) -> float:
    """A stable hash of integers into [0, 1).

    SplitMix64 rather than `hash()`, which Python salts per process for
    strings and which would make the lattice move between restarts.
    """
    x = 0x9E3779B97F4A7C15
    for part in parts:
        x = (x ^ (part & 0xFFFFFFFFFFFFFFFF)) * 0xBF58476D1CE4E5B9 & 0xFFFFFFFFFFFFFFFF
        x = (x ^ (x >> 31)) * 0x94D049BB133111EB & 0xFFFFFFFFFFFFFFFF
        x ^= x >> 29
    return (x >> 11) / float(1 << 53)


def smooth01(lat: float, lon: float) -> float:
    """A smooth field over the globe in [0, 1]: the sim's idea of relief."""
    a = math.sin(lat * 9.1 + 1.3) * math.cos(lon * 7.3 - 0.4)
    b = math.sin(lat * 23.7 + lon * 17.9 + 0.7)
    return 0.5 + 0.5 * (0.6 * a + 0.4 * b)


def summit_m(lat: float, lon: float) -> float:
    """How high a summit standing here is, 900 to 3,400 m."""
    return 900 + 2500 * smooth01(lat, lon)


def terrain_m(lat: float, lon: float) -> float:
    """The ground height Open-Meteo echoes as `elevation` for a coordinate.

    The summit field less a few hundred metres, so the forecast grid's terrain
    sits under the summits beside it, as a real DEM's does between peaks.
    """
    return round(max(50.0, summit_m(lat, lon) - 300), 1)


def model_shift_h(model: str | None) -> int:
    """How many hours a model runs ahead of or behind the others, -3 to +3.

    A comparison of three models then draws three distinct lines. CRC32 rather
    than `hash()` for `unit_hash`'s reason.
    """
    if not model:
        return 0
    return zlib.crc32(model.encode()) % 7 - 3


def _diurnal(hour: int, lon: float) -> float:
    """-1 to 1, warmest mid-afternoon local solar time."""
    solar = hour + lon / 15
    return math.sin(2 * math.pi * (solar - 9) / 24)


def _sea_level_f(lat: float, lon: float, hour: int) -> float:
    """The free air's temperature at sea level: the latitude gradient, plus a
    four-day swing so a long window has weather systems in it."""
    synoptic = 6 * math.sin(2 * math.pi * hour / (24 * 4.3) + lon * 0.5)
    return 60 - (lat - 46) * 3 + synoptic


def temperature_2m_f(lat: float, lon: float, hour: int) -> float:
    ground = terrain_m(lat, lon)
    return _sea_level_f(lat, lon, hour) - _LAPSE_F_PER_M * ground + 9 * _diurnal(hour, lon)


def temperature_level_f(lat: float, lon: float, hour: int, level: int) -> float:
    # The free air swings less over a day than the ground does.
    return _sea_level_f(lat, lon, hour) - _LAPSE_F_PER_M * ISA_HEIGHT_M[level] + 2 * _diurnal(hour, lon)


def wind_10m_mph(lat: float, lon: float, hour: int) -> float:
    return 5 + abs(math.sin(hour / 6 + lat)) * 10


def wind_level_mph(lat: float, lon: float, hour: int, level: int) -> float:
    height_km = ISA_HEIGHT_M[level] / 1000
    return wind_10m_mph(lat, lon, hour) * (1 + height_km / 1.5) + 5 * height_km


def wind_direction_deg(lat: float, lon: float, hour: int) -> float:
    return (hour * 17 + lat * 30) % 360


def precipitation_in(lat: float, lon: float, hour: int) -> float:
    """Rain spells: zero most hours, a few hundredths of an inch in a spell."""
    wave = math.sin(2 * math.pi * hour / 37 + lat * 3 + lon * 2)
    return max(0.0, wave - 0.6) * 0.1


def snowfall_in(lat: float, lon: float, hour: int) -> float:
    """The precipitation as snow where the ground is below freezing, at the
    usual ten to one."""
    if temperature_2m_f(lat, lon, hour) >= 32:
        return 0.0
    return precipitation_in(lat, lon, hour) * 10


def freezing_level_ft(lat: float, lon: float, hour: int) -> float:
    """Where the free air crosses 32 °F, 0 when the whole column is below it."""
    above = _sea_level_f(lat, lon, hour) + 2 * _diurnal(hour, lon) - 32
    return max(0.0, above / _LAPSE_F_PER_M * _FT_PER_M)


def relative_humidity_pct(lat: float, lon: float, hour: int, level: int | None) -> float:
    """Humidity at a level, or at 2 m when `level` is None.

    Each level peaks for a few hours a day, the peaks staggered up the column,
    and the wettest places cross the app's saturation threshold (95 %) at
    some level most days, so the cloud deck is sometimes under a summit and
    sometimes absent.
    """
    index = -1 if level is None else RH_LEVELS.index(level)
    base = 55 + 10 * math.sin(lat * 7 + lon * 5)
    wave = math.sin(2 * math.pi * (hour - 2 * index) / 24 + lat * 5 + lon * 3)
    return min(100.0, max(5.0, base + 38 * wave))


def us_aqi(lat: float, lon: float, hour: int) -> int:
    """A US AQI from 10 to 150: cleaner air to the north, a daily swing."""
    north = max(0.0, min(1.0, (lat - 30) / 30))
    value = 80 - 40 * north + 30 * math.sin(2 * math.pi * hour / 24 + lon) + 10 * math.sin(hour / 50)
    return int(max(10, min(150, round(value))))


def snow_depth_m(lat: float, lon: float) -> float:
    """The snowpack's depth in metres, from the ground's height above a snow
    line that falls toward the pole."""
    snowline = 2600 - (lat - 40) * 120
    return max(0.0, (terrain_m(lat, lon) - snowline) * 0.0012)


def snow_water_mm(lat: float, lon: float) -> float:
    # A settled pack's density, about 0.3.
    return snow_depth_m(lat, lon) * 300
