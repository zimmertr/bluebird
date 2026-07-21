import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.analyze import router
from app.routes.config import router as config_router
from app.routes.geocode import router as geocode_router

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

# Uvicorn installs its own handlers (its default "INFO:     ..." prefix format)
# before this module is ever imported. Strip them and let its records propagate
# to root so every line — access logs included — shares the format above.
for _name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
    _uvlog = logging.getLogger(_name)
    _uvlog.handlers.clear()
    _uvlog.propagate = True


class _HealthzToTrace(logging.Filter):
    """Demote /healthz access lines (kubelet probes) to TRACE.

    Probes hit every few seconds per replica and would drown real traffic at
    INFO. Requests from actual users keep their normal access-log level; the
    probe heartbeat is only visible under LOG_LEVEL=TRACE.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # uvicorn.access args: (client_addr, method, path, http_version, status)
        args = record.args
        if isinstance(args, tuple) and len(args) == 5 and args[2] == "/healthz":
            record.levelno = TRACE
            record.levelname = "TRACE"
            return _level <= TRACE
        return True


logging.getLogger("uvicorn.access").addFilter(_HealthzToTrace())

logging.getLogger(__name__).info("Log level set to %s", _level_name)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Bluebird", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(geocode_router, prefix="/api")


# Dedicated probe target so kubelet traffic is distinguishable from real users
# hitting / — the access-log filter above relies on this exact path.
@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
