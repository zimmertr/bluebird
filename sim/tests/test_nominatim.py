"""Nominatim: a list of places in `jsonv2`'s shape, the same list for the same text."""

from __future__ import annotations

from app import lattice


def _search(client, q: str, limit: int = 10):
    return client.get("/nominatim/search", params={"format": "jsonv2", "limit": limit, "extratags": 1, "q": q})


def test_rows_carry_what_the_web_app_reads(client):
    rows = _search(client, "Mount Rainier").json()
    assert len(rows) == 10
    for row in rows:
        # Strings, as Nominatim sends them; geocode.ts parses them.
        assert isinstance(row["lat"], str) and isinstance(row["lon"], str)
        float(row["lat"]), float(row["lon"])
        assert row["display_name"] == f"{row['name']}, Sim County, Washington, United States"
        assert row["osm_type"] in ("node", "way") and isinstance(row["osm_id"], int)
        assert len(row["boundingbox"]) == 4 and all(isinstance(v, str) for v in row["boundingbox"])
    assert {row["type"] for row in rows} >= {"peak", "water"}
    assert any(row["category"] == "place" for row in rows)
    peaks = [row for row in rows if row["type"] == "peak"]
    for row in peaks:
        summit = next(p for p in lattice.peaks_in_bbox(
            float(row["lat"]) - 1e-6, float(row["lon"]) - 1e-6, float(row["lat"]) + 1e-6, float(row["lon"]) + 1e-6
        ))
        assert float(row["extratags"]["ele"]) == summit.elevation_m
    importance = [row["importance"] for row in rows]
    assert importance == sorted(importance, reverse=True)


def test_the_same_text_is_the_same_bytes_and_another_is_not(client):
    first = _search(client, "Mount Rainier").content
    assert first == _search(client, "Mount Rainier").content
    assert first != _search(client, "Mount Baker").content


def test_a_coordinate_answers_the_places_beside_it(client):
    rows = _search(client, "47.5, -121.5", limit=3).json()
    assert len(rows) == 3
    assert all(abs(float(r["lat"]) - 47.5) < 0.5 and abs(float(r["lon"]) + 121.5) < 0.7 for r in rows)


def test_an_empty_search_finds_nothing(client):
    assert _search(client, "  ").json() == []


def test_a_fault_answers_plain_text(client):
    client.put("/control", json={"faults": {"nominatim": {"status": 503, "times": 1}}})
    assert _search(client, "x").status_code == 503
    assert _search(client, "x").status_code == 200
