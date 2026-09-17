"""The security response headers every response carries (issue #132).

The app owns these rather than the mesh because the interesting one, the
Content-Security-Policy, is a list of the hosts the *browser bundle* reaches.
That list changes when a frontend overlay changes, so it belongs beside the
code that defines it and inside a suite that can read that code:
``tests/test_security_headers.py`` reads ``frontend/src`` as text and fails
when a host appears there that this module has not classified.

Every host below was measured from the source on 2026-09-16, not remembered.
Overpass, Nominatim, NIFC and NOAA's HMS smoke files are absent on purpose:
those are fetched by the pod, so the browser only ever talks to this origin for
them. NOAA's snow map service is the one NOAA host that IS here, because that
one renders per tile and the browser asks it directly (#446).
"""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Iterable
from html.parser import HTMLParser

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# ── The browser's third-party surface ─────────────────────────────────────────

# Origins the SPA fetches directly, and therefore the whole of connect-src
# beyond 'self'. MapLibre reaches the map host five ways (the style JSON, its
# TileJSON, vector tiles, glyphs and sprites) and all five resolve to this one
# origin, checked against the served style document rather than assumed.
BROWSER_FETCH_ORIGINS = (
    # frontend/src/utils/openMeteo.ts: the ranked field's forecasts.
    "https://api.open-meteo.com",
    # frontend/src/utils/openMeteo.ts: US AQI, fetched beside the weather.
    "https://air-quality-api.open-meteo.com",
    # frontend/src/utils/openMeteo.ts: reanalysis for a window older than the
    # forecast endpoint holds (#123).
    "https://archive-api.open-meteo.com",
    # frontend/src/components/MapView.tsx: the basemap style, and every tile,
    # glyph and sprite that style names.
    "https://tiles.openfreemap.org",
    # frontend/src/utils/radar.ts: the NEXRAD frames behind the radar overlay.
    "https://mesonet.agron.iastate.edu",
    # frontend/src/utils/snowDepth.ts: the NOHRSC snow analysis, rendered per
    # tile by NOAA's own map service (#446).
    "https://mapservices.weather.noaa.gov",
)

# The subset of the above that also serves raster images. MapLibre fetches
# raster tiles with fetch and decodes them to an ImageBitmap, so connect-src
# carries the common path; an engine without createImageBitmap falls back to an
# Image element instead, which is what these entries cover.
BROWSER_IMAGE_ORIGINS = (
    "https://tiles.openfreemap.org",
    "https://mesonet.agron.iastate.edu",
    "https://mapservices.weather.noaa.gov",
)


def _directives(pairs: Iterable[tuple[str, str]]) -> str:
    return "; ".join(f"{name} {value}" for name, value in pairs)


_SHARED_CSP: tuple[tuple[str, str], ...] = (
    ("default-src", "'self'"),
    ("base-uri", "'self'"),
    ("object-src", "'none'"),
    ("frame-ancestors", "'none'"),
    ("form-action", "'self'"),
    # The built pages carry no inline <script>: Vite emits module scripts and
    # stylesheets as files, checked on the build output rather than assumed.
    # The one page that does carry one is /docs, which earns its own policy
    # below.
    ("script-src", "'self'"),
    # style-src is the one loosened directive, and only for the ATTRIBUTE case:
    # map popups are built as HTML strings with inline style attributes and
    # handed to MapLibre's setHTML (frontend/src/utils/popupChrome.ts and the
    # popup builders beside it), because a string passed to setHTML is not a
    # class list Tailwind's scanner ever sees. Inline style attributes are
    # exactly what style-src blocks without this, so a strict value renders
    # every map popup unstyled. style-src-attr would carry it alone, but an
    # engine that does not know that directive falls back to this one, which
    # would break the popups on exactly the older browsers a CSP protects most.
    # The script side stays strict, which is where the XSS boundary sits.
    ("style-src", "'self' 'unsafe-inline'"),
)


APP_CSP = _directives(
    (
        *_SHARED_CSP,
        # data: covers the CSS icon sprites (inline SVG) and the 1x1 PNG the
        # forecast grid's image source is declared with; blob: covers
        # MapLibre's Image-element fallback for a decoded tile.
        (
            "img-src",
            " ".join(("'self'", "data:", "blob:", *BROWSER_IMAGE_ORIGINS)),
        ),
        # data: is not decoration here: MapLibre loads an image source by
        # fetching its url, and the forecast grid's raster is a canvas
        # data: URL, so a strict connect-src blanks that overlay.
        (
            "connect-src",
            " ".join(("'self'", "data:", *BROWSER_FETCH_ORIGINS)),
        ),
        # MapLibre builds its worker from a Blob URL. child-src repeats it for
        # engines that predate worker-src.
        ("worker-src", "'self' blob:"),
        ("child-src", "'self' blob:"),
    )
)


def docs_csp(html: str, asset_origins: Iterable[str] = ()) -> str:
    """The policy for the self-hosted Swagger UI page.

    It differs from :data:`APP_CSP` in four ways, all of them narrowing except
    the first: the inline init script FastAPI emits is allowed by its own
    hash, no third-party origin reaches either img-src or connect-src, and the
    page starts no worker so neither worker directive is sent.

    The hash is taken from the rendered page rather than pinned, so a FastAPI
    upgrade that rewrites that script cannot silently blank the page. The suite
    checks the header against the page the route actually serves, and pins the
    extractor on the shapes that would otherwise go unhashed: an uppercase tag,
    an added attribute, and a tag carrying ``src``.

    ``asset_origins`` is where the page's script and stylesheet come from when
    they are not this origin's own. A source checkout has no build output, so
    a plain ``uvicorn`` serves /docs off a CDN, and a policy written only for
    the shipped image would blank the page for the one audience that reads it
    without Docker.
    """
    origins = tuple(asset_origins)
    script_src = " ".join(("'self'", *origins, *_script_hashes(html)))
    return _directives(
        (
            *(
                (name, _docs_value(name, value, script_src, origins))
                for name, value in _SHARED_CSP
            ),
            # The Swagger UI stylesheet inlines its icons as data: URLs, and
            # the page reads nothing but this origin's own openapi.json.
            ("img-src", "'self' data:"),
            ("connect-src", "'self'"),
        )
    )


def _docs_value(name: str, value: str, script_src: str, origins: tuple[str, ...]) -> str:
    if name == "script-src":
        return script_src
    if name == "style-src" and origins:
        return " ".join((value, *origins))
    return value


class _InlineScripts(HTMLParser):
    """The text of every ``<script>`` element that has no ``src``.

    A parser rather than a pattern, because a pattern has to re-decide what a
    tag is and gets it wrong in the directions that matter: ``<SCRIPT>`` is the
    same element to a browser, and so is ``<script type="module">``. Both would
    go unhashed by a regex written for the exact spelling FastAPI happens to
    emit, and an unhashed inline script is a page that renders blank under its
    own policy. ``HTMLParser`` lowercases tag names and hands attributes over
    already parsed, so neither case nor an added attribute is this code's
    problem.

    An element carrying ``src`` is skipped deliberately: an external script is
    covered by a source expression, and a hash would not describe it.
    """

    def __init__(self) -> None:
        super().__init__()
        self.bodies: list[str] = []
        self._buffer: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and not dict(attrs).get("src"):
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._buffer is not None:
            body = "".join(self._buffer)
            self._buffer = None
            # Nothing executes, so nothing needs allowing.
            if body.strip():
                self.bodies.append(body)

    def handle_data(self, data: str) -> None:
        if self._buffer is not None:
            self._buffer.append(data)


def inline_script_bodies(html: str) -> tuple[str, ...]:
    """Every inline script in ``html``, in document order."""
    parser = _InlineScripts()
    parser.feed(html)
    parser.close()
    return tuple(parser.bodies)


def _script_hashes(html: str) -> tuple[str, ...]:
    """CSP source expressions for every inline script in ``html``."""
    return tuple(
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        for body in inline_script_bodies(html)
    )


# ── The headers themselves ────────────────────────────────────────────────────

# Sent on every response, alongside whichever CSP the path earns.
#
# No Strict-Transport-Security here, deliberately. TLS terminates at the edge,
# which is the layer that knows the zone and already sets the header; a browser
# cannot be told to forget a max-age it has read, so the app must not be a
# second voice on a claim it cannot withdraw.
BASE_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    # Full URL to this origin, bare origin to anybody else. The path of an
    # analysis is not interesting, but the query string of a shared link is.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # geolocation is the one capability the app uses: MapLibre's geolocate
    # control puts the map on the reader. The rest are named rather than left
    # to the default so switching one on is a deliberate edit.
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
}


class SecurityHeadersMiddleware:
    """Adds the headers above to every response.

    Pure ASGI rather than ``BaseHTTPMiddleware`` because the analyze route
    streams (``/api/analyze/stream``), and the base class buffers a streaming
    response through a queue to hand it to the next layer. Setting a header is
    the only thing this needs, which the raw ``http.response.start`` message
    already offers.
    """

    def __init__(self, app: ASGIApp, *, csp_by_path: dict[str, str] | None = None) -> None:
        self.app = app
        # Exact paths whose page needs its own policy; everything else, the
        # SPA and the API alike, gets APP_CSP.
        self.csp_by_path = csp_by_path or {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        csp = self.csp_by_path.get(scope["path"], APP_CSP)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in BASE_HEADERS.items():
                    headers[name] = value
                headers["Content-Security-Policy"] = csp
            await send(message)

        await self.app(scope, receive, send_with_headers)
