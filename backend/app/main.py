import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.analyze import router
from app.routes.config import router as config_router

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

_level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
_level = _LEVELS.get(_level_name, logging.INFO)

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

app = FastAPI(title="Bluebird", version="0.1.0")

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

static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
