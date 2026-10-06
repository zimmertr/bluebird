from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query

from app import ratelimit
from app.error_codes import ApiError, ErrorCode
from app.models import ErrorResponse
from app.services import cache
from app.services.errors import classify_http_error
from app.services.http import USER_AGENT

log = logging.getLogger(__name__)
router = APIRouter()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# The User-Agent comes from services/http.py, with every other upstream's.
# Nominatim's usage policy asks callers to identify themselves with a real
# User-Agent — something a browser fetch can't set. That, plus getting search
# queries into the server logs, is why the SPA doesn't call Nominatim directly.
PROVIDER = "Nominatim (place search)"

# The whole of one search, connect to last byte. The value is the per-operation
# timeout this call has always carried, now applied as a total as well: httpx's
# own restarts its read timer on every chunk, so a server that kept sending
# slowly was never cut off (#630). A visitor is waiting on this one, so it is
# short beside the other upstreams'.
TIMEOUT_S = 10.0


@router.get(
    "/geocode",
    tags=["search"],
    summary="Look up a place by name",
    description=(
        "Thin proxy to Nominatim, forwarding its JSON verbatim. The response "
        "shape is therefore Nominatim's `jsonv2` format, not something Bluebird Forecast "
        "defines, and each row carries `lat`, `lon`, `display_name`, and "
        "`extratags` (which is where a summit's `ele` lives).\n\n"
        "This exists because Nominatim's usage policy asks callers to identify "
        "themselves with a real User-Agent, which a browser fetch cannot set. "
        "That same policy forbids autocomplete, so call this on an explicit "
        "search action rather than on every keystroke."
    ),
    response_description="Matching places, in Nominatim's `jsonv2` format.",
    # Explicit, because FastAPI otherwise builds a response model from the
    # return annotation. The body is Nominatim's own JSON forwarded as is, so
    # there is no model of ours to validate it against or to publish.
    response_model=None,
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
) -> list[Any]:
    log.info("Geocode query: %r", q)
    # Checked before the gate, so a repeat search neither calls Nominatim nor
    # waits in the queue behind other visitors' searches.
    cache_key = cache.geocode_key(q, limit)
    cached = cache.GEOCODE_CACHE.get(cache_key)
    if cached is not None:
        log.debug("Geocode query %r served from cache", q)
        return cached
    # Pace the shared egress IP to Nominatim's ~1 req/s policy before opening
    # a connection; a full queue sheds here rather than piling onto them.
    try:
        await ratelimit.NOMINATIM_GATE.acquire()
    except ratelimit.BudgetExhausted as exc:
        raise ApiError(
            status_code=503,
            detail=exc.message,
            code=ErrorCode.busy,
            headers={"Retry-After": str(exc.retry_after_s)},
        ) from None
    try:
        async with (
            httpx.AsyncClient(timeout=TIMEOUT_S) as client,
            asyncio.timeout(TIMEOUT_S),
        ):
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
    # TimeoutError is the total deadline; ValueError and RecursionError are a
    # body that does not decode, such as an HTML block page on a 200. Each is
    # the 502 this route documents rather than an unhandled 500 (#630), and
    # `classify_http_error` words each one.
    except (httpx.HTTPError, TimeoutError, ValueError, RecursionError) as exc:
        log.warning("Nominatim request failed: %s", str(exc) or type(exc).__name__)
        raise ApiError(
            status_code=502,
            detail=classify_http_error(exc, PROVIDER),
            code=ErrorCode.upstream_unavailable,
        ) from exc

    if not isinstance(rows, list):
        log.warning("Nominatim returned a non-list payload: %r", type(rows))
        raise ApiError(
            status_code=502,
            detail=f"{PROVIDER} returned an unexpected response.",
            code=ErrorCode.upstream_unavailable,
        )

    log.info("Geocode query %r returned %d place(s)", q, len(rows))
    # An empty list is a real answer and is cached too; failures above never
    # reach here, so a transient error is not held for the TTL.
    cache.GEOCODE_CACHE.put(cache_key, rows)
    return rows
