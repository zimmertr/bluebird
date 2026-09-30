import asyncio
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Security
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import APIKeyHeader

from app import ratelimit, telemetry
from app.error_codes import ApiError, ErrorCode
from app.models import (
    MAX_ANALYZE_PEAKS,
    AnalysisRefusal,
    AnalyzeRequest,
    AnalyzeResponse,
    DestinationResult,
    DestinationType,
    ErrorResponse,
    WindowSource,
    archive_boundary,
    bbox_area_km2,
    window_source,
)
from app.routes.analyze.events import (
    _STREAM_DONE,
    AnalyzeEvent,
    Failure,
    Progress,
    Refusal,
    Result,
    Status,
    _drain,
)
from app.routes.analyze.sse import _render_sse, _sse_error, _with_keepalive
from app.services import air_quality, snodas, weather
from app.services.candidates import (
    _filter_elevation,
    _merge_custom,
    _refusal_body,
    _resolve_custom,
    _suggest_elevation_floor,
    discover,
)
from app.services.errors import (
    InvalidApiKeyError,
    ModelCoverageError,
    UpstreamError,
    UpstreamRateLimited,
)
from app.services.ranking import (
    _LOWER_BOUNDS,
    _UPPER_BOUNDS,
    _aligned_aqi,
    _aligned_cloud,
    _aqi_bounded,
    _assemble,
    _cloud_eager,
    _filter_constraints,
    _noun,
    _sort_key,
    _truncate_top_elevation,
)

# The one spelling of the header that carries a caller's Open-Meteo key.
# `GET /api/capabilities` publishes this value, so it is defined once here and
# imported there rather than written twice (issue #317).
API_KEY_HEADER = "X-Open-Meteo-Key"

# Optional on purpose. The key requirement is enforced at the public edge: the
# gateway forwards an analyze request only when this header is present, so a
# request that reaches an unkeyed path arrived in-cluster (the release probe, a
# PR preview, a port-forward) or on a self-hosted instance, where the free tier
# is the deployment's own to spend. `auto_error=False` is what leaves those
# alone while still declaring the scheme on both routes in the OpenAPI
# document.
open_meteo_key = APIKeyHeader(
    name=API_KEY_HEADER,
    auto_error=False,
    description=(
        "An Open-Meteo API key. The public deployment requires it on the "
        "analyze routes, and the request spends this key's quota."
    ),
)


def _window_split(request: AnalyzeRequest) -> tuple[WindowSource, datetime]:
    """Which weather endpoint answers this request, and where the seam falls.

    One reading of the clock for both answers (issue #123). The boundary moves,
    so classifying in one place and splitting in another would let a window be
    classified as spanning and then cut at an instant the classification never
    saw — which is why the weather service takes both as arguments rather than
    working either out for itself.

    A window that crosses the boundary is served rather than refused: the archive
    answers the hours before the seam, the forecast endpoint the hours from it on,
    and the two are joined per location before the aggregation runs.
    """
    now = datetime.now(UTC)
    start, end = request.resolved_window()
    return (
        window_source(start, end, now),
        archive_boundary(now),
    )


# Pinned rather than `__name__` (`app.routes.analyze.route`), because
# `docs/CONFIGURATION.md` shows operators this name in its log examples and a
# filter written against it must keep matching.
log = logging.getLogger("app.routes.analyze")
router = APIRouter()


def _summarize_request(request: AnalyzeRequest) -> str:
    """One-line summary of an analyze request for the logs: type, window, rank
    config, elevation band, and polygon size (or custom-destination count)."""
    parts = [
        f"types={','.join(t.value for t in request.destination_types) or 'none'}",
        f"start={request.start_datetime:%Y-%m-%dT%H:%M}",
        f"end={request.end_datetime:%Y-%m-%dT%H:%M}",
        f"sort={request.sort_by.value}",
        f"dir={'desc' if request.sort_desc else 'asc'}",
        f"limit={request.limit}",
    ]
    # Logged only when off, so a response an order of magnitude smaller than
    # the same analysis yesterday is traceable to the request that asked for it.
    if not request.include_series:
        parts.append("series=off")
    if request.include_clouds:
        parts.append("clouds=on")
    if request.min_elevation_ft is not None:
        parts.append(f"min_elev_ft={request.min_elevation_ft:.0f}")
    if request.max_elevation_ft is not None:
        parts.append(f"max_elev_ft={request.max_elevation_ft:.0f}")
    # Bounds are logged by their request field name so a log line and a curl
    # of the same analysis read the same, and an empty-looking result can be
    # traced to the bound that emptied it.
    for attr, _ in (*_LOWER_BOUNDS, *_UPPER_BOUNDS):
        value = getattr(request, attr)
        if value is not None:
            parts.append(f"{attr}={value:g}")
    if request.custom_destinations:
        parts.append(f"custom={len(request.custom_destinations or [])}")
    if request.destination_types and request.polygon is not None:
        ring = request.polygon.coordinates[0]
        parts.append(f"polygon={max(0, len(ring) - 1)}pts")
        parts.append(f"area={bbox_area_km2(ring):,.0f}km2")
    return " ".join(parts)


# ── The analysis, and the two ways it is presented ─────────────────────────
#
# Both analyze routes are public API since #317, so neither arm can be dropped
# and every rule has to hold on both. They ran the same sequence written out
# twice until #384: window split, discovery, custom merge, elevation band, cap
# refusal, weather with its six-branch failure ladder, assemble, bound, rank,
# cut, AQI. `_run_analysis` holds that sequence once and yields what happens;
# each route renders the events it can show and drops the rest.
#
# A generator rather than a coroutine because the SSE route needs the events
# that arrive mid-flight. A coroutine could only hand back the last one.


async def _attach_aqi(
    results: list[DestinationResult],
    times: list[int],
    start_dt,
    end_dt,
    api_key: str | None = None,
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
    aqi_list = await air_quality.fetch_aqi_batch(
        dests, start_dt, end_dt, api_key=api_key
    )
    for row, aqi in zip(results, aqi_list, strict=False):
        if not aqi:
            continue
        row.aqi_avg = aqi.get("aqi_avg")
        row.aqi_min = aqi.get("aqi_min")
        row.aqi_max = aqi.get("aqi_max")
        if row.series is not None:
            row.series.aqi = _aligned_aqi(times, aqi.get("series"))


async def _attach_cloud(
    results: list[DestinationResult],
    times: list[int],
    start_dt,
    end_dt,
    request: AnalyzeRequest,
    api_key: str | None,
    source: WindowSource,
    boundary: datetime,
) -> None:
    """Fetch the cloud fields for exactly the rows being returned.

    The lazy half, for a caller who asked for the columns (`include_clouds`)
    without ranking or bounding by them: the fields are display data for the
    returned rows, so fetching them for every candidate would spend a second
    request per location on rows nobody sees. Raises like the weather fetch,
    because the caller asked for these by name.
    """
    if not results:
        return
    dests = [
        {"latitude": r.latitude, "longitude": r.longitude, "elevation_ft": r.elevation_ft}
        for r in results
    ]
    cloud_list = await weather.fetch_cloud_batch(
        dests,
        start_dt,
        end_dt,
        request.forecast_model,
        api_key=api_key,
        source=source,
        boundary=boundary,
    )
    for row, cloud in zip(results, cloud_list, strict=False):
        if not cloud:
            continue
        for field in _CLOUD_FIELDS:
            setattr(row, field, cloud.get(field))
        if row.series is not None:
            row.series.cloud_base_ft, row.series.cloud_cover_pct = _aligned_cloud(
                times, cloud.get("series")
            )


# The six aggregate fields a cloud answer carries, in the order the result
# model declares them.
_CLOUD_FIELDS = (
    "cloud_base_min_ft",
    "cloud_base_avg_ft",
    "cloud_base_max_ft",
    "cloud_cover_min_pct",
    "cloud_cover_avg_pct",
    "cloud_cover_max_pct",
)


def _upstream_failure(e: Exception) -> Failure:
    """What a failed forecast fetch answers, one arm per cause.

    One ladder for every fetch that can fail the analysis, the weather and the
    cloud request alike, so the two cannot answer the same upstream fault with
    two statuses.
    """
    if isinstance(e, ratelimit.BudgetExhausted):
        return Failure(
            ApiError(
                status_code=503,
                detail=e.message,
                code=ErrorCode.busy,
                headers={"Retry-After": str(e.retry_after_s)},
            )
        )
    if isinstance(e, InvalidApiKeyError):
        # 401, and tested ahead of its UpstreamError base for the same reason
        # ModelCoverageError below is a 400: the upstream is healthy and only
        # the caller can fix the request.
        return Failure(
            ApiError(status_code=401, detail=e.message, code=ErrorCode.invalid_api_key)
        )
    if isinstance(e, UpstreamRateLimited):
        # A response says how long to wait in `Retry-After` and names no
        # scope at all. An event has no headers, so both ride it as members.
        return Failure(
            ApiError(
                status_code=429,
                detail=e.message,
                code=ErrorCode.upstream_rate_limited,
                headers={"Retry-After": str(e.retry_after_s)},
            ),
            extra={"scope": e.scope, "retry_after_s": e.retry_after_s},
        )
    if isinstance(e, ModelCoverageError):
        # 400, not the 502 its UpstreamError base would otherwise give: the
        # upstream is healthy and answered correctly. The request asked a
        # regional model about somewhere it does not model, and only the
        # caller can fix that.
        return Failure(
            ApiError(status_code=400, detail=e.message, code=ErrorCode.model_coverage)
        )
    if isinstance(e, UpstreamError):
        return Failure(
            ApiError(
                status_code=502, detail=e.message, code=ErrorCode.upstream_unavailable
            )
        )
    log.exception("Weather fetch failed", exc_info=e)
    return Failure(
        ApiError(
            status_code=502,
            detail="The weather search failed. Try again later.",
            code=ErrorCode.upstream_unavailable,
        )
    )


async def _run_analysis(
    request: AnalyzeRequest, api_key: str | None
) -> AsyncGenerator[AnalyzeEvent]:
    """Run one analysis, reporting what happens as it happens.

    Ends with exactly one terminal event — `Failure`, `Refusal` or `Result` —
    and returns. A caller iterates to exhaustion rather than abandoning the
    generator on the terminal event, so the `finally` blocks that cancel
    in-flight upstream tasks run promptly instead of at collection.
    """
    start, end = request.resolved_window()
    if start >= end:
        yield Failure(
            ApiError(
                status_code=400,
                detail="The start date must be before the end date.",
                code=ErrorCode.validation,
            )
        )
        return
    source, boundary = _window_split(request)

    # A union (polygon + custom list) is a mixed set, so its messages say
    # "destinations" rather than any one type's noun.
    noun = _noun(request.destination_types, has_custom=bool(request.custom_destinations))

    if not request.destination_types:
        if not request.custom_destinations:
            yield Failure(
                ApiError(
                    status_code=400,
                    detail=(
                        "Nothing to analyze: send destination_types with a polygon, "
                        "custom_destinations, or both."
                    ),
                    code=ErrorCode.validation,
                )
            )
            return
        destinations = await _resolve_custom(request.custom_destinations)
    else:
        polygon = request.polygon
        if not polygon:
            yield Failure(
                ApiError(
                    status_code=400,
                    detail="polygon is required when destination_types is non-empty",
                    code=ErrorCode.validation,
                )
            )
            return
        yield Status("Searching for Destinations…")

        # Overpass is one opaque request per mirror, so the only progress
        # signal is mirror failover. Run it on a task and surface those
        # status lines promptly via the queue.
        osm_queue: asyncio.Queue = asyncio.Queue()

        async def on_status(detail) -> None:
            # Mirror failover ("Trying backup map server 2 of 3…") rides the
            # optional `detail` field; `message` stays the stable phase
            # heading the overlay keys on.
            await osm_queue.put(Status("Searching for Destinations…", detail))

        async def run_osm() -> list[dict]:
            try:
                return await discover(
                    polygon,
                    request.destination_types,
                    include_unnamed_peaks=request.include_unnamed_peaks,
                    on_status=on_status,
                )
            finally:
                await osm_queue.put(_STREAM_DONE)

        osm_task = asyncio.create_task(run_osm())
        try:
            async for event in _drain(osm_queue):
                yield event
            destinations = await osm_task
        except ApiError as e:
            yield Failure(e)
            return
        finally:
            # If the consumer went away (generator torn down) before discovery
            # finished, don't leave the request running in the background.
            if not osm_task.done():
                osm_task.cancel()

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
        yield Result(AnalyzeResponse(results=[], total_queried=0, total_matched=0))
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
            yield Refusal(_refusal_body(len(destinations), noun, suggestion=suggestion))
            return

    # Today's snow depth, read off the held grid once the candidate set is
    # final. It is not a forecast and costs no upstream call, so it rides here
    # rather than beside the weather fetch, and a pod holding no grid answers
    # nulls instead of waiting for one (`fill_snow_depth`).
    snow_analysis_date = snodas.fill_snow_depth(destinations)

    total_queried = len(destinations)
    telemetry.ANALYZE_DESTINATIONS.observe(total_queried)
    telemetry.ANALYZE_LIMIT.observe(request.limit)
    log.info("Fetching weather for %d destination(s)", total_queried)

    # Announce the retrieval phase WITH the final count the moment discovery
    # settles, so the overlay shows "Retrieving N Forecasts…" immediately
    # rather than a count-less line while the first batch (a full Open-Meteo
    # round-trip) is still in flight.
    yield Progress(processed=0, total=total_queried, percent=0)

    # Drive the weather fetch on a task and drain per-batch progress from a
    # queue, so progress events interleave with the await.
    progress_queue: asyncio.Queue = asyncio.Queue()

    async def on_progress(processed, total, batches_done, total_batches) -> None:
        percent = round(processed / total * 100) if total else 100
        await progress_queue.put(
            Progress(
                processed=processed,
                total=total,
                percent=percent,
                batches_done=batches_done,
                total_batches=total_batches,
                message=f"Retrieving forecasts: {processed} of {total} {noun}s…",
            )
        )

    async def on_pace(seconds: int) -> None:
        # A pace wait is silence the user would otherwise read as a hang; the
        # detail line narrates it under the phase heading.
        await progress_queue.put(
            Status(
                "Retrieving Forecasts…",
                f"Open-Meteo quota: resuming in about {seconds}s",
            )
        )

    async def run_fetch() -> list[dict[str, Any] | None]:
        try:
            return await weather.fetch_weather_batch(
                destinations,
                start,
                end,
                on_progress,
                on_pace,
                request.forecast_model,
                api_key=api_key,
                source=source,
                boundary=boundary,
            )
        finally:
            await progress_queue.put(_STREAM_DONE)

    # Air quality is fetched for every candidate ONLY when the answer depends
    # on it before the cut: it is the ranking key (the order cannot be known
    # without it), or a bound filters on it (a bound on an unfetched value
    # drops nothing, since nulls pass). Otherwise it is display data for the
    # returned rows alone and is attached after the cut — for a 908-peak
    # default-sort analysis that is the difference between ~1,800 and ~1,000
    # weighted calls.
    aqi_eager = request.sort_by.value.startswith("aqi") or _aqi_bounded(request)
    aqi_task = (
        asyncio.create_task(
            air_quality.fetch_aqi_batch(
                destinations,
                start,
                end,
                api_key=api_key,
            )
        )
        if aqi_eager
        else None
    )
    # The cloud variables are the same question one step further: a second
    # request per location that the ranking or a bound can depend on (issue
    # #117). Fetched eagerly for every candidate only then, alongside the
    # weather; a caller who only asked to SEE them gets them after the cut.
    cloud_eager = _cloud_eager(request)
    cloud_task = (
        asyncio.create_task(
            weather.fetch_cloud_batch(
                destinations,
                start,
                end,
                request.forecast_model,
                api_key=api_key,
                source=source,
                boundary=boundary,
            )
        )
        if cloud_eager
        else None
    )
    fetch_task = asyncio.create_task(run_fetch())
    try:
        async for event in _drain(progress_queue):
            yield event

        wx_list = await fetch_task
        aqi_list = await aqi_task if aqi_task is not None else [None] * len(destinations)
        cloud_list = await cloud_task if cloud_task is not None else None
    except Exception as e:
        yield _upstream_failure(e)
        return
    finally:
        # If the consumer went away (generator torn down) before the fetch
        # finished, don't leave the request running in the background.
        for task in (fetch_task, aqi_task, cloud_task):
            if task is not None and not task.done():
                task.cancel()

    results, times = _assemble(
        destinations,
        wx_list,
        aqi_list,
        DestinationType.custom.value,
        include_series=request.include_series,
        cloud_list=cloud_list,
    )
    results = _filter_constraints(results, request)
    total_matched = len(results)
    sort_field = request.sort_by.value
    results.sort(key=_sort_key(sort_field, request.sort_desc))
    results = results[: request.limit]
    if not aqi_eager:
        try:
            await _attach_aqi(
                results, times, start, end, api_key
            )
        except InvalidApiKeyError as e:
            # Reachable when the weather half answered entirely from cache, so
            # the first upstream call the key made was the air-quality one.
            yield Failure(
                ApiError(
                    status_code=401, detail=e.message, code=ErrorCode.invalid_api_key
                )
            )
            return
    if request.include_clouds and not cloud_eager:
        try:
            await _attach_cloud(
                results, times, start, end, request, api_key, source, boundary
            )
        except Exception as e:
            yield _upstream_failure(e)
            return

    def _fmt(r: DestinationResult) -> str:
        v = getattr(r, sort_field)
        return f"{v:.3f}" if v is not None else "—"

    log.info(
        "Returning %d result(s) sorted by %s %s (best: %s, worst: %s)%s",
        len(results),
        sort_field,
        "desc" if request.sort_desc else "asc",
        _fmt(results[0]) if results else "—",
        _fmt(results[-1]) if results else "—",
        f" ({total_matched} of {total_queried} matched)"
        if total_matched != total_queried
        else "",
    )
    yield Result(
        AnalyzeResponse(
            results=results,
            total_queried=total_queried,
            total_matched=total_matched,
            times=times,
            total_found=total_found,
            truncated=truncated,
            snow_analysis_date=snow_analysis_date,
        )
    )


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
        "`message` and the same machine-readable `error` object "
        "(`code`, `retryable`) the JSON routes answer with; an over-limit "
        "refusal also carries the `AnalysisRefusal` remedy fields, and an "
        "upstream rate limit carries `scope` and `retry_after_s`\n\n"
        "Exactly one `result` or one `error` ends the stream.\n\n"
        "Rate limiting applies before the stream opens: a client past the "
        "per-address limit gets a plain **429 with `Retry-After`**, exactly as "
        "on `POST /api/analyze`. Capacity problems found mid-analysis (the "
        "instance-wide upstream budget saturating) arrive as an `error` event, "
        "since the stream is already open."
    ),
    dependencies=[Depends(ratelimit.analyze_rate_limit)],
    responses={
        401: {
            "model": ErrorResponse,
            "description": "Open-Meteo rejected the API key.",
        },
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
                            'data: {"type": "progress", "processed": 50, "total": 120, "percent": 42}\n\n'
                            'data: {"type": "result", "data": {"results": [], "total_queried": 0}}\n\n'
                        ),
                    }
                }
            },
        }
    },
)
async def analyze_stream(
    request: AnalyzeRequest,
    api_key: str | None = Security(open_meteo_key),
) -> StreamingResponse:
    async def generate() -> AsyncIterator[str]:
        log.info("Analyze request (stream): %s", _summarize_request(request))
        try:
            async with aclosing(_run_analysis(request, api_key)) as events:
                async for event in events:
                    yield _render_sse(event)
        except Exception:
            log.exception("Unexpected error in analyze_stream")
            yield _sse_error("Something went wrong. Try again later.", ErrorCode.internal)

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
        401: {
            "model": ErrorResponse,
            "description": "Open-Meteo rejected the API key.",
        },
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
async def analyze(
    request: AnalyzeRequest,
    api_key: str | None = Security(open_meteo_key),
) -> AnalyzeResponse | JSONResponse:
    log.info("Analyze request: %s", _summarize_request(request))

    terminal: AnalyzeEvent | None = None
    # Iterated to exhaustion rather than broken out of on the terminal event:
    # the generator's own `finally` blocks cancel in-flight upstream tasks, and
    # abandoning it would defer those to collection. Status and progress are
    # the stream's to show; a single response has nowhere to put them.
    async with aclosing(_run_analysis(request, api_key)) as events:
        async for event in events:
            if isinstance(event, (Failure, Refusal, Result)):
                terminal = event

    if isinstance(terminal, Failure):
        raise terminal.error
    if isinstance(terminal, Refusal):
        return JSONResponse(status_code=400, content=terminal.body)
    if isinstance(terminal, Result):
        return terminal.response
    # Unreachable: the generator ends with a terminal event on every path. A
    # 500 is the honest answer if that ever stops being true, rather than an
    # empty ranking that looks like a real answer.
    raise ApiError(
        status_code=500,
        detail="Something went wrong. Try again later.",
        code=ErrorCode.internal,
    )
