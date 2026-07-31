import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app import ratelimit
from app.routes.analyze import router
from app.routes.capabilities import router as capabilities_router
from app.routes.config import router as config_router
from app.routes.destinations import router as destinations_router
from app.routes.geocode import router as geocode_router
from app.routes.notfound import router as notfound_router
from app.routes.version import router as version_router
from app.routes.wildfires import router as wildfires_router
from app.version import get_version

# ── Logging setup ─────────────────────────────────────────────────────────────

TRACE = 5
logging.addLevelName(TRACE, "TRACE")

def _trace(self: logging.Logger, msg: object, *args: object, **kwargs: object) -> None:
    if self.isEnabledFor(TRACE):
        self._log(TRACE, msg, args, **kwargs)  # type: ignore[arg-type]

logging.Logger.trace = _trace  # type: ignore[attr-defined]

_LEVELS: dict[str, int] = {
    "TRACE":    TRACE,
    "DEBUG":    logging.DEBUG,
    "INFO":     logging.INFO,
    "WARNING":  logging.WARNING,
    "ERROR":    logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}

_level_name = os.environ.get("LOG_LEVEL", "WARNING").upper()
_level = _LEVELS.get(_level_name, logging.WARNING)

logging.basicConfig(
    level=_level,
    format="%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logging.getLogger(__name__).info("Log level set to %s", _level_name)

# Uvicorn installs its own bare handlers (the timestamp-less "INFO:  ..." lines).
# Clear them and let its records propagate to our root formatter instead, so
# every line — app, startup, shutdown — carries a timestamp and [LEVEL]. Its
# per-request access log is silenced outright; the middleware below emits a
# cleaner one (real client IP, API calls only).
for _uv_name in ("uvicorn", "uvicorn.error"):
    _uv_logger = logging.getLogger(_uv_name)
    _uv_logger.handlers = []
    _uv_logger.propagate = True

_uvicorn_access = logging.getLogger("uvicorn.access")
_uvicorn_access.handlers = []
_uvicorn_access.propagate = False
_uvicorn_access.disabled = True

# httpx logs every outbound request at INFO. At our INFO default that would
# flood the logs during a weather fetch (dozens of batched Open-Meteo calls),
# so keep it to warnings and above.
logging.getLogger("httpx").setLevel(logging.WARNING)

_access_log = logging.getLogger("bluebird.access")


def _client_ip(request: Request) -> str:
    """The client identity for the access log.

    Delegates to the rate limiter's key function so what the log prints is
    exactly what enforcement counted — a mismatch there would make throttle
    log lines impossible to correlate.
    """
    return ratelimit.client_key(request)

# ── App ───────────────────────────────────────────────────────────────────────

# Resolved before the app is built because the docs route below needs to know
# whether the vendored Swagger UI assets shipped with this build.
static_dir = Path(__file__).parent.parent / "static"

_DESCRIPTION = """
Bluebird ranks outdoor destinations by their forecast weather.

Draw a polygon and every named peak, trailhead, or lake inside it is discovered
from OpenStreetMap, given a real hourly forecast, and ranked. Or skip discovery
entirely and send your own coordinates.

There is no API key and no authentication. Light per-address rate limits and
an instance-wide upstream budget protect the free, keyless APIs underneath:
requests past them receive 429 or 503 with a `Retry-After` header, and
`GET /api/capabilities` publishes the numbers. Please stay considerate all the
same: a single analysis can fan out to hundreds of forecast requests.

Start with `GET /api/capabilities` to learn the limits this deployment enforces,
and `GET /api/version` to confirm which build you are talking to.
"""

_TAGS = [
    {
        "name": "analysis",
        "description": "Discover destinations and rank them by forecast weather.",
    },
    {
        "name": "metadata",
        "description": (
            "Build identity, enforced limits, and deployment configuration. "
            "These answer from memory, touch no upstream, and are safe to poll."
        ),
    },
    {
        "name": "search",
        "description": "Look up a place by name, proxied to Nominatim.",
    },
    {
        "name": "wildfires",
        "description": (
            "Active US wildfire perimeters, cached from NIFC. Served from this "
            "instance's snapshot rather than proxied per request, because the "
            "upstream quota is NIFC's and shared with every other consumer of "
            "the public dataset."
        ),
    },
]

app = FastAPI(
    title="Bluebird",
    # The real release, baked into the image at build time. A hardcoded value
    # here silently rots: it read 0.1.0 for the whole 0.x series.
    version=get_version(),
    summary="Map-based weather window finder for hikers and mountaineers.",
    description=_DESCRIPTION,
    openapi_tags=_TAGS,
    license_info={
        "name": "PolyForm-Noncommercial-1.0.0",
        "url": "https://polyformproject.org/licenses/noncommercial/1.0.0",
    },
    contact={"name": "Bluebird on GitHub", "url": "https://github.com/zimmertr/bluebird"},
    # Both must be disabled here rather than reassigned later: FastAPI.setup()
    # registers these routes at the end of __init__, so a post-hoc assignment
    # leaves the built-in route in place and a later @app.get("/docs") loses to
    # it. /docs is re-registered below with self-hosted assets; /redoc is
    # dropped outright, since a second renderer of the same document earns
    # nothing and it was the one pulling Google Fonts.
    docs_url=None,
    redoc_url=None,
)
# `servers` is deliberately unset. FastAPI's default leaves Swagger UI's
# "Try it out" pointed at whatever origin served the page, which is what makes
# it work unchanged in local dev, a PR preview, and production. Pinning it to
# the production URL would make a local /docs fire real requests at the live
# site.

# A national wildfire viewport is the largest body this API serves: ~1.3 MB of
# perimeter geometry that compresses to ~350 KB. Everything else here is small
# enough that the 1 KB floor skips it, so this costs nothing on the common path.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    # Without this a cross-origin caller can see a 429/503 but not read how
    # long Retry-After told it to back off.
    expose_headers=["Retry-After"],
)


@app.middleware("http")
async def access_log(request: Request, call_next) -> Response:
    """One log line per request, with the real client IP.

    Only the API surface and errors are logged: the SPA/static assets and the
    Kubernetes probe hits to "/" are dropped so real browser activity isn't
    buried under health-check noise.
    """
    start = time.perf_counter()
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") or response.status_code >= 400:
        elapsed_ms = (time.perf_counter() - start) * 1000
        _access_log.info(
            "%s %s %d (%.0f ms) client=%s",
            request.method,
            path,
            response.status_code,
            elapsed_ms,
            _client_ip(request),
        )
    return response


app.include_router(router, prefix="/api")
app.include_router(destinations_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(geocode_router, prefix="/api")
app.include_router(version_router, prefix="/api")
app.include_router(capabilities_router, prefix="/api")
app.include_router(wildfires_router, prefix="/api")
# Must stay last of the /api routers: it matches every path under the prefix, so
# anything registered after it would be unreachable.
app.include_router(notfound_router, prefix="/api")


# Dedicated probe target: answers without touching the static mount (a probe
# shouldn't depend on the SPA build being present) and stays out of the access
# log above, which only records /api/* and errors.
@app.get("/healthz", tags=["metadata"], summary="Liveness probe")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# Uptime monitors reach for HEAD by default, and FastAPI's APIRoute (unlike
# Starlette's plain Route) does not imply it from GET. Registered separately
# rather than as a second method on the route above, which would emit two
# operations sharing one operationId and make the generated schema invalid.
@app.head("/healthz", include_in_schema=False)
async def healthz_head() -> dict[str, str]:
    return {"status": "ok"}


# Swagger UI, served from assets baked into the image rather than a CDN, so the
# reference page makes no third-party requests: nothing to jsdelivr, nothing to
# Google Fonts, no visitor IP handed to either. That also keeps /docs working
# under a strict CSP. A source checkout has no build output, so local `uvicorn`
# falls back to the CDN rather than serving a blank page.
_swagger_dir = static_dir / "swagger-ui"
_swagger_base = (
    "/swagger-ui"
    if _swagger_dir.is_dir()
    else "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5"
)


@app.get("/docs", include_in_schema=False)
async def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} API reference",
        swagger_js_url=f"{_swagger_base}/swagger-ui-bundle.js",
        swagger_css_url=f"{_swagger_base}/swagger-ui.css",
        swagger_favicon_url="/favicon-32.png",
    )


# The public document pages, each built as its own SPA entry so a shared link
# is a real document with its own title and unfurl rather than app state.
#
# Two pages rather than one covering both, because that is how they get asked
# for: app stores, payment processors and data providers want a privacy link
# and a terms link separately, and a "Terms" label pointing at /privacy is a
# small lie told in the URL bar.
#
# The static mount below would already serve these files as directory indexes,
# but only at /privacy/ and /terms/, 307ing the bare paths to the trailing
# slash first. These routes exist so the canonical URL is the one people
# actually type and paste. Both spellings work; only these avoid the redirect.
#
# Registered unconditionally and 404ing on a missing file, rather than being
# skipped when the build output is absent: a route that disappears in a source
# checkout is a route the tests cannot describe.
#
# HEAD is named explicitly for the reason /healthz above spells out, and it
# matters more here: link checkers and unfurlers reach for HEAD, and without it
# the canonical URLs these routes exist to protect would hand exactly those
# clients the 307 they were added to avoid. Both methods fit on one route
# because include_in_schema=False keeps the pair out of the schema entirely, so
# the duplicate-operationId problem that forced /healthz into two handlers
# cannot arise.
#
# The paths stay module-level names rather than closure variables so the tests
# can point them at a tmp_path and exercise both the present and absent cases.
_privacy_page = static_dir / "privacy" / "index.html"
_terms_page = static_dir / "terms" / "index.html"


def _document_response(page: Path) -> FileResponse:
    if not page.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(page)


@app.api_route("/privacy", methods=["GET", "HEAD"], include_in_schema=False)
async def privacy_page() -> FileResponse:
    return _document_response(_privacy_page)


@app.api_route("/terms", methods=["GET", "HEAD"], include_in_schema=False)
async def terms_page() -> FileResponse:
    return _document_response(_terms_page)


if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
