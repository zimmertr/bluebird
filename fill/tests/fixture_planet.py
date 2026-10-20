"""A hand-written planet around Index, Washington, for the fill's suite (#760).

Every kind the rules keep, the features they must not keep, and the shapes the
centre pass has to survive: a multipolygon lake in two halves, climbing areas
two levels above their crags, a loop of areas, an area naming a relation the
file lacks and an area made of an empty one. EXPECTED is worked out by hand.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from xml.sax.saxutils import quoteattr

PLANET_TIMESTAMP = "2026-10-12T00:59:58Z"

NODES = {
    # id: (lat, lon, tags)
    1: (47.8, -121.5, {"natural": "peak", "name": "Mount Index", "ele": "1814"}),
    2: (47.81, -121.51, {"natural": "peak", "ele": "1500"}),
    3: (47.82, -121.52, {"natural": "peak"}),  # no name and no height: dropped
    4: (48.112, -121.113, {"natural": "volcano", "name": "Glacier Peak", "ele": "3213"}),
    5: (47.83, -121.53, {"highway": "trailhead", "name": "Lake Serene Trailhead"}),
    6: (47.84, -121.54, {}),
    7: (47.845, -121.545, {"sport": "climbing", "climbing": "route", "name": "Thin Fingers"}),
    8: (47.85, -121.55, {"climbing": "crag", "name": "Hag Crag"}),
    9: (47.86, -121.56, {"natural": "cliff", "sport": "climbing", "name": "Ozone Wall"}),
    11: (47.6, -122.3, {"leisure": "sports_centre", "sport": "climbing", "name": "Vertical World"}),
    12: (47.87, -121.57, {"sport": "climbing", "name": "Bare Point"}),
    101: (47.79, -121.57, {}),
    102: (47.79, -121.56, {}),
    103: (47.78, -121.56, {}),
    104: (47.78, -121.57, {}),
    105: (47.83, -121.532, {}),
    106: (47.831, -121.532, {}),
    107: (47.831, -121.531, {}),
    108: (47.83, -121.531, {}),
    109: (47.85, -121.69, {}),
    110: (47.851, -121.69, {}),
    111: (47.851, -121.689, {}),
    201: (47.7, -121.4, {}),
    202: (47.7, -121.38, {}),
    203: (47.69, -121.38, {}),
    204: (47.69, -121.4, {}),
    205: (47.71, -121.41, {}),
    206: (47.711, -121.41, {}),
    207: (47.711, -121.409, {}),
    301: (47.81, -121.58, {}),
    302: (47.812, -121.578, {}),
}

WAYS = {
    10: ([101, 102, 103, 104, 101], {"natural": "water", "water": "lake", "name": "Lake Serene"}),
    21: ([201, 202, 203], {}),
    22: ([203, 204, 201], {}),
    23: ([205, 206, 207, 205], {"natural": "water", "water": "lake"}),  # unnamed: dropped
    30: ([105, 106, 107, 108, 105], {"amenity": "parking", "name": "Lake Serene Trailhead"}),
    31: ([109, 110, 111, 109], {"amenity": "parking", "name": "Gold Bar Park and Ride"}),
    43: ([301, 302], {}),
}

RELATIONS = {
    20: ([("way", 21, "outer"), ("way", 22, "outer")],
         {"type": "multipolygon", "natural": "water", "water": "lake", "name": "Lost Lake"}),
    40: ([("relation", 41, ""), ("relation", 42, "")], {"climbing": "area", "name": "Index Town Walls"}),
    41: ([("node", 6, ""), ("node", 7, "")], {"sport": "climbing", "climbing": "crag", "name": "Lower Town Wall"}),
    42: ([("way", 43, "")], {"sport": "climbing", "climbing": "crag", "name": "Upper Town Wall"}),
    # An area above an area above the crags, and a crag of its own beside
    # them, which is where it stands, as on Overpass (2026-10-18).
    45: ([("relation", 40, ""), ("node", 8, "")], {"climbing": "area", "name": "Index"}),
    46: ([("node", 9, "")], {"type": "site", "sport": "climbing", "name": "K Cliff"}),
    # Nothing below either of these: one names a relation the file lacks.
    47: ([("relation", 999, "")], {"climbing": "area", "name": "Missing Area"}),
    50: ([("relation", 51, "")], {"climbing": "area", "name": "Empty Area"}),
    51: ([], {"type": "site"}),
    # A loop, which a mapper can make and the fill must survive.
    48: ([("relation", 49, ""), ("node", 12, "")], {"climbing": "area", "name": "Loop A"}),
    49: ([("relation", 48, ""), ("node", 7, "")], {"climbing": "area", "name": "Loop B"}),
}

# (osm_type, osm_id, kind, name, ele_ft, rank, lon, lat), worked out by hand.
EXPECTED = {
    ("node", 1, "peak", "Mount Index", 5951.0, 0, -121.5, 47.8),
    ("node", 2, "peak", None, 4921.0, 0, -121.51, 47.81),
    ("node", 4, "peak", "Glacier Peak", 10541.0, 0, -121.113, 48.112),
    ("node", 5, "trailhead", "Lake Serene Trailhead", None, 0, -121.53, 47.83),
    ("node", 8, "crag", "Hag Crag", None, 0, -121.55, 47.85),
    ("node", 9, "crag", "Ozone Wall", None, 0, -121.56, 47.86),
    ("way", 10, "lake", "Lake Serene", None, 0, -121.565, 47.785),
    # The lot named for the trailhead is a trailhead too, ranked behind the node.
    ("way", 30, "trailhead", "Lake Serene Trailhead", None, 1, -121.5315, 47.8305),
    ("relation", 20, "lake", "Lost Lake", None, 0, -121.39, 47.695),
    ("relation", 40, "crag", "Index Town Walls", None, 0, -121.56, 47.8275),
    ("relation", 41, "crag", "Lower Town Wall", None, 0, -121.5425, 47.8425),
    ("relation", 42, "crag", "Upper Town Wall", None, 0, -121.579, 47.811),
    ("relation", 45, "crag", "Index", None, 0, -121.55, 47.85),
    ("relation", 46, "crag", "K Cliff", None, 0, -121.56, 47.86),
    ("relation", 48, "crag", "Loop A", None, 0, -121.57, 47.87),
    ("relation", 49, "crag", "Loop B", None, 0, -121.545, 47.845),
}


def _tags(tags: dict[str, str]) -> str:
    return "".join(f"<tag k={quoteattr(k)} v={quoteattr(v)}/>" for k, v in tags.items())


def planet_xml() -> str:
    head = '<node id="{}" version="1" timestamp="2026-10-01T00:00:00Z" lat="{}" lon="{}">'
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="fill tests">']
    for nid, (lat, lon, tags) in sorted(NODES.items()):
        parts.append(head.format(nid, lat, lon) + _tags(tags) + "</node>")
    for wid, (refs, tags) in sorted(WAYS.items()):
        nds = "".join(f'<nd ref="{r}"/>' for r in refs)
        parts.append(f'<way id="{wid}" version="1" timestamp="2026-10-01T00:00:00Z">{nds}{_tags(tags)}</way>')
    for rid, (members, tags) in sorted(RELATIONS.items()):
        ms = "".join(f'<member type="{t}" ref="{r}" role="{role}"/>' for t, r, role in members)
        parts.append(f'<relation id="{rid}" version="1" timestamp="2026-10-01T00:00:00Z">{ms}{_tags(tags)}</relation>')
    parts.append("</osm>")
    return "\n".join(parts)


def write_pbf(directory: Path) -> Path:
    """The planet as a PBF in `directory`, its header stamped like the real one's."""
    xml = directory / "planet.osm"
    xml.write_text(planet_xml())
    pbf = directory / "planet.osm.pbf"
    subprocess.run(
        ["osmium", "cat", "--no-progress", "--overwrite", str(xml), "-o", str(pbf),
         f"--output-header=osmosis_replication_timestamp={PLANET_TIMESTAMP}"],
        check=True,
    )
    return pbf
