import asyncio
import json
import logging
import math

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from app import ratelimit
from app.models import (
    MAX_ANALYZE_PEAKS,
    AnalysisRefusal,
    AnalyzeRequest,
    AnalyzeResponse,
    DestinationResult,
    DestinationType,
    ErrorResponse,
    HourlySeries,
    bbox_area_km2,
)
from app.services import air_quality, osm, weather
from app.services.errors import UpstreamError, UpstreamRateLimited


def _filter_elevation(destinations, min_ft, max_ft):
    """Drop candidates outside the requested elevation band.

    Unknown elevations pass through — many OSM peaks lack the tag and
    silently excluding them would be surprising.
    """
    if min_ft is None and max_ft is None:
        return destinations

    def keep(dest) -> bool:
        elev = dest.get("elevation_ft")
        if elev is None:
            return True
        if min_ft is not None and elev < min_ft:
            return False
        return not (max_ft is not None and elev > max_ft)

    return [d for d in destinations if keep(d)]


def _custom_dicts(custom_destinations) -> list[dict]:
    """The request's custom destinations in the same dict shape discovery
    produces. Each carries its own "type" so a mixed (union) response can tag
    every row by true source — discovered rows fall back to the request type."""
    return [
        {
            "name": d.name,
            "latitude": d.latitude,
            "longitude": d.longitude,
            "elevation_ft": d.elevation_ft,
            "osm_id": None,
            "type": "custom",
        }
        for d in custom_destinations
    ]


async def _resolve_custom(custom_destinations) -> list[dict]:
    """The request's custom destinations as candidate dicts, with elevation
    resolved from OSM wherever the caller did not supply one.

    Every path that turns `custom_destinations` into candidates goes through
    here rather than calling `_custom_dicts` directly, so no route can serve a
    custom row that skipped enrichment (issue #207).
    """
    return await osm.enrich_custom(_custom_dicts(custom_destinations))


def _coord_key(dest) -> str:
    return f"{dest['latitude']:.5f},{dest['longitude']:.5f}"


def _merge_custom(discovered: list[dict], custom: list[dict]) -> list[dict]:
    """Union of discovered + custom rows where the custom row wins a collision.

    A discovered row is dropped when a custom row claims its exact name (the
    identity rule query_osm already applies within its own results) or its
    5-decimal coordinate key (~1 m — the frontend's pinKey precedent). The
    user's own rows always survive; near-misses simply coexist as two rows.
    """
    names = {c["name"] for c in custom}
    coords = {_coord_key(c) for c in custom}
    kept = [
        d for d in discovered if d["name"] not in names and _coord_key(d) not in coords
    ]
    return kept + custom


def _suggest_elevation_floor(
    destinations: list[dict], cap: int
) -> tuple[int, int] | None:
    """A minimum elevation that would bring the candidate count under ``cap``.

    Returns ``(floor_ft, keeps)`` or None when no floor can work — which
    happens exactly when the unknown-elevation rows alone exceed the cap,
    since elevation filters always let unknowns through. The floor is rounded
    up to the next 100 ft so the suggestion reads like a number a person would
    type; rounding up can only keep fewer rows, never more, so the suggestion
    always actually works.
    """
    unknowns = sum(1 for d in destinations if d.get("elevation_ft") is None)
    budget = cap - unknowns
    if budget <= 0:
        return None
    known = sorted(
        (d["elevation_ft"] for d in destinations if d.get("elevation_ft") is not None),
        reverse=True,
    )
    if len(known) <= budget:
        return None  # already under cap; nothing to suggest
    threshold = known[budget - 1]
    floor = math.ceil(threshold / 100.0) * 100
    keeps = unknowns + sum(1 for e in known if e >= floor)
    return floor, keeps


def _truncate_top_elevation(destinations: list[dict], cap: int) -> list[dict]:
    """The explicit opt-in cut: the ``cap`` highest-elevation candidates.

    Unknown-elevation rows are dropped first — a row that cannot prove any
    elevation cannot claim to be among the highest. Never called without the
    request's ``top_by_elevation`` flag; silent truncation stays impossible.
    """
    known = [d for d in destinations if d.get("elevation_ft") is not None]
    known.sort(key=lambda d: d["elevation_ft"], reverse=True)
    return known[:cap]


def _cap_detail(
    count: int,
    noun: str,
    *,
    has_polygon: bool,
    has_custom: bool,
    suggestion: tuple[int, int] | None = None,
) -> str:
    """The over-cap refusal, advising only the remedies actually in play."""
    if has_polygon and has_custom:
        advice = "Draw a smaller polygon, narrow the elevation range, or trim the custom list."
    elif has_polygon:
        advice = "Draw a smaller polygon or narrow the elevation range."
    else:
        advice = "Trim the custom list or narrow the elevation range."
    detail = (
        f"This search covers {count:,} {noun}s. The analysis limit is "
        f"{MAX_ANALYZE_PEAKS:,} destinations. {advice}"
    )
    if suggestion is not None:
        floor, keeps = suggestion
        detail += (
            f" Setting a minimum elevation of {floor:,} ft would keep about "
            f"{keeps:,} {noun}s."
        )
    return detail


def _refusal_body(
    count: int,
    noun: str,
    *,
    has_polygon: bool,
    has_custom: bool,
    suggestion: tuple[int, int] | None,
) -> dict:
    """The structured 400 body (`AnalysisRefusal`) for an over-cap refusal."""
    body = AnalysisRefusal(
        detail=_cap_detail(
            count,
            noun,
            has_polygon=has_polygon,
            has_custom=has_custom,
            suggestion=suggestion,
        ),
        found=count,
        limit=MAX_ANALYZE_PEAKS,
    )
    if suggestion is not None:
        body.suggested_min_elevation_ft = float(suggestion[0])
        body.suggested_keeps = suggestion[1]
    return body.model_dump()


def _sort_key(sort_field: str, descending: bool = False):
    # AQI fields are nullable (short forecast horizon / best-effort fetch);
    # None sorts after every real value in either direction so it never wins
    # a ranking — hence negating values rather than sort(reverse=True).
    def key(r: DestinationResult):
        v = getattr(r, sort_field)
        if v is None:
            return (1, 0.0)
        return (0, -v if descending else v)

    return key

log = logging.getLogger(__name__)
router = APIRouter()

_NOUNS = {
    DestinationType.peak: "peak",
    DestinationType.trailhead: "trailhead",
    DestinationType.lake: "lake",
    DestinationType.custom: "destination",
}


def _noun(dest_type: DestinationType) -> str:
    return _NOUNS.get(dest_type, "destination")


def _summarize_request(request: AnalyzeRequest) -> str:
    """One-line summary of an analyze request for the logs: type, window, rank
    config, elevation band, and polygon size (or custom-destination count)."""
    parts = [
        f"type={request.destination_type.value}",
        f"start={request.start_datetime:%Y-%m-%dT%H:%M}",
        f"end={request.end_datetime:%Y-%m-%dT%H:%M}",
        f"sort={request.sort_by.value}",
        f"dir={'desc' if request.sort_desc else 'asc'}",
        f"limit={request.limit}",
    ]
    if request.min_elevation_ft is not None:
        parts.append(f"min_elev_ft={request.min_elevation_ft:.0f}")
    if request.max_elevation_ft is not None:
        parts.append(f"max_elev_ft={request.max_elevation_ft:.0f}")
    if request.destination_type == DestinationType.custom or request.custom_destinations:
        parts.append(f"custom={len(request.custom_destinations or [])}")
    if request.destination_type != DestinationType.custom and request.polygon is not None:
        ring = request.polygon.coordinates[0]
        parts.append(f"polygon={max(0, len(ring) - 1)}pts")
        parts.append(f"area={bbox_area_km2(ring):,.0f}km2")
    return " ".join(parts)


def _sse(event_type: str, **kwargs) -> str:
    return f"data: {json.dumps({'type': event_type, **kwargs})}\n\n"


# Sentinel pushed onto a progress queue once the backing task has finished.
_STREAM_DONE = object()


async def _drain(queue: asyncio.Queue):
    """Yield pre-formatted SSE strings from `queue` until the done sentinel.

    Lets an SSE route interleave progress events with a coroutine it runs on a
    separate task: the task pushes SSE strings as work happens, then pushes
    `_STREAM_DONE` in its `finally` to end the drain.
    """
    while True:
        item = await queue.get()
        if item is _STREAM_DONE:
            return
        yield item


# Cloudflare closes proxied connections idle for ~100 seconds, and a paced
# analysis can legitimately go quiet for most of a minute while the weighted
# budget refills. Emitted often enough to keep a healthy margin.
KEEPALIVE_INTERVAL_S = 25.0


async def _with_keepalive(source, interval_s: float = KEEPALIVE_INTERVAL_S):
    """Re-yield `source`, inserting a `keepalive` event during silences.

    Consumers that switch on the event `type` ignore it by construction; its
    only job is keeping proxy idle timers from killing a paced stream.
    """
    iterator = source.__aiter__()
    next_item = asyncio.ensure_future(anext(iterator))
    try:
        while True:
            try:
                item = await asyncio.wait_for(asyncio.shield(next_item), interval_s)
            except TimeoutError:
                yield _sse("keepalive")
                continue
            except StopAsyncIteration:
                return
            yield item
            next_item = asyncio.ensure_future(anext(iterator))
    finally:
        next_item.cancel()


async def _attach_aqi(
    results: list[DestinationResult],
    times: list[int],
    start_dt,
    end_dt,
) -> None:
    """Fetch AQI for exactly the rows being returned and merge it in.

    The lazy half of ranking-then-AQI: when the sort key is not an AQI
    metric, air quality is display data for the top rows only, so fetching
    it for every candidate (as the pre-#180 code did) doubled the weighted
    Open-Meteo spend for nothing. Best-effort like all AQI: the batch fetch
    degrades to nulls rather than raising.
    """
    if not results:
        return
    dests = [{"latitude": r.latitude, "longitude": r.longitude} for r in results]
    aqi_list = await air_quality.fetch_aqi_batch(dests, start_dt, end_dt)
    for row, aqi in zip(results, aqi_list):
        if not aqi:
            continue
        row.aqi_avg = aqi.get("aqi_avg")
        row.aqi_max = aqi.get("aqi_max")
        if row.series is not None:
            row.series.aqi = _aligned_aqi(times, aqi.get("series"))


def _canonical_times(wx_list: list) -> list[int]:
    """The shared hourly grid for the response. It is identical across
    destinations for one window, so the first row carrying a series defines it."""
    for wx in wx_list:
        if wx and wx.get("series"):
            return wx["series"]["times"]
    return []


def _aligned_aqi(times_ms: list[int], aqi_series: dict | None) -> list[int | None]:
    """AQI values aligned onto the weather grid, null where absent.

    AQI has a shorter (~5-day) horizon than weather, so hours beyond it have no
    entry and stay null — the chart's AQI line simply ends there.
    """
    if not aqi_series:
        return [None] * len(times_ms)
    lookup = dict(zip(aqi_series["times"], aqi_series["aqi"]))
    return [lookup.get(t) for t in times_ms]


def _assemble(
    destinations: list,
    wx_list: list,
    aqi_list: list,
    type_value: str,
) -> tuple[list[DestinationResult], list[int]]:
    """Zip destinations with their weather + AQI results into rows, baking the
    hourly series (AQI aligned onto the weather grid) into each.

    Rows whose weather came back None are dropped. Weather dicts without a
    `series` key (e.g. stubbed in tests) degrade cleanly to `series=None`.

    A row's `type` prefers the destination dict's own tag — a union response
    mixes discovered and custom rows — falling back to the request-level value.
    """
    times = _canonical_times(wx_list)
    results: list[DestinationResult] = []
    for dest, wx, aqi in zip(destinations, wx_list, aqi_list):
        if wx is None:
            continue
        aqi = aqi or {}
        wx_series = wx.get("series")
        agg = {k: v for k, v in wx.items() if k != "series"}
        aqi_stats = {k: v for k, v in aqi.items() if k != "series"}
        series = None
        if wx_series:
            series = HourlySeries(
                precip_in=wx_series["precip_in"],
                temp_f=wx_series["temp_f"],
                wind_mph=wx_series["wind_mph"],
                aqi=_aligned_aqi(wx_series["times"], aqi.get("series")),
            )
        results.append(
            DestinationResult(
                name=dest["name"],
                type=dest.get("type", type_value),
                latitude=dest["latitude"],
                longitude=dest["longitude"],
                elevation_ft=dest.get("elevation_ft"),
                osm_id=dest.get("osm_id"),
                **agg,
                **aqi_stats,
                series=series,
            )
        )
    return results, times


@router.post(
    "/analyze/stream",
    tags=["analysis"],
    summary="Rank destinations, streaming progress as it goes",
    # Without this, FastAPI assumes JSONResponse and documents the 200 as
    # application/json, which is what the schema wrongly claimed before.
    # StreamingResponse declares no media type of its own, so the only content
    # type in the schema is the one spelled out below.
    response_class=StreamingResponse,
    description=(
        "Identical analysis to `POST /api/analyze`, delivered as Server-Sent "
        "Events so a caller can show progress instead of waiting on one long "
        "request.\n\n"
        "Check the status code first, then the stream. A request that fails "
        "validation is rejected with **422 before the stream opens**, exactly "
        "as on `POST /api/analyze`. Once the stream does open the status is "
        "**200 for the rest of the exchange**, including for failures, because "
        "the connection is already streaming by the time an upstream problem "
        "surfaces. So a 200 here means the request was accepted, not that the "
        "analysis succeeded. Four event "
        "types arrive as `data:` lines carrying a JSON object with a `type` "
        "field:\n\n"
        "- `status` — a human-readable phase message in `message`, plus an "
        "optional `detail` line for mid-phase news: a fall-over to a backup "
        "map server, or a weather-quota pace wait with its resume estimate\n"
        "- `progress` — `processed`, `total`, and `percent` counters\n"
        "- `keepalive` — periodic no-op during quiet stretches (a paced "
        "analysis can wait most of a minute for quota); ignore it\n"
        "- `result` — the terminal success event, carrying a full "
        "`AnalyzeResponse` in `data`\n"
        "- `error` — the terminal failure event, with the reason in "
        "`message`; an over-limit refusal also carries the "
        "`AnalysisRefusal` remedy fields, and an upstream rate limit "
        "carries `scope` and `retry_after_s`\n\n"
        "Exactly one `result` or one `error` ends the stream.\n\n"
        "Rate limiting applies before the stream opens: a client past the "
        "per-address limit gets a plain **429 with `Retry-After`**, exactly as "
        "on `POST /api/analyze`. Capacity problems found mid-analysis (the "
        "instance-wide upstream budget saturating) arrive as an `error` event, "
        "since the stream is already open."
    ),
    dependencies=[Depends(ratelimit.analyze_rate_limit)],
    responses={
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is analyzing faster than the per-address limit. "
                "`Retry-After` says how many seconds to wait. "
                "`GET /api/capabilities` publishes the limit."
            ),
        },
        200: {
            "description": (
                "An SSE stream. Ends with either a `result` or an `error` event."
            ),
            "content": {
                "text/event-stream": {
                    "schema": {
                        "type": "string",
                        "example": (
                            'data: {"type": "status", "message": "Searching for Destinations…"}\n\n'
                            'data: {"type": "status", "message": "Searching for Destinations…", '
                            '"detail": "Trying backup map server 2 of 3…"}\n\n'
                            'data: {"type": "progress", "processed": 50, "total": 120, "percent": 41}\n\n'
                            'data: {"type": "result", "data": {"results": [], "total_queried": 0}}\n\n'
                        ),
                    }
                }
            },
        }
    },
)
async def analyze_stream(request: AnalyzeRequest):
    async def generate():
        log.info("Analyze request (stream): %s", _summarize_request(request))
        try:
            if request.start_datetime >= request.end_datetime:
                yield _sse("error", message="The start date must be before the end date.")
                return

            # A union (polygon + custom list) is a mixed set, so its messages
            # say "destinations" rather than any one type's noun.
            noun = "destination" if request.custom_destinations else _noun(request.destination_type)

            if request.destination_type == DestinationType.custom:
                if not request.custom_destinations:
                    yield _sse("error", message="custom_destinations is required for custom type")
                    return
                destinations = await _resolve_custom(request.custom_destinations)
            else:
                if not request.polygon:
                    yield _sse("error", message="polygon is required for non-custom destination types")
                    return
                yield _sse("status", message="Searching for Destinations…")

                # Overpass is one opaque request per mirror, so the only progress
                # signal is mirror failover. Run it on a task and surface those
                # status lines promptly via the queue.
                osm_queue: asyncio.Queue = asyncio.Queue()

                async def on_status(detail):
                    # Mirror failover ("Trying backup map server 2 of 3…") rides
                    # the optional `detail` field; `message` stays the stable
                    # phase heading the overlay keys on.
                    await osm_queue.put(
                        _sse("status", message="Searching for Destinations…", detail=detail)
                    )

                async def run_osm():
                    try:
                        return await osm.query_osm(
                            request.polygon, request.destination_type, on_status
                        )
                    finally:
                        await osm_queue.put(_STREAM_DONE)

                osm_task = asyncio.create_task(run_osm())
                try:
                    async for event in _drain(osm_queue):
                        yield event
                    destinations = await osm_task
                except NotImplementedError as e:
                    yield _sse("error", message=str(e))
                    return
                except ratelimit.BudgetExhausted as e:
                    yield _sse("error", message=e.message)
                    return
                except UpstreamError as e:
                    yield _sse("error", message=e.message)
                    return
                except Exception as e:
                    log.exception("OSM query failed")
                    yield _sse("error", message=f"Destination search failed unexpectedly: {e}")
                    return
                finally:
                    if not osm_task.done():
                        osm_task.cancel()

                # The user's own list rides along with whatever discovery found —
                # the union proceeds even when the polygon itself found nothing.
                if request.custom_destinations:
                    destinations = _merge_custom(
                        destinations, await _resolve_custom(request.custom_destinations)
                    )

                if not destinations:
                    yield _sse("result", data=AnalyzeResponse(results=[], total_queried=0).model_dump())
                    return

            destinations = _filter_elevation(
                destinations, request.min_elevation_ft, request.max_elevation_ft
            )
            if not destinations:
                yield _sse("result", data=AnalyzeResponse(results=[], total_queried=0).model_dump())
                return
            total_found: int | None = None
            truncated = False
            if len(destinations) > MAX_ANALYZE_PEAKS:
                if request.top_by_elevation:
                    total_found = len(destinations)
                    destinations = _truncate_top_elevation(destinations, MAX_ANALYZE_PEAKS)
                    truncated = True
                else:
                    suggestion = _suggest_elevation_floor(destinations, MAX_ANALYZE_PEAKS)
                    body = _refusal_body(
                        len(destinations),
                        noun,
                        has_polygon=request.destination_type != DestinationType.custom,
                        has_custom=bool(request.custom_destinations),
                        suggestion=suggestion,
                    )
                    # The error event carries the same structured remedy
                    # fields the HTTP 400 does, message first so a plain
                    # consumer can just render it.
                    yield _sse("error", message=body.pop("detail"), **body)
                    return

            total_queried = len(destinations)

            # Announce the retrieval phase WITH the final count the moment discovery
            # settles, so the overlay shows "Retrieving N Forecasts…" immediately
            # rather than a count-less line while the first batch (a full Open-Meteo
            # round-trip) is still in flight.
            yield _sse("progress", processed=0, total=total_queried, percent=0)

            # Drive the weather fetch on a task and drain per-batch progress from
            # a queue, so we can interleave `progress` SSE events with the await.
            progress_queue: asyncio.Queue = asyncio.Queue()

            async def on_progress(processed, total, batches_done, total_batches):
                percent = round(processed / total * 100) if total else 100
                await progress_queue.put(
                    _sse(
                        "progress",
                        processed=processed,
                        total=total,
                        percent=percent,
                        batches_done=batches_done,
                        total_batches=total_batches,
                        message=f"Retrieving forecasts: {processed} of {total} {noun}s…",
                    )
                )

            async def on_pace(seconds: int):
                # A pace wait is silence the user would otherwise read as a
                # hang; the detail line narrates it under the phase heading.
                await progress_queue.put(
                    _sse(
                        "status",
                        message="Retrieving Forecasts…",
                        detail=f"Weather service quota: resuming in about {seconds}s",
                    )
                )

            async def run_fetch():
                try:
                    return await weather.fetch_weather_batch(
                        destinations,
                        request.start_datetime,
                        request.end_datetime,
                        on_progress,
                        on_pace,
                    )
                finally:
                    await progress_queue.put(_STREAM_DONE)

            # Air quality is fetched for every candidate ONLY when it is the
            # ranking key (the order cannot be known without it). Otherwise it
            # is display data for the returned rows alone and is attached
            # after the cut — for a 908-peak default-sort analysis that is the
            # difference between ~1,800 and ~1,000 weighted calls.
            aqi_sort = request.sort_by.value.startswith("aqi")
            aqi_task = (
                asyncio.create_task(
                    air_quality.fetch_aqi_batch(
                        destinations, request.start_datetime, request.end_datetime
                    )
                )
                if aqi_sort
                else None
            )
            fetch_task = asyncio.create_task(run_fetch())
            try:
                async for event in _drain(progress_queue):
                    yield event

                wx_list = await fetch_task
                aqi_list = (
                    await aqi_task if aqi_task is not None else [None] * len(destinations)
                )
            except ratelimit.BudgetExhausted as e:
                yield _sse("error", message=e.message)
                return
            except UpstreamRateLimited as e:
                yield _sse(
                    "error", message=e.message, scope=e.scope, retry_after_s=e.retry_after_s
                )
                return
            except UpstreamError as e:
                yield _sse("error", message=e.message)
                return
            except Exception as e:
                log.exception("Weather fetch failed")
                yield _sse("error", message=f"Weather lookup failed unexpectedly: {e}")
                return
            finally:
                # If the client disconnected (generator torn down) before the
                # fetch finished, don't leave the request running in the background.
                for task in (fetch_task, aqi_task):
                    if task is not None and not task.done():
                        task.cancel()

            results, times = _assemble(
                destinations, wx_list, aqi_list, request.destination_type.value
            )
            results.sort(key=_sort_key(request.sort_by.value, request.sort_desc))
            results = results[: request.limit]
            if not aqi_sort:
                await _attach_aqi(
                    results, times, request.start_datetime, request.end_datetime
                )

            yield _sse(
                "result",
                data=AnalyzeResponse(
                    results=results,
                    total_queried=total_queried,
                    times=times,
                    total_found=total_found,
                    truncated=truncated,
                ).model_dump(),
            )

        except Exception as e:
            log.exception("Unexpected error in analyze_stream")
            yield _sse("error", message=f"Unexpected error: {e}")

    return StreamingResponse(
        _with_keepalive(generate()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    tags=["analysis"],
    summary="Rank destinations by forecast weather",
    description=(
        "Discovers every named destination of the requested type inside the "
        "polygon, unions in any `custom_destinations`, fetches a real hourly "
        "forecast for each, and returns the top `limit` ranked by `sort_by`.\n\n"
        "Discovery is never sampled, so cost scales with how many destinations "
        "the polygon contains, not with `limit`. A large polygon over dense "
        "terrain can take tens of seconds. For a progress feed instead of a "
        "single long wait, use `POST /api/analyze/stream`."
    ),
    dependencies=[Depends(ratelimit.analyze_rate_limit)],
    responses={
        429: {
            "model": ErrorResponse,
            "description": (
                "Either this client is analyzing faster than the per-address "
                "limit (shared with `POST /api/analyze/stream`), or the "
                "upstream weather service rate-limited this deployment "
                "mid-analysis. `Retry-After` says how many seconds to wait "
                "in both cases. `GET /api/capabilities` publishes the "
                "per-address limit."
            ),
        },
        503: {
            "model": ErrorResponse,
            "description": (
                "This instance's upstream budget is saturated: too many "
                "analyses already have calls in flight to the shared free "
                "APIs. Transient by nature; `Retry-After` says when a retry "
                "is worthwhile."
            ),
        },
        400: {
            "model": AnalysisRefusal,
            "description": (
                "The request parsed but does not describe a runnable analysis: "
                "the window is inverted, the destination type is not "
                "discoverable, `custom_destinations` is missing for a custom "
                "analysis, the elevation band excludes every candidate, or the "
                "candidate count exceeds the cap. Over-cap refusals carry the "
                "structured remedy fields (`found`, `limit`, and a computed "
                "elevation-floor suggestion when one exists); send "
                "`top_by_elevation: true` to elect an explicit top-N analysis "
                "instead."
            ),
        },
        502: {
            "model": ErrorResponse,
            "description": (
                "An upstream failed: every Overpass mirror was unreachable, or "
                "the weather API did not answer. Transient and worth retrying. "
                "Air quality is exempt, since a failure there degrades to null "
                "rather than failing the analysis."
            ),
        },
    },
)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    log.info("Analyze request: %s", _summarize_request(request))

    if request.start_datetime >= request.end_datetime:
        raise HTTPException(
            status_code=400, detail="The start date must be before the end date."
        )

    # Resolve destinations
    if request.destination_type == DestinationType.custom:
        if not request.custom_destinations:
            raise HTTPException(
                status_code=400,
                detail="custom_destinations is required when destination_type is 'custom'",
            )
        destinations = await _resolve_custom(request.custom_destinations)
    else:
        if not request.polygon:
            raise HTTPException(
                status_code=400,
                detail="polygon is required for non-custom destination types",
            )
        try:
            destinations = await osm.query_osm(request.polygon, request.destination_type)
        except NotImplementedError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except ratelimit.BudgetExhausted as e:
            raise HTTPException(
                status_code=503,
                detail=e.message,
                headers={"Retry-After": str(e.retry_after_s)},
            )
        except UpstreamError as e:
            raise HTTPException(status_code=502, detail=e.message)
        except Exception as e:  # noqa: BLE001 — any OSM failure maps to a 502
            raise HTTPException(
                status_code=502, detail=f"OSM query failed: {e}"
            )

        # The user's own list rides along with whatever discovery found — the
        # union proceeds even when the polygon itself found nothing.
        if request.custom_destinations:
            destinations = _merge_custom(
                destinations, await _resolve_custom(request.custom_destinations)
            )

    destinations = _filter_elevation(
        destinations, request.min_elevation_ft, request.max_elevation_ft
    )
    if not destinations:
        log.info("No destinations to analyze (none found, or none within the elevation band)")
        return AnalyzeResponse(results=[], total_queried=0)
    total_found: int | None = None
    truncated = False
    if len(destinations) > MAX_ANALYZE_PEAKS:
        noun = "destination" if request.custom_destinations else _noun(request.destination_type)
        if request.top_by_elevation:
            total_found = len(destinations)
            destinations = _truncate_top_elevation(destinations, MAX_ANALYZE_PEAKS)
            truncated = True
        else:
            suggestion = _suggest_elevation_floor(destinations, MAX_ANALYZE_PEAKS)
            return JSONResponse(
                status_code=400,
                content=_refusal_body(
                    len(destinations),
                    noun,
                    has_polygon=request.destination_type != DestinationType.custom,
                    has_custom=bool(request.custom_destinations),
                    suggestion=suggestion,
                ),
            )

    total_queried = len(destinations)
    log.info("Fetching weather for %d destination(s)", total_queried)

    # AQI for every candidate only when it is the ranking key; otherwise it is
    # attached to just the returned rows after the cut (see _attach_aqi).
    aqi_sort = request.sort_by.value.startswith("aqi")
    aqi_task = (
        asyncio.create_task(
            air_quality.fetch_aqi_batch(
                destinations, request.start_datetime, request.end_datetime
            )
        )
        if aqi_sort
        else None
    )
    try:
        wx_list = await weather.fetch_weather_batch(
            destinations, request.start_datetime, request.end_datetime
        )
    except ratelimit.BudgetExhausted as e:
        if aqi_task is not None:
            aqi_task.cancel()
        raise HTTPException(
            status_code=503,
            detail=e.message,
            headers={"Retry-After": str(e.retry_after_s)},
        )
    except UpstreamRateLimited as e:
        if aqi_task is not None:
            aqi_task.cancel()
        raise HTTPException(
            status_code=429,
            detail=e.message,
            headers={"Retry-After": str(e.retry_after_s)},
        )
    except UpstreamError as e:
        if aqi_task is not None:
            aqi_task.cancel()
        raise HTTPException(status_code=502, detail=e.message)
    except Exception as e:  # noqa: BLE001 — any weather failure maps to a 502
        if aqi_task is not None:
            aqi_task.cancel()
        raise HTTPException(
            status_code=502, detail=f"Weather API request failed: {e}"
        )
    aqi_list = await aqi_task if aqi_task is not None else [None] * len(destinations)

    results, times = _assemble(
        destinations, wx_list, aqi_list, request.destination_type.value
    )
    sort_field = request.sort_by.value
    results.sort(key=_sort_key(sort_field, request.sort_desc))
    results = results[: request.limit]
    if not aqi_sort:
        await _attach_aqi(results, times, request.start_datetime, request.end_datetime)

    def _fmt(r: DestinationResult) -> str:
        v = getattr(r, sort_field)
        return f"{v:.3f}" if v is not None else "—"

    log.info(
        "Returning %d result(s) sorted by %s %s (best: %s, worst: %s)",
        len(results),
        sort_field,
        "desc" if request.sort_desc else "asc",
        _fmt(results[0]) if results else "—",
        _fmt(results[-1]) if results else "—",
    )
    return AnalyzeResponse(
        results=results,
        total_queried=total_queried,
        times=times,
        total_found=total_found,
        truncated=truncated,
    )
