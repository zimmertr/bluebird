from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from app.main import app
from app.models import AnalyzeRequest, DestinationResult, DestinationType, GeoPolygon
from app.routes import analyze as analyze_mod
from app.routes.analyze import (
    _aligned_aqi,
    _assemble,
    _filter_elevation,
    _merge_custom,
    _noun,
    _sort_key,
    _sse,
    _summarize_request,
)
from fastapi.testclient import TestClient

client = TestClient(app)


# ── _filter_elevation ──────────────────────────────────────────────────────

DESTS = [
    {"name": "low", "elevation_ft": 500},
    {"name": "mid", "elevation_ft": 5000},
    {"name": "high", "elevation_ft": 9000},
    {"name": "unknown", "elevation_ft": None},
]


def test_filter_elevation_no_band_returns_all():
    assert _filter_elevation(DESTS, None, None) == DESTS


def test_filter_elevation_min_only_keeps_unknown():
    kept = {d["name"] for d in _filter_elevation(DESTS, 1000, None)}
    assert kept == {"mid", "high", "unknown"}


def test_filter_elevation_max_only():
    kept = {d["name"] for d in _filter_elevation(DESTS, None, 6000)}
    assert kept == {"low", "mid", "unknown"}


def test_filter_elevation_band_keeps_unknown_and_in_range():
    kept = {d["name"] for d in _filter_elevation(DESTS, 1000, 6000)}
    assert kept == {"mid", "unknown"}


# ── _sort_key ──────────────────────────────────────────────────────────────


def _result(name, precip=0.0, aqi=None):
    return DestinationResult(
        name=name, type="peak", latitude=1.0, longitude=2.0,
        precip_total_in=precip, precip_avg_in_hr=0.0, precip_max_in_hr=0.0,
        temp_min_f=0.0, temp_max_f=0.0, temp_avg_f=0.0,
        wind_min_mph=0.0, wind_max_mph=0.0, wind_avg_mph=0.0,
        aqi_avg=aqi, aqi_max=aqi,
    )


def test_sort_key_ascending():
    rows = [_result("c", 3.0), _result("a", 1.0), _result("b", 2.0)]
    rows.sort(key=_sort_key("precip_total_in", descending=False))
    assert [r.name for r in rows] == ["a", "b", "c"]


def test_sort_key_descending():
    rows = [_result("c", 3.0), _result("a", 1.0), _result("b", 2.0)]
    rows.sort(key=_sort_key("precip_total_in", descending=True))
    assert [r.name for r in rows] == ["c", "b", "a"]


def test_sort_key_none_sorts_last_ascending():
    rows = [_result("none", aqi=None), _result("low", aqi=50), _result("high", aqi=100)]
    rows.sort(key=_sort_key("aqi_avg", descending=False))
    assert [r.name for r in rows] == ["low", "high", "none"]


def test_sort_key_none_sorts_last_descending():
    rows = [_result("none", aqi=None), _result("low", aqi=50), _result("high", aqi=100)]
    rows.sort(key=_sort_key("aqi_avg", descending=True))
    assert [r.name for r in rows] == ["high", "low", "none"]


# ── small helpers ──────────────────────────────────────────────────────────


def test_noun_mapping():
    assert _noun(DestinationType.peak) == "peak"
    assert _noun(DestinationType.custom) == "destination"


def test_sse_format():
    line = _sse("status", message="hi")
    assert line.endswith("\n\n")
    assert json.loads(line[len("data: "):]) == {"type": "status", "message": "hi"}


def test_summarize_request_custom_includes_count():
    req = AnalyzeRequest(
        destination_type=DestinationType.custom,
        start_datetime=datetime.now(timezone.utc),
        end_datetime=datetime.now(timezone.utc) + timedelta(days=1),
        custom_destinations=[{"name": "A", "latitude": 1.0, "longitude": 2.0}],
    )
    summary = _summarize_request(req)
    assert "type=custom" in summary
    assert "custom=1" in summary


def test_summarize_request_polygon_includes_area():
    req = AnalyzeRequest(
        destination_type=DestinationType.peak,
        start_datetime=datetime.now(timezone.utc),
        end_datetime=datetime.now(timezone.utc) + timedelta(days=1),
        polygon=GeoPolygon(type="Polygon", coordinates=[[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]),
    )
    summary = _summarize_request(req)
    assert "polygon=" in summary
    assert "area=" in summary


def test_summarize_request_union_includes_polygon_and_custom():
    req = AnalyzeRequest(
        destination_type=DestinationType.peak,
        start_datetime=datetime.now(timezone.utc),
        end_datetime=datetime.now(timezone.utc) + timedelta(days=1),
        polygon=GeoPolygon(type="Polygon", coordinates=[[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]),
        custom_destinations=[{"name": "A", "latitude": 1.0, "longitude": 2.0}],
    )
    summary = _summarize_request(req)
    assert "custom=1" in summary
    assert "polygon=" in summary


# ── /api/analyze route (upstream services stubbed) ─────────────────────────


def _wx(precip):
    """A complete weather-metrics dict with a controllable precip total."""
    return {
        "precip_total_in": precip, "precip_avg_in_hr": precip, "precip_max_in_hr": precip,
        "temp_min_f": 40.0, "temp_max_f": 60.0, "temp_avg_f": 50.0,
        "wind_min_mph": 1.0, "wind_max_mph": 9.0, "wind_avg_mph": 5.0,
    }


def _window():
    now = datetime.now(timezone.utc)
    return now.isoformat(), (now + timedelta(days=1)).isoformat()


@pytest.fixture
def stub_upstreams(monkeypatch):
    """Weather returns precip = destination latitude; AQI degrades to None."""

    async def fake_wx(destinations, start, end, on_progress=None):
        return [_wx(d["latitude"]) for d in destinations]

    async def fake_aqi(destinations, start, end):
        return [None] * len(destinations)

    monkeypatch.setattr(analyze_mod.weather, "fetch_weather_batch", fake_wx)
    monkeypatch.setattr(analyze_mod.air_quality, "fetch_aqi_batch", fake_aqi)


def test_analyze_custom_ranks_and_limits(stub_upstreams):
    start, end = _window()
    body = {
        "destination_type": "custom",
        "start_datetime": start,
        "end_datetime": end,
        "sort_by": "precip_total_in",
        "limit": 2,
        "custom_destinations": [
            {"name": "c", "latitude": 3.0, "longitude": 0.0},
            {"name": "a", "latitude": 1.0, "longitude": 0.0},
            {"name": "b", "latitude": 2.0, "longitude": 0.0},
        ],
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_queried"] == 3
    # Ascending precip (== latitude), truncated to the limit of 2.
    assert [r["name"] for r in data["results"]] == ["a", "b"]


def test_analyze_start_after_end_is_400(stub_upstreams):
    now = datetime.now(timezone.utc)
    body = {
        "destination_type": "custom",
        "start_datetime": now.isoformat(),
        "end_datetime": (now - timedelta(hours=1)).isoformat(),
        "custom_destinations": [{"name": "a", "latitude": 1.0, "longitude": 2.0}],
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 400
    assert "before" in resp.json()["detail"]


def test_analyze_equal_window_is_current_forecast(stub_upstreams):
    # start == end is a point sample ("current conditions"): the model
    # normalizes it to the hour at hand instead of the routes rejecting it as
    # an empty window.
    now = datetime.now(timezone.utc)
    body = {
        "destination_type": "custom",
        "start_datetime": now.isoformat(),
        "end_datetime": now.isoformat(),
        "custom_destinations": [{"name": "a", "latitude": 1.0, "longitude": 2.0}],
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    assert resp.json()["total_queried"] == 1


def test_analyze_equal_window_at_future_moment(stub_upstreams):
    # The "future day/time" mode is the same wire shape at a later hour —
    # a future equal window must analyze, not 400 as empty or out of range.
    at = datetime.now(timezone.utc) + timedelta(hours=30)
    body = {
        "destination_type": "custom",
        "start_datetime": at.isoformat(),
        "end_datetime": at.isoformat(),
        "custom_destinations": [{"name": "a", "latitude": 1.0, "longitude": 2.0}],
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    assert resp.json()["total_queried"] == 1


def test_analyze_custom_without_destinations_is_400(stub_upstreams):
    start, end = _window()
    resp = client.post("/api/analyze", json={
        "destination_type": "custom", "start_datetime": start, "end_datetime": end,
    })
    assert resp.status_code == 400
    assert "custom_destinations is required" in resp.json()["detail"]


def test_analyze_peak_without_polygon_is_400(stub_upstreams):
    start, end = _window()
    resp = client.post("/api/analyze", json={
        "destination_type": "peak", "start_datetime": start, "end_datetime": end,
    })
    assert resp.status_code == 400
    assert "polygon is required" in resp.json()["detail"]


def test_analyze_elevation_band_can_empty_results(stub_upstreams):
    start, end = _window()
    body = {
        "destination_type": "custom", "start_datetime": start, "end_datetime": end,
        "min_elevation_ft": 8000,
        "custom_destinations": [
            {"name": "low", "latitude": 1.0, "longitude": 0.0, "elevation_ft": 500},
        ],
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    assert resp.json() == {"results": [], "total_queried": 0, "error": None, "times": []}


def test_analyze_over_peak_cap_is_400(monkeypatch, stub_upstreams):
    from app.models import MAX_ANALYZE_PEAKS

    async def flood(polygon, destination_type, on_status=None):
        return [
            {"name": f"p{i}", "latitude": 1.0, "longitude": 2.0, "elevation_ft": None, "osm_id": None}
            for i in range(MAX_ANALYZE_PEAKS + 1)
        ]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", flood)
    start, end = _window()
    body = {
        "destination_type": "peak", "start_datetime": start, "end_datetime": end,
        "polygon": {"type": "Polygon", "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]},
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 400
    assert "analysis limit" in resp.json()["detail"]


def test_analyze_stream_emits_error_event(stub_upstreams):
    now = datetime.now(timezone.utc)
    body = {
        "destination_type": "custom",
        "start_datetime": now.isoformat(),
        "end_datetime": (now - timedelta(hours=1)).isoformat(),
        "custom_destinations": [{"name": "a", "latitude": 1.0, "longitude": 2.0}],
    }
    resp = client.post("/api/analyze/stream", json=body)
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    events = [json.loads(line[len("data: "):]) for line in resp.text.splitlines() if line.startswith("data: ")]
    assert any(e["type"] == "error" and "before" in e["message"] for e in events)


def test_analyze_stream_custom_happy_path_emits_result(stub_upstreams):
    start, end = _window()
    body = {
        "destination_type": "custom", "start_datetime": start, "end_datetime": end,
        "custom_destinations": [
            {"name": "a", "latitude": 1.0, "longitude": 0.0},
            {"name": "b", "latitude": 2.0, "longitude": 0.0},
        ],
    }
    resp = client.post("/api/analyze/stream", json=body)
    events = [json.loads(line[len("data: "):]) for line in resp.text.splitlines() if line.startswith("data: ")]
    result_events = [e for e in events if e["type"] == "result"]
    assert len(result_events) == 1
    assert result_events[0]["data"]["total_queried"] == 2
    # The count is announced up front via an initial 0-progress event, so the
    # overlay names it ("Retrieving 2 Forecasts…") without a count-less flash.
    progress_events = [e for e in events if e["type"] == "progress"]
    assert progress_events[0]["processed"] == 0
    assert progress_events[0]["total"] == 2
    # No leftover per-type status wording.
    statuses = [e["message"] for e in events if e["type"] == "status"]
    assert not any("custom" in s or "Analyzing" in s or "Retrieving" in s for s in statuses)


def test_analyze_stream_polygon_searches_then_announces_count(monkeypatch, stub_upstreams):
    async def two_peaks(polygon, destination_type, on_status=None):
        return [
            {"name": "a", "latitude": 1.0, "longitude": 2.0, "elevation_ft": None, "osm_id": "node/1"},
            {"name": "b", "latitude": 2.0, "longitude": 3.0, "elevation_ft": None, "osm_id": "node/2"},
        ]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", two_peaks)
    start, end = _window()
    body = {
        "destination_type": "peak", "start_datetime": start, "end_datetime": end,
        "polygon": {"type": "Polygon", "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]},
    }
    resp = client.post("/api/analyze/stream", json=body)
    events = [json.loads(line[len("data: "):]) for line in resp.text.splitlines() if line.startswith("data: ")]
    types = [e["type"] for e in events]
    statuses = [e["message"] for e in events if e["type"] == "status"]
    # Discovery shows only the generic label, and it precedes the first progress
    # event (which carries the count) — no count-less "Retrieving…" in between.
    assert "Searching for Destinations…" in statuses
    assert types.index("status") < types.index("progress")
    first_progress = next(e for e in events if e["type"] == "progress")
    assert first_progress["processed"] == 0
    assert first_progress["total"] == 2
    # No mirror-failover detail, and no leftover per-type/analyzing wording.
    assert not any("Attempting" in s or "Lookup" in s for s in statuses)
    assert not any("peak" in s or "Found" in s or "Analyzing" in s or "Retrieving" in s for s in statuses)


# ── polygon ∪ custom union ─────────────────────────────────────────────────


UNION_POLY = {"type": "Polygon", "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]]}


def _union_body(start, end, custom):
    return {
        "destination_type": "peak", "start_datetime": start, "end_datetime": end,
        "polygon": UNION_POLY, "custom_destinations": custom,
    }


def test_analyze_union_ranks_polygon_and_custom_together(monkeypatch, stub_upstreams):
    async def two_peaks(polygon, destination_type, on_status=None):
        return [
            {"name": "pk_a", "latitude": 1.0, "longitude": 2.0, "elevation_ft": None, "osm_id": "node/1"},
            {"name": "pk_b", "latitude": 3.0, "longitude": 4.0, "elevation_ft": None, "osm_id": "node/2"},
        ]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", two_peaks)
    start, end = _window()
    body = _union_body(start, end, [
        {"name": "cu_a", "latitude": 2.0, "longitude": 5.0},
        {"name": "cu_b", "latitude": 4.0, "longitude": 6.0},
    ])
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_queried"] == 4
    # One ranking across both sources (ascending precip == latitude).
    assert [r["name"] for r in data["results"]] == ["pk_a", "cu_a", "pk_b", "cu_b"]
    by_name = {r["name"]: r for r in data["results"]}
    assert by_name["pk_a"]["type"] == "peak" and by_name["pk_a"]["osm_id"] == "node/1"
    assert by_name["cu_a"]["type"] == "custom" and by_name["cu_a"]["osm_id"] is None


def test_analyze_union_dedup_by_name_custom_wins(monkeypatch, stub_upstreams):
    async def one_peak(polygon, destination_type, on_status=None):
        return [{"name": "Shared", "latitude": 1.0, "longitude": 2.0, "elevation_ft": 5000, "osm_id": "node/1"}]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", one_peak)
    start, end = _window()
    body = _union_body(start, end, [{"name": "Shared", "latitude": 9.0, "longitude": 9.0}])
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_queried"] == 1
    row = data["results"][0]
    assert row["type"] == "custom" and row["osm_id"] is None and row["latitude"] == 9.0


def test_analyze_union_dedup_by_coord_custom_wins(monkeypatch, stub_upstreams):
    async def one_peak(polygon, destination_type, on_status=None):
        return [{"name": "Discovered", "latitude": 46.852890, "longitude": -121.760410, "elevation_ft": None, "osm_id": "node/1"}]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", one_peak)
    start, end = _window()
    # Different name; same coordinate at 5-decimal (~1 m) precision.
    body = _union_body(start, end, [{"name": "Mine", "latitude": 46.852892, "longitude": -121.760408}])
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_queried"] == 1
    assert data["results"][0]["name"] == "Mine"
    assert data["results"][0]["type"] == "custom"


def test_analyze_union_with_empty_discovery_still_analyzes_custom(monkeypatch, stub_upstreams):
    async def nothing(polygon, destination_type, on_status=None):
        return []

    monkeypatch.setattr(analyze_mod.osm, "query_osm", nothing)
    start, end = _window()
    body = _union_body(start, end, [{"name": "cu", "latitude": 1.0, "longitude": 2.0}])
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_queried"] == 1
    assert data["results"][0]["name"] == "cu"


def test_analyze_stream_union_with_empty_discovery_still_analyzes_custom(monkeypatch, stub_upstreams):
    async def nothing(polygon, destination_type, on_status=None):
        return []

    monkeypatch.setattr(analyze_mod.osm, "query_osm", nothing)
    start, end = _window()
    body = _union_body(start, end, [{"name": "cu", "latitude": 1.0, "longitude": 2.0}])
    resp = client.post("/api/analyze/stream", json=body)
    events = [json.loads(line[len("data: "):]) for line in resp.text.splitlines() if line.startswith("data: ")]
    result_events = [e for e in events if e["type"] == "result"]
    assert len(result_events) == 1
    assert result_events[0]["data"]["total_queried"] == 1
    assert result_events[0]["data"]["results"][0]["name"] == "cu"


def test_analyze_stream_union_emits_search_then_mixed_result(monkeypatch, stub_upstreams):
    async def one_peak(polygon, destination_type, on_status=None):
        return [{"name": "pk", "latitude": 1.0, "longitude": 2.0, "elevation_ft": None, "osm_id": "node/1"}]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", one_peak)
    start, end = _window()
    body = _union_body(start, end, [{"name": "cu", "latitude": 2.0, "longitude": 3.0}])
    resp = client.post("/api/analyze/stream", json=body)
    events = [json.loads(line[len("data: "):]) for line in resp.text.splitlines() if line.startswith("data: ")]
    statuses = [e["message"] for e in events if e["type"] == "status"]
    assert "Searching for Destinations…" in statuses
    first_progress = next(e for e in events if e["type"] == "progress")
    assert first_progress["total"] == 2
    result = next(e for e in events if e["type"] == "result")["data"]
    types = {r["name"]: r["type"] for r in result["results"]}
    assert types == {"pk": "peak", "cu": "custom"}


def test_analyze_union_counts_toward_cap(monkeypatch, stub_upstreams):
    from app.models import MAX_ANALYZE_PEAKS

    async def near_cap(polygon, destination_type, on_status=None):
        # Distinct coords/names — collisions with the custom rows would dedup
        # away before the cap.
        return [
            {"name": f"p{i}", "latitude": i * 0.001, "longitude": 0.0, "elevation_ft": None, "osm_id": None}
            for i in range(MAX_ANALYZE_PEAKS - 5)
        ]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", near_cap)
    start, end = _window()
    body = _union_body(start, end, [
        {"name": f"c{i}", "latitude": 50.0 + i, "longitude": 10.0} for i in range(10)
    ])
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "analysis limit" in detail
    assert "destinations" in detail          # mixed set speaks generically
    assert "trim the custom list" in detail  # advice includes the CSV remedy


def test_analyze_union_elevation_filter_applies_to_custom_rows(monkeypatch, stub_upstreams):
    async def one_peak(polygon, destination_type, on_status=None):
        return [{"name": "pk", "latitude": 1.0, "longitude": 2.0, "elevation_ft": 9000, "osm_id": "node/1"}]

    monkeypatch.setattr(analyze_mod.osm, "query_osm", one_peak)
    start, end = _window()
    body = {
        **_union_body(start, end, [
            {"name": "low", "latitude": 2.0, "longitude": 3.0, "elevation_ft": 500},
            {"name": "mystery", "latitude": 3.0, "longitude": 4.0},
        ]),
        "min_elevation_ft": 8000,
    }
    resp = client.post("/api/analyze", json=body)
    assert resp.status_code == 200
    data = resp.json()
    # The band drops the low custom row; the unknown-elevation one passes.
    assert {r["name"] for r in data["results"]} == {"pk", "mystery"}
    assert data["total_queried"] == 2


def test_merge_custom_no_collision_appends():
    discovered = [{"name": "a", "latitude": 1.0, "longitude": 2.0}]
    custom = [{"name": "b", "latitude": 3.0, "longitude": 4.0}]
    assert _merge_custom(discovered, custom) == discovered + custom


def test_merge_custom_name_collision_drops_discovered():
    discovered = [{"name": "same", "latitude": 1.0, "longitude": 2.0}]
    custom = [{"name": "same", "latitude": 9.0, "longitude": 9.0}]
    assert _merge_custom(discovered, custom) == custom


def test_merge_custom_coord_collision_drops_discovered():
    discovered = [{"name": "osm", "latitude": 46.852890, "longitude": -121.760410}]
    custom = [{"name": "mine", "latitude": 46.852892, "longitude": -121.760408}]
    assert _merge_custom(discovered, custom) == custom


# ── _aligned_aqi / _assemble (series bake-in) ──────────────────────────────


def test_aligned_aqi_none_series_is_all_null():
    assert _aligned_aqi([1000, 2000, 3000], None) == [None, None, None]


def test_aligned_aqi_maps_matching_hours_and_trails_null():
    # AQI covers the first two grid hours; the third is past its horizon → null.
    aqi_series = {"times": [1000, 2000], "aqi": [40, 55]}
    assert _aligned_aqi([1000, 2000, 3000], aqi_series) == [40, 55, None]


def _dest(name, lat):
    return {"name": name, "latitude": lat, "longitude": 0.0, "elevation_ft": None, "osm_id": None}


def _wx_series(precip_total, times, precip, temp, wind):
    return {**_wx(precip_total), "series": {
        "times": times, "precip_in": precip, "temp_f": temp, "wind_mph": wind,
    }}


def test_assemble_bakes_series_and_shares_the_time_grid():
    times = [1000, 2000]
    dests = [_dest("a", 1.0), _dest("b", 2.0)]
    wx_list = [
        _wx_series(0.1, times, [0.1, None], [50.0, 51.0], [5.0, 6.0]),
        _wx_series(0.2, times, [0.2, 0.3], [40.0, 41.0], [7.0, 8.0]),
    ]
    aqi_list = [
        {"aqi_avg": 40, "aqi_max": 55, "series": {"times": [1000], "aqi": [40]}},
        None,
    ]
    results, out_times = _assemble(dests, wx_list, aqi_list, "custom")

    assert out_times == times
    a = results[0]
    assert a.series.precip_in == [0.1, None]  # per-metric nulls survive as gaps
    assert a.series.temp_f == [50.0, 51.0]
    assert a.series.aqi == [40, None]         # AQI present at 1000, null past horizon
    assert a.aqi_avg == 40                    # aggregates still flow through
    # Second row had no AQI → all-null AQI series, but the row still has a series.
    assert results[1].series.aqi == [None, None]
    assert results[1].aqi_avg is None


def test_assemble_without_series_degrades_to_none():
    # Stubbed weather (aggregates only, no "series") → series is None and the
    # shared grid is empty. This is exactly what the route stubs produce.
    results, out_times = _assemble([_dest("a", 1.0)], [_wx(0.1)], [None], "custom")
    assert out_times == []
    assert results[0].series is None


def test_assemble_drops_rows_with_no_weather():
    results, _ = _assemble(
        [_dest("a", 1.0), _dest("b", 2.0)], [None, _wx(0.2)], [None, None], "custom"
    )
    assert [r.name for r in results] == ["b"]


def test_assemble_prefers_per_destination_type():
    dests = [_dest("pk", 1.0), {**_dest("cu", 2.0), "type": "custom"}]
    results, _ = _assemble(dests, [_wx(0.1), _wx(0.2)], [None, None], "peak")
    assert [(r.name, r.type) for r in results] == [("pk", "peak"), ("cu", "custom")]
