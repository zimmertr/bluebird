import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.routes.analyze import router
from app.routes.capabilities import router as capabilities_router
from app.routes.config import router as config_router
from app.routes.geocode import router as geocode_router
from app.routes.notfound import router as notfound_router
from app.routes.version import router as version_router
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
    """Best-effort real client IP.

    Behind Istio/Envoy the socket peer is the sidecar (127.0.0.6), so the real
    client is the first hop of X-Forwarded-For. Falls back to the peer address
    when the header is absent (local dev, direct hits).
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "-"

# ── App ───────────────────────────────────────────────────────────────────────

# Resolved before the app is built because the docs route below needs to know
# whether the vendored Swagger UI assets shipped with this build.
static_dir = Path(__file__).parent.parent / "static"

_DESCRIPTION = """
Bluebird ranks outdoor destinations by their forecast weather.

Draw a polygon and every named peak, trailhead, or lake inside it is discovered
from OpenStreetMap, given a real hourly forecast, and ranked. Or skip discovery
entirely and send your own coordinates.

There is no API key, no authentication, and no rate limit. Every upstream is
free and keyless, so please be considerate: a single analysis can fan out to
hundreds of forecast requests.

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
        "name": "GPL-3.0-only",
        "url": "https://www.gnu.org/licenses/gpl-3.0-standalone.html",
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(config_router, prefix="/api")
app.include_router(geocode_router, prefix="/api")
app.include_router(version_router, prefix="/api")
app.include_router(capabilities_router, prefix="/api")
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


if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
