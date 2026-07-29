from __future__ import annotations

import pytest
from app import main
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

# The two public document pages, each with the module-level attribute holding
# its built file. Everything below runs against both: they are the same route
# shape, and a suite that covered only /privacy is how /terms would quietly
# ship without the no-redirect guarantee that is the whole reason these routes
# exist instead of just the static mount.
PAGES = [
    pytest.param("/privacy", "_privacy_page", "Privacy", id="privacy"),
    pytest.param("/terms", "_terms_page", "Terms", id="terms"),
]


def _build(monkeypatch, tmp_path, attr, body="<!doctype html>"):
    page = tmp_path / "index.html"
    page.write_text(body, encoding="utf-8")
    monkeypatch.setattr(main, attr, page)
    return page


@pytest.mark.parametrize(("path", "attr", "title"), PAGES)
def test_404s_without_a_build(path, attr, title, tmp_path, monkeypatch):
    # The state of a source checkout and of CI: no SPA build output exists, so
    # there is nothing to serve. The route still has to exist and answer, which
    # is why it is registered unconditionally.
    monkeypatch.setattr(main, attr, tmp_path / "missing" / "index.html")

    assert client.get(path).status_code == 404


@pytest.mark.parametrize(("path", "attr", "title"), PAGES)
def test_is_served_at_the_path_people_paste(path, attr, title, tmp_path, monkeypatch):
    _build(monkeypatch, tmp_path, attr, f"<!doctype html><title>{title}</title>")

    response = client.get(path)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert title in response.text


@pytest.mark.parametrize(("path", "attr", "title"), PAGES)
@pytest.mark.parametrize("method", ["GET", "HEAD"])
def test_does_not_redirect(method, path, attr, title, tmp_path, monkeypatch):
    # The static mount would also serve these files, as the directory index for
    # /privacy/ and /terms/, but only after 307ing the bare path to the
    # trailing-slash form. These routes exist so the canonical URL is the one
    # people type, and a redirect creeping back in is the regression worth
    # catching.
    #
    # HEAD is parametrized in rather than assumed: FastAPI's APIRoute does not
    # imply it from GET the way Starlette's plain Route does, so a GET-only
    # route sends every link checker and unfurler down the redirect this test
    # is here to forbid, while the GET case keeps passing.
    _build(monkeypatch, tmp_path, attr)

    response = client.request(method, path)

    assert not response.history
    assert response.status_code == 200


@pytest.mark.parametrize(("path", "attr", "title"), PAGES)
def test_under_the_api_prefix_is_still_json(path, attr, title, tmp_path, monkeypatch):
    # /api belongs to the catch-all: a client that asked for JSON should never
    # have to parse an HTML page to find out it used the wrong path.
    _build(monkeypatch, tmp_path, attr)

    response = client.get(f"/api{path}")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


@pytest.mark.parametrize(("path", "attr", "title"), PAGES)
def test_is_absent_from_the_schema(path, attr, title):
    # Human pages, not endpoints. Documenting them would put HTML responses in
    # a schema whose every other path returns JSON, and would churn the
    # committed openapi.json snapshot for something no client calls.
    assert path not in app.openapi()["paths"]


def test_the_two_pages_are_distinct_documents(tmp_path, monkeypatch):
    # The point of the split is that /terms is its own URL, so the one thing
    # that must never regress is both routes resolving to the same file. They
    # share a _document_response helper, and passing it one path for both is a
    # plausible refactor slip that every test above would still pass.
    privacy = tmp_path / "privacy.html"
    privacy.write_text("<!doctype html><title>Privacy</title>", encoding="utf-8")
    terms = tmp_path / "terms.html"
    terms.write_text("<!doctype html><title>Terms</title>", encoding="utf-8")
    monkeypatch.setattr(main, "_privacy_page", privacy)
    monkeypatch.setattr(main, "_terms_page", terms)

    assert "Privacy" in client.get("/privacy").text
    assert "Terms" in client.get("/terms").text
