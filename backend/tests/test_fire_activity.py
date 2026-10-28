"""Satellite fire detections from NASA FIRMS (#799).

The fixtures are real rows, ten from each instrument's Global 48-hour file as
FIRMS served it on 2026-10-27: the two VIIRS files share one header and MODIS
has its own, and the rows were picked to straddle the antimeridian, to carry
every VIIRS confidence word and a spread of MODIS numbers, and to put one
detection in Idaho for the bounding box.
"""

from __future__ import annotations

import gzip
import json
import random
from array import array
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from conftest import fake_response
from fastapi.testclient import TestClient

from app.main import app
from app.services import fire_activity as fa
from app.services.errors import UpstreamError

DATA = Path(__file__).parent / "data"
VIIRS = (DATA / "firms_viirs.csv").read_text()
MODIS = (DATA / "firms_modis.csv").read_text()

# 2026-10-26T12:00:00Z: every fixture row was acquired on 2026-10-25, so all
# of them are inside 48 hours of this fetch.
FETCHED_AT_MS = int(datetime(2026, 10, 26, 12, 0, tzinfo=UTC).timestamp() * 1000)


def _snapshot(fetched_at_ms: int = FETCHED_AT_MS) -> fa.Snapshot:
    return fa.build_snapshot(fa.parse_csv(VIIRS, "VIIRS") + fa.parse_csv(MODIS, "MODIS"), fetched_at_ms)


class _Clock:
    def __init__(self, t: float = 0.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


# ── The acquisition time ─────────────────────────────────────────────────────


def test_acquired_is_the_date_and_the_utc_clock_together():
    assert fa.acquired_at("2026-10-25", "0306") == datetime(2026, 10, 25, 3, 6, tzinfo=UTC)
    assert fa.acquired_at("2026-10-25", "2359") == datetime(2026, 10, 25, 23, 59, tzinfo=UTC)


def test_a_clock_without_its_leading_zeros_is_still_read():
    # 00:05 written as 5, the way a spreadsheet export drops the zeros.
    assert fa.acquired_at("2026-10-25", "5") == datetime(2026, 10, 25, 0, 5, tzinfo=UTC)


@pytest.mark.parametrize(("day", "clock"), [("2026-10-25", "2460"), ("2026-10-25", "12:30"), ("25/10/2026", "0306")])
def test_a_stamp_that_is_not_a_date_and_hhmm_is_refused(day, clock):
    with pytest.raises(ValueError):
        fa.acquired_at(day, clock)


# ── Parsing ──────────────────────────────────────────────────────────────────


def test_viirs_rows_keep_what_the_layer_reads():
    rows = fa.parse_csv(VIIRS, "VIIRS")
    assert len(rows) == 10
    first = rows[0]
    assert (first.lon, first.lat) == (126.00391, 50.62661)
    assert first.acquired == datetime(2026, 10, 25, 3, 6, tzinfo=UTC)
    assert (first.instrument, first.satellite, first.confidence, first.frp) == ("VIIRS", "N20", "low", 22.85)
    assert {r.satellite for r in rows} == {"N20", "N21"}
    # Every confidence word is kept as FIRMS spells it, and none is dropped.
    assert {r.confidence for r in rows} == {"low", "nominal", "high"}


def test_modis_rows_keep_their_numeric_confidence_as_text():
    rows = fa.parse_csv(MODIS, "MODIS")
    assert len(rows) == 10
    assert {r.instrument for r in rows} == {"MODIS"}
    assert {r.satellite for r in rows} == {"T", "A"}
    assert rows[0].confidence == "26"
    assert rows[-1].frp == 313.0


def test_a_file_missing_a_column_this_reads_fails_the_refresh():
    without_frp = "\n".join(",".join(line.split(",")[:-2] + line.split(",")[-1:]) for line in VIIRS.splitlines())
    with pytest.raises(UpstreamError) as raised:
        fa.parse_csv(without_frp, "VIIRS")
    assert raised.value.message == f"{fa.PROVIDER} request failed. Try again later."


def test_an_unreadable_row_costs_only_itself():
    header, *rows = VIIRS.splitlines()
    broken = [rows[0].replace("50.62661", "north"), rows[1].replace(",0342,", ",9999,"), *rows[2:]]
    parsed = fa.parse_csv("\n".join([header, *broken]), "VIIRS")
    assert len(parsed) == 8


def test_a_missing_power_is_kept_as_none():
    header, first, *_ = VIIRS.splitlines()
    [row] = fa.parse_csv("\n".join([header, first.replace(",22.85,", ",,")]), "VIIRS")
    assert row.frp is None


def test_since_keeps_only_the_newer_rows():
    since = int(datetime(2026, 10, 25, 3, 0, tzinfo=UTC).timestamp())
    kept = fa.parse_csv(VIIRS, "VIIRS", since_s=since)
    assert all(r.acquired >= datetime(2026, 10, 25, 3, 0, tzinfo=UTC) for r in kept)
    assert len(kept) == 6


# ── The snapshot ─────────────────────────────────────────────────────────────


def test_the_snapshot_keeps_what_is_inside_48_hours_of_the_fetch():
    # One VIIRS row was acquired at 03:06 on the 25th. A fetch exactly 48
    # hours after it keeps it; a minute later drops it.
    edge = int(datetime(2026, 10, 27, 3, 6, tzinfo=UTC).timestamp() * 1000)
    rows = fa.parse_csv(VIIRS, "VIIRS")
    at_edge = fa.build_snapshot(rows, edge)
    later = fa.build_snapshot(rows, edge + 60_000)
    assert at_edge.count - later.count == 1
    assert fa.build_snapshot(rows, FETCHED_AT_MS).count == 10


def test_the_box_finds_the_detection_in_idaho():
    snapshot = _snapshot()
    rows = snapshot.within((-117.0, 45.5, -116.0, 46.5))
    assert [(snapshot.lon[i], snapshot.lat[i]) for i in rows] == [(-116.47974, 46.09978)]


def test_the_box_includes_its_edges():
    snapshot = _snapshot()
    assert len(snapshot.within((-116.47974, 46.09978, -116.47974, 46.09978))) == 1


def test_a_box_whose_west_is_past_its_east_crosses_the_antimeridian():
    snapshot = _snapshot()
    rows = snapshot.within((170.0, -50.0, -170.0, -10.0))
    found = sorted((snapshot.lon[i], snapshot.lat[i]) for i in rows)
    assert found == [(-175.06664, -21.16599), (171.10616, -44.67845), (177.88521, -17.62021)]


def test_the_world_box_holds_every_detection():
    snapshot = _snapshot()
    assert len(snapshot.within((-180.0, -90.0, 180.0, 90.0))) == snapshot.count == 20


def test_the_cell_index_answers_what_a_scan_of_every_row_answers():
    # Property-style: the box reads whole cells without testing their rows,
    # and tests the rows of the cells on its edge, so it must agree with the
    # plain scan for boxes that cut cells, cover them, and sit on their seams.
    rng = random.Random(799)
    stamp = datetime(2026, 10, 26, 6, 0, tzinfo=UTC)
    detections = [
        fa.Detection(
            lon=round(rng.uniform(-180, 180), 5),
            lat=round(rng.uniform(-90, 90), 5),
            acquired=stamp,
            instrument="VIIRS",
            satellite="N20",
            confidence="nominal",
            frp=1.0,
        )
        for _ in range(3000)
    ]
    snapshot = fa.build_snapshot(detections, FETCHED_AT_MS)
    for _ in range(300):
        west, east = sorted(rng.choice([rng.uniform(-180, 180), float(rng.randint(-180, 180))]) for _ in range(2))
        south, north = sorted(rng.choice([rng.uniform(-90, 90), float(rng.randint(-90, 90))]) for _ in range(2))
        box = (west, south, east, north)
        expected = {
            i
            for i in range(snapshot.count)
            if west <= snapshot.lon[i] <= east and south <= snapshot.lat[i] <= north
        }
        got = snapshot.within(box)
        assert len(got) == len(set(got))
        assert set(got) == expected, box


def test_the_collection_is_geojson_with_the_properties_the_browser_reads():
    snapshot = _snapshot()
    body = json.loads(fa.collection_json(snapshot, snapshot.within((-117.0, 45.5, -116.0, 46.5))))
    assert body["type"] == "FeatureCollection"
    assert body["fetched_at"] == FETCHED_AT_MS
    assert body["features"] == [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-116.47974, 46.09978]},
            "properties": {
                "acquired": "2026-10-25T10:13:00Z",
                "instrument": "VIIRS",
                "satellite": "N20",
                "confidence": "nominal",
                "frp": 2.33,
            },
        }
    ]


def test_a_missing_power_is_sent_as_null():
    header, first, *_ = VIIRS.splitlines()
    rows = fa.parse_csv("\n".join([header, first.replace(",22.85,", ",,")]), "VIIRS")
    snapshot = fa.build_snapshot(rows, FETCHED_AT_MS)
    [feature] = json.loads(fa.collection_json(snapshot, [0]))["features"]
    assert feature["properties"]["frp"] is None


def test_an_empty_box_is_an_empty_collection():
    snapshot = _snapshot()
    body = json.loads(fa.collection_json(snapshot, snapshot.within((0.0, 0.0, 1.0, 1.0))))
    assert body["features"] == []


def test_a_snapshot_reads_back_from_the_shared_cache_unchanged():
    header, first, *rest = VIIRS.splitlines()
    rows = fa.parse_csv("\n".join([header, first.replace(",22.85,", ",,"), *rest]), "VIIRS")
    snapshot = fa.build_snapshot(rows + fa.parse_csv(MODIS, "MODIS"), FETCHED_AT_MS)
    body = fa.SHARED.pack(snapshot)
    read_back = fa.SHARED.unpack(body)
    assert read_back == snapshot
    assert fa.SHARED.pack(read_back) == body
    assert fa.collection_json(read_back, list(range(read_back.count))) == fa.collection_json(
        snapshot, list(range(snapshot.count))
    )


def test_the_row_is_named_for_the_layer():
    assert fa.SHARED.source == "fire_activity"


# ── Fetching ─────────────────────────────────────────────────────────────────


@pytest.fixture
def served_files(monkeypatch):
    """Route the fetch through a MockTransport keyed by URL; returns what was asked, and how."""

    def install(responses: dict[str, httpx.Response]) -> list[httpx.Request]:
        asked: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            asked.append(request)
            return responses.get(str(request.url), fake_response(None, 404, text="not found"))

        transport = httpx.MockTransport(handler)

        class _Client(httpx.AsyncClient):
            def __init__(self, **kwargs):
                kwargs.pop("transport", None)
                super().__init__(**kwargs, transport=transport)

        monkeypatch.setattr(fa.httpx, "AsyncClient", _Client)
        return asked

    return install


def _all_three() -> dict[str, httpx.Response]:
    empty_viirs = VIIRS.splitlines()[0] + "\n"
    return {
        fa.FEEDS[0].url: httpx.Response(200, text=VIIRS),
        fa.FEEDS[1].url: httpx.Response(200, text=empty_viirs),
        fa.FEEDS[2].url: httpx.Response(200, text=MODIS),
    }


def test_the_three_feeds_are_the_two_viirs_satellites_and_modis_globally():
    assert [f.url for f in fa.FEEDS] == [
        "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_48h.csv",
        "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_48h.csv",
        "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_48h.csv",
    ]


async def test_a_fetch_reads_all_three_files_with_the_apps_user_agent(served_files, monkeypatch):
    monkeypatch.setattr(fa.time, "time", lambda: FETCHED_AT_MS / 1000)
    asked = served_files(_all_three())
    snapshot = await fa.fetch_snapshot()
    assert sorted(str(r.url) for r in asked) == sorted(f.url for f in fa.FEEDS)
    assert {r.headers["User-Agent"] for r in asked} == {fa.HEADERS["User-Agent"]}
    assert snapshot.count == 20
    assert snapshot.fetched_at_ms == FETCHED_AT_MS


async def test_a_file_that_fails_fails_the_refresh(served_files):
    # All three or none: a snapshot missing a satellite would read as a map
    # with fewer fires and nothing saying so.
    files = _all_three()
    files[fa.FEEDS[2].url] = fake_response(None, 503, text="busy")
    served_files(files)
    with pytest.raises(httpx.HTTPStatusError):
        await fa.fetch_snapshot()


def test_the_refresh_waits_an_hour_and_never_less():
    assert fa.TTL_S == 3600
    assert fa.DETECTIONS.source().interval_s == 3600


# ── The cache ────────────────────────────────────────────────────────────────


async def test_an_aged_snapshot_survives_a_failed_refresh():
    clock = _Clock()
    healthy = True

    async def fetch() -> fa.Snapshot:
        if not healthy:
            raise UpstreamError("FIRMS unreachable")
        return _snapshot()

    cache = fa.detection_cache(clock=clock, fetch=fetch)
    await cache.get()
    healthy = False
    clock.t = fa.TTL_S + 1
    await cache.get()
    await cache.settle()
    assert (await cache.get()).fetched_at_ms == FETCHED_AT_MS


async def test_a_snapshot_older_than_a_day_is_not_served():
    # Record 0077: past 24 hours the honest answer is the cold cache's 503,
    # not a fire map from another day.
    clock = _Clock()
    healthy = True

    async def fetch() -> fa.Snapshot:
        if not healthy:
            raise UpstreamError("FIRMS unreachable")
        return _snapshot()

    cache = fa.detection_cache(clock=clock, fetch=fetch)
    await cache.get()
    healthy = False
    clock.t = 24 * 60 * 60 + 1
    with pytest.raises(UpstreamError):
        await cache.get()


# ── The route ────────────────────────────────────────────────────────────────


@pytest.fixture
def served(monkeypatch):
    """Install a cache that answers from the fixture snapshot without any network."""
    snapshot = _snapshot()

    async def fetch() -> fa.Snapshot:
        return snapshot

    monkeypatch.setattr(fa, "DETECTIONS", fa.detection_cache(fetch=fetch))
    return snapshot


def test_route_returns_the_detections_in_the_box(served):
    with TestClient(app) as client:
        response = client.get("/api/fire-activity", params={"bbox": "-117,45.5,-116,46.5"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    # Revalidated like every API answer, so a pan never reads a cached hour.
    assert response.headers["cache-control"] == "no-cache"
    body = response.json()
    assert body["fetched_at"] == FETCHED_AT_MS
    assert [f["properties"]["acquired"] for f in body["features"]] == ["2026-10-25T10:13:00Z"]


def test_route_reads_a_box_across_the_antimeridian(served):
    with TestClient(app) as client:
        body = client.get("/api/fire-activity", params={"bbox": "170,-50,-170,-10"}).json()
    assert len(body["features"]) == 3


def test_route_holds_the_whole_worlds_answer_gzipped(served):
    with TestClient(app) as client:
        first = client.get(
            "/api/fire-activity", params={"bbox": "-180,-90,180,90"}, headers={"Accept-Encoding": "gzip"}
        )
    assert first.status_code == 200
    assert first.headers["content-encoding"] == "gzip"
    assert len(first.json()["features"]) == 20


@pytest.mark.parametrize("bbox", ["", "1,2,3", "a,b,c,d", "-181,0,0,1", "0,10,1,5"])
def test_route_refuses_a_box_it_cannot_read(served, bbox):
    with TestClient(app) as client:
        response = client.get("/api/fire-activity", params={"bbox": bbox})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation"


def test_route_answers_503_when_nothing_has_ever_been_fetched():
    # The conftest default refuses; this is what a cold pod facing an
    # unreachable FIRMS says.
    with TestClient(app) as client:
        response = client.get("/api/fire-activity", params={"bbox": "-117,45.5,-116,46.5"})
    assert response.status_code == 503
    assert response.headers["Retry-After"]
    assert response.json()["error"] == {"code": "snapshot_unavailable", "retryable": True}


def test_the_bodies_are_the_columns_not_feature_text():
    # The row is what every pod downloads each hour, so it holds columns, and
    # a detection's text is written per request.
    snapshot = _snapshot()
    data = json.loads(gzip.decompress(fa.SHARED.pack(snapshot)))["snapshot"]
    assert set(data) == {"fetched_at_ms", "lon", "lat", "acquired", "frp", "kind", "kinds", "cells"}
    assert isinstance(snapshot.lon, array)
