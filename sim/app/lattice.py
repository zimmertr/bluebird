"""The sim's geography: where every peak, lake, trailhead, crag and town is.

Every supplier the sim answers for reads this one module, so the places agree
across them: a summit in a zoom-14 tile is the summit the Overpass sim
discovers, with the same node id, name and elevation, and the snow and the
weather at it come from the same ground (`values.py`). Nothing is stored. Each
kind of place sits on its own lattice of cells over the whole globe, one place
per cell, and a cell's place is a pure function of the cell's indices.

The lattices, in degrees (latitude by longitude):

- named peaks, 0.02 by 0.03, about half a peak per zoom-14 tile at 47° N;
- unnamed peaks, 0.014 by 0.021 on an offset grid, about twice as dense, the
  ratio that has the real app's unnamed-peaks toggle roughly triple a field;
- lakes 0.06 by 0.09, trailheads 0.08 by 0.12, crags 0.1 by 0.15, towns 0.3
  by 0.45, each offset so no two kinds share a cell corner.

A place stands at its cell's centre moved by up to 30% of the pitch, so the
map does not read as a grid. Names come from two fixed word lists and are
injective within any block of 64 by 32 cells of a lattice. OSM ids are a pure
function of the cell, in ranges no two lattices share, so a place has one id
everywhere it is reported.

Boxes are half-open, `south <= lat < north` and `west <= lon < east`, so two
boxes that share an edge never report the same place twice (the tiles rely on
this). Coordinates are WGS 84 degrees and elevations metres throughout.
"""

from __future__ import annotations

import math
from collections.abc import Iterator, Sequence
from dataclasses import dataclass

from app.values import smooth01, summit_m, terrain_m, unit_hash

FIRST_WORDS = (
    "Copper", "Hazel", "Granite", "Sentinel", "Raven", "Cedar", "Silver", "Eagle",
    "Juniper", "Basalt", "Marten", "Larch", "Ptarmigan", "Obsidian", "Heather", "Lupine",
    "Talus", "Osprey", "Aster", "Cinder", "Falcon", "Hemlock", "Iron", "Kestrel",
    "Lichen", "Marmot", "Nimbus", "Ochre", "Pika", "Quartz", "Rime", "Saddleback",
    "Tamarack", "Umber", "Vesper", "Willow", "Yarrow", "Alder", "Bramble", "Cobalt",
    "Dipper", "Ember", "Fern", "Garnet", "Huckleberry", "Indigo", "Jasper", "Kinglet",
    "Lantern", "Mica", "Nettle", "Opal", "Pumice", "Quail", "Rowan", "Shale",
    "Thistle", "Vireo", "Wren", "Zircon", "Amber", "Bluebell", "Corvid", "Dogwood",
)
SECOND_WORDS = (
    "Ridge", "Peak", "Dome", "Spire", "Butte", "Point", "Crest", "Knob",
    "Horn", "Tower", "Needle", "Pinnacle", "Summit", "Bluff", "Head", "Hill",
    "Tor", "Mesa", "Pyramid", "Shoulder", "Cone", "Rock", "Buttress", "Crown",
    "Fang", "Tooth", "Castle", "Thumb", "Lookout", "Bald", "Mountain", "Arete",
)
_TOWN_WORDS = ("Springs", "Falls", "Junction", "Crossing")

# Each lattice: pitch in degrees, offset of its first cell in fractions of a
# pitch, and the base of its id range. A node and a way are separate id spaces
# in OSM, so the lakes (ways) may start where the peaks do.
_Grid = tuple[float, float, float, float, int]
_PEAKS: _Grid = (0.02, 0.03, 0.0, 0.0, 10_000_000_000)
_UNNAMED: _Grid = (0.014, 0.021, 0.37, 0.61, 12_000_000_000)
_LAKES: _Grid = (0.06, 0.09, 0.5, 0.5, 10_000_000_000)
_TRAILHEADS: _Grid = (0.08, 0.12, 0.25, 0.75, 14_000_000_000)
_CRAGS: _Grid = (0.1, 0.15, 0.8, 0.2, 16_000_000_000)
_TOWNS: _Grid = (0.3, 0.45, 0.15, 0.4, 18_000_000_000)
# Wide enough for the finest lattice's column count, 360 / 0.014.
_ID_ROW = 100_000

_EARTH_RADIUS_M = 6_371_008.8


@dataclass(frozen=True, slots=True)
class Peak:
    """A summit node. `name` is None on the unnamed lattice alone."""

    lat: float
    lon: float
    osm_id: int
    name: str | None
    elevation_m: float


@dataclass(frozen=True, slots=True)
class Lake:
    """A lake way, reported at its middle."""

    lat: float
    lon: float
    osm_id: int
    name: str
    elevation_m: float


@dataclass(frozen=True, slots=True)
class Trailhead:
    lat: float
    lon: float
    osm_id: int
    name: str
    elevation_m: float


@dataclass(frozen=True, slots=True)
class Crag:
    lat: float
    lon: float
    osm_id: int
    name: str
    elevation_m: float


@dataclass(frozen=True, slots=True)
class Town:
    """A settlement node; `kind` is OSM's `place=` value, town or village."""

    lat: float
    lon: float
    osm_id: int
    name: str
    kind: str


def _name(i: int, j: int, suffix: str = "") -> str:
    # Odd multipliers make each index map onto its list one to one, so the
    # pair is injective on any 64 by 32 block while neighbours still differ in
    # both words.
    first = FIRST_WORDS[(i * 29) % 64]
    second = SECOND_WORDS[(j * 13 + i) % 32]
    return f"{first} {second}{suffix}"


def _cells(
    grid: _Grid, south: float, west: float, north: float, east: float, stride: int
) -> Iterator[tuple[int, int, float, float]]:
    """Every cell of `grid` whose place falls inside the box, as (i, j, lat, lon).

    `stride` keeps only cells whose indices are both multiples of it, which is
    how a low-zoom tile thins a lattice without walking every cell under it.
    """
    pitch_lat, pitch_lon, off_lat, off_lon, _ = grid
    i0 = math.floor((south + 90) / pitch_lat - off_lat) - 1
    i1 = math.floor((north + 90) / pitch_lat - off_lat) + 1
    j0 = math.floor((west + 180) / pitch_lon - off_lon) - 1
    j1 = math.floor((east + 180) / pitch_lon - off_lon) + 1
    for i in range(i0 - i0 % stride, i1 + 1, stride):
        for j in range(j0 - j0 % stride, j1 + 1, stride):
            lat = (i + off_lat + 0.5 + 0.6 * (unit_hash(grid[4], i, j, 1) - 0.5)) * pitch_lat - 90
            lon = (j + off_lon + 0.5 + 0.6 * (unit_hash(grid[4], i, j, 2) - 0.5)) * pitch_lon - 180
            if south <= lat < north and west <= lon < east and -85 < lat < 85:
                yield i, j, round(lat, 6), round(lon, 6)


def _id(grid: _Grid, i: int, j: int) -> int:
    return grid[4] + i * _ID_ROW + j


def peaks_in_bbox(south: float, west: float, north: float, east: float, stride: int = 1) -> list[Peak]:
    """The named summits in the box, each with an elevation from 900 to 3,400 m."""
    return [
        Peak(lat, lon, _id(_PEAKS, i, j), _name(i, j), round(summit_m(lat, lon), 1))
        for i, j, lat, lon in _cells(_PEAKS, south, west, north, east, stride)
    ]


def unnamed_peaks_in_bbox(south: float, west: float, north: float, east: float) -> list[Peak]:
    """The summits OSM knows by an elevation alone (`ele` and no `name`).

    Their name is None, and every consumer names one `Peak <feet>` itself, the
    way the app's tile and Overpass paths do.
    """
    return [
        Peak(lat, lon, _id(_UNNAMED, i, j), None, round(summit_m(lat, lon) - 250, 1))
        for i, j, lat, lon in _cells(_UNNAMED, south, west, north, east, 1)
    ]


def lakes_in_bbox(south: float, west: float, north: float, east: float, stride: int = 1) -> list[Lake]:
    return [
        Lake(lat, lon, _id(_LAKES, i, j), _name(i, j, " Lake"), round(300 + 1900 * smooth01(lat, lon), 1))
        for i, j, lat, lon in _cells(_LAKES, south, west, north, east, stride)
    ]


def trailheads_in_bbox(south: float, west: float, north: float, east: float) -> list[Trailhead]:
    return [
        Trailhead(
            lat, lon, _id(_TRAILHEADS, i, j), _name(i, j, " Trailhead"), round(300 + 1200 * smooth01(lat, lon), 1)
        )
        for i, j, lat, lon in _cells(_TRAILHEADS, south, west, north, east, 1)
    ]


def crags_in_bbox(south: float, west: float, north: float, east: float) -> list[Crag]:
    return [
        Crag(lat, lon, _id(_CRAGS, i, j), _name(i, j, " Wall"), terrain_m(lat, lon))
        for i, j, lat, lon in _cells(_CRAGS, south, west, north, east, 1)
    ]


def towns_in_bbox(south: float, west: float, north: float, east: float, stride: int = 1) -> list[Town]:
    """Settlements, for the map's place layer and a geocoder's answers."""
    out = []
    for i, j, lat, lon in _cells(_TOWNS, south, west, north, east, stride):
        word = _TOWN_WORDS[(i + j) % len(_TOWN_WORDS)]
        kind = "town" if unit_hash(_TOWNS[4], i, j, 3) < 0.4 else "village"
        out.append(Town(lat, lon, _id(_TOWNS, i, j), f"{FIRST_WORDS[(i * 29 + j) % 64]} {word}", kind))
    return out


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance, haversine."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def nearest_peak(lat: float, lon: float, radius_m: float, include_unnamed: bool = True) -> Peak | None:
    """The summit nearest the point within `radius_m`, named or not, or None.

    The rule of the pod's custom-destination lookup (`osm.enrich`): the
    nearest node inside the radius, with or without a name.
    """
    dlat = radius_m / 111_320
    dlon = radius_m / (111_320 * max(0.01, math.cos(math.radians(lat))))
    box = (lat - dlat, lon - dlon, lat + dlat, lon + dlon)
    candidates = peaks_in_bbox(*box) + (unnamed_peaks_in_bbox(*box) if include_unnamed else [])
    scored = [(distance_m(lat, lon, p.lat, p.lon), p.osm_id, p) for p in candidates]
    inside = [s for s in scored if s[0] <= radius_m]
    return min(inside)[2] if inside else None


def point_in_ring(lat: float, lon: float, ring: Sequence[tuple[float, float]]) -> bool:
    """Whether a point is inside a ring given as (lat, lon) pairs.

    (lat, lon) rather than GeoJSON's (lon, lat), because the Overpass `poly:`
    filter the pod sends spells its ring that way. A closing repeat of the
    first position is allowed and changes nothing. Even-odd ray cast, the
    rule the app's own `pointInRing` uses.
    """
    inside = False
    n = len(ring)
    for k in range(n):
        lat_a, lon_a = ring[k]
        lat_b, lon_b = ring[k - 1]
        if (lat_a > lat) != (lat_b > lat):
            cross = lon_a + (lat - lat_a) * (lon_b - lon_a) / (lat_b - lat_a)
            if lon < cross:
                inside = not inside
    return inside
