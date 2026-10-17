"""USFS: the pod's snapshot fetch reads all five sim layers, and sifts the order feeds."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app import control, usfs
from app.main import app as sim_app
from app.services import usfs_closures as pod
from app.services.errors import UpstreamRateLimited
from app.services.usfs_coverage import covers

BASE = "http://sim/usfs/"


@pytest.fixture(autouse=True)
def _pod(monkeypatch):
    control.reset()
    service = f"{BASE}R06_FireClosureOrders_PublicView/FeatureServer"
    monkeypatch.setattr(pod, "POINT_QUERY_URL", f"{service}/0/query")
    monkeypatch.setattr(pod, "LINE_QUERY_URL", f"{service}/1/query")
    monkeypatch.setattr(pod, "AREA_QUERY_URL", f"{service}/2/query")
    feeds = (
        pod.OrderFeed(pod.REGION_THREE.label, f"{BASE}r03_ForestOrder/FeatureServer/1/query", "R03"),
        pod.OrderFeed(pod.REGION_FOUR.label, f"{BASE}R04_Forest_Orders_PUBLIC_VIEW/FeatureServer/0/query", "R04"),
    )
    monkeypatch.setattr(pod, "ORDER_FEEDS", feeds)
    yield
    control.reset()


def _snapshot() -> pod.Snapshot:
    return asyncio.run(pod.fetch_snapshot(transport=httpx.ASGITransport(app=sim_app)))


def _props(closures):
    return [json.loads(c.blob)["properties"] for c in closures]


def test_the_pods_snapshot_holds_every_layer():
    snapshot = _snapshot()
    assert snapshot.regions == frozenset({"R06", "R03", "R04"})
    points, lines, areas = usfs.r06_points(), usfs.r06_lines(), usfs.r06_areas()
    # The lines outnumber one page, so the pod's pager took two.
    assert len(lines.features) > pod.PAGE_SIZE
    assert len(snapshot.trails_full) == len(lines.features) + len(points.features)
    assert len(snapshot.trails_coarse) == len(snapshot.trails_full)

    kept = {
        source: [f for f in layer.features if pod.is_area_closure(f.attributes)]
        for source, layer in (("R03", usfs.r03_orders()), ("R04", usfs.r04_orders()))
    }
    for source, layer in (("R03", usfs.r03_orders()), ("R04", usfs.r04_orders())):
        assert 0 < len(kept[source]) < len(layer.features)
    sources = [p["ClosureSource"] for p in _props(snapshot.areas_full)]
    assert sources.count("R06") == len(areas.features)
    assert sources.count("R03") == len(kept["R03"]) and sources.count("R04") == len(kept["R04"])
    assert len(snapshot.areas_coarse) == len(snapshot.areas_full)


def test_the_sifting_keeps_the_closures_and_drops_the_rest():
    for layer in (usfs.r03_orders(), usfs.r04_orders()):
        for feature in layer.features:
            kind = [k[0] for k in usfs.ORDER_KINDS].index(feature.attributes["ordertype"])
            assert pod.is_area_closure(feature.attributes) == (kind in usfs.KEPT_KINDS)


def test_every_feature_stands_inside_the_pods_coverage():
    snapshot = _snapshot()
    for kind, closures in (("trail", snapshot.trails_full), ("area", snapshot.areas_full)):
        for c in closures:
            for lat, lon in ((c.south, c.west), (c.north, c.east)):
                assert covers(kind, lat, lon), (kind, lat, lon)


def test_region_six_carries_the_fields_the_pod_asks_for():
    snapshot = _snapshot()
    lines = [p for p in _props(snapshot.trails_full) if "RouteName" in p]
    assert lines and all(p["RouteName"] and p["RouteNum"] for p in lines)
    for p in _props(snapshot.trails_full):
        for field in pod.POINT_FIELDS.split(","):
            assert field in p
        assert p["ClosureURLlink"].startswith("https://www.fs.usda.gov/r06/alerts/sim-")
        assert isinstance(p["ClosureStartDate"], int)
    assert all(p["GIS_Acres"] > 0 for p in _props(snapshot.areas_full))


def test_a_simplified_copy_has_fewer_vertices():
    snapshot = _snapshot()

    def vertices(closures):
        return sum(len(json.dumps(json.loads(c.blob)["geometry"]["coordinates"])) for c in closures)

    assert vertices(snapshot.areas_coarse) < vertices(snapshot.areas_full)
    assert vertices(snapshot.trails_coarse) < vertices(snapshot.trails_full)


def test_a_quota_fault_is_an_error_inside_a_200(client):
    client.put("/control", json={"faults": {"usfs": {"status": 429, "times": 1}}})
    r = client.get("/usfs/R06_FireClosureOrders_PublicView/FeatureServer/2/query", params={"f": "geojson"})
    assert r.status_code == 200
    with pytest.raises(UpstreamRateLimited):
        pod._parse_page(r.content)


def test_a_field_the_layer_lacks_is_refused(client):
    params = {"f": "geojson", "outFields": "OBJECTID,GIS_Acres"}
    r = client.get("/usfs/R06_FireClosureOrders_PublicView/FeatureServer/0/query", params=params)
    assert r.json()["error"]["code"] == 400


def test_the_same_snapshot_is_the_same_features():
    first, second = _snapshot(), _snapshot()
    assert [c.blob for c in first.areas_full] == [c.blob for c in second.areas_full]
    assert [c.blob for c in first.trails_coarse] == [c.blob for c in second.trails_coarse]
