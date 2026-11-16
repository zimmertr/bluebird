from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from app import db, ratelimit
from app.error_codes import ApiError, ErrorCode
from app.models import ErrorResponse
from app.ratelimit import shared
from app.services import cache
from app.services.errors import classify_http_error, log_reason, retry_after_header
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

# After Nominatim fails or refuses a search, this pod sends it nothing for a
# minute, doubling with each failure in a row up to an hour, or for its
# `Retry-After` when that is longer, and answers each search meanwhile with the
# failure's own 502. The policy blocks an address that keeps asking through
# refusals, and the gate's spacing alone kept asking at its full rate. Per pod,
# so ten replicas send at most ten searches a hold. NSIDC refused the
# cluster's address outright on 2026-11-14 for less (#849).
HOLD_FIRST_S = 60.0
HOLD_MAX_S = 3600.0


@dataclass
class _Hold:
    until: float = 0.0
    failures: int = 0
    detail: str = ""


HOLD = _Hold()
# Read through the module, so a test can move this clock.
_clock: Callable[[], float] = time.monotonic


def reset_hold() -> None:
    """Forget every failure, so each test starts with Nominatim open."""
    HOLD.until, HOLD.failures, HOLD.detail = 0.0, 0, ""


def _failed(detail: str, exc: BaseException | None = None) -> ApiError:
    """Hold Nominatim off after a failure, and the 502 that reports it."""
    HOLD.failures += 1
    wait = min(HOLD_FIRST_S * 2 ** (HOLD.failures - 1), HOLD_MAX_S)
    if isinstance(exc, httpx.HTTPStatusError):
        wait = max(wait, retry_after_header(exc.response) or 0)
    HOLD.until, HOLD.detail = _clock() + wait, detail
    return ApiError(status_code=502, detail=detail, code=ErrorCode.upstream_unavailable)


# ── The search cache ──────────────────────────────────────────────────────────
#
# One for the whole deployment while the shared cache can hold it (#760),
# because a repeat search is as likely to land on another pod as on this one,
# and Nominatim's policy asks for the repeat not to reach them. This pod's
# `GEOCODE_CACHE` otherwise: no database, a read-only preview (whose login
# cannot write the table), or a call the database cannot answer.


async def _read_shared(conn: AsyncConnection, key: str) -> list[Any] | None:
    row = await (
        await conn.execute(
            "SELECT body FROM geocode_cache WHERE key = %s AND expires_at > now()", (key,)
        )
    ).fetchone()
    return None if row is None else row[0]


async def _write_shared(conn: AsyncConnection, key: str, rows: list[Any]) -> None:
    await conn.execute(
        "INSERT INTO geocode_cache (key, body, expires_at)"
        " VALUES (%s, %s, now() + make_interval(secs => %s))"
        " ON CONFLICT (key) DO UPDATE SET body = excluded.body, expires_at = excluded.expires_at",
        (key, Jsonb(rows), cache.GEOCODE_TTL_S),
    )


async def _cached(key: tuple) -> list[Any] | None:
    if shared.usable():
        try:
            return await shared.run(
                "geocode cache", lambda conn: _read_shared(conn, cache.shared_key(key))
            )
        except db.DatabaseUnavailable:
            pass
    return cache.GEOCODE_CACHE.get(key)


async def _remember(key: tuple, rows: list[Any]) -> None:
    if shared.usable():
        try:
            await shared.run(
                "geocode cache", lambda conn: _write_shared(conn, cache.shared_key(key), rows)
            )
            return
        except db.DatabaseUnavailable:
            pass
    cache.GEOCODE_CACHE.put(key, rows)


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
    cached = await _cached(cache_key)
    if cached is not None:
        log.debug("Geocode query %r served from cache", q)
        return cached
    if _clock() < HOLD.until:
        raise ApiError(status_code=502, detail=HOLD.detail, code=ErrorCode.upstream_unavailable)
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
        log.warning("Nominatim request failed: %s", log_reason(exc, deadline_s=TIMEOUT_S))
        raise _failed(classify_http_error(exc, PROVIDER), exc) from exc

    if not isinstance(rows, list):
        log.warning("Nominatim returned a non-list payload: %r", type(rows))
        raise _failed(f"{PROVIDER} returned an unexpected response.")

    HOLD.failures = 0

    log.info("Geocode query %r returned %d place(s)", q, len(rows))
    # An empty list is a real answer and is cached too; failures above never
    # reach here, so a transient error is not held for the TTL.
    await _remember(cache_key, rows)
    return rows
