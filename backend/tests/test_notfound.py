from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.routing import Mount
from starlette.staticfiles import StaticFiles

from app.main import app
from app.routes.notfound import EDGE_PATH_PHRASE, not_found_body
from app.security_headers import APP_CSP, BASE_HEADERS

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate_edge_not_found import OUT as EDGE_RECORD  # noqa: E402 — after the sys.path insert above
from generate_edge_not_found import render as render_edge_record  # noqa: E402

client = TestClient(app)


@pytest.fixture
def static_mount(tmp_path):
    """The SPA mount the image has, which a source checkout lacks.

    Without build output there is no mount, and Starlette answers a path that
    matches nothing with a slash redirect instead, which hides what the image
    does with the same request.
    """
    (tmp_path / "404.html").write_text("<!doctype html><title>Not found</title>")
    mount = Mount("/", StaticFiles(directory=tmp_path, html=True))
    app.router.routes.append(mount)
    yield
    app.router.routes.remove(mount)


@pytest.mark.parametrize("path", ["/api/nope", "/api/analyze/nope", "/api/v1/analyze"])
def test_unknown_api_path_returns_a_json_404(path):
    # Before the catch-all, these fell through to the SPA static mount and were
    # answered by StaticFiles, so an API typo was indistinguishable from a
    # missing web page and the body shape was an accident of the static handler.
    response = client.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert path in response.json()["detail"]
    # This body is built by hand rather than raised, so it is the one place a
    # coded error could quietly go missing.
    assert response.json()["error"] == {"code": "not_found", "retryable": False}


@pytest.mark.parametrize("method", ["GET", "HEAD", "POST", "DELETE"])
@pytest.mark.parametrize("path", ["/api", "/api/"])
def test_the_bare_prefix_is_a_json_404_not_the_static_page(static_mount, method, path):
    # "/{path:path}" under the prefix never matches "/api" itself, so the image
    # used to answer it from the static mount with the HTML not-found page.
    response = client.request(method, path, follow_redirects=False)
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    if method != "HEAD":
        assert response.json() == not_found_body(path)


def test_the_body_is_one_builder_with_the_path_in_it():
    # The gateway's copy is this builder with a phrase for the path, so the
    # route must not grow a field the builder does not carry.
    assert client.get("/api/nope").json() == not_found_body("/api/nope")


def test_the_edge_record_is_what_the_script_writes():
    # bluebird-helm's Lint & render check compares the chart's directResponse
    # against this file on main, so a stale file would let the chart pass
    # against a body the pod no longer sends.
    assert EDGE_RECORD.read_text() == render_edge_record(), (
        "backend/edge_not_found.json is stale.\n"
        "Regenerate it, then update the chart's -api-internal route to match:\n"
        "    cd backend && python scripts/generate_edge_not_found.py"
    )


def test_the_edge_record_is_the_pods_404_with_a_phrase_for_the_path():
    record = json.loads(EDGE_RECORD.read_text())
    assert record["status"] == 404
    assert record["body"] == not_found_body(EDGE_PATH_PHRASE)
    assert record["body"]["error"] == {"code": "not_found", "retryable": False}
    # The #132 set an API path earns, read from the module that defines it,
    # so a header the generator stopped recording fails here by name.
    headers = record["headers"]
    for name, value in BASE_HEADERS.items():
        assert headers[name.lower()] == value
    assert headers["content-security-policy"] == APP_CSP
    assert headers["cache-control"] == "no-cache"
    assert headers["content-type"] == "application/json"
    assert headers["access-control-allow-origin"] == "*"


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
    assert response.json()["error"] == {
        "code": "method_not_allowed",
        "retryable": False,
    }


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
