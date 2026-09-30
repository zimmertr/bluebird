"""What every ArcGIS feature service answers the same way, read once.

Two overlays fetch from ArcGIS Online: NIFC's wildfire perimeters (``nifc.py``)
and the Forest Service's closure orders (``usfs_closures.py``). The
services differ in what they hold and share three habits, each of which has
already cost an investigation when it was read wrong:

- **A refusal arrives as HTTP 200.** An exhausted quota answers 200 with the
  error in the body, so ``raise_for_status`` learns nothing (#203).
- **The page flag moves with the format.** ``f=json`` puts
  ``exceededTransferLimit`` at the top level, and ``f=geojson`` puts it under
  the FeatureCollection's ``properties`` (measured 2026-09-30 on both
  services). A reader that looks only at the top level stops after page one
  and serves a truncated set without a word. Fires never reached a second
  page, so ``nifc.py`` carried that bug unseen; closed trail lines arrive in
  two pages today.
- **Paging is by offset,** stepped by what the page SENT rather than by what
  survived parsing, or the features a dropped one displaced are read twice.

Everything here is pure or takes the caller's client, so each service keeps its
own client, its own messages and its own knobs.
"""

from __future__ import annotations

import asyncio
import logging
import math
from collections.abc import Callable
from typing import Any

import httpx

from app.services.errors import UpstreamError, UpstreamRateLimited

log = logging.getLogger(__name__)


def raise_for_arcgis_error(body: Any, provider: str, *, rate_limited: str, rejected: str) -> None:
    """Surface an error ArcGIS reported inside an HTTP 200.

    ArcGIS answers an exhausted quota with 200 and the refusal in the body:

        {"error":{"code":429,"message":"Unable to perform query. Too many
         requests.","details":["API calls quota exceeded (62896 request units)!
         maximum allowed request units (57600) per Minute. Retry after 60 sec."]}}

    Validating only that the body looks like a FeatureCollection reports this as
    a parsing problem, which sent an earlier investigation hunting through our
    own code for hours (issue #203). ``rate_limited`` and ``rejected`` are the
    caller's own sentences, because each overlay names its own data.
    """
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return
    code = error.get("code") if isinstance(error.get("code"), int) else None
    # 503 arrives in the same envelope when the service is merely overloaded.
    if code in (429, 503):
        raise UpstreamRateLimited(provider, "minutely", 60, rate_limited)
    raise UpstreamError(rejected)


def page_flag(body: Any) -> bool:
    """Whether ArcGIS truncated this page, wherever the format put the flag.

    Read from both places rather than from the one the current format uses,
    because the two formats disagree and a request that changes ``f`` should
    not quietly break paging.
    """
    if not isinstance(body, dict):
        return False
    if body.get("exceededTransferLimit"):
        return True
    properties = body.get("properties")
    return isinstance(properties, dict) and bool(properties.get("exceededTransferLimit"))


def bounds(coordinates: Any) -> tuple[float, float, float, float] | None:
    """Bounding box of an arbitrarily nested GeoJSON coordinate array.

    Written as a walk rather than per-geometry-type cases because the services
    return Point, LineString, Polygon and their Multi forms, and the answer is
    the same for all of them. A Point answers a box of zero width.
    """
    west = south = math.inf
    east = north = -math.inf
    stack: list[Any] = [coordinates]
    while stack:
        item = stack.pop()
        if not isinstance(item, list) or not item:
            continue
        if isinstance(item[0], (int, float)) and len(item) >= 2:
            lon, lat = float(item[0]), float(item[1])
            west = min(west, lon)
            east = max(east, lon)
            south = min(south, lat)
            north = max(north, lat)
        else:
            stack.extend(item)
    if west is math.inf:
        return None
    return west, south, east, north


async def fetch_pages[T](
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, Any],
    parse: Callable[[bytes], tuple[list[T], bool, int]],
    *,
    page_size: int,
    max_pages: int,
    label: str,
) -> tuple[T, ...]:
    """Every feature one query matches, page by page.

    ``parse`` takes one page's bytes and returns what it kept, whether ArcGIS
    truncated the page, and how many features it SENT, which is the offset
    step. It runs off the event loop: the national full-resolution perimeter
    copy is 16.5 MB of JSON holding 861k coordinates, and an ``async`` function
    that holds the loop for that long blocks every OTHER request on the pod,
    which is the likely cause of the 4.1 s answer #337 measured from a warm
    snapshot. A thread is enough, because the parse is pure and the GIL is
    released around the decode.

    ``max_pages`` is a backstop, so a server that never clears the flag cannot
    spin forever. Reaching it serves what arrived and logs, rather than failing
    a snapshot that is merely large.
    """
    items: list[T] = []
    offset = 0
    for _page in range(max_pages):
        # ArcGIS promises no order across pages unless one is asked for, so an
        # offset walk without `orderByFields` can repeat or skip a feature at a
        # page edge (review of #552). Every hosted layer has an OBJECTID.
        page_params = {
            **params,
            "orderByFields": "OBJECTID",
            "resultOffset": offset,
            "resultRecordCount": page_size,
        }
        response = await client.get(url, params=page_params)
        response.raise_for_status()
        kept, more, count = await asyncio.to_thread(parse, response.content)
        items.extend(kept)
        if not more or not count:
            return tuple(items)
        offset += count
    log.warning(
        "%s paging hit the %d page backstop at %d features; serving what arrived",
        label,
        max_pages,
        len(items),
    )
    return tuple(items)
