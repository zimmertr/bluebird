"""The two spellings of each destination rule held to one table (#760).

`rules.CLAUSES` is what Overpass is asked and `rules.classify` is what the
planet fill and the daily update keep, so a feature one takes and the other
drops would be found by a deployment without the database and missing from one
with it. Nothing here calls Overpass: `_selects` evaluates the small subset of
its selector grammar the clauses use, which `test_every_clause_parses` pins.
"""

from __future__ import annotations

import re

import pytest

from app.services.osm import rules

_CLAUSE = re.compile(r"^(node|way|relation|nwr)(\[.*\]);$")
_FILTER = re.compile(r'\[(!?)"([^"]+)"(?:(=|~)"([^"]*)")?\]')


def _parse(clause: str) -> tuple[str, list[tuple[bool, str, str | None, str | None]]]:
    m = _CLAUSE.match(clause)
    assert m, clause
    filters = [
        (neg == "!", key, op or None, value if op else None)
        for neg, key, op, value in _FILTER.findall(m.group(2))
    ]
    # Every bracket is understood: the filters cover the whole tail.
    assert "".join(
        f'[{"!" if n else ""}"{k}"' + (f'{o}"{v}"' if o else "") + "]" for n, k, o, v in filters
    ) == m.group(2), clause
    return m.group(1), filters


def _selects(clause: str, element: str, tags: dict[str, str]) -> bool:
    kind, filters = _parse(clause)
    if kind != "nwr" and kind != element:
        return False
    for negated, key, op, value in filters:
        if negated:
            ok = key not in tags
        elif op is None:
            ok = key in tags
        elif op == "=":
            ok = tags.get(key) == value
        else:
            ok = key in tags and re.search(value or "", tags[key]) is not None
        if not ok:
            return False
    return True


def _clause_kinds(element: str, tags: dict[str, str]) -> set[tuple[str, bool]]:
    found = {
        (kind, True)
        for kind, clauses in rules.CLAUSES.items()
        for clause in clauses
        if _selects(clause, element, tags)
    }
    if any(_selects(c, element, tags) for c in rules.UNNAMED_PEAK_CLAUSES):
        found.add((rules.PEAK, False))
    return found


# (element, tags, what classify answers). Each line is a case a reader of OSM
# would argue about; the measured ones name the place they were measured at.
CASES: list[tuple[str, dict[str, str], tuple[str, bool] | None]] = [
    ("node", {"natural": "peak", "name": "Dome Peak"}, (rules.PEAK, True)),
    ("node", {"natural": "volcano", "name": "Mount Baker"}, (rules.PEAK, True)),
    ("node", {"natural": "peak", "ele": "1817"}, (rules.PEAK, False)),
    ("node", {"natural": "peak"}, None),
    # Peaks are nodes: an outlined summit is a ridge someone drew.
    ("way", {"natural": "peak", "name": "Ridge"}, None),
    ("node", {"highway": "trailhead", "name": "Snow Lake TH"}, (rules.TRAILHEAD, True)),
    ("way", {"highway": "trailhead", "name": "Snow Lake TH"}, (rules.TRAILHEAD, True)),
    ("relation", {"highway": "trailhead", "name": "Odd"}, None),
    ("way", {"amenity": "parking", "name": "Poo Poo Trailhead"}, (rules.TRAILHEAD, True)),
    ("node", {"amenity": "parking", "name": "Lake 22 Trail Head"}, (rules.TRAILHEAD, True)),
    ("way", {"amenity": "parking", "name": "Heybrook Trail Parking"}, None),
    ("way", {"amenity": "parking", "name": "Safeway"}, None),
    ("way", {"natural": "water", "water": "lake", "name": "Lost Lake"}, (rules.LAKE, True)),
    ("relation", {"natural": "water", "water": "lake", "name": "Lake Chelan"}, (rules.LAKE, True)),
    ("way", {"natural": "water", "water": "pond", "name": "Mill Pond"}, None),
    ("node", {"sport": "climbing", "climbing": "crag", "name": "Lower Town Wall"}, (rules.CRAG, True)),
    ("relation", {"sport": "climbing", "climbing": "area", "name": "Index"}, (rules.CRAG, True)),
    ("node", {"sport": "climbing", "climbing": "boulder", "name": "B1"}, (rules.CRAG, True)),
    ("node", {"natural": "stone", "sport": "climbing", "name": "Midnite Boulder"}, (rules.CRAG, True)),
    ("node", {"natural": "stone", "sport": "climbing", "climbing": "route", "name": "R"}, None),
    ("node", {"sport": "climbing", "climbing": "route", "name": "Davis-Holland"}, None),
    ("node", {"sport": "climbing", "climbing": "route_bottom", "name": "Start"}, None),
    # The widened rules (#760). A subtype alone: Hag Crag.
    ("node", {"climbing": "crag", "name": "Hag Crag"}, (rules.CRAG, True)),
    # ...but not indoors.
    ("node", {"climbing": "area", "leisure": "sports_centre", "name": "Gym"}, None),
    # Bare sport on natural rock: Ozone Wall, Icicle Buttress.
    ("way", {"sport": "climbing", "natural": "cliff", "name": "Ozone Wall"}, (rules.CRAG, True)),
    ("node", {"sport": "climbing", "natural": "bare_rock", "name": "Slab"}, (rules.CRAG, True)),
    ("node", {"sport": "climbing", "natural": "rock", "name": "Rock"}, (rules.CRAG, True)),
    ("way", {"sport": "climbing", "natural": "cliff", "building": "yes", "name": "Wall"}, None),
    # A climbing site: K Cliff.
    ("relation", {"type": "site", "sport": "climbing", "name": "K Cliff"}, (rules.CRAG, True)),
    ("relation", {"type": "site", "sport": "climbing", "club": "yes", "name": "Club"}, None),
    # A bare sport=climbing point is a gym, a route or a shop until it says more.
    ("node", {"sport": "climbing", "name": "Vertical World"}, None),
    ("node", {"sport": "climbing", "leisure": "sports_centre", "name": "Edgeworks"}, None),
    # A feature the original rule takes stays a crag whatever else marks it.
    ("node", {"sport": "climbing", "climbing": "crag", "tourism": "attraction", "name": "C"}, (rules.CRAG, True)),
    # Two kinds' tags: the summit wins, and the crag clause selected it too.
    ("node", {"natural": "peak", "sport": "climbing", "climbing": "crag", "name": "Spire"}, (rules.PEAK, True)),
    # A trailhead node that also marks a crag is the trailhead.
    ("node", {"highway": "trailhead", "climbing": "crag", "name": "Both"}, (rules.TRAILHEAD, True)),
]


@pytest.mark.parametrize(("element", "tags", "expected"), CASES)
def test_classify_reads_the_table(element, tags, expected):
    assert rules.classify(element, tags) == expected


@pytest.mark.parametrize(("element", "tags", "expected"), CASES)
def test_the_clauses_select_what_classify_keeps(element, tags, expected):
    selected = _clause_kinds(element, tags)
    if expected is None:
        assert selected == set()
    else:
        # The kind classify names is among the clauses that select it, so
        # Overpass returns it to be read the same way.
        assert expected in selected


def test_every_clause_parses():
    for clauses in (*rules.CLAUSES.values(), rules.UNNAMED_PEAK_CLAUSES):
        for clause in clauses:
            _parse(clause)


def test_the_overpass_and_python_trailhead_patterns_agree():
    # POSIX extended and Python's `re` read this pattern the same way only
    # while it stays inside their common subset: literals, classes and `?`.
    assert re.fullmatch(r"[\[\]A-Za-z ?]+", rules.TRAILHEAD_LOT_NAME)


def test_rules_import_nothing_outside_the_standard_library():
    # fill/ copies this file into an image with none of the app's packages.
    import ast
    import sys
    from pathlib import Path

    tree = ast.parse(Path(rules.__file__).read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        else:
            continue
        for name in names:
            assert name.split(".")[0] in sys.stdlib_module_names or name == "__future__", name


def _row(name, lat, lon, kind=rules.LAKE):
    return {"name": name, "type": kind, "latitude": lat, "longitude": lon}


def test_merge_keeps_the_preferred_row_and_the_input_order():
    rows = [_row("A", 47.0, -121.0), _row("B", 47.1, -121.0), _row("A", 47.001, -121.0)]
    kept = rules.merge_neighbours(rows, order=[(1,), (0,), (0,)], mergeable=[True] * 3)
    assert kept == [rows[1], rows[2]]


def test_merge_measures_from_kept_rows_only():
    # A chain of three 200 m apart: the middle one goes, the far end stays,
    # because it is 400 m from the row that stands for the group.
    rows = [_row("A", 47.0, -121.0), _row("A", 47.0018, -121.0), _row("A", 47.0036, -121.0)]
    kept = rules.merge_neighbours(rows, order=[(0,), (1,), (2,)], mergeable=[True] * 3)
    assert kept == [rows[0], rows[2]]


def test_merge_never_joins_two_kinds_or_two_generated_names():
    rows = [
        _row("The Tooth", 47.0, -121.0, rules.PEAK),
        _row("The Tooth", 47.0001, -121.0, rules.CRAG),
        _row("Peak 5961", 47.2, -121.0, rules.PEAK),
        _row("Peak 5961", 47.2001, -121.0, rules.PEAK),
    ]
    kept = rules.merge_neighbours(rows, order=[(0,)] * 4, mergeable=[True, True, False, False])
    assert kept == rows


def test_merge_radius_is_the_measured_300_m():
    assert rules.MERGE_RADIUS_M == 300.0
    # 0.0027 degrees of latitude is 300.2 m on the sphere `_distance_m` uses.
    assert 299 < rules._distance_m(47.0, -121.0, 47.0027, -121.0) < 301


# --- Where a relation stands ------------------------------------------------

_POINTS = {1: (-121.0, 47.0), 2: (-121.2, 47.2), 3: (-121.4, 47.4), 4: (-121.6, 47.6)}


def _boxes(members, way_boxes=None):
    return rules.relation_boxes(members, _POINTS.get, way_boxes or {})


def test_a_relation_with_points_of_its_own_stands_at_them():
    # Boston Basin: its own crags plus sub-areas. Overpass boxes the own
    # members alone, and so does the table (2026-10-18).
    boxes = _boxes({10: (("n", 1), ("n", 2), ("r", 11)), 11: (("n", 4),)})
    assert rules.centre(boxes[10]) == pytest.approx((-121.1, 47.1))
    assert rules.centre(boxes[11]) == pytest.approx((-121.6, 47.6))


def test_an_area_made_only_of_areas_stands_at_their_middle_however_deep():
    boxes = _boxes({
        20: (("r", 21), ("r", 22)),
        21: (("r", 23),),
        22: (("n", 4),),
        23: (("n", 1), ("w", 99)),
    }, way_boxes={99: (-121.2, 47.0, -121.0, 47.2)})
    assert rules.centre(boxes[21]) == pytest.approx((-121.1, 47.1))
    assert rules.centre(boxes[20]) == pytest.approx((-121.3, 47.3))


def test_a_loop_of_areas_and_an_empty_one_place_nothing_they_cannot():
    boxes = _boxes({30: (("r", 31),), 31: (("r", 30),), 32: (("n", 404),), 33: (("r", 404),)})
    assert boxes == {}


def test_a_way_member_counts_as_the_relations_own():
    boxes = _boxes({40: (("w", 98), ("r", 41)), 41: (("n", 4),)}, way_boxes={98: (-121.0, 47.0, -120.8, 47.2)})
    assert rules.centre(boxes[40]) == pytest.approx((-120.9, 47.1))
