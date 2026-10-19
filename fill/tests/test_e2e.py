"""The whole fill against a hand-written planet and a real database (#760).

The planet is fixture_planet.py's few dozen elements around Index, Washington,
turned into a PBF by the image's own osmium with a replication timestamp in
its header, the way the real planet carries one. The fill runs as the
CronJob runs it, as `python3 fill.py` with its settings in the environment,
reading the planet and the replication state from file URLs.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fixture_planet import EXPECTED, write_pbf

import fill
import rules

pytestmark = pytest.mark.db

STATE = "#Sat Oct 18 00:21:04 UTC 2026\nsequenceNumber=4943\ntimestamp=2026-10-18T00\\:00\\:00Z\n"
# 5.96 days between them, so six files back from 4943, and one more on purpose.
SEQUENCE = 4936


@pytest.fixture(scope="module")
def planet(tmp_path_factory) -> Path:
    """The planet PBF with its .md5 beside it, and a replication directory."""
    root = tmp_path_factory.mktemp("upstream")
    pbf = write_pbf(root)
    digest = hashlib.md5(pbf.read_bytes()).hexdigest()
    (root / "planet.osm.pbf.md5").write_text(f"{digest}  planet-261012.osm.pbf\n")
    (root / "replication").mkdir()
    (root / "replication" / "state.txt").write_text(STATE)
    return pbf


def run_fill(dsn: str, scratch: Path, planet_url: str, replication_url: str, **extra: str):
    env = {
        "PATH": os.environ["PATH"],
        "DATABASE_URL": dsn,
        "SCRATCH_DIR": str(scratch),
        "PLANET_URL": planet_url,
        "REPLICATION_URL": replication_url,
        "SCHEMA_WAIT_S": "1",
        **extra,
    }
    return subprocess.run(
        [sys.executable, fill.__file__], env=env, capture_output=True, text=True, timeout=120, check=False
    )


def urls(planet: Path) -> tuple[str, str]:
    return planet.as_uri(), (planet.parent / "replication").as_uri()


def query(dsn: str, sql: str, *args: object) -> list[tuple]:
    import psycopg2

    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql, args)
        rows = cur.fetchall() if cur.description else []
    conn.close()
    return rows


def execute(dsn: str, *statements: str) -> None:
    import psycopg2

    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    with conn.cursor() as cur:
        for statement in statements:
            cur.execute(statement)
    conn.close()


def places(dsn: str) -> set[tuple]:
    rows = query(
        dsn,
        "SELECT osm_type, osm_id, kind, name, ele_ft, rank, round(ST_X(geom)::numeric, 7)::float8,"
        " round(ST_Y(geom)::numeric, 7)::float8 FROM places",
    )
    return {tuple(r) for r in rows}


STALE = (
    "INSERT INTO places (osm_type, osm_id, kind, name, rank, geom)"
    " VALUES ('node', 999, 'peak', 'Stale Peak', 0, ST_SetSRID(ST_MakePoint(0, 0), 4326))"
)


def test_a_fill_builds_the_table_swaps_it_in_and_is_then_current(database, planet, tmp_path):
    execute(
        database,
        STALE,
        "INSERT INTO places_pending (osm_type, osm_id) VALUES ('way', 77)",
        "GRANT SELECT ON places TO fill_reader",
    )
    planet_url, replication_url = urls(planet)

    done = run_fill(database, tmp_path, planet_url, replication_url)
    assert done.returncode == 0, done.stderr
    assert "MD5 matches" in done.stderr
    assert "relation without geometry 2" in done.stderr
    assert places(database) == EXPECTED

    (filled_at, planet_ts, version, sequence) = query(
        database, "SELECT filled_at, planet_timestamp, rules_version, sequence FROM osm_state"
    )[0]
    assert filled_at is not None
    assert planet_ts == datetime(2026, 10, 12, 0, 59, 58, tzinfo=UTC)
    assert version == rules.RULES_VERSION
    assert sequence == SEQUENCE
    assert query(database, "SELECT count(*) FROM places_pending") == [(0,)]

    # The swapped-in table carries the migration's names, grants and nothing else.
    assert set(query(database, "SELECT indexname FROM pg_indexes WHERE tablename = 'places'")) == {
        ("places_pkey",),
        ("places_geom",),
    }
    primary = "SELECT conname FROM pg_constraint WHERE conrelid = 'places'::regclass AND contype = 'p'"
    assert query(database, primary) == [("places_pkey",)]
    assert query(database, "SELECT to_regclass('places_new'), to_regclass('places_old')") == [(None, None)]
    assert query(database, "SELECT has_table_privilege('fill_reader', 'places', 'SELECT')") == [(True,)]
    assert not (tmp_path / "bluebird-fill").exists()

    # Current now: a second run reads no planet, and this URL has none to read.
    again = run_fill(database, tmp_path, planet_url + ".gone", replication_url + ".gone")
    assert again.returncode == 0, again.stderr
    assert "places are current" in again.stderr
    assert "Downloaded" not in again.stderr

    # FORCE_FILL refills and lands on the same rows.
    forced = run_fill(database, tmp_path, planet_url, replication_url, FORCE_FILL="1")
    assert forced.returncode == 0, forced.stderr
    assert places(database) == EXPECTED
    assert query(database, "SELECT filled_at > %s FROM osm_state", filled_at) == [(True,)]


def test_a_rules_version_change_refills(database, planet, tmp_path):
    execute(database, f"UPDATE osm_state SET filled_at = now(), rules_version = {rules.RULES_VERSION - 1}")
    planet_url, replication_url = urls(planet)
    done = run_fill(database, tmp_path, planet_url, replication_url)
    assert done.returncode == 0, done.stderr
    assert f"filled under rules version {rules.RULES_VERSION - 1}" in done.stderr
    assert query(database, "SELECT rules_version FROM osm_state") == [(rules.RULES_VERSION,)]


def test_a_failed_download_leaves_the_live_table_alone(database, planet, tmp_path):
    execute(database, STALE)
    bad = tmp_path / "upstream"
    bad.mkdir()
    copy = bad / "planet.osm.pbf"
    copy.write_bytes(planet.read_bytes())
    (bad / "planet.osm.pbf.md5").write_text("0" * 32 + "  planet-261012.osm.pbf\n")
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    done = run_fill(database, scratch, copy.as_uri(), urls(planet)[1])
    assert done.returncode == 1
    assert "MD5" in done.stderr
    assert places(database) == {("node", 999, "peak", "Stale Peak", None, 0, 0.0, 0.0)}
    assert query(database, "SELECT filled_at FROM osm_state") == [(None,)]
    assert not (scratch / "bluebird-fill").exists()


def test_a_swap_that_fails_part_way_changes_nothing(database, planet, tmp_path, monkeypatch):
    execute(database, STALE, "INSERT INTO places_pending (osm_type, osm_id) VALUES ('way', 77)")
    real = fill.swap

    def swap_then_fail(cur, *args):
        real(cur, *args)
        raise RuntimeError("the pod was killed")

    monkeypatch.setattr(fill, "swap", swap_then_fail)
    planet_url, replication_url = urls(planet)
    config = fill.Config(database, tmp_path, planet_url, replication_url, False, 1.0)
    with pytest.raises(RuntimeError):
        fill.run(config)
    assert places(database) == {("node", 999, "peak", "Stale Peak", None, 0, 0.0, 0.0)}
    assert query(database, "SELECT count(*) FROM places_pending") == [(1,)]
    assert query(database, "SELECT filled_at FROM osm_state") == [(None,)]
    assert query(database, "SELECT to_regclass('places_new'), to_regclass('places_old')") == [(None, None)]


def test_a_second_fill_leaves_the_work_to_the_first(database, planet, tmp_path):
    import psycopg2

    holder = psycopg2.connect(database)
    holder.autocommit = True
    with holder.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s)", (fill.FILL_LOCK,))
    try:
        planet_url, replication_url = urls(planet)
        done = run_fill(database, tmp_path, planet_url, replication_url)
    finally:
        holder.close()
    assert done.returncode == 0, done.stderr
    assert "Another fill holds the planet-fill lock" in done.stderr
    assert query(database, "SELECT filled_at FROM osm_state") == [(None,)]


def test_no_schema_is_waited_for_and_then_a_failure(bare_database, planet, tmp_path):
    planet_url, replication_url = urls(planet)
    done = run_fill(bare_database, tmp_path, planet_url, replication_url)
    assert done.returncode == 1
    assert "the osm_state table does not exist yet" in done.stderr
    assert "Downloaded" not in done.stderr
