"""Overpass: the pod's discovery query and its coordinate lookup, answered off the lattice.

The pod sends Overpass QL (`osm/query.py`, `osm/enrich.py`) and this reads it
the way Overpass does, statement by statement: each `node`/`way`/`relation`
statement names tag filters and one spatial filter, and the answer is the
union of what every statement matches, sorted by element type and id the way
`out` sorts it. A statement's tag filters are tested against what each kind of
lattice place is tagged with, so a clause the pod adds later reaches the places
it describes without a change here, and a clause no sim place could satisfy
(a volcano, a lake mapped as a node, a climbing stone) answers nothing, which
is what the real server would say over ground that holds none.

Three spatial filters, because the pod sends three questions:

- `(poly:"lat lon lat lon ...")`, discovery: every place inside the ring;
- `(around:R,LAT,LON)`, the pasted-coordinate lookup: every place within R
  metres, several clauses to one query;
- none at all, a question about the whole planet (#756 asks one at pod start
  for every named trailhead and crag), answered over `HOME_BOX` so it stays
  bounded. A `(s,w,n,e)` box and a global `[bbox:...]` setting are read too.

The switchboard reaches this two ways. `overpass.candidates` replaces every
discovery answer with that many named peaks, the one way to reach the pod's
over-cap refusal with a ring a reader can draw. An `overpass` fault answers
through `control.fault`, and a fault whose status is 200 answers what a
mid-query timeout does on the real server: half the elements and a `remark`.
"""

from __future__ import annotations

import http
import json
import logging
import math
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import PlainTextResponse

from app import control, lattice

log = logging.getLogger("sim.overpass")

# The Cascades, south to north and west to east. A query with no spatial
# filter is a question about the planet, and the planet's lattice is millions
# of places; this is the ground the sim's dev stack is drawn over.
HOME_BOX = (45.0, -124.0, 49.0, -117.0)

GENERATOR = "bluebird-forecast-sim"

_STATEMENT = re.compile(r"\b(node|way|relation|nwr)((?:\s*(?:\[[^\]]*\]|\([^)]*\)))+)\s*;")
_TAG = re.compile(r'\[\s*(?:(!)\s*)?"([^"]+)"\s*(?:(=|!=|~)\s*"([^"]*)"\s*)?\]')
_POLY = re.compile(r'\(\s*poly\s*:\s*"([^"]*)"\s*\)')
_AROUND = re.compile(r"\(\s*around\s*:\s*([0-9.]+)\s*,\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\)")
_NUM = r"\s*(-?[0-9.]+)\s*"
_BOX = re.compile(r"\(" + ",".join([_NUM] * 4) + r"\)")
_GLOBAL_BOX = re.compile(r"\[\s*bbox\s*:" + ",".join([_NUM] * 4) + r"\]")
_ALTERNATION = re.compile(r"\^\(?([A-Za-z_]+(?:\|[A-Za-z_]+)*)\)?\$")
_TIMEOUT = re.compile(r"\[\s*timeout\s*:\s*(\d+)\s*\]")

_TYPE_ORDER = {"node": 0, "way": 1, "relation": 2}

_Box = tuple[float, float, float, float]


@dataclass(frozen=True, slots=True)
class _Kind:
    """One kind of lattice place as Overpass would hold it.

    `sample` is a stand-in for the tags every place of the kind carries, so a
    statement's filters can be tested once per kind rather than once per place.
    `ele` and `name` are in it exactly when the kind's elements carry them.
    """

    name: str
    element: str
    sample: dict[str, str]
    places: Callable[[float, float, float, float], list[Any]]
    tags: Callable[[Any], dict[str, str]]


def ele_tag(elevation_m: float) -> str:
    """Metres as OSM spells them, a bare number with no unit.

    `:g` keeps the lattice's one decimal and drops a trailing `.0`, and parses
    back to the same float, so the pod's `_ele_ft` and the tiles' `ele_ft`
    agree on every summit's feet.
    """
    return f"{elevation_m:g}"


def _peak_tags(p: lattice.Peak) -> dict[str, str]:
    tags = {"natural": "peak"}
    if p.name is not None:
        tags["name"] = p.name
    tags["ele"] = ele_tag(p.elevation_m)
    return tags


KINDS: tuple[_Kind, ...] = (
    _Kind(
        "peak",
        "node",
        {"natural": "peak", "name": "x", "ele": "1"},
        lattice.peaks_in_bbox,
        _peak_tags,
    ),
    _Kind(
        "unnamed_peak",
        "node",
        {"natural": "peak", "ele": "1"},
        lattice.unnamed_peaks_in_bbox,
        _peak_tags,
    ),
    _Kind(
        "trailhead",
        "node",
        {"highway": "trailhead", "name": "x"},
        lattice.trailheads_in_bbox,
        lambda t: {"highway": "trailhead", "name": t.name},
    ),
    # A way, because a lake is an area in OSM; `out center` gives it a centre.
    _Kind(
        "lake",
        "way",
        {"natural": "water", "water": "lake", "name": "x"},
        lattice.lakes_in_bbox,
        lambda lake: {"natural": "water", "water": "lake", "name": lake.name},
    ),
    _Kind(
        "crag",
        "node",
        {"sport": "climbing", "climbing": "crag", "name": "x"},
        lattice.crags_in_bbox,
        lambda c: {"sport": "climbing", "climbing": "crag", "name": c.name},
    ),
)


@dataclass(frozen=True, slots=True)
class _Statement:
    kinds: tuple[_Kind, ...]
    ring: tuple[tuple[float, float], ...] | None
    around: tuple[float, float, float] | None
    box: _Box | None


class _BadQuery(Exception):
    pass


# The one body an unreadable query gets, in Overpass's own `static error` form;
# the sim's log says what it could not read.
BAD_QUERY_TEXT = "Error: static error: the sim could not read this query. Its log says why."


def _alternatives(pattern: str) -> frozenset[str]:
    """The words of a `~"^(a|b|c)$"` filter, the only regex form the pod sends.

    Read as a set rather than run, because the pattern arrives in the request
    and the sim has no business compiling a caller's regex. Any other form is a
    query the sim cannot read.
    """
    match = _ALTERNATION.fullmatch(pattern)
    if match is None:
        raise _BadQuery(f"unsupported regex filter {pattern!r}")
    return frozenset(match.group(1).split("|"))


def _matches(filters: list[tuple[str, str, str | None, str | None]], tags: dict[str, str]) -> bool:
    for negated, key, op, value in filters:
        present = key in tags
        if op is None:
            ok = present != bool(negated)
        elif op == "=":
            ok = tags.get(key) == value
        elif op == "!=":
            ok = tags.get(key) != value
        else:
            ok = present and tags[key] in _alternatives(value or "")
        if not ok:
            return False
    return True


def _ring(text: str) -> tuple[tuple[float, float], ...]:
    try:
        numbers = [float(part) for part in text.split()]
    except ValueError:
        raise _BadQuery("poly: expects numbers") from None
    if len(numbers) < 6 or len(numbers) % 2:
        raise _BadQuery("poly: needs at least three lat lon pairs")
    return tuple((numbers[k], numbers[k + 1]) for k in range(0, len(numbers), 2))


def parse(query: str) -> tuple[list[_Statement], int | None]:
    """The statements of one query, and its `[timeout:N]` if it set one."""
    timeout = _TIMEOUT.search(query)
    global_box = _GLOBAL_BOX.search(query)
    statements = []
    for element, body in _STATEMENT.findall(query):
        filters = [(neg, key, op or None, value if op else None) for neg, key, op, value in _TAG.findall(body)]
        kinds = tuple(
            kind for kind in KINDS if element in (kind.element, "nwr") and _matches(filters, kind.sample)
        )
        poly = _POLY.search(body)
        around = _AROUND.search(body)
        box = _BOX.search(body) or global_box
        statements.append(
            _Statement(
                kinds=kinds,
                ring=_ring(poly.group(1)) if poly else None,
                around=(float(around[1]), float(around[2]), float(around[3])) if around else None,
                box=(float(box[1]), float(box[2]), float(box[3]), float(box[4])) if box else None,
            )
        )
    if not statements:
        raise _BadQuery("no statement the sim can read")
    return statements, int(timeout.group(1)) if timeout else None


def _element(kind: _Kind, place: Any) -> dict[str, Any]:
    if kind.element == "node":
        return {"type": "node", "id": place.osm_id, "lat": place.lat, "lon": place.lon, "tags": kind.tags(place)}
    return {
        "type": kind.element,
        "id": place.osm_id,
        "center": {"lat": place.lat, "lon": place.lon},
        "tags": kind.tags(place),
    }


def _ring_box(ring: Iterable[tuple[float, float]]) -> _Box:
    lats, lons = zip(*ring, strict=True)
    # The lattice's boxes are half-open, so the north and east edges move out
    # a hair to keep a place standing exactly on them.
    return min(lats), min(lons), max(lats) + 1e-9, max(lons) + 1e-9


def _radius_box(lat: float, lon: float, radius_m: float) -> _Box:
    dlat = radius_m / 111_320
    dlon = radius_m / (111_320 * max(0.01, math.cos(math.radians(lat))))
    return lat - dlat, lon - dlon, lat + dlat, lon + dlon


def _answer(statement: _Statement) -> Iterable[dict[str, Any]]:
    for kind in statement.kinds:
        if statement.ring is not None:
            ring = statement.ring
            for place in kind.places(*_ring_box(ring)):
                if lattice.point_in_ring(place.lat, place.lon, ring):
                    yield _element(kind, place)
        elif statement.around is not None:
            radius, lat, lon = statement.around
            for place in kind.places(*_radius_box(lat, lon, radius)):
                if lattice.distance_m(lat, lon, place.lat, place.lon) <= radius:
                    yield _element(kind, place)
        else:
            for place in kind.places(*(statement.box or HOME_BOX)):
                yield _element(kind, place)


def forced_peaks(ring: tuple[tuple[float, float], ...], count: int) -> list[dict[str, Any]]:
    """Exactly `count` named peaks, the nearest to the ring's middle first.

    The box widens until it holds enough. A name that repeats takes a numeral:
    the lattice's names are distinct only within a block of 64 by 32 cells, a
    field this large outgrows one, and the pod merges two rows of one type and
    name, so a repeat would land the field under the count it was forced to.
    """
    south, west, north, east = _ring_box(ring)
    lat0, lon0 = (south + north) / 2, (west + east) / 2
    half = max(north - south, east - west, 0.05) / 2
    while True:
        box = (max(-84.9, lat0 - half), lon0 - half * 1.5, min(84.9, lat0 + half), lon0 + half * 1.5)
        peaks = lattice.peaks_in_bbox(*box)
        if len(peaks) >= count or half > 80:
            break
        half *= 1.5
    peaks.sort(key=lambda p: ((p.lat - lat0) ** 2 + (p.lon - lon0) ** 2, p.osm_id))
    seen: dict[str, int] = {}
    out = []
    for p in peaks[:count]:
        element = _element(KINDS[0], p)
        name = element["tags"]["name"]
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            element["tags"]["name"] = f"{name} {seen[name]}"
        out.append(element)
    return out


def answer(query: str) -> dict[str, Any]:
    """The JSON body Overpass would send for one query.

    Raises `_BadQuery` for text the sim cannot read, which the route answers
    with a 400 the way Overpass refuses a query it cannot parse.
    """
    statements, timeout = parse(query)
    forced = control.current().overpass.candidates
    discovery = any(s.ring is not None for s in statements)
    if forced is not None and discovery:
        ring = next(s.ring for s in statements if s.ring is not None)
        elements = forced_peaks(ring, forced)
    else:
        unique = {(e["type"], e["id"]): e for s in statements for e in _answer(s)}
        elements = [unique[key] for key in sorted(unique, key=lambda k: (_TYPE_ORDER[k[0]], k[1]))]
    kinds = sorted({k.name for s in statements for k in s.kinds})
    question = "discovery" if discovery else "around" if any(s.around for s in statements) else "box"
    log.info(
        "Overpass %s query for %s (timeout %s): %d element(s)%s",
        question,
        ",".join(kinds) or "nothing",
        timeout,
        len(elements),
        " (forced)" if forced is not None and discovery else "",
    )
    return {"version": 0.6, "generator": GENERATOR, "elements": elements}


def _json(body: dict[str, Any]) -> Response:
    text = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    return Response(text.encode(), media_type="application/json")


async def _query_text(request: Request) -> str:
    if request.method == "POST":
        form = parse_qs((await request.body()).decode(), keep_blank_values=True)
        data = form.get("data", [""])[0]
    else:
        data = request.query_params.get("data", "")
    return data


async def _fault(request: Request) -> None:
    """`control.fault("overpass")`, with Overpass's own words where none are given.

    A fault with no `reason` answers the status's phrase as plain text, which
    is the `504 Gateway Timeout` the real server sends when it is too busy. A
    fault of status 200 is the partial answer: the query is read, half its
    elements sent, and the reason rides as the `remark` the pod refuses.
    """
    armed = control.current().faults.get("overpass")
    reason = armed.reason if armed else None
    try:
        await control.fault("overpass")()
    except control.FaultAnswer as exc:
        status = exc.response.status_code
        if status == 200:
            try:
                body = answer(await _query_text(request))
            except _BadQuery:
                body = {"version": 0.6, "generator": GENERATOR, "elements": []}
            body["elements"] = body["elements"][: len(body["elements"]) // 2]
            body["remark"] = reason or "runtime error: Query timed out in \"query\" at line 3 after 25 seconds."
            raise control.FaultAnswer(_json(body)) from None
        if reason is None:
            try:
                phrase = http.HTTPStatus(status).phrase
            except ValueError:
                phrase = "Error"
            retry = {k: v for k, v in exc.response.headers.items() if k.lower() == "retry-after"}
            raise control.FaultAnswer(PlainTextResponse(phrase, status_code=status, headers=retry)) from None
        raise


router = APIRouter(prefix="/overpass", include_in_schema=False)


@router.api_route("/api/interpreter", methods=["GET", "POST"], dependencies=[Depends(_fault)])
async def interpreter(request: Request) -> Response:
    try:
        body = answer(await _query_text(request))
    except _BadQuery as exc:
        log.warning("Refused an Overpass query: %s", exc)
        return PlainTextResponse(BAD_QUERY_TEXT, status_code=400)
    return _json(body)
