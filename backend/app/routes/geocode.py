from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.services.errors import classify_http_error

log = logging.getLogger(__name__)
router = APIRouter()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy asks callers to identify themselves with a real
# User-Agent — something a browser fetch can't set. That, plus getting search
# queries into the server logs, is why the SPA doesn't call Nominatim directly.
USER_AGENT = "Bluebird/1.0 (https://bluebirdforecast.com)"
PROVIDER = "Nominatim (place search)"


@router.get("/geocode")
async def geocode(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(5, ge=1, le=10),
):
    """Proxy a place search to Nominatim, forwarding its JSON verbatim.

    The frontend keeps ownership of the row→Place mapping; this route only
    adds logging, the policy User-Agent, and friendly upstream error text.
    """
    log.info("Geocode query: %r", q)
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
