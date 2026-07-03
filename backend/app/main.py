import logging
import os
from pathlib import Path

from fastapi import FastAPI
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

_level_name = os.environ.get("LOG_LEVEL", "WARNING").upper()
_level = _LEVELS.get(_level_name, logging.WARNING)

logging.basicConfig(
    level=_level,
    format="%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

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

static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
