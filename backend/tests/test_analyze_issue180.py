"""Issue #180 route behavior: refusal remedies, elective truncation, lazy AQI,
and the SSE keepalive."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.main import app
from app.routes.analyze import (
    _suggest_elevation_floor,
    _truncate_top_elevation,
    _with_keepalive,
)
from app.services import air_quality, osm, weather
from fastapi.testclient import TestClient

client = TestClient(app)


# ── Pure helpers ───────────────────────────────────────────────────────────


def _dests(elevations: list[float | None]) -> list[dict]:
    return [
        {
            "name": f"P{i}",
            "latitude": 47.0 + i * 1e-4,
            "longitude": -121.0,
            "elevation_ft": e,
            "osm_id": f"node/{i}",
        }
        for i, e in enumerate(elevations)
    ]


def test_suggest_floor_picks_the_cutting_elevation():
    floor = _suggest_elevation_floor(_dests([1000, 2000, 3000, 4000, 5000]), cap=3)
    assert floor == (3000, 3)


def test_suggest_floor_rounds_up_and_never_overshoots_the_cap():
    floor = _suggest_elevation_floor(_dests([4980, 4880, 4780, 4680]), cap=2)
    assert floor is not None
    floor_ft, keeps = floor
    assert floor_ft == 4900  # 4880 rounded up to the next 100
    assert keeps <= 2


def test_suggest_floor_counts_unknowns_that_always_pass():
    floor = _suggest_elevation_floor(_dests([None, None, 1000, 2000, 3000]), cap=3)
    # Two unknowns leave budget for one known: threshold 3000.
    assert floor == (3000, 3)


def test_suggest_floor_impossible_when_unknowns_exceed_cap():
    assert _suggest_elevation_floor(_dests([None, None, None, 1000]), cap=2) is None


def test_truncate_top_elevation_drops_unknowns_first():
    kept = _truncate_top_elevation(_dests([None, 1000, 5000, 3000]), cap=2)
    assert [d["elevation_ft"] for d in kept] == [5000, 3000]


# ── Route behavior (services stubbed) ──────────────────────────────────────


def _window() -> dict[str, str]:
    now = datetime.now(timezone.utc)
    return {
        "start_datetime": now.isoformat(),
        "end_datetime": (now + timedelta(days=1)).isoformat(),
    }


_POLY = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]],
}


def _wx(n: int) -> list[dict]:
    return [
        {
            "precip_total_in": 0.0,
            "precip_avg_in_hr": 0.0,
            "precip_max_in_hr": 0.0,
            "temp_min_f": 40.0,
            "temp_max_f": 50.0,
            "temp_avg_f": 45.0,
            "wind_min_mph": 1.0,
            "wind_max_mph": 9.0,
            "wind_avg_mph": 5.0,
        }
        for _ in range(n)
    ]


def _stub_discovery(monkeypatch, count: int):
    dests = _dests([1000.0 + i for i in range(count)])

    async def fake_query(polygon, destination_type, on_status=None):
        return list(dests)

    monkeypatch.setattr(osm, "query_osm", fake_query)


def _stub_weather(monkeypatch):
    async def fake_weather(destinations, start, end, on_progress=None, on_pace=None):
        return _wx(len(destinations))

    monkeypatch.setattr(weather, "fetch_weather_batch", fake_weather)


def _stub_aqi(monkeypatch, calls: list[int]):
    async def fake_aqi(destinations, start, end):
        calls.append(len(destinations))
        return [None] * len(destinations)

    monkeypatch.setattr(air_quality, "fetch_aqi_batch", fake_aqi)


def test_over_cap_refusal_carries_remedy_fields(monkeypatch):
    _stub_discovery(monkeypatch, 1_501)
    resp = client.post(
        "/api/analyze",
        json={"destination_type": "peak", "polygon": _POLY, **_window()},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert "1,500 destinations" in body["detail"]
    assert body["found"] == 1_501
    assert body["limit"] == 1_500
    assert body["suggested_min_elevation_ft"] is not None
    assert body["suggested_keeps"] <= 1_500


def test_destinations_refusal_matches(monkeypatch):
    _stub_discovery(monkeypatch, 1_501)
    resp = client.post(
        "/api/destinations",
        json={"destination_type": "peak", "polygon": _POLY},
    )
    assert resp.status_code == 400
    assert resp.json()["found"] == 1_501


def test_elected_truncation_analyzes_the_top_and_says_so(monkeypatch):
    _stub_discovery(monkeypatch, 1_501)
    _stub_weather(monkeypatch)
    _stub_aqi(monkeypatch, [])
    resp = client.post(
        "/api/analyze",
        json={
            "destination_type": "peak",
            "polygon": _POLY,
            "top_by_elevation": True,
            "limit": 5,
            **_window(),
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["truncated"] is True
    assert body["total_found"] == 1_501
    assert body["total_queried"] == 1_500
    # The lowest candidate (1000 ft) is the one the cut dropped.
    names = {r["name"] for r in body["results"]}
    assert "P0" not in names


def test_destinations_elected_truncation(monkeypatch):
    _stub_discovery(monkeypatch, 1_501)
    resp = client.post(
        "/api/destinations",
        json={"destination_type": "peak", "polygon": _POLY, "top_by_elevation": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["truncated"] is True
    assert body["total_found"] == 1_501
    assert body["total"] == 1_500


def test_lazy_aqi_fetches_only_displayed_rows(monkeypatch):
    _stub_discovery(monkeypatch, 20)
    _stub_weather(monkeypatch)
    calls: list[int] = []
    _stub_aqi(monkeypatch, calls)
    resp = client.post(
        "/api/analyze",
        json={"destination_type": "peak", "polygon": _POLY, "limit": 5, **_window()},
    )
    assert resp.status_code == 200
    # AQI is display data here (default precip sort): fetched once, for
    # exactly the 5 returned rows, not the 20 candidates.
    assert calls == [5]


def test_aqi_sort_fetches_every_candidate(monkeypatch):
    _stub_discovery(monkeypatch, 20)
    _stub_weather(monkeypatch)
    calls: list[int] = []
    _stub_aqi(monkeypatch, calls)
    resp = client.post(
        "/api/analyze",
        json={
            "destination_type": "peak",
            "polygon": _POLY,
            "limit": 5,
            "sort_by": "aqi_avg",
            **_window(),
        },
    )
    assert resp.status_code == 200
    # Ranking BY air quality cannot be done without it: all 20 fetched.
    assert calls == [20]


# ── Keepalive ──────────────────────────────────────────────────────────────


async def test_keepalive_fills_stream_silences():
    async def slow_source():
        yield "data: {\"type\": \"status\"}\n\n"
        await asyncio.sleep(0.08)
        yield "data: {\"type\": \"result\"}\n\n"

    items = [item async for item in _with_keepalive(slow_source(), interval_s=0.02)]
    assert any('"keepalive"' in item for item in items)
    # Order preserved around the filler.
    assert '"status"' in items[0]
    assert '"result"' in items[-1]


async def test_keepalive_silent_on_a_chatty_stream():
    async def chatty_source():
        for _ in range(3):
            yield "data: {\"type\": \"progress\"}\n\n"

    items = [item async for item in _with_keepalive(chatty_source(), interval_s=5.0)]
    assert len(items) == 3
    assert not any("keepalive" in item for item in items)
