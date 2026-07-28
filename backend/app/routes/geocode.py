from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app import ratelimit
from app.models import ErrorResponse
from app.services.errors import classify_http_error

log = logging.getLogger(__name__)
router = APIRouter()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy asks callers to identify themselves with a real
# User-Agent — something a browser fetch can't set. That, plus getting search
# queries into the server logs, is why the SPA doesn't call Nominatim directly.
USER_AGENT = "Bluebird/1.0 (https://bluebirdforecast.com)"
PROVIDER = "Nominatim (place search)"


@router.get(
    "/geocode",
    tags=["search"],
    summary="Look up a place by name",
    description=(
        "Thin proxy to Nominatim, forwarding its JSON verbatim. The response "
        "shape is therefore Nominatim's `jsonv2` format, not something Bluebird "
        "defines, and each row carries `lat`, `lon`, `display_name`, and "
        "`extratags` (which is where a summit's `ele` lives).\n\n"
        "This exists because Nominatim's usage policy asks callers to identify "
        "themselves with a real User-Agent, which a browser fetch cannot set. "
        "That same policy forbids autocomplete, so call this on an explicit "
        "search action rather than on every keystroke."
    ),
    response_description="Matching places, in Nominatim's `jsonv2` format.",
    responses={
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is searching faster than the per-address limit. "
                "`Retry-After` says how many seconds to wait. "
                "`GET /api/capabilities` publishes the limit."
            ),
        },
        502: {
            "model": ErrorResponse,
            "description": "Nominatim was unreachable or returned an unexpected payload.",
        },
        503: {
            "model": ErrorResponse,
            "description": (
                "This instance is already at Nominatim's usage-policy pace and "
                "the queue is full. Transient; `Retry-After` says when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.geocode_rate_limit)],
)
async def geocode(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="Place name to search for, such as `Mount Rainier`.",
    ),
    limit: int = Query(5, ge=1, le=10, description="Maximum places to return."),
):
    log.info("Geocode query: %r", q)
    # Pace the shared egress IP to Nominatim's ~1 req/s policy before opening
    # a connection; a full queue sheds here rather than piling onto them.
    try:
        await ratelimit.NOMINATIM_GATE.acquire()
    except ratelimit.BudgetExhausted as exc:
        raise HTTPException(
            status_code=503,
            detail=exc.message,
            headers={"Retry-After": str(exc.retry_after_s)},
        ) from None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                NOMINATIM_URL,
                # extratags carries the raw OSM tags — notably `ele`, which is
                # how pinned search rows get the same summit elevation an
                # Overpass-sourced analysis row would show.
                params={"format": "jsonv2", "limit": limit, "extratags": 1, "q": q},
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            rows = resp.json()
    except httpx.HTTPError as exc:
        log.warning("Nominatim request failed: %s", exc)
        raise HTTPException(
            status_code=502, detail=classify_http_error(exc, PROVIDER)
        ) from exc

    if not isinstance(rows, list):
        log.warning("Nominatim returned a non-list payload: %r", type(rows))
        raise HTTPException(
            status_code=502, detail=f"{PROVIDER} returned an unexpected response."
        )

    log.info("Geocode query %r returned %d place(s)", q, len(rows))
    return rows
