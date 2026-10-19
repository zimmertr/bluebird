"""The fill's pure parts: no database, no planet (#760)."""

from __future__ import annotations

import csv
import hashlib
import http.server
import itertools
import re
import threading
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fixture_planet import EXPECTED, write_pbf

import fill
import rules
from conftest import HTTP_PY


def test_lock_key_is_the_apps():
    # Computed with app/db/__init__.py `lock_key` on 2026-10-18. If the app's
    # algorithm changes, the fill's copy must change with it, or a fill would
    # migrate the schema while a starting pod did, each under a lock the other
    # never asks for.
    assert fill.lock_key("schema-migrations") == -6314023549647095855
    assert fill.FILL_LOCK == fill.lock_key("planet-fill") == 3004097570968718113


def test_user_agent_is_the_apps():
    if not HTTP_PY.exists():
        pytest.skip("services/http.py is not beside the suite")
    match = re.search(r'^USER_AGENT = "([^"]+)"', HTTP_PY.read_text(), re.M)
    assert match and match.group(1) == fill.USER_AGENT


def test_state_txt_is_read_from_the_replication_url(tmp_path):
    (tmp_path / "state.txt").write_text("sequenceNumber=4943\ntimestamp=2026-10-18T00\\:00\\:00Z\n")
    assert fill.fetch_state(tmp_path.as_uri() + "/") == (4943, datetime(2026, 10, 18, tzinfo=UTC))


@pytest.mark.parametrize("text", ["", "sequenceNumber=12\n", "<html>Bad gateway</html>"])
def test_an_unreadable_state_txt_fails_the_fill(tmp_path, text):
    (tmp_path / "state.txt").write_text(text)
    with pytest.raises(fill.FillError):
        fill.fetch_state(tmp_path.as_uri())
    with pytest.raises(fill.FillError):
        fill.fetch_state((tmp_path / "missing").as_uri())


@pytest.mark.parametrize(
    ("planet", "expected"),
    [
        # Six whole days before the newest file: file 4937 ends at the planet,
        # so it is the last one wholly inside; one more back is 4936.
        (datetime(2026, 10, 12, tzinfo=UTC), 4936),
        # A planet an hour into the 12th: 4937 still ends inside it.
        (datetime(2026, 10, 12, 0, 59, 58, tzinfo=UTC), 4936),
        # Just before the 12th: only 4936 is wholly inside.
        (datetime(2026, 10, 11, 23, 0, tzinfo=UTC), 4935),
        # A planet newer than the replication state still resumes behind it.
        (datetime(2026, 10, 18, 6, tzinfo=UTC), 4942),
    ],
)
def test_resume_sequence(planet, expected):
    assert fill.resume_sequence(4943, datetime(2026, 10, 18, tzinfo=UTC), planet) == expected


def test_md5_file():
    assert fill.parse_md5("0123456789ABCDEF0123456789abcdef  planet-261012.osm.pbf\n") == "0123456789abcdef" * 2
    for bad in ("", "not-a-digest  planet.osm.pbf", "<html>"):
        with pytest.raises(fill.FillError):
            fill.parse_md5(bad)


def test_is_current():
    filled = datetime(2026, 10, 18, tzinfo=UTC)
    assert fill.is_current(filled, rules.RULES_VERSION, force=False)
    assert not fill.is_current(filled, rules.RULES_VERSION, force=True)
    assert not fill.is_current(None, rules.RULES_VERSION, force=False)
    assert not fill.is_current(filled, rules.RULES_VERSION - 1, force=False)
    assert not fill.is_current(filled, None, force=False)


def test_config_defaults():
    config = fill.Config.from_env({"DATABASE_URL": "postgresql://x/y"})
    assert config.planet_url == fill.DEFAULT_PLANET_URL
    assert config.replication_url == fill.DEFAULT_REPLICATION_URL
    assert config.scratch_dir == Path("/scratch")
    assert config.force is False
    assert config.schema_wait_s == fill.SCHEMA_WAIT_S
    with pytest.raises(fill.FillError):
        fill.Config.from_env({})


# --- The centre pass ------------------------------------------------------------


def test_the_centre_pass_places_every_kept_element(tmp_path):
    # The whole fixture planet stands in for getid's copy: everything any kept
    # element references is in it, and one relation names a member it lacks.
    pbf = write_pbf(tmp_path)
    rows_path = tmp_path / "places.csv"
    kinds, notes = fill.place_elements(pbf, tmp_path / "nodes.idx", rows_path)
    rows = set()
    with rows_path.open(newline="") as handle:
        for element, osm_id, kind, name, ele, rank, point in csv.reader(handle):
            lon, lat = map(float, point.removeprefix("SRID=4326;POINT(").removesuffix(")").split())
            rows.add((element, int(osm_id), kind, name or None, float(ele) if ele else None, int(rank), lon, lat))
    assert rows == EXPECTED
    assert kinds == {"peak": 3, "trailhead": 2, "lake": 2, "crag": 9}
    assert notes == {"relation without geometry": 2, "relation placed through member relations": 1}


def test_csv_fields_round_to_osm_precision():
    row = ("way", 10, "lake", "Lake Serene", None, 0, -121.56499999999, 47.785)
    point = "SRID=4326;POINT(-121.5650000 47.7850000)"
    assert fill.csv_fields(row) == ["way", 10, "lake", "Lake Serene", None, 0, point]


def test_indexes_pair_by_definition():
    old = {
        "places_pkey": "CREATE UNIQUE INDEX places_pkey ON public.places USING btree (osm_type, osm_id)",
        "places_geom": "CREATE INDEX places_geom ON public.places USING gist (geom)",
    }
    new = {
        "places_new_geom_idx": "CREATE INDEX places_new_geom_idx ON public.places_new USING gist (geom)",
        "places_new_pkey": "CREATE UNIQUE INDEX places_new_pkey ON public.places_new USING btree (osm_type, osm_id)",
    }
    assert fill.pair_indexes(old, new) == {"places_new_pkey": "places_pkey", "places_new_geom_idx": "places_geom"}
    with pytest.raises(fill.FillError):
        fill.pair_indexes(old, {"places_new_pkey": new["places_new_pkey"]})
    with pytest.raises(fill.FillError):
        fill.pair_indexes({"places_pkey": old["places_pkey"]}, new)


# --- The candidate filters cover every rule -------------------------------------

_CONDITION = re.compile(r'\[(!?)"([^"]+)"(?:(=|~)"([^"]+)")?\]')
_ALTERNATION = re.compile(r"\^\(([^()]+)\)\$")
# Values to try against a pattern that is not a plain list of words: today only
# the trailhead lot's name pattern.
_SAMPLES = ("Lost Lake", "Lost Trailhead", "Lost Trail Head")


def _vocabulary() -> tuple[dict[str, set[str | None]], set[str]]:
    """Every value the clauses name for every key they name, plus absent.

    Also the keys the clauses only ever require absent (the gym and business
    keys), which are tried one at a time rather than in every combination: all
    32 combinations of five such keys would make this test slow for nothing.
    """
    values: dict[str, set[str | None]] = {}
    required: set[str] = set()
    clauses = [c for group in rules.CLAUSES.values() for c in group] + list(rules.UNNAMED_PEAK_CLAUSES)
    for clause in clauses:
        for negated, key, op, value in _CONDITION.findall(clause):
            seen = values.setdefault(key, {None})
            if not negated:
                required.add(key)
            if negated or not op:
                seen.add("yes" if key != "name" else "Lost Lake")
            elif op == "=":
                seen.add(value)
            elif alternation := _ALTERNATION.fullmatch(value):
                seen.update(alternation.group(1).split("|"))
            else:
                seen.update(_SAMPLES)
    return values, set(values) - required


def _tag_sets():
    values, absent_only = _vocabulary()
    keys = sorted(set(values) - absent_only)
    extras = [{}] + [{key: "yes"} for key in sorted(absent_only)]
    for combo in itertools.product(*(sorted(values[k], key=str) for k in keys)):
        tags = {k: v for k, v in zip(keys, combo, strict=True) if v is not None}
        for extra in extras:
            yield {**tags, **extra}


def _matches(expression: str, element: str, tags: dict[str, str]) -> bool:
    """osmium tags-filter's reading of one `types/key=v1,v2` expression."""
    types, _, condition = expression.partition("/")
    key, _, wanted = condition.partition("=")
    if element[0] not in types or key not in tags:
        return False
    return not wanted or tags[key] in wanted.split(",")


def test_candidate_filters_keep_everything_the_rules_keep():
    values, absent_only = _vocabulary()
    # The clauses name these, so a vocabulary without them means the parsing
    # above broke rather than the filters being right.
    assert {"natural", "name", "ele", "sport", "climbing", "amenity", "highway", "water", "type"} <= set(values)
    assert {"leisure", "tourism"} <= absent_only
    missed = []
    checked = 0
    tag_sets = list(_tag_sets())
    for element in ("node", "way", "relation"):
        for tags in tag_sets:
            if rules.classify(element, tags) is None:
                continue
            checked += 1
            if not any(_matches(e, element, tags) for e in fill.CANDIDATE_FILTERS):
                missed.append((element, tags))
    assert checked > 1000
    assert not missed, f"kept by the rules, dropped by the filters: {missed[:5]}"


# --- Download -------------------------------------------------------------------


class _Planet(http.server.BaseHTTPRequestHandler):
    body = bytes(range(256)) * 4096  # 1 MB
    honour_range = True
    drop_first = True
    requests: list[str | None] = []

    def do_GET(self):  # noqa: N802  http.server's name
        cls = type(self)
        cls.requests.append(self.headers.get("Range"))
        start = 0
        ranged = self.headers.get("Range")
        if ranged and cls.honour_range:
            start = int(ranged.split("=")[1].rstrip("-"))
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{len(cls.body) - 1}/{len(cls.body)}")
        else:
            self.send_response(200)
        self.send_header("Content-Length", str(len(cls.body) - start))
        self.end_headers()
        if cls.drop_first:
            cls.drop_first = False
            self.wfile.write(cls.body[start : start + 300_000])
            return
        self.wfile.write(cls.body[start:])

    def log_message(self, *args):
        pass


@pytest.fixture
def planet_server(monkeypatch):
    monkeypatch.setattr(fill.time, "sleep", lambda s: None)
    _Planet.requests = []
    _Planet.drop_first = True
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Planet)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/planet.osm.pbf"
    server.shutdown()


def test_a_dropped_download_resumes_where_it_stopped(planet_server, tmp_path):
    _Planet.honour_range = True
    dest = tmp_path / "planet.osm.pbf"
    digest = fill.download(planet_server, dest)
    assert dest.read_bytes() == _Planet.body
    assert digest == hashlib.md5(_Planet.body).hexdigest()
    assert _Planet.requests == [None, "bytes=300000-"]


def test_a_server_that_ignores_the_range_starts_over(planet_server, tmp_path):
    _Planet.honour_range = False
    dest = tmp_path / "planet.osm.pbf"
    digest = fill.download(planet_server, dest)
    assert dest.read_bytes() == _Planet.body
    assert digest == hashlib.md5(_Planet.body).hexdigest()


def test_content_total():
    assert fill.content_total({"Content-Length": "100"}, 0) == 100
    assert fill.content_total({"Content-Range": "bytes 40-99/100", "Content-Length": "60"}, 40) == 100
    assert fill.content_total({}, 0) is None
