"""The `Cache-Control` header by path class (#354)."""

from __future__ import annotations

import pytest
from app import cache_headers
from app.main import app
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

client = TestClient(app)

# One of each kind of response the service produces, because the middleware
# sits outside all of them: a page route, a probe, the API, the /api catch-all,
# the self-hosted reference page, and a miss under the asset prefix itself.
REVALIDATED = [
    pytest.param("/", id="spa-root"),
    pytest.param("/privacy", id="privacy"),
    pytest.param("/docs", id="docs"),
    pytest.param("/healthz", id="probe"),
    # `/api/version` rather than `/api/capabilities`: the one API route that
    # sets its own value is the exception below, and this list is about the
    # default.
    pytest.param("/api/version", id="api"),
    pytest.param("/api/not-a-route", id="api-404"),
    pytest.param("/assets/does-not-exist.js", id="asset-404"),
]


@pytest.mark.parametrize("path", REVALIDATED)
def test_everything_outside_the_asset_directory_revalidates(path):
    assert client.get(path).headers["Cache-Control"] == "no-cache"


def test_a_route_keeps_the_freshness_it_sets_for_itself():
    # `GET /api/capabilities` answers the same bytes to every visitor until a
    # deploy changes a constant, so it takes a minute of freshness of its own
    # (#337). The middleware must leave it alone: that is the whole meaning of
    # "only where the response carries none".
    assert client.get("/api/capabilities").headers["Cache-Control"] == "public, max-age=60"


def _static_app(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-abc123.js").write_text("export {}\n", encoding="utf-8")
    inner = Starlette(routes=[Mount("/", StaticFiles(directory=tmp_path, html=True))])
    inner.add_middleware(cache_headers.CacheHeadersMiddleware)
    return inner


def test_a_hashed_asset_is_immutable(tmp_path):
    # A real file under the prefix, because the name is the whole reason the
    # rule is safe: the hash is in it, so the URL never changes meaning.
    with TestClient(_static_app(tmp_path)) as static:
        response = static.get("/assets/app-abc123.js")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == cache_headers.IMMUTABLE


def test_the_path_the_middleware_reads_is_the_whole_request_path():
    # The asset rule is a prefix test against ``scope["path"]``, so it holds
    # only while that path is the one the browser asked for. The middleware is
    # outside every mount, which is what makes it so.
    seen = []

    async def record(scope, receive, send):
        seen.append(scope["path"])
        await PlainTextResponse("ok")(scope, receive, send)

    inner = Starlette(routes=[Mount("/assets", record)])
    inner.add_middleware(cache_headers.CacheHeadersMiddleware)

    with TestClient(inner) as mounted:
        response = mounted.get("/assets/app-abc123.js")

    assert seen == ["/assets/app-abc123.js"]
    assert response.headers["Cache-Control"] == cache_headers.IMMUTABLE


def test_a_miss_under_the_asset_directory_is_not_immutable(tmp_path):
    # A year of a cached 404 outlasts the release that would have fixed it.
    with TestClient(_static_app(tmp_path)) as static:
        response = static.get("/assets/app-deleted.js")

    assert response.status_code == 404
    assert response.headers["Cache-Control"] == "no-cache"


def test_a_static_file_still_answers_a_conditional_request(tmp_path):
    # The cost of no-cache is this exchange, so it has to be the cheap one.
    with TestClient(_static_app(tmp_path)) as static:
        first = static.get("/assets/app-abc123.js")
        again = static.get(
            "/assets/app-abc123.js",
            headers={"If-Modified-Since": first.headers["Last-Modified"]},
        )

    assert again.status_code == 304


def test_a_route_that_sets_its_own_value_keeps_it():
    # The route owns the freshness of its own body. #337 wants a short max-age
    # on two API routes, and this middleware must not take that decision.
    async def short(_request):
        return PlainTextResponse("ok", headers={"Cache-Control": "max-age=60"})

    inner = Starlette(routes=[Route("/c", short)])
    inner.add_middleware(cache_headers.CacheHeadersMiddleware)

    with TestClient(inner) as routed:
        response = routed.get("/c")

    assert response.headers["Cache-Control"] == "max-age=60"


def test_a_streamed_response_still_streams():
    """The reason the middleware is pure ASGI rather than BaseHTTPMiddleware.

    ``POST /api/analyze/stream`` is server-sent events, and a header layer
    that buffered it would turn a progress feed into one late delivery.
    """

    async def chunks():
        yield b"one"
        yield b"two"

    async def stream(_request):
        return StreamingResponse(chunks(), media_type="text/event-stream")

    inner = Starlette(routes=[Route("/s", stream)])
    inner.add_middleware(cache_headers.CacheHeadersMiddleware)

    with TestClient(inner) as streamed:
        response = streamed.get("/s")

    assert response.text == "onetwo"
    assert response.headers["Cache-Control"] == "no-cache"
