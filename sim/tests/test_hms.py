"""HMS: a dated KML the pod's parser reads, and the 404 that sends it to yesterday."""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta

import pytest
from pod_client import route_to_sim

from app import control, hms
from app.services import hms as pod_hms

SIM_URL = "http://sim/hms"


@pytest.fixture(autouse=True)
def _pod(monkeypatch):
    control.reset()
    monkeypatch.setattr(pod_hms, "BASE_URL", SIM_URL)
    yield
    control.reset()


def _path(day: date) -> str:
    return pod_hms.kml_url(day).removeprefix("http://sim")


def test_a_days_file_reads_through_the_pods_parser():
    day = date(2026, 8, 4)
    features = pod_hms.parse_kml(hms.kml(day))
    assert 20 < len(features) < 60
    assert {f["properties"]["density"] for f in features} == set(pod_hms.DENSITIES)
    assert all("density_raw" not in f["properties"] for f in features)
    for f in features:
        props = f["properties"]
        assert props["satellite"] == "GOES-EAST"
        start, end = props["observed_start"], props["observed_end"]
        assert datetime(2026, 8, 4, 12, tzinfo=UTC).timestamp() * 1000 <= start < end
        assert end < datetime(2026, 8, 5, tzinfo=UTC).timestamp() * 1000
        ring = f["geometry"]["coordinates"][0]
        assert len(ring) >= 9 and ring[0] == ring[-1]
        assert all(-126 < lon < -101 and 30 < lat < 50 for lon, lat in ring)


def test_the_server_holds_three_days(client):
    today = datetime.now(UTC).date()
    for offset in (-1, 0, 1):
        assert client.get(_path(today + timedelta(days=offset))).status_code == 200
    for offset in (-2, 2, 400):
        assert client.get(_path(today + timedelta(days=offset))).status_code == 404
    assert client.get("/hms/2026/08/hms_smoke20260804.txt").status_code == 404


def test_the_pod_takes_today(monkeypatch):
    asked = route_to_sim(monkeypatch)
    snapshot = asyncio.run(pod_hms.fetch_snapshot())
    assert len(asked) == 1
    assert snapshot.analysis_date == pod_hms.analysis_date().isoformat()
    assert snapshot.plumes > 0


def test_a_404_fault_sends_the_pod_to_yesterday(client, monkeypatch):
    client.put("/control", json={"faults": {"hms": {"status": 404, "times": 1}}})
    asked = route_to_sim(monkeypatch)
    snapshot = asyncio.run(pod_hms.fetch_snapshot())
    today = pod_hms.analysis_date()
    assert asked == [pod_hms.kml_url(today), pod_hms.kml_url(today - timedelta(days=1))]
    assert snapshot.analysis_date == (today - timedelta(days=1)).isoformat()


def test_a_day_is_the_same_bytes_and_the_next_day_is_not(client):
    today = datetime.now(UTC).date()
    first = client.get(_path(today)).content
    assert first == client.get(_path(today)).content
    assert first != client.get(_path(today - timedelta(days=1))).content
    assert hms.kml(date(2026, 8, 4)) == hms.kml(date(2026, 8, 4))
