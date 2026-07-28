from __future__ import annotations

from app import main
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_privacy_page_404s_without_a_build(tmp_path, monkeypatch):
    # The state of a source checkout and of CI: no SPA build output exists, so
    # there is nothing to serve. The route still has to exist and answer, which
    # is why it is registered unconditionally.
    monkeypatch.setattr(main, "_privacy_page", tmp_path / "missing" / "index.html")

    assert client.get("/privacy").status_code == 404


def test_privacy_page_is_served_at_the_path_people_paste(tmp_path, monkeypatch):
    page = tmp_path / "index.html"
    page.write_text("<!doctype html><title>Privacy and terms</title>", encoding="utf-8")
    monkeypatch.setattr(main, "_privacy_page", page)

    response = client.get("/privacy")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Privacy and terms" in response.text


def test_privacy_page_does_not_redirect(tmp_path, monkeypatch):
    # The static mount would also serve this file, as the directory index for
    # /privacy/, but only after 307ing /privacy to the trailing-slash form.
    # This route exists so the canonical URL is the one people type, and a
    # redirect creeping back in is the regression worth catching.
    page = tmp_path / "index.html"
    page.write_text("<!doctype html>", encoding="utf-8")
    monkeypatch.setattr(main, "_privacy_page", page)

    response = client.get("/privacy")

    assert not response.history
    assert response.status_code == 200


def test_privacy_under_the_api_prefix_is_still_json(tmp_path, monkeypatch):
    # /api belongs to the catch-all: a client that asked for JSON should never
    # have to parse an HTML page to find out it used the wrong path.
    page = tmp_path / "index.html"
    page.write_text("<!doctype html>", encoding="utf-8")
    monkeypatch.setattr(main, "_privacy_page", page)

    response = client.get("/api/privacy")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_privacy_page_is_absent_from_the_schema():
    # A human page, not an endpoint. Documenting it would put an HTML response
    # in a schema whose every other path returns JSON, and would churn the
    # committed openapi.json snapshot for something no client calls.
    assert "/privacy" not in app.openapi()["paths"]
