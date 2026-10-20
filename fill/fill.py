"""The planet fill: the shared cache's places table, built from OpenStreetMap (#760).

A weekly CronJob runs this in its own image (fill/Dockerfile) with a scratch
volume at SCRATCH_DIR. On most runs it only checks: the places table was filled
under this release's `rules.RULES_VERSION`, so it exits without downloading
anything. Otherwise it fills: it downloads the planet file, keeps what the app's
own rules keep, and swaps a new table in under the live one in one transaction,
so a failure at any step leaves the live table as it was.

The pipeline, validated against Overpass on Washington's extract on 2026-10-18
(identical sets and positions, 0.0 m apart):

1. `osmium tags-filter -R` keeps every element carrying a tag some rule reads
   (CANDIDATE_FILTERS), without the objects they reference.
2. A pass over those candidates asks `rules.classify` which to keep and writes
   their ids.
3. `osmium getid -r` copies those elements out of the planet with everything
   they reference: a lake's ways and their nodes, an area's crags.
4. A pass over that copy places each element at the centre of its bounding
   box, which is what Overpass's `out center` gives, following relations made
   of other relations.

The planet is read more than once because a lake's points come before the lake
in the file, and the points go to an on-disk index because a Python dict of
them would take tens of GB.

The daily update (services/places/update.py) keeps the table current from
OpenStreetMap's change files, starting after the sequence this writes to
osm_state.

Standard library plus pyosmium and psycopg2, which Debian packages: the image
carries none of the app's dependencies, so `rules.py` is copied in beside this
file rather than imported from the app.
"""

from __future__ import annotations

import csv
import hashlib
import http.client
import logging
import math
import os
import re
import resource
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import IO, Any

import rules

log = logging.getLogger("bluebird_forecast.fill")

DEFAULT_PLANET_URL = "https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf"
DEFAULT_REPLICATION_URL = "https://planet.openstreetmap.org/replication/day"

# The app's identity (services/http.py USER_AGENT), spelled again because this
# image cannot import the app; tests/test_fill.py holds the two together.
USER_AGENT = "BluebirdForecast/1.0 (bluebirdforecast.com; personal weather tool)"

# osmium tags-filter expressions selecting a superset of what `rules` keeps:
# anything a clause in rules.CLAUSES or rules.UNNAMED_PEAK_CLAUSES matches
# carries one of these tags. They are wider than the rules (a parking lot of
# any name, a lake with no `natural=water`, a summit with neither name nor
# `ele`) because tags-filter cannot test a name against a pattern or a key for
# absence, and `rules.classify` decides in the next step anyway. The
# `climbing=` line is for crags tagged with no `sport` (Hag Crag); every other
# crag clause needs `sport=climbing`. tests/test_fill.py checks the superset
# over every combination of the tags the clauses name, so a rule that starts
# reading a new tag fails there rather than quietly finding nothing.
CANDIDATE_FILTERS = (
    "n/natural=peak,volcano",
    "nw/highway=trailhead",
    "nwr/amenity=parking",
    "nwr/water=lake",
    "nwr/sport=climbing",
    "nwr/climbing=" + ",".join(rules.CRAG_SUBTYPES),
)

OSM_TYPES = {"n": "node", "w": "way", "r": "relation"}

# How long CHECK waits for the app's migrations to create osm_state. The fill
# and the app's first pod can start together on a new database; ten minutes
# covers a pod still pulling its image.
SCHEMA_WAIT_S = 600.0
SCHEMA_POLL_S = 10.0
# How often KeepAlive sends a statement on the lock's connection while the
# pipeline runs. Istio's sidecar closes a TCP connection that carries no bytes
# for an hour, the mesh's default idle timeout, and the TCP keepalives
# `connect` sets carry none. The first production fill, 2026-10-20, held the
# connection idle from the state read to the load, 82 minutes, and died at the
# load's first statement: SSL SYSCALL error: EOF detected. Five minutes is far
# under the hour and costs nothing.
KEEPALIVE_S = 300.0

DOWNLOAD_ATTEMPTS = 5
DOWNLOAD_CHUNK = 8 << 20
# 95 GB takes most of an hour; a line every half minute shows it moving
# without burying the rest of the log.
PROGRESS_EVERY_S = 30.0
# Room for what the steps after the download write. The candidates and
# getid's copy came to 1% of Washington's extract, and the node index holds
# 16 bytes for each point those keep.
SCRATCH_MARGIN = 0.10

# How long the swap waits for the live table's lock before giving way. Every
# search reads `places`, and a rename queued behind a long reader holds up
# every search that arrives after it, so the swap backs off and tries again.
SWAP_LOCK_TIMEOUT = "10s"
SWAP_ATTEMPTS = 6


class FillError(Exception):
    """A failure whose message says it all; logged without a traceback."""


class _Retry(Exception):
    """A download attempt that ended early and may resume."""


@dataclass(frozen=True)
class Config:
    database_url: str
    scratch_dir: Path
    planet_url: str
    replication_url: str
    force: bool
    schema_wait_s: float

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> Config:
        url = env.get("DATABASE_URL", "").strip()
        if not url:
            raise FillError("DATABASE_URL is not set")
        return cls(
            database_url=url,
            scratch_dir=Path(env.get("SCRATCH_DIR", "").strip() or "/scratch"),
            planet_url=env.get("PLANET_URL", "").strip() or DEFAULT_PLANET_URL,
            replication_url=env.get("REPLICATION_URL", "").strip() or DEFAULT_REPLICATION_URL,
            force=env.get("FORCE_FILL", "").strip().lower() in ("1", "true", "yes"),
            schema_wait_s=float(env.get("SCHEMA_WAIT_S", "").strip() or SCHEMA_WAIT_S),
        )


# --- Pure parts: no database, no osmium, no network --------------------------


def lock_key(name: str) -> int:
    """The app's advisory-lock key for a name (`lock_key` in app/db/__init__.py).

    Copied rather than imported, since the image has no app: blake2b over the
    name, 8 bytes, read big-endian and signed. The two must agree or the lock
    excludes nothing, so tests/test_fill.py pins the number.
    """
    digest = hashlib.blake2b(name.encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=True)


FILL_LOCK = lock_key("planet-fill")


def is_current(filled_at: datetime | None, rules_version: int | None, *, force: bool) -> bool:
    """True when the places table needs no fill: it was filled under these rules.

    A new RULES_VERSION means a rule changed what is kept, and the daily update
    applies a rule only to what it edits, so the whole table is rebuilt.
    """
    return not force and filled_at is not None and rules_version == rules.RULES_VERSION


def parse_md5(text: str) -> str:
    """The digest from a published `.md5` file ("<hex>  <file name>")."""
    fields = text.split()
    if not fields or not re.fullmatch(r"[0-9a-fA-F]{32}", fields[0]):
        raise FillError(f"the .md5 file does not start with an MD5 digest: {text[:80]!r}")
    return fields[0].lower()


def resume_sequence(latest_sequence: int, latest_timestamp: datetime, planet_timestamp: datetime) -> int:
    """The daily change file the update is to treat as the last one applied.

    Day files are numbered one a day, so counting back from the newest by the
    days between it and the planet, rounded up, finds the last file wholly
    inside the planet. One more day back is on purpose: replaying a change the
    planet already holds rewrites the same row, while a missed one stays wrong
    until someone edits that feature again.
    """
    days = (latest_timestamp - planet_timestamp) / timedelta(days=1)
    return latest_sequence - math.ceil(days) - 1


def csv_fields(row: rules.Row) -> list[object]:
    """One COPY line: EWKT for the point, at the seven decimals OSM stores."""
    element, osm_id, kind, name, ele, rank, lon, lat = row
    return [element, osm_id, kind, name, ele, rank, f"SRID=4326;POINT({lon:.7f} {lat:.7f})"]


def pair_indexes(old: Mapping[str, str], new: Mapping[str, str]) -> dict[str, str]:
    """{new index name: old index name}, matched by what each index is.

    `CREATE TABLE ... (LIKE places INCLUDING ALL)` names the copy's indexes
    itself (places_new_pkey, places_new_geom_idx), where the migration named
    them places_pkey and places_geom. Matching on the definition rather than
    on those two names keeps the swap right when a later migration adds an
    index. The values are pg_get_indexdef's text.
    """

    def shape(definition: str) -> str:
        return re.sub(r"^CREATE (UNIQUE )?INDEX \S+ ON \S+ ", r"\1", definition)

    by_shape = {shape(d): name for name, d in old.items()}
    pairs: dict[str, str] = {}
    for name, definition in new.items():
        match = by_shape.pop(shape(definition), None)
        if match is None:
            raise FillError(f"index {name} on the new table has no counterpart on places")
        pairs[name] = match
    if by_shape:
        raise FillError(f"places has indexes the new table lacks: {sorted(by_shape.values())}")
    return pairs


def human_bytes(n: float) -> str:
    if n < 1024:
        return f"{int(n)} B"
    for unit in ("KB", "MB", "GB"):
        n /= 1024
        if n < 1024 or unit == "GB":
            break
    return f"{n:.1f} {unit}"


def summary(counts: Mapping[str, int]) -> str:
    return ", ".join(f"{key} {value:,}" for key, value in sorted(counts.items())) or "nothing"


# --- Steps ---------------------------------------------------------------------


def peak_rss_mb() -> float:
    """This process's peak resident memory so far (Linux counts in KB)."""
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


@contextmanager
def step(name: str) -> Iterator[None]:
    started = time.monotonic()
    log.info("Step %s: starting", name)
    yield
    log.info(
        "Step %s: done in %.1f s (fill process peak RSS so far %.0f MB)",
        name,
        time.monotonic() - started,
        peak_rss_mb(),
    )


def run_tool(name: str, args: Sequence[str], *, missing_ok: bool = False) -> None:
    """Run one osmium command and log its own time and peak memory.

    wait4 rather than subprocess.run because it hands back the child's own
    resource use, and `osmium getid -r`'s peak (3.6 GB on Washington) is the
    number a cluster worker has to hold. `missing_ok` accepts `osmium getid`'s
    exit 1, which says some id it looked for is not in the file: the ids it was
    given all came from that file, so only a member a relation names and the
    file lacks can be missing, and that member simply adds nothing to a box.
    """
    log.info("Step %s: %s", name, " ".join(args))
    started = time.monotonic()
    proc = subprocess.Popen(args)
    _, status, usage = os.wait4(proc.pid, 0)
    proc.returncode = code = os.waitstatus_to_exitcode(status)
    log.info(
        "Step %s: exit %d in %.1f s, peak RSS %.0f MB",
        name,
        code,
        time.monotonic() - started,
        usage.ru_maxrss / 1024,
    )
    if code == 1 and missing_ok:
        log.warning("Step %s: some referenced objects are not in the file; placing without them", name)
    elif code != 0:
        raise FillError(f"`{' '.join(args[:2])}` exited with {code}")


def _open(url: str, headers: Mapping[str, str] | None = None, timeout_s: float = 120.0) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    return urllib.request.urlopen(request, timeout=timeout_s)


def fetch_text(url: str) -> str:
    try:
        with _open(url, timeout_s=60.0) as response:
            return response.read(1 << 20).decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, http.client.HTTPException) as exc:
        raise FillError(f"could not read {url}: {exc}") from exc


def fetch_state(replication_url: str) -> tuple[int, datetime]:
    try:
        sequence, stamp = rules.parse_state(fetch_text(replication_url.rstrip("/") + "/state.txt"))
    except ValueError as exc:
        raise FillError(str(exc)) from exc
    log.info("Daily replication is at sequence %d (%s)", sequence, stamp.isoformat())
    return sequence, stamp


def local_path(url: str) -> Path | None:
    parsed = urllib.parse.urlparse(url)
    return Path(urllib.request.url2pathname(parsed.path)) if parsed.scheme == "file" else None


def published_md5(url: str) -> str | None:
    """The digest published beside the planet, or None for a local file with none.

    Every planet mirror publishes one. A file URL is how the tests and a
    measurement run feed the fill, and those may come without.
    """
    local = local_path(url + ".md5")
    if local is not None and not local.exists():
        log.warning("No %s beside the local planet file; not verifying it", local.name)
        return None
    return parse_md5(fetch_text(url + ".md5"))


def content_total(headers: Mapping[str, str], offset: int) -> int | None:
    """The whole file's size, from a 206's Content-Range or a 200's Content-Length."""
    ranged = headers.get("Content-Range")
    if ranged and "/" in ranged:
        tail = ranged.rsplit("/", 1)[1].strip()
        return int(tail) if tail.isdigit() else None
    length = headers.get("Content-Length")
    return offset + int(length) if length and length.isdigit() else None


def check_scratch(directory: Path, size: int) -> None:
    free = shutil.disk_usage(directory).free
    need = int(size * (1 + SCRATCH_MARGIN))
    if free < need:
        raise FillError(f"scratch has {human_bytes(free)} free and the planet needs about {human_bytes(need)}")


def copy_stream(response: IO[bytes], out: IO[bytes], digest: Any, got: int, total: int | None) -> int:
    started = last = time.monotonic()
    first = got
    while block := response.read(DOWNLOAD_CHUNK):
        out.write(block)
        digest.update(block)
        got += len(block)
        now = time.monotonic()
        if now - last >= PROGRESS_EVERY_S:
            last = now
            rate = (got - first) / max(now - started, 1e-9)
            share = f" of {human_bytes(total)} ({100 * got / total:.1f}%)" if total else ""
            log.info("Downloaded %s%s at %s/s", human_bytes(got), share, human_bytes(rate))
    return got


def download(url: str, dest: Path) -> str:
    """Stream `url` to `dest`, resuming after a dropped connection; its MD5.

    Most of an hour on one connection will see a reset now and then, so a
    failed attempt carries on with a Range request from the byte it reached.
    A server that ignores the Range answers 200, and the file starts over.
    """
    digest = hashlib.md5(usedforsecurity=False)
    got = 0
    total: int | None = None
    for attempt in range(1, DOWNLOAD_ATTEMPTS + 1):
        try:
            with _open(url, {"Range": f"bytes={got}-"} if got else None) as response, dest.open("ab") as out:
                if got and (getattr(response, "status", None) or 200) != 206:
                    log.warning("The server ignored the resume request; downloading from the start")
                    got = 0
                    digest = hashlib.md5(usedforsecurity=False)
                    out.truncate(0)
                total = content_total(response.headers, got) or total
                if attempt == 1 and total:
                    check_scratch(dest.parent, total)
                got = copy_stream(response, out, digest, got, total)
            if total is not None and got != total:
                raise _Retry(f"the connection closed at {got:,} of {total:,} bytes")
            return digest.hexdigest()
        except urllib.error.HTTPError as exc:
            if 400 <= exc.code < 500 and exc.code not in (408, 429):
                raise FillError(f"could not download {url}: HTTP {exc.code}") from exc
            failure: Exception = exc
        except (_Retry, urllib.error.URLError, OSError, http.client.HTTPException) as exc:
            failure = exc
        if attempt == DOWNLOAD_ATTEMPTS:
            raise FillError(f"could not download {url} in {attempt} attempts: {failure}")
        wait = min(30 * attempt, 300)
        log.warning(
            "Download attempt %d stopped at %s (%s); retrying in %d s", attempt, human_bytes(got), failure, wait
        )
        time.sleep(wait)
    raise AssertionError("unreachable")


def download_planet(url: str, dest: Path) -> None:
    expected = published_md5(url)
    started = time.monotonic()
    actual = download(url, dest)
    elapsed = max(time.monotonic() - started, 1e-9)
    size = dest.stat().st_size
    log.info("Downloaded %s in %.0f s (%s/s)", human_bytes(size), elapsed, human_bytes(size / elapsed))
    if expected is None:
        return
    if actual != expected:
        # The planet is republished weekly under one name, so a digest read
        # before a long download can be the previous week's: ask once more.
        again = published_md5(url)
        if actual != again:
            raise FillError(f"the planet's MD5 is {actual}; {url}.md5 said {expected}, then {again}")
        expected = again
    log.info("MD5 matches the published %s", expected)


def planet_timestamp(planet: Path) -> datetime:
    """The replication timestamp in the planet's header: what it is current to."""
    out = subprocess.run(
        ["osmium", "fileinfo", "-g", "header.option.osmosis_replication_timestamp", str(planet)],
        capture_output=True,
        text=True,
        check=False,
    )
    value = out.stdout.strip()
    if out.returncode != 0 or not value:
        raise FillError(
            "the planet's header carries no osmosis_replication_timestamp, so there is no "
            f"change file to resume from ({out.stderr.strip() or 'empty'})"
        )
    try:
        return rules.parse_timestamp(value)
    except ValueError as exc:
        raise FillError(f"unreadable planet timestamp {value!r}") from exc


def keep_ids(candidates: Path, ids_path: Path) -> Counter[str]:
    """Write `osmium getid`'s id list ("n123", "w45") for what the rules keep."""
    import osmium

    counts: Counter[str] = Counter()
    with ids_path.open("w") as out:
        for obj in osmium.FileProcessor(str(candidates)):
            letter = obj.type_str()
            kept = rules.classify(OSM_TYPES[letter], obj.tags)
            if kept is not None:
                out.write(f"{letter}{obj.id}\n")
                counts[kept[0]] += 1
    return counts


def place_elements(ours: Path, index_path: Path, rows_path: Path) -> tuple[Counter[str], Counter[str]]:
    """Write a COPY row per kept element in `ours`: (rows per kind, notes).

    Node locations go to an on-disk sparse index rather than a dict (41 MB for
    Washington's whole pass). Ways keep a box each, since a relation's box is
    built from its members', and relations keep their member lists to the end
    of the file, because a member relation can come after the one holding it.
    """
    import osmium

    nodes = osmium.index.create_map(f"sparse_file_array,{index_path}")

    def node_at(ref: int) -> tuple[float, float] | None:
        try:
            loc = nodes.get(ref)
        except KeyError:
            return None
        return (loc.lon, loc.lat) if loc.valid() else None

    kinds: Counter[str] = Counter()
    notes: Counter[str] = Counter()
    way_boxes: dict[int, rules.Box] = {}
    members: dict[int, tuple[tuple[str, int], ...]] = {}
    held: list[rules.Row] = []

    with rows_path.open("w", newline="") as handle:
        out = csv.writer(handle)

        def emit(row: rules.Row, point: tuple[float, float]) -> None:
            out.writerow(csv_fields((*row[:6], *point)))  # type: ignore[arg-type]
            kinds[row[2]] += 1

        for obj in osmium.FileProcessor(str(ours)):
            if obj.is_node():
                location = obj.location
                if not location.valid():
                    continue
                nodes.set(obj.id, location)
                if len(obj.tags):
                    row = rules.place_row("node", obj.id, obj.tags, (0.0, 0.0))
                    if row is not None:
                        emit(row, (location.lon, location.lat))
            elif obj.is_way():
                box: rules.Box | None = None
                for ref in obj.nodes:
                    point = node_at(ref.ref)
                    if point is not None:
                        box = rules.extend(box, *point)
                row = rules.place_row("way", obj.id, obj.tags, (0.0, 0.0))
                if box is None:
                    if row is not None:
                        notes["way without geometry"] += 1
                    continue
                way_boxes[obj.id] = box
                if row is not None:
                    emit(row, rules.centre(box))
            elif obj.is_relation():
                members[obj.id] = tuple((m.type, m.ref) for m in obj.members)
                row = rules.place_row("relation", obj.id, obj.tags, (0.0, 0.0))
                if row is not None:
                    held.append(row)

        boxes = rules.relation_boxes(members, node_at, way_boxes)
        for row in held:
            box = boxes.get(row[1])
            if box is None:
                notes["relation without geometry"] += 1
                continue
            if members[row[1]] and all(kind == "r" for kind, _ in members[row[1]]):
                notes["relation placed through member relations"] += 1
            emit(row, rules.centre(box))
    return kinds, notes


# --- Database ------------------------------------------------------------------


def connect(url: str) -> Any:
    import psycopg2

    # Keepalives for the hours the lock's connection sits idle while the
    # pipeline runs: a connection a middlebox forgets is a lock let go. Not
    # enough on their own, since a keepalive carries no bytes and a mesh proxy
    # counts bytes (KeepAlive below).
    conn = psycopg2.connect(
        url,
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=60,
        keepalives_interval=10,
        keepalives_count=6,
        application_name="bluebird-forecast-fill",
    )
    conn.autocommit = True
    return conn


def wait_for_schema(url: str, wait_s: float) -> Any:
    """A connection once osm_state exists, waiting up to `wait_s` for it.

    The app's migrations create the table, and on a new database the fill can
    start before any pod has run them.
    """
    import psycopg2

    deadline = time.monotonic() + wait_s
    while True:
        try:
            conn = connect(url)
            with conn.cursor() as cur:
                cur.execute("SELECT to_regclass('osm_state') IS NOT NULL")
                if cur.fetchone()[0]:
                    return conn
            conn.close()
            reason = "the osm_state table does not exist yet"
        except psycopg2.OperationalError as exc:
            reason = f"cannot connect: {str(exc).strip()}"
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise FillError(
                f"gave up after {wait_s:.0f} s: {reason}. The app's migrations create it "
                "when a pod first starts against this database"
            )
        log.info("Waiting for the shared cache's schema (%s)", reason)
        time.sleep(min(SCHEMA_POLL_S, remaining))


class KeepAlive:
    """`SELECT 1` on `conn` every `every_s` seconds, on a thread, until the block ends.

    psycopg2 serializes the statements on a connection and the block runs none
    on this one, so the thread has it to itself. A statement that fails ends
    the thread, and the failure is raised when the block ends, unless the
    block raised first: the connection, and the lock it held, are gone either
    way, and the load would find that out an hour of osmium later.
    """

    def __init__(self, conn: Any, every_s: float = KEEPALIVE_S) -> None:
        self._conn = conn
        self._every_s = every_s
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="fill-keepalive", daemon=True)
        self.error: Exception | None = None

    def __enter__(self) -> KeepAlive:
        self._thread.start()
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self._stop.set()
        self._thread.join()
        if self.error is not None and exc is None:
            raise FillError("the database connection was lost while the planet was processed") from self.error

    def _run(self) -> None:
        while not self._stop.wait(self._every_s):
            try:
                with self._conn.cursor() as cur:
                    cur.execute("SELECT 1")
            except Exception as exc:  # noqa: BLE001  raised on the main thread when the block ends
                self.error = exc
                return


def read_state(conn: Any) -> tuple[datetime | None, int | None]:
    with conn.cursor() as cur:
        cur.execute("SELECT filled_at, rules_version FROM osm_state WHERE id")
        row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)


def table_indexes(cur: Any, table: str) -> dict[str, str]:
    cur.execute(
        "SELECT c.relname, pg_get_indexdef(i.indexrelid) FROM pg_index i"
        " JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = %s::regclass",
        (table,),
    )
    return dict(cur.fetchall())


def load_and_swap(conn: Any, rows_path: Path, planet_ts: datetime, sequence: int) -> int:
    """Load the rows into a copy of places and swap it in; the row count.

    One transaction from CREATE to COMMIT, so a failure anywhere leaves the
    live table and osm_state as they were and no copy behind. The swap runs
    under a savepoint with a short lock timeout, so it gives way to searches
    holding the table and tries again rather than queueing them.
    """
    from psycopg2 import errors

    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS places_new")
            cur.execute("CREATE TABLE places_new (LIKE places INCLUDING ALL)")
            with rows_path.open() as handle:
                cur.copy_expert(
                    "COPY places_new (osm_type, osm_id, kind, name, ele_ft, rank, geom)"
                    " FROM STDIN WITH (FORMAT csv)",
                    handle,
                )
            cur.execute("SELECT count(*) FROM places_new")
            count = int(cur.fetchone()[0])
            cur.execute("ANALYZE places_new")
            renames = pair_indexes(table_indexes(cur, "places"), table_indexes(cur, "places_new"))
            for attempt in range(1, SWAP_ATTEMPTS + 1):
                cur.execute("SAVEPOINT swap")
                try:
                    cur.execute(f"SET LOCAL lock_timeout = '{SWAP_LOCK_TIMEOUT}'")
                    swap(cur, renames, planet_ts, sequence)
                    break
                except errors.LockNotAvailable:
                    cur.execute("ROLLBACK TO SAVEPOINT swap")
                    if attempt == SWAP_ATTEMPTS:
                        raise FillError("could not take the places table's lock for the swap") from None
                    log.warning("The places table is busy; trying the swap again (%d)", attempt)
        conn.commit()
        return count
    except BaseException:
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001  the original failure is the one worth raising
            pass
        raise
    finally:
        try:
            conn.autocommit = True
        except Exception:  # noqa: BLE001  a dead connection; close() follows
            pass


def swap(cur: Any, renames: Mapping[str, str], planet_ts: datetime, sequence: int) -> None:
    """Put places_new where places was, keeping its owner, grants and index names."""
    from psycopg2 import sql

    # The copy belongs to whoever runs the fill. The app's login owns the live
    # table and the previews' read-only login reads it, so both carry over.
    cur.execute("SELECT pg_get_userbyid(relowner), current_user FROM pg_class WHERE oid = 'places'::regclass")
    owner, me = cur.fetchone()
    if owner != me:
        cur.execute(sql.SQL("ALTER TABLE places_new OWNER TO {}").format(sql.Identifier(owner)))
    cur.execute(
        "SELECT CASE WHEN a.grantee = 0 THEN '' ELSE pg_get_userbyid(a.grantee) END,"
        " a.privilege_type, a.is_grantable"
        " FROM pg_class c, aclexplode(c.relacl) a"
        " WHERE c.oid = 'places'::regclass AND a.grantee <> c.relowner"
    )
    for grantee, privilege, grantable in cur.fetchall():
        cur.execute(
            sql.SQL("GRANT {} ON places_new TO {}{}").format(
                sql.SQL(privilege),
                sql.Identifier(grantee) if grantee else sql.SQL("PUBLIC"),
                sql.SQL(" WITH GRANT OPTION" if grantable else ""),
            )
        )
    cur.execute("ALTER TABLE places RENAME TO places_old")
    cur.execute("ALTER TABLE places_new RENAME TO places")
    cur.execute("DROP TABLE places_old")
    # Renaming the primary key's index renames its constraint with it.
    for new, old in renames.items():
        cur.execute(sql.SQL("ALTER INDEX {} RENAME TO {}").format(sql.Identifier(new), sql.Identifier(old)))
    # A shape waiting on the API belonged to the old table; the planet held it whole.
    cur.execute("DELETE FROM places_pending")
    cur.execute(
        "INSERT INTO osm_state (id, filled_at, planet_timestamp, rules_version, sequence, updated_at)"
        " VALUES (true, now(), %s, %s, %s, now())"
        " ON CONFLICT (id) DO UPDATE SET filled_at = excluded.filled_at,"
        " planet_timestamp = excluded.planet_timestamp, rules_version = excluded.rules_version,"
        " sequence = excluded.sequence, updated_at = excluded.updated_at",
        (planet_ts, rules.RULES_VERSION, sequence),
    )


# --- The run -------------------------------------------------------------------


def fill(conn: Any, config: Config) -> None:
    work = config.scratch_dir / "bluebird-fill"
    # A run killed part way leaves its files behind. Only this directory is
    # ever removed, whatever else the volume holds.
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    started = time.monotonic()
    try:
        # Read first: it costs nothing, and a replication server that is down
        # fails the run before an hour of download rather than after it.
        latest_sequence, latest_ts = fetch_state(config.replication_url)
        with KeepAlive(conn):
            planet = work / "planet.osm.pbf"
            with step("download"):
                download_planet(config.planet_url, planet)
            planet_ts = planet_timestamp(planet)
            sequence = resume_sequence(latest_sequence, latest_ts, planet_ts)
            log.info("The planet is current to %s; the daily update resumes after %d", planet_ts.isoformat(), sequence)

            candidates = work / "candidates.osm.pbf"
            run_tool(
                "candidates",
                ["osmium", "tags-filter", "--no-progress", "--overwrite", "-R", str(planet),
                 *CANDIDATE_FILTERS, "-o", str(candidates)],
            )
            ids = work / "ids.txt"
            with step("rules"):
                kept = keep_ids(candidates, ids)
            log.info("Rules keep %s", summary(kept))
            if not kept:
                raise FillError("the rules kept nothing from the planet; refusing to empty the places table")

            ours = work / "ours.osm.pbf"
            run_tool(
                "getid",
                ["osmium", "getid", "--no-progress", "--overwrite", "-r", str(planet), "-i", str(ids),
                 "-o", str(ours)],
                missing_ok=True,
            )
            planet.unlink()

            rows_path = work / "places.csv"
            with step("centres"):
                kinds, notes = place_elements(ours, work / "nodes.idx", rows_path)
            log.info("Placed %s", summary(kinds))
            if notes:
                log.info("Of those: %s", summary(notes))

        with step("load"):
            count = load_and_swap(conn, rows_path, planet_ts, sequence)
        log.info("Swapped in %s places, %.0f s in all", f"{count:,}", time.monotonic() - started)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def run(config: Config) -> int:
    conn = wait_for_schema(config.database_url, config.schema_wait_s)
    try:
        # Held for the whole run, on this connection, so a second fill finds
        # it taken; it goes with the connection if this process dies.
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(%s)", (FILL_LOCK,))
            if not cur.fetchone()[0]:
                log.info("Another fill holds the planet-fill lock; leaving the work to it")
                return 0
        filled_at, version = read_state(conn)
        if is_current(filled_at, version, force=config.force):
            log.info("places are current (filled %s under rules version %s)", filled_at, version)
            return 0
        if config.force:
            log.info("FORCE_FILL is set; filling")
        elif filled_at is None:
            log.info("places have never been filled; filling")
        else:
            log.info(
                "places were filled under rules version %s and these are %d; filling", version, rules.RULES_VERSION
            )
        fill(conn, config)
        return 0
    finally:
        conn.close()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )
    try:
        return run(Config.from_env())
    except FillError as exc:
        log.error("Fill failed: %s", exc)
    except Exception:
        log.exception("Fill failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
