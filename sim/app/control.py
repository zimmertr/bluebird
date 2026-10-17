"""The switchboard: one document that says which endpoint misbehaves, and how.

`PUT /control` replaces the whole document, `GET` returns it as it stands (a
fault's `times` counts down as requests spend it), and `DELETE` puts the
default back. A switchboard rather than environment variables because the
failure a developer wants changes mid-session, and restarting the stack to
change it would drop the per-location cache and the session the failure is
meant to be seen against.

Nothing here fails on its own. Every 429, 400 and slow batch the sim answers
is one somebody asked for.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, ConfigDict, Field

# The sim's endpoint names, one per supplier the app reaches. The customer
# Open-Meteo hosts share their free twin's name, because a fault is about the
# supplier and the two hosts are one supplier.
Endpoint = Literal[
    "forecast",
    "archive",
    "air_quality",
    "overpass",
    "nominatim",
    "nifc",
    "usfs",
    "hms",
    "tiles",
    "radar",
    "snow",
]

# What each supplier's error body looks like, so a fault reaches the app's
# reader in the shape that reader was written against. Open-Meteo answers JSON
# with a `reason` that `classify429` and `parse_rate_limit` read the scope word
# from; ArcGIS wraps its error in an `error` object; the rest send text.
_BODY_SHAPE: dict[str, Literal["open_meteo", "arcgis", "plain"]] = {
    "forecast": "open_meteo",
    "archive": "open_meteo",
    "air_quality": "open_meteo",
    "overpass": "plain",
    "nominatim": "plain",
    "nifc": "arcgis",
    "usfs": "arcgis",
    "hms": "plain",
    "tiles": "plain",
    "radar": "plain",
    "snow": "arcgis",
}

# The reason a 429 carries when the document names none: Open-Meteo's own
# minutely wording, which is the one quota the browser's pacer resumes from.
MINUTELY_REASON = "Minutely API request limit exceeded. Please try again in one minute."


class Fault(BaseModel):
    """One endpoint's misbehaviour.

    `status` alone is an error answer; `delay_s` alone is a slow answer that
    still succeeds; both is a slow error. A status of 200 is the one success a
    fault can ask for, and only Overpass reads it: its partial answer, half
    the elements under a `remark` carrying `reason`. `times` is how many requests the
    fault applies to before it clears itself, and null means every request
    until the document changes.
    """

    model_config = ConfigDict(extra="forbid")

    status: int | None = Field(default=None, ge=200, le=599)
    times: int | None = Field(default=None, ge=1)
    retry_after_s: int | None = Field(default=None, ge=0)
    reason: str | None = None
    delay_s: float = Field(default=0, ge=0, le=120)


class OverpassControl(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Forces every discovery answer to exactly this many elements, which is the
    # one way to reach the over-cap refusal without drawing a ring the size of
    # a state.
    candidates: int | None = Field(default=None, ge=0, le=100_000)


class ControlDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    faults: dict[Endpoint, Fault] = Field(default_factory=dict)
    overpass: OverpassControl = Field(default_factory=OverpassControl)


_document = ControlDocument()


def current() -> ControlDocument:
    """The document as it stands. Routers read `overpass` off it."""
    return _document


def reset() -> None:
    global _document
    _document = ControlDocument()


class FaultAnswer(Exception):
    """Raised by a fault dependency; `main.py` turns it into the response."""

    def __init__(self, response: Response) -> None:
        super().__init__(response.status_code)
        self.response = response


def _error_response(endpoint: str, fault: Fault) -> Response:
    status = fault.status or 500
    reason = fault.reason or (MINUTELY_REASON if status == 429 else f"Simulated {status} from the supplier sim.")
    headers = {} if fault.retry_after_s is None else {"Retry-After": str(fault.retry_after_s)}
    shape = _BODY_SHAPE[endpoint]
    if shape == "open_meteo":
        return JSONResponse({"error": True, "reason": reason}, status_code=status, headers=headers)
    if shape == "arcgis":
        body = {"error": {"code": status, "message": reason, "details": []}}
        return JSONResponse(body, status_code=status, headers=headers)
    return PlainTextResponse(reason, status_code=status, headers=headers)


def fault(endpoint: Endpoint) -> Callable[[], Awaitable[None]]:
    """A dependency that applies the endpoint's fault, if one is armed.

    The count is spent before the sleep, so two requests racing for a one-shot
    fault cannot both take it.
    """

    async def apply() -> None:
        armed = _document.faults.get(endpoint)
        if armed is None:
            return
        if armed.times is not None:
            if armed.times <= 1:
                del _document.faults[endpoint]
            else:
                armed.times -= 1
        if armed.delay_s:
            await asyncio.sleep(armed.delay_s)
        if armed.status is not None:
            raise FaultAnswer(_error_response(endpoint, armed))

    return apply


router = APIRouter()


@router.get("/control")
async def get_control() -> ControlDocument:
    return _document


@router.put("/control")
async def put_control(document: ControlDocument) -> ControlDocument:
    global _document
    _document = document
    return _document


@router.delete("/control")
async def delete_control() -> ControlDocument:
    reset()
    return _document
