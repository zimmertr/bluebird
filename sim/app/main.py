"""The supplier sim: one origin on port 8080 that answers for every data
supplier Bluebird Forecast reaches, so a dev stack sends nothing off the
machine (issue #224).

Each supplier is a router mounted at the prefix the pod's and the browser's
base-URL variables point at (`sim/compose.yml`, `sim/pod.env`). Every answer
is logged at INFO with its method, path and status, which is the record a load
test reads to show that nothing went anywhere else.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app import control, hms, nifc, nominatim, open_meteo, overpass, radar, snow, tiles, usfs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("sim.requests")

app = FastAPI(title="Bluebird Forecast supplier sim", docs_url=None, redoc_url=None, openapi_url=None)

# The browser calls the sim from the app's own origin, so every answer needs
# the open CORS the real suppliers send. Retry-After is exposed because it is
# not a CORS-safelisted header: without this the browser's `classify429`
# reads null and falls back to the scope's floor, and a fault's
# `retry_after_s` would never reach the countdown it exists to test.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)


@app.middleware("http")
async def log_answer(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response = await call_next(request)
    log.info("%s %s %d", request.method, request.url.path, response.status_code)
    return response


@app.exception_handler(control.FaultAnswer)
async def answer_fault(_: Request, exc: control.FaultAnswer) -> Response:
    return exc.response


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(control.router)
app.include_router(open_meteo.router)
app.include_router(tiles.router)
app.include_router(radar.router)
app.include_router(snow.router)
app.include_router(overpass.router)
app.include_router(nominatim.router)
app.include_router(nifc.router)
app.include_router(usfs.router)
app.include_router(hms.router)
