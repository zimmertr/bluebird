from __future__ import annotations

import pytest
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.mark.parametrize("path", ["/api/nope", "/api/analyze/nope", "/api/v1/analyze"])
def test_unknown_api_path_returns_a_json_404(path):
    # Before the catch-all, these fell through to the SPA static mount and were
    # answered by StaticFiles, so an API typo was indistinguishable from a
    # missing web page and the body shape was an accident of the static handler.
    response = client.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert path in response.json()["detail"]


def test_unknown_api_path_points_at_the_docs():
    detail = client.get("/api/nope").json()["detail"]
    assert "/docs" in detail
    assert "/openapi.json" in detail


def test_unknown_api_path_404s_for_any_method():
    assert client.post("/api/nope", json={}).status_code == 404
    assert client.delete("/api/nope").status_code == 404


def test_wrong_method_on_a_real_path_is_a_405_not_a_404():
    # Starlette prefers the catch-all's full match over the real route's partial
    # one, so the 405 it would otherwise have produced has to be rebuilt. Worth
    # the trouble: telling a caller "wrong verb" beats "no such endpoint".
    response = client.get("/api/analyze")
    assert response.status_code == 405
    assert response.headers["allow"] == "POST"
    assert "POST" in response.json()["detail"]


def test_head_on_a_get_only_endpoint_reports_the_allowed_verb():
    # FastAPI's APIRoute does not imply HEAD from GET the way Starlette's plain
    # Route does, so this used to 404 while GET on the same path returned 200.
    response = client.head("/api/config")
    assert response.status_code == 405
    assert response.headers["allow"] == "GET"
    assert client.get("/api/config").status_code == 200


def test_catch_all_does_not_shadow_real_routes():
    for path in ("/api/version", "/api/capabilities", "/api/config"):
        assert client.get(path).status_code == 200, path


def test_catch_all_is_absent_from_the_schema():
    # It answers every path under /api; documenting it would bury the real
    # endpoints under a wildcard.
    assert not [p for p in app.openapi()["paths"] if "{path" in p]


def test_healthz_answers_head_for_uptime_monitors():
    assert client.head("/healthz").status_code == 200
    assert client.get("/healthz").json() == {"status": "ok"}
