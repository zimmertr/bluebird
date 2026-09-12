"""The security response headers, and the drift guard behind the CSP (#132)."""

from __future__ import annotations

import base64
import hashlib
import re
from html.parser import HTMLParser
from pathlib import Path

import pytest
from app import main, security_headers
from app.main import app
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.routing import Route

client = TestClient(app)

# One of each kind of response the service can produce, because the middleware
# sits outside all of them and a suite that checked only a route would not
# notice it slipping under the static mount or the /api catch-all.
PATHS = [
    pytest.param("/", id="spa-root"),
    pytest.param("/healthz", id="probe"),
    pytest.param("/api/capabilities", id="api"),
    pytest.param("/docs", id="docs"),
    pytest.param("/api/not-a-route", id="api-404"),
]

EXPECTED = {
    # This host only. includeSubDomains would have the app assert something
    # about a zone it cannot see, for a year a visitor cannot take back.
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
}


@pytest.mark.parametrize("path", PATHS)
def test_every_response_carries_the_header_set(path):
    response = client.get(path)
    for name, value in EXPECTED.items():
        assert response.headers[name] == value
    assert response.headers["Content-Security-Policy"]


def test_hsts_speaks_for_this_host_only():
    # Both directives reach past the one hostname this service answers on, and
    # neither can be withdrawn from a browser that has already read it. They
    # belong to whoever can verify the zone, which is the edge, not the app.
    hsts = client.get("/healthz").headers["Strict-Transport-Security"]
    assert "includeSubDomains" not in hsts
    assert "preload" not in hsts


def test_a_streamed_response_still_carries_the_headers():
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
    inner.add_middleware(security_headers.SecurityHeadersMiddleware)

    with TestClient(inner) as streamed:
        response = streamed.get("/s")
    assert response.text == "onetwo"
    assert response.headers["Content-Security-Policy"] == security_headers.APP_CSP
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_the_api_carries_the_app_policy():
    # The API is not a page, but it shares the origin with one: a policy that
    # stopped at the SPA would leave /api/* free to frame or to be framed.
    assert client.get("/api/capabilities").headers["Content-Security-Policy"] == (
        security_headers.APP_CSP
    )


def _parse(csp: str) -> dict[str, list[str]]:
    directives = {}
    for part in csp.split(";"):
        name, _, value = part.strip().partition(" ")
        directives[name] = value.split()
    return directives


def test_the_app_policy_names_every_third_party_origin_the_browser_fetches():
    connect = _parse(security_headers.APP_CSP)["connect-src"]
    assert set(security_headers.BROWSER_FETCH_ORIGINS) <= set(connect)
    assert connect[0] == "'self'"
    # An origin that serves images is one the browser also fetches, so a tile
    # host added to one list and not the other is a mistake either way.
    assert set(security_headers.BROWSER_IMAGE_ORIGINS) <= set(
        security_headers.BROWSER_FETCH_ORIGINS
    )
    assert set(security_headers.BROWSER_IMAGE_ORIGINS) <= set(
        _parse(security_headers.APP_CSP)["img-src"]
    )


def test_the_app_policy_forbids_the_dangerous_sources():
    app_csp = _parse(security_headers.APP_CSP)
    assert app_csp["script-src"] == ["'self'"]
    assert app_csp["object-src"] == ["'none'"]
    assert app_csp["frame-ancestors"] == ["'none'"]
    assert app_csp["base-uri"] == ["'self'"]
    assert app_csp["form-action"] == ["'self'"]
    assert "'unsafe-eval'" not in security_headers.APP_CSP


def test_the_docs_policy_differs_from_the_app_policy_only_where_stated():
    app_csp = _parse(security_headers.APP_CSP)
    docs = _parse(client.get("/docs").headers["Content-Security-Policy"])
    # Empty in the shipped image, which vendors both assets; the CDN origin in
    # a source checkout, which falls back to one.
    assets = set(main._DOCS_ASSET_ORIGINS)

    # Narrower: no third-party origin, and no worker at all.
    assert docs["img-src"] == ["'self'", "data:"]
    assert docs["connect-src"] == ["'self'"]
    assert "worker-src" not in docs
    assert "child-src" not in docs

    # Looser in exactly one place: the inline init script, by hash.
    hashes = {source for source in docs["script-src"] if source.startswith("'sha256-")}
    assert hashes, "Swagger UI's init script must be allowed by hash"
    assert set(docs["script-src"]) - hashes - assets == {"'self'"}

    # Everything else is the app's policy, give or take where those assets sit.
    shared = set(app_csp) - {"img-src", "connect-src", "worker-src", "child-src", "script-src"}
    assert {name: set(app_csp[name]) for name in shared} == {
        name: set(docs[name]) - assets for name in shared
    }


class _ScriptCollector(HTMLParser):
    """Inline script bodies, found the way a browser finds them.

    Deliberately a parser rather than the module's regex: the hash is only
    worth anything if something other than the code that produced it agrees
    on which bytes were hashed.
    """

    def __init__(self) -> None:
        super().__init__()
        self.inline: list[str] = []
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == "script" and not dict(attrs).get("src"):
            self._depth += 1

    def handle_endtag(self, tag):
        if tag == "script" and self._depth:
            self._depth -= 1

    def handle_data(self, data):
        if self._depth:
            self.inline.append(data)


def test_the_docs_script_hash_covers_the_script_the_page_serves():
    page = client.get("/docs")
    collector = _ScriptCollector()
    collector.feed(page.text)
    assert collector.inline, "FastAPI's docs page is expected to inline its init script"

    digests = {
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        for body in collector.inline
    }
    allowed = set(_parse(page.headers["Content-Security-Policy"])["script-src"])
    assert digests <= allowed


def test_the_docs_policy_allows_the_cdn_only_when_the_fallback_is_active():
    # A source checkout has no vendored assets, so /docs falls back to a CDN.
    # The policy has to follow the fallback or that checkout renders a blank
    # reference page with no clue why.
    served_locally = security_headers.docs_csp("<script>x</script>")
    from_cdn = security_headers.docs_csp("<script>x</script>", ("https://cdn.jsdelivr.net",))
    assert "cdn.jsdelivr.net" not in served_locally
    assert _parse(from_cdn)["script-src"][1] == "https://cdn.jsdelivr.net"
    assert "https://cdn.jsdelivr.net" in _parse(from_cdn)["style-src"]


def test_the_docs_page_is_the_one_path_with_its_own_policy():
    # Every other path, including the one a typo reaches, gets the app policy.
    assert main.DOCS_PATH == "/docs"
    assert client.get("/docsx").headers["Content-Security-Policy"] == security_headers.APP_CSP


# ── The drift guard ───────────────────────────────────────────────────────────

_FRONTEND_SRC = Path(__file__).parents[2] / "frontend" / "src"

# Hosts the frontend names but never fetches: attribution links, provider
# documentation, the peak lookups a result row offers. Each one is here
# because somebody decided it is a link rather than a request, which is the
# decision this list exists to force on the next host that appears.
LINK_ONLY_HOSTS = {
    "atmosphere.copernicus.eu",
    "creativecommons.org",
    "data-nifc.opendata.arcgis.com",
    "github.com",
    "nominatim.org",
    "open-meteo.com",
    "opendatacommons.org",
    "openfreemap.org",
    "polyformproject.org",
    "www.nifc.gov",
    "www.openstreetmap.org",
    "www.ospo.noaa.gov",
    "www.peakbagger.com",
    "www.weather.gov",
    "www.windy.com",
}

_HOST = re.compile(r"https://([A-Za-z0-9._-]+)")


def _frontend_hosts() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for path in sorted(_FRONTEND_SRC.rglob("*")):
        if not path.is_file() or ".test." in path.name:
            continue
        if path.suffix not in {".ts", ".tsx", ".css", ".html"}:
            continue
        for match in _HOST.finditer(path.read_text()):
            found.setdefault(match.group(1), set()).add(str(path.relative_to(_FRONTEND_SRC)))
    return found


@pytest.mark.skipif(
    not _FRONTEND_SRC.is_dir(),
    reason="frontend sources are not mounted; CI runs pytest from the repo root",
)
def test_every_host_the_frontend_names_is_classified():
    """A new host in the browser bundle is a CSP decision, not a silent one.

    The shipped image carries the built SPA and none of its sources, so this
    contract can only be checked where both trees are present: CI, and any
    local run that mounts the repository rather than backend/ alone.
    """
    fetched = {origin.removeprefix("https://") for origin in security_headers.BROWSER_FETCH_ORIGINS}
    assert not fetched & LINK_ONLY_HOSTS, "a host cannot be both fetched and link-only"

    found = _frontend_hosts()
    unclassified = {
        host: sorted(files) for host, files in found.items() if host not in fetched | LINK_ONLY_HOSTS
    }
    assert not unclassified, (
        "hosts in frontend/src that neither connect-src nor LINK_ONLY_HOSTS names: "
        f"{unclassified}"
    )

    stale = (fetched | LINK_ONLY_HOSTS) - set(found)
    assert not stale, f"hosts nothing in frontend/src names any more: {sorted(stale)}"
