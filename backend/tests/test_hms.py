"""Server-side smoke-plume snapshot (issue #121).

Two things are worth pinning here and neither is the happy path. HMS publishes
one dated file per day, so "which day" is computed rather than asked for, and
before the first analyst pass lands that file does not exist. And the KML's
density lives in a style reference, in a vocabulary NOAA has already changed
once, so an unrecognized value must still draw rather than vanish.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

import httpx
import pytest
from app.main import app
from app.services import hms
from app.services.errors import UpstreamError
from fastapi.testclient import TestClient

# One placemark in the shape the live file uses, verified against the 2026-08-04
# analysis. Written as a template so a test can vary the style and description
# without restating the envelope.
_PLACEMARK = """<Placemark>
<description><![CDATA[<div style="width:170px;">Start Time: {start}<br>End Time: {end}<br>Density: {density}<br>Satellite: {satellite}</div>]]></description>
<styleUrl>{style}</styleUrl>
<Polygon>
  <tessellate>1</tessellate>
  <outerBoundaryIs>
    <LinearRing>
      <coordinates>
        {coordinates}
      </coordinates>
    </LinearRing>
  </outerBoundaryIs>
</Polygon>
</Placemark>"""

_SQUARE = "-123.180730,41.420707,0 -122.180730,41.420707,0 -122.180730,42.420707,0 -123.180730,41.420707,0"


def _placemark(
    *,
    style: str = "#Smoke_Light_style",
    density: str = "Light",
    satellite: str = "GOES-WEST",
    start: str = "2026216 1200UTC",
    end: str = "2026216 1500UTC",
    coordinates: str = _SQUARE,
) -> str:
    return _PLACEMARK.format(
        style=style,
        density=density,
        satellite=satellite,
        start=start,
        end=end,
        coordinates=coordinates,
    )


def _kml(*placemarks: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">'
        "<Document><name>HMS Smoke Mapping-20260804</name>" + "".join(placemarks) + "</Document></kml>"
    )


class _Clock:
    """Injectable monotonic clock, matching test_nifc.py's idiom."""

    def __init__(self, t: float = 0.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


# ── Which day to ask for ──────────────────────────────────────────────────────


def test_analysis_date_is_eastern_not_utc():
    # 01:30 UTC on the 5th is still the evening of the 4th in the analysts'
    # timezone. A UTC date here would ask for a file that does not exist yet
    # for five hours every evening.
    late = datetime(2026, 8, 5, 1, 30, tzinfo=timezone.utc)
    assert hms.analysis_date(late) == date(2026, 8, 4)


def test_kml_url_nests_the_date_three_ways():
    assert hms.kml_url(date(2026, 8, 4)) == (
        "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML/"
        "2026/08/hms_smoke20260804.kml"
    )


# ── Parsing ───────────────────────────────────────────────────────────────────


def test_parse_reads_density_from_the_style_reference():
    features = hms.parse_kml(
        _kml(
            _placemark(style="#Smoke_Light_style"),
            _placemark(style="#Smoke_Medium_style"),
            _placemark(style="#Smoke_Heavy_style"),
        )
    )
    assert [f["properties"]["density"] for f in features] == ["Light", "Medium", "Heavy"]


def test_an_unrecognized_style_still_draws_and_keeps_the_raw_value():
    # HMS changed this vocabulary once already (numeric to named, 2022-07-19).
    # A plume nobody can classify is still smoke somebody is standing in.
    features = hms.parse_kml(_kml(_placemark(style="#Smoke_Extreme_style")))
    assert len(features) == 1
    assert features[0]["properties"]["density"] == "Light"
    assert features[0]["properties"]["density_raw"] == "#Smoke_Extreme_style"


def test_a_recognized_style_carries_no_raw_value():
    features = hms.parse_kml(_kml(_placemark()))
    assert "density_raw" not in features[0]["properties"]


def test_parse_reads_the_satellite_and_the_observed_window():
    features = hms.parse_kml(
        _kml(_placemark(satellite="GOES-EAST", start="2026216 1200UTC", end="2026216 1500UTC"))
    )
    properties = features[0]["properties"]
    assert properties["satellite"] == "GOES-EAST"
    # Day 216 of 2026 is 2026-08-04; 12:00 UTC on it.
    assert properties["observed_start"] == int(
        datetime(2026, 8, 4, 12, 0, tzinfo=timezone.utc).timestamp() * 1000
    )
    assert properties["observed_end"] == int(
        datetime(2026, 8, 4, 15, 0, tzinfo=timezone.utc).timestamp() * 1000
    )


@pytest.mark.parametrize("raw", ["", "12:00 UTC", "2026216", "20262161200UTC", "9999999 9999UTC"])
def test_an_unreadable_stamp_degrades_to_null_rather_than_failing(raw):
    assert hms._parse_hms_time(raw) is None


def test_parse_drops_lon_lat_alt_down_to_lon_lat_and_trims_precision():
    features = hms.parse_kml(_kml(_placemark()))
    ring = features[0]["geometry"]["coordinates"][0]
    # The altitude ordinate — always 0 in this product — goes, so no consumer
    # has to ignore it. Coordinates round to ~1 m, matching nifc.py, which on a
    # continental plume is invisible and takes a tenth off the payload.
    assert all(len(point) == 2 for point in ring)
    assert ring[0] == [-123.18073, 41.42071]


def test_parse_drops_a_placemark_with_no_drawable_ring():
    assert hms.parse_kml(_kml(_placemark(coordinates="-123.0,41.0,0 -122.0,41.0,0"))) == []


def test_parse_drops_a_placemark_with_no_polygon_at_all():
    assert hms.parse_kml(_kml("<Placemark><name>NOAA logo</name></Placemark>")) == []


def test_unparseable_xml_is_an_upstream_error_not_a_traceback():
    with pytest.raises(UpstreamError):
        hms.parse_kml("<kml><Document>")


def test_collection_json_carries_the_fetch_time_and_the_analysis_date():
    body = json.loads(
        hms.collection_json(1_722_470_000_000, date(2026, 8, 4), hms.parse_kml(_kml(_placemark())))
    )
    assert body["type"] == "FeatureCollection"
    assert body["fetched_at"] == 1_722_470_000_000
    assert body["analysis_date"] == "2026-08-04"
    assert len(body["features"]) == 1


# ── Fetching ──────────────────────────────────────────────────────────────────


def _transport(responses: dict[str, httpx.Response]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return responses.get(str(request.url), httpx.Response(404, text="not found"))

    return httpx.MockTransport(handler)


@pytest.fixture
def served_kml(monkeypatch):
    """Route hms's fetch through a MockTransport keyed by URL."""

    def install(responses: dict[str, httpx.Response]) -> list[str]:
        asked: list[str] = []
        transport = _transport(responses)

        class _Client(httpx.AsyncClient):
            def __init__(self, **kwargs):
                kwargs.pop("transport", None)
                super().__init__(**kwargs, transport=transport)

            async def get(self, url, **kwargs):  # type: ignore[override]
                asked.append(str(url))
                return await super().get(url, **kwargs)

        monkeypatch.setattr(hms.httpx, "AsyncClient", _Client)
        return asked

    return install


async def test_fetch_uses_todays_file(served_kml):
    today = date(2026, 8, 4)
    asked = served_kml({hms.kml_url(today): httpx.Response(200, text=_kml(_placemark()))})
    snapshot = await hms.fetch_snapshot(datetime(2026, 8, 4, 20, 0, tzinfo=timezone.utc))
    assert asked == [hms.kml_url(today)]
    assert snapshot.analysis_date == "2026-08-04"
    assert snapshot.plumes == 1


async def test_fetch_falls_back_a_day_before_the_first_pass_lands(served_kml):
    # The morning state, not an outage: HMS's first analysis lands around late
    # morning Eastern, so the dated file simply does not exist before it.
    yesterday = date(2026, 8, 3)
    asked = served_kml({hms.kml_url(yesterday): httpx.Response(200, text=_kml(_placemark()))})
    snapshot = await hms.fetch_snapshot(datetime(2026, 8, 4, 13, 0, tzinfo=timezone.utc))
    assert asked == [hms.kml_url(date(2026, 8, 4)), hms.kml_url(yesterday)]
    # Labelled with the day it really came from, which is what keeps the
    # fallback honest rather than a quiet lie about how current the map is.
    assert snapshot.analysis_date == "2026-08-03"


async def test_fetch_gives_up_when_neither_day_exists(served_kml):
    served_kml({})
    with pytest.raises(UpstreamError):
        await hms.fetch_snapshot(datetime(2026, 8, 4, 20, 0, tzinfo=timezone.utc))


async def test_a_server_error_is_not_swallowed_as_a_missing_day(served_kml):
    # 500 is an outage and must surface; only 404 means "not published yet".
    today = date(2026, 8, 4)
    asked = served_kml({hms.kml_url(today): httpx.Response(500, text="oops")})
    with pytest.raises(httpx.HTTPStatusError):
        await hms.fetch_snapshot(datetime(2026, 8, 4, 20, 0, tzinfo=timezone.utc))
    assert asked == [hms.kml_url(today)]


# ── The cache ─────────────────────────────────────────────────────────────────
#
# The mechanics are SnapshotCache's and are exercised against the fire overlay
# in test_nifc.py. What is worth asserting here is that smoke is wired into
# them: it serves stale rather than failing, which for a product analyzed twice
# a day is the whole reason it uses this cache instead of a TTLCache.


async def test_an_aged_snapshot_survives_a_failed_refresh():
    clock = _Clock()
    healthy = True

    async def fetch() -> hms.Snapshot:
        if not healthy:
            raise UpstreamError("NOAA unreachable")
        return hms.Snapshot(fetched_at_ms=7, analysis_date="2026-08-04", plumes=1, body="{}")

    plumes = hms.smoke_cache(ttl_s=1800, clock=clock, fetch=fetch)
    await plumes.get()

    healthy = False
    clock.t = 1801
    await plumes.get()
    await plumes.settle()
    stale = await plumes.get()
    assert stale.fetched_at_ms == 7


# ── The route ─────────────────────────────────────────────────────────────────


@pytest.fixture
def served(monkeypatch):
    """Install a cache that answers from a fixed snapshot without any network."""

    def install(*placemarks: str, analysis_date: str = "2026-08-04") -> None:
        features = hms.parse_kml(_kml(*placemarks))
        body = hms.collection_json(
            1_722_470_000_000, date.fromisoformat(analysis_date), features
        )
        snapshot = hms.Snapshot(
            fetched_at_ms=1_722_470_000_000,
            analysis_date=analysis_date,
            plumes=len(features),
            body=body,
        )

        async def fetch() -> hms.Snapshot:
            return snapshot

        monkeypatch.setattr(hms, "PLUMES", hms.smoke_cache(fetch=fetch))

    return install


def test_route_returns_the_whole_analysis(served):
    served(_placemark(style="#Smoke_Light_style"), _placemark(style="#Smoke_Heavy_style"))
    with TestClient(app) as client:
        response = client.get("/api/smoke")
    assert response.status_code == 200
    body = response.json()
    assert body["fetched_at"] == 1_722_470_000_000
    assert body["analysis_date"] == "2026-08-04"
    assert [f["properties"]["density"] for f in body["features"]] == ["Light", "Heavy"]


def test_route_takes_no_bounding_box(served):
    # Deliberately unlike /api/wildfires: a busy day is under half a megabyte,
    # so a filter would be a parameter that saved nothing. An unknown query
    # param is simply ignored rather than rejected.
    served(_placemark())
    with TestClient(app) as client:
        assert client.get("/api/smoke", params={"bbox": "-180,-90,180,90"}).status_code == 200


def test_route_answers_503_when_nothing_has_ever_been_fetched():
    # The conftest default already refuses; this asserts the shape a cold pod
    # facing an unreachable NOAA presents to the browser.
    with TestClient(app) as client:
        response = client.get("/api/smoke")
    assert response.status_code == 503
    assert response.headers["Retry-After"]


def test_capabilities_publishes_the_smoke_bucket():
    with TestClient(app) as client:
        limits = client.get("/api/capabilities").json()["limits"]["rate"]
    assert "smoke_per_minute" in limits
    assert "smoke_burst" in limits
