"""The snow depth grid: its header, its arithmetic, and how it is refreshed.

Nothing here downloads anything. The real archive is 4.9 MB of tar around 64 MiB
of samples, and a suite that fetched it would be measuring NSIDC's uptime rather
than this module. Every test below builds a three-by-three grid into a tar in
memory, in the header format the real file uses, so the parser and the index
arithmetic are exercised against the shape they will actually meet.
"""

from __future__ import annotations

import dataclasses
import gzip
import io
import struct
import tarfile
import time
import tracemalloc
from datetime import UTC, date, datetime

import httpx
import pytest

from app.services import snodas
from app.services.errors import UpstreamError

# Taken at import time, ahead of conftest's autouse fixture, which replaces the
# module's own `warm_up` with a no-op so no test and no CI run reaches NSIDC.
# The two tests below are the ones that mean to exercise it.
real_warm_up = snodas.warm_up

# The synthetic grid's geometry: three columns of one degree from 100°W, three
# rows of one degree down from 40°N. Round numbers so a coordinate in a test
# reads as the cell it lands in.
COLUMNS, ROWS = 3, 3
MIN_X, MAX_Y, RES = -100.0, 40.0, 1.0
NO_DATA = -9999

# Millimetres, row-major from the north-west corner. 1,000 mm is one metre and
# 2,540 mm is one hundred inches, so two cells assert the conversion outright.
SAMPLES = [
    [0, 1000, NO_DATA],
    [2540, NO_DATA, 5000],
    [NO_DATA, 0, 100],
]

_HEADER = """Format version: NOHRSC GIS/RS raster file v1.1
Description: Modeled snow layer thickness, total of snow layers
Data units: Meters / 1000.000000
Data type: integer
Data bytes per pixel: {bytes_per_pixel}
Maximum data value: {maximum}
No data value: -9999.00000000000
Number of columns: {columns}
Number of rows: {rows}
X-axis resolution: {res}
Y-axis resolution: {res}
Minimum x-axis coordinate: {min_x}
Maximum y-axis coordinate: {max_y}
"""


def header_text(**overrides) -> str:
    fields = {
        "bytes_per_pixel": 2,
        # As NSIDC writes it, which is why the reader parses rather than
        # compares strings.
        "maximum": "32767.0000000000",
        "columns": COLUMNS,
        "rows": ROWS,
        "res": RES,
        "min_x": MIN_X,
        "max_y": MAX_Y,
    }
    fields.update(overrides)
    return _HEADER.format(**fields)


def sample_bytes(grid=SAMPLES) -> bytes:
    return b"".join(struct.pack(">h", v) for row in grid for v in row)


def build_tar(
    *,
    header: str | None = None,
    samples: bytes | None = None,
    stem: str = "zz_ssmv11036tS__T0001TTNATS2026092205HP001",
    extras: tuple[str, ...] = ("zz_ssmv11034tS__T0001TTNATS2026092205HP001",),
) -> bytes:
    """One day's archive, in memory.

    ``extras`` are other products' members, present because the real archive
    carries eight of them and the depth grid has to be found by its 1036 code
    rather than by being first.
    """
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        def add(name: str, payload: bytes) -> None:
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))

        for extra in extras:
            add(f"{extra}.txt.gz", gzip.compress(b"Description: something else\n"))
            add(f"{extra}.dat.gz", gzip.compress(b"\x00\x00"))
        add(f"{stem}.txt.gz", gzip.compress((header or header_text()).encode()))
        add(f"{stem}.dat.gz", gzip.compress(samples if samples is not None else sample_bytes()))
    return buffer.getvalue()


def a_snapshot(day: str = "2026-09-22") -> snodas.Snapshot:
    return snodas.read_tar(build_tar(), datetime.fromisoformat(day).date())


# ── The header ─────────────────────────────────────────────────────────────


def test_parses_every_key_value_line_lower_cased():
    fields = snodas.parse_header(header_text())
    assert fields["number of columns"] == "3"
    assert fields["data units"] == "Meters / 1000.000000"
    # The real header's values are padded out with trailing spaces.
    assert fields["number of rows"] == "3"


def test_ignores_a_line_that_is_not_a_pair():
    fields = snodas.parse_header("Number of rows: 3\nnot a header line\n")
    assert fields == {"number of rows": "3"}


@pytest.mark.parametrize(
    "overrides",
    [
        # Four bytes per pixel is a different file than this reader was
        # written against, and unpacking it as int16 would answer confident
        # nonsense rather than nothing.
        {"bytes_per_pixel": 4},
        # A geometry that cannot index anything.
        {"columns": 0},
        {"res": 0},
        # A different ceiling is the dangerous one: the numbers would still
        # look plausible, and the browser's "at least" mark would sit on the
        # wrong depth with nothing on screen saying so.
        {"maximum": "65535.0000000000"},
        {"maximum": "not a number"},
    ],
)
def test_refuses_a_header_it_cannot_index(overrides):
    with pytest.raises(UpstreamError):
        snodas.read_tar(build_tar(header=header_text(**overrides)), datetime.now(UTC).date())


def test_refuses_a_header_missing_a_field_it_needs():
    without_origin = "\n".join(
        line for line in header_text().splitlines() if "Minimum x-axis" not in line
    )
    with pytest.raises(UpstreamError):
        snodas.read_tar(build_tar(header=without_origin), datetime.now(UTC).date())


def test_refuses_an_array_that_is_not_the_size_the_header_states():
    with pytest.raises(UpstreamError):
        snodas.read_tar(build_tar(samples=sample_bytes()[:-2]), datetime.now(UTC).date())


def test_refuses_units_it_cannot_convert():
    with pytest.raises(UpstreamError):
        snodas.read_tar(
            build_tar(header=header_text().replace("Meters / 1000.000000", "Furlongs / 1.0")),
            datetime.now(UTC).date(),
        )


def test_reads_the_divisor_out_of_the_declared_units():
    # Same integers over a divisor of one are metres rather than millimetres,
    # and the answer moves by the factor the header named.
    metres = snodas.read_tar(
        build_tar(header=header_text().replace("/ 1000.000000", "/ 1.000000")),
        datetime.now(UTC).date(),
    )
    assert metres.depth_in(39.5, -98.5) == 39370.1


@pytest.mark.parametrize(
    "header",
    [
        # Issue #629. `float()` reads all four of these, and every `<= 0` check
        # passes NaN, so a grid built on one answered every lookup with a
        # ValueError or an OverflowError instead of a depth.
        header_text(min_x="nan"),
        header_text(max_y="inf"),
        header_text(res="nan"),
        header_text(res="inf"),
        header_text().replace("/ 1000.000000", "/ nan"),
        header_text().replace("/ 1000.000000", "/ inf"),
        header_text().replace("No data value: -9999.00000000000", "No data value: inf"),
        header_text(maximum="inf"),
    ],
    ids=["origin x nan", "origin y inf", "resolution nan", "resolution inf",
         "divisor nan", "divisor inf", "no data inf", "maximum inf"],
)
def test_refuses_a_header_number_that_is_not_finite(header):
    with pytest.raises(UpstreamError):
        snodas.read_tar(build_tar(header=header), datetime.now(UTC).date())


# ── Bounds on what the file may cost ───────────────────────────────────────


def _peak_bytes(action) -> int:
    """The most memory Python allocated while `action` ran."""
    tracemalloc.start()
    try:
        action()
        return tracemalloc.get_traced_memory()[1]
    finally:
        tracemalloc.stop()


def _refused(payload: bytes) -> None:
    with pytest.raises(UpstreamError):
        snodas.read_tar(payload, datetime.now(UTC).date())


def test_refuses_a_data_member_larger_than_its_header_without_inflating_it():
    # Issue #629. The header says three by three, 18 bytes; the member inflates
    # to 32 MiB of zeros from about 32 KB on the wire. The size check used to
    # run only after the whole member was in memory.
    tar = build_tar(samples=bytes(32 * 2**20))
    assert _peak_bytes(lambda: _refused(tar)) < 4 * 2**20


def test_refuses_a_header_member_that_inflates_past_any_real_header():
    tar = build_tar(header=header_text() + "x" * (32 * 2**20))
    assert _peak_bytes(lambda: _refused(tar)) < 4 * 2**20


def test_refuses_a_grid_too_large_to_hold_before_reading_it():
    # A header can declare any geometry, and the size it declares is what the
    # data member is inflated against, so the declaration is bounded first.
    tar = build_tar(header=header_text(columns=10**6, rows=10**6), samples=bytes(32 * 2**20))
    assert _peak_bytes(lambda: _refused(tar)) < 4 * 2**20


def test_refuses_a_compressed_outer_archive():
    # NSIDC publishes a plain tar. `tarfile.open` would otherwise unwrap a gzip,
    # bz2 or xz layer around it, a second expansion before the members' own.
    _refused(gzip.compress(build_tar()))


def test_reads_a_data_member_written_as_several_gzip_members():
    # `gzip.decompress` reads concatenated members, which the format allows,
    # so the bounded reader has to as well or a valid file reads as truncated.
    data = sample_bytes()
    split = gzip.compress(data[:8]) + gzip.compress(data[8:])
    buffer = io.BytesIO()
    stem = "zz_ssmv11036tS__T0001TTNATS2026092205HP001"
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for name, payload in (
            (f"{stem}.txt.gz", gzip.compress(header_text().encode())),
            (f"{stem}.dat.gz", split),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    snapshot = snodas.read_tar(buffer.getvalue(), date(2026, 9, 22))
    assert snapshot.depth_in(39.5, -98.5) == 39.37


def test_refuses_a_truncated_data_member():
    stem = "zz_ssmv11036tS__T0001TTNATS2026092205HP001"
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for name, payload in (
            (f"{stem}.txt.gz", gzip.compress(header_text().encode())),
            (f"{stem}.dat.gz", gzip.compress(sample_bytes())[:-12]),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    _refused(buffer.getvalue())


# ── Selecting the depth product ────────────────────────────────────────────


def test_selects_the_depth_member_by_its_product_code_not_its_position():
    # The 1034 members are written first, so a reader taking the first .dat.gz
    # would decode two bytes of another product.
    snapshot = a_snapshot()
    assert snapshot.columns == COLUMNS and snapshot.rows == ROWS


def test_refuses_an_archive_with_no_depth_member():
    tar = build_tar(stem="zz_ssmv11034tS__T0001TTNATS2026092205HP001", extras=())
    with pytest.raises(UpstreamError):
        snodas.read_tar(tar, datetime.now(UTC).date())


def test_refuses_a_depth_member_with_no_header_beside_it():
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        payload = gzip.compress(sample_bytes())
        info = tarfile.TarInfo("zz_ssmv11036tS__T0001TTNATS2026092205HP001.dat.gz")
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
    with pytest.raises(UpstreamError):
        snodas.read_tar(buffer.getvalue(), datetime.now(UTC).date())


# ── The lookup ─────────────────────────────────────────────────────────────


def test_converts_the_stored_millimetres_to_inches():
    snapshot = a_snapshot()
    # One metre in the middle of the top row. Two decimals, because the grid
    # is whole millimetres and the digits past that are the factor's own noise.
    assert snapshot.depth_in(39.5, -98.5) == 39.37
    # 2,540 mm is one hundred inches, in the first cell of the middle row.
    assert snapshot.depth_in(38.5, -99.5) == 100.0


def test_saturates_at_the_files_own_int16_ceiling():
    # 32,767 mm is the largest depth the member can carry, and the header says
    # so. Over deep ice the model holds more and the file clips it: NOAA's map
    # service reported 68.62 m at Mount Rainier's summit on 2026-09-16 where
    # the tar read 32.77 m. The number is pinned because it is the one a reader
    # meets most often on a glaciated summit, and it is a ceiling rather than a
    # measurement.
    ceiling = snodas.read_tar(
        build_tar(samples=sample_bytes([[32767] * COLUMNS] * ROWS)),
        date(2026, 9, 22),
    )
    assert ceiling.depth_in(39.5, -98.5) == 1290.04


def test_reads_zero_as_a_reading_rather_than_a_gap():
    # Bare ground is a measurement. A null there would be indistinguishable
    # from a destination the grid never covered.
    assert a_snapshot().depth_in(39.5, -99.5) == 0.0


def test_answers_none_on_the_no_data_value():
    assert a_snapshot().depth_in(39.5, -97.5) is None
    assert a_snapshot().depth_in(38.5, -98.5) is None


@pytest.mark.parametrize(
    "latitude,longitude",
    [
        (41.0, -98.5),  # north of the grid
        (36.5, -98.5),  # south of it
        (38.5, -101.0),  # west of it
        (38.5, -96.0),  # east of it
    ],
)
def test_answers_none_outside_the_grid(latitude, longitude):
    assert a_snapshot().depth_in(latitude, longitude) is None


def test_floors_a_coordinate_into_the_cell_that_owns_it():
    snapshot = a_snapshot()
    # The whole of the top-middle cell reads the same sample, right up to but
    # not including the boundary with the cell east of it.
    assert snapshot.depth_in(39.99, -99.0) == 39.37
    assert snapshot.depth_in(39.01, -98.01) == 39.37
    assert snapshot.depth_in(39.5, -98.0) is None


def test_records_the_day_it_was_analyzed():
    assert a_snapshot("2026-09-22").analysis_date == "2026-09-22"


# ── Fetching ───────────────────────────────────────────────────────────────


def _transport(answers: dict[str, int], body=build_tar):
    """An httpx transport that answers each URL with the status it is given,
    and with an archive where that status is 200: a real one unless `body`
    builds the response itself."""
    seen: list[tuple[str, str]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, str(request.url)))
        status = answers.get(str(request.url), 404)
        if status != 200 or request.method == "HEAD":
            return httpx.Response(status)
        answer = body()
        if isinstance(answer, httpx.Response):
            return answer
        return httpx.Response(200, content=answer)

    return httpx.MockTransport(handle), seen


@pytest.fixture
def stub_client(monkeypatch):
    """Point the fetch's own client at a transport the test owns."""

    def install(answers: dict[str, int], body=build_tar):
        transport, seen = _transport(answers, body)
        real = httpx.AsyncClient

        def build(*args, **kwargs):
            kwargs["transport"] = transport
            return real(*args, **kwargs)

        monkeypatch.setattr(snodas.httpx, "AsyncClient", build)
        return seen

    return install


NOW = datetime(2026, 9, 22, 18, 0, tzinfo=UTC)
TODAY_URL = snodas.tar_url(NOW.date())
YESTERDAY_URL = snodas.tar_url(datetime(2026, 9, 21, tzinfo=UTC).date())


def test_url_follows_nsidc_own_month_naming():
    assert snodas.tar_url(date(2026, 9, 22)).endswith(
        "/2026/09_Sep/SNODAS_unmasked_20260922.tar"
    )


def test_every_month_segment_is_the_english_abbreviation():
    # Spelled in the module rather than read off `%b`, which takes the C
    # library's locale: a pod in a non-English locale would ask for a path
    # NSIDC does not serve, every day of the year.
    segments = [snodas.tar_url(date(2026, m, 1)).split("/")[-2] for m in range(1, 13)]
    assert segments == [
        "01_Jan",
        "02_Feb",
        "03_Mar",
        "04_Apr",
        "05_May",
        "06_Jun",
        "07_Jul",
        "08_Aug",
        "09_Sep",
        "10_Oct",
        "11_Nov",
        "12_Dec",
    ]


async def test_fetches_today_when_nsidc_has_published_it(stub_client):
    seen = stub_client({TODAY_URL: 200})
    snapshot = await snodas.fetch_snapshot(held=lambda: None, now=NOW)
    assert snapshot.analysis_date == "2026-09-22"
    # The HEAD is what keeps an hourly refresh cheap, so it is sent first.
    assert seen[0] == ("HEAD", TODAY_URL)


async def test_falls_back_a_day_before_the_archive_is_published(stub_client):
    # The normal morning state rather than an outage: the day's tar lands about
    # 13:15 UTC, and until then yesterday's grid IS the current analysis.
    seen = stub_client({TODAY_URL: 404, YESTERDAY_URL: 200})
    snapshot = await snodas.fetch_snapshot(held=lambda: None, now=NOW)
    assert snapshot.analysis_date == "2026-09-21"
    assert [method for method, _ in seen] == ["HEAD", "HEAD", "GET"]


async def test_fails_when_neither_day_exists(stub_client):
    stub_client({})
    with pytest.raises(UpstreamError):
        await snodas.fetch_snapshot(held=lambda: None, now=NOW)


async def test_keeps_the_held_grid_rather_than_downloading_it_again(stub_client):
    held = a_snapshot("2026-09-22")
    seen = stub_client({TODAY_URL: 200})
    assert await snodas.fetch_snapshot(held=lambda: held, now=NOW) is held
    assert seen == []


async def test_downloads_when_the_held_grid_is_yesterdays(stub_client):
    held = a_snapshot("2026-09-21")
    stub_client({TODAY_URL: 200})
    fresh = await snodas.fetch_snapshot(held=lambda: held, now=NOW)
    assert fresh is not held
    assert fresh.analysis_date == "2026-09-22"


async def test_keeps_yesterdays_held_grid_while_today_is_unpublished(stub_client):
    held = a_snapshot("2026-09-21")
    seen = stub_client({TODAY_URL: 404, YESTERDAY_URL: 200})
    assert await snodas.fetch_snapshot(held=lambda: held, now=NOW) is held
    # One HEAD for today, and nothing at all for the day already in hand.
    assert seen == [("HEAD", TODAY_URL)]


# ── A refused file (#629, decision 0102) ──────────────────────────────────


def _nan_tar() -> bytes:
    return build_tar(header=header_text(min_x="nan"))


async def test_a_refused_file_stands_for_its_day_as_no_grid(stub_client):
    stub_client({TODAY_URL: 200}, body=_nan_tar)
    refused = await snodas.fetch_snapshot(held=lambda: None, now=NOW)
    assert isinstance(refused, snodas.Refused)
    assert refused.analysis_date == "2026-09-22"


async def test_a_refused_file_replaces_yesterdays_grid_rather_than_keeping_it(stub_client):
    # The maintainer's call on #629: a refused day reads null, and the day
    # before is not served in its place, because its date would then caption
    # a column the reader takes for today's.
    held = a_snapshot("2026-09-21")
    seen = stub_client({TODAY_URL: 200, YESTERDAY_URL: 200}, body=_nan_tar)
    refused = await snodas.fetch_snapshot(held=lambda: held, now=NOW)
    assert isinstance(refused, snodas.Refused)
    # Today's file was the answer, refused or not; yesterday's is not fetched
    # to stand in for it.
    assert seen == [("HEAD", TODAY_URL), ("GET", TODAY_URL)]


async def test_a_refused_day_is_not_downloaded_again(stub_client):
    # The hourly check finds the day in hand, as it does for a good grid, so a
    # bad file costs NSIDC one download a day rather than one per backoff.
    seen = stub_client({TODAY_URL: 200})
    held = snodas.Refused("2026-09-22")
    assert await snodas.fetch_snapshot(held=lambda: held, now=NOW) is held
    assert seen == []


async def test_the_next_days_file_replaces_a_refused_one(stub_client):
    stub_client({TODAY_URL: 200})
    fresh = await snodas.fetch_snapshot(held=lambda: snodas.Refused("2026-09-21"), now=NOW)
    assert isinstance(fresh, snodas.Snapshot)
    assert fresh.analysis_date == "2026-09-22"


async def test_a_refused_refresh_leaves_every_row_null_and_no_date(monkeypatch, stub_client):
    stub_client({TODAY_URL: 200}, body=_nan_tar)
    cache = _install(monkeypatch, a_snapshot("2026-09-21"), fresh=False)
    cache._fetch = lambda: snodas.fetch_snapshot(now=NOW)
    rows = [{"latitude": 39.5, "longitude": -98.5}]
    snodas.fill_snow_depth(rows)
    await cache.settle()
    assert snodas.fill_snow_depth(rows) is None
    assert rows[0]["snow_depth_in"] is None


async def test_refuses_a_download_that_declares_more_than_the_cap(monkeypatch, stub_client):
    monkeypatch.setattr(snodas, "MAX_ARCHIVE_BYTES", 1024, raising=False)
    stub_client({TODAY_URL: 200})
    assert isinstance(
        await snodas.fetch_snapshot(held=lambda: None, now=NOW), snodas.Refused
    )


async def test_refuses_a_download_that_runs_past_the_cap_without_declaring_it(
    monkeypatch, stub_client
):
    # No Content-Length, as a chunked answer has none, so the cap is counted
    # as the bytes arrive rather than read off a header.
    monkeypatch.setattr(snodas, "MAX_ARCHIVE_BYTES", 1024, raising=False)
    stub_client(
        {TODAY_URL: 200},
        body=lambda: httpx.Response(200, stream=httpx.ByteStream(build_tar())),
    )
    assert isinstance(
        await snodas.fetch_snapshot(held=lambda: None, now=NOW), snodas.Refused
    )


# ── The fill step, and never waiting for a grid ────────────────────────────


def _install(monkeypatch, snapshot: snodas.Snapshot | None, *, fresh: bool = True):
    """A cache holding (or not holding) one snapshot, with no live fetch."""

    async def refuse():
        raise AssertionError("the fill step must not fetch")

    cache = snodas.snow_cache(fetch=refuse)
    if snapshot is not None:
        cache._snapshot = snapshot
        cache._fresh_until = time.monotonic() + (3600 if fresh else -1)
    monkeypatch.setattr(snodas, "GRID", cache)
    return cache


def test_fill_sets_the_depth_and_reports_the_grids_date(monkeypatch):
    _install(monkeypatch, a_snapshot("2026-09-22"))
    rows = [
        {"latitude": 39.5, "longitude": -98.5},
        {"latitude": 38.5, "longitude": -99.5},
        {"latitude": 39.5, "longitude": -97.5},
        {"latitude": 10.0, "longitude": 10.0},
    ]
    assert snodas.fill_snow_depth(rows) == "2026-09-22"
    assert [r["snow_depth_in"] for r in rows] == [
        39.37,
        100.0,
        None,
        None,
    ]


def test_fill_answers_nulls_and_no_date_with_no_grid_held(monkeypatch):
    # The first analyses after a pod restart. Every row reads as unknown and
    # the report carries no date to caption itself with, which is what stops a
    # blank column from being read as bare ground.
    _install(monkeypatch, None)
    rows = [{"latitude": 39.5, "longitude": -98.5}]
    assert snodas.fill_snow_depth(rows) is None
    assert rows[0]["snow_depth_in"] is None


def test_fill_degrades_to_nulls_when_the_grid_cannot_answer(monkeypatch):
    # Issue #629: a grid whose lookup raises must not take the route with it.
    # The header checks keep a NaN origin out of a real snapshot; this one is
    # built past them, which is the case the fill exists to survive.
    _install(monkeypatch, dataclasses.replace(a_snapshot(), min_x=float("nan")))
    rows = [{"latitude": 39.5, "longitude": -98.5}, {"latitude": 38.5, "longitude": -99.5}]
    assert snodas.fill_snow_depth(rows) is None
    assert [r["snow_depth_in"] for r in rows] == [None, None]


async def test_fill_never_waits_for_a_cold_grid(monkeypatch):
    # The whole reason `current_or_schedule` exists: a request assembling rows
    # answers now and the refresh runs behind it.
    started = []

    async def slow():
        started.append(True)
        return a_snapshot()

    cache = snodas.snow_cache(fetch=slow)
    monkeypatch.setattr(snodas, "GRID", cache)
    assert snodas.fill_snow_depth([{"latitude": 39.5, "longitude": -98.5}]) is None
    await cache.settle()
    assert started == [True]
    assert cache.snapshot_or_none is not None


async def test_an_aged_grid_still_answers_while_it_refreshes(monkeypatch):
    cache = _install(monkeypatch, a_snapshot("2026-09-21"), fresh=False)
    refreshed = []

    async def fetch():
        refreshed.append(True)
        return a_snapshot("2026-09-22")

    cache._fetch = fetch
    rows = [{"latitude": 39.5, "longitude": -98.5}]
    # The stale grid answers this request rather than the fresh one.
    assert snodas.fill_snow_depth(rows) == "2026-09-21"
    await cache.settle()
    assert refreshed == [True]
    assert cache.snapshot_or_none.analysis_date == "2026-09-22"


async def test_a_failed_refresh_is_not_retried_on_every_request(monkeypatch):
    attempts = []

    async def refuse():
        attempts.append(True)
        raise UpstreamError("nope")

    cache = snodas.snow_cache(fetch=refuse, retry_after_failure_s=3600)
    monkeypatch.setattr(snodas, "GRID", cache)
    for _ in range(3):
        snodas.fill_snow_depth([{"latitude": 39.5, "longitude": -98.5}])
        await cache.settle()
    assert attempts == [True]


async def test_warm_up_swallows_a_failure_rather_than_taking_the_pod_with_it(monkeypatch):
    async def refuse():
        raise UpstreamError("nope")

    monkeypatch.setattr(snodas, "GRID", snodas.snow_cache(fetch=refuse))
    await real_warm_up()


async def test_warm_up_fills_the_cache(monkeypatch):
    async def fetch():
        return a_snapshot()

    cache = snodas.snow_cache(fetch=fetch)
    monkeypatch.setattr(snodas, "GRID", cache)
    await real_warm_up()
    assert cache.snapshot_or_none is not None
