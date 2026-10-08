"""The analysis, one function per phase.

`_run_analysis` in `route.py` is the one generator both analyze routes read
(#384), and it does nothing but call these in order and stop at the first
terminal event. Each phase has a name and a test of its own
(`tests/test_analyze_phases.py`).

Two phases are async generators, because each runs an upstream call on a task
and relays what happens while it waits: discovery reports a mirror failover,
and the forecast fetch reports per-batch progress and pace waits. The stream
must show those events while the await is still running. A generator phase
ends with `Done` carrying its value, or with a terminal event and no `Done`.
Every other phase takes values and returns one, because a generator would only
add a relay loop.

Two rules keep the two routes answering alike. `_eager_fetches` is the only
reader of the eager conditions, and its one `Eager` value decides both the
early fetch and the late skip. `_upstream_failure` is the only place a forecast
fetch error becomes a `Failure`. Discovery maps its own errors in `discover()`,
and its phase wraps the `ApiError` it raises as it stands.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app import ratelimit, telemetry
from app.error_codes import ApiError, ErrorCode
from app.limits import MAX_ANALYZE_DESTINATION_HOURS, window_hours
from app.models import (
    MAX_ANALYZE_PEAKS,
    AnalysisRefusal,
    AnalyzeRequest,
    AnalyzeResponse,
    ApiErrorInfo,
    DestinationResult,
    DestinationType,
    WindowSource,
    archive_boundary,
    window_source,
)
from app.routes.analyze.events import (
    _STREAM_DONE,
    AnalyzeEvent,
    Done,
    Failure,
    Progress,
    Refusal,
    Result,
    Status,
    _drain,
)
from app.services import air_quality, weather
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
from app.services.openmeteo_fetch import MAX_CONCURRENT_BATCHES
from app.services.ranking import (
    _aligned_aqi,
    _aligned_cloud,
    _aqi_bounded,
    _assemble,
    _cloud_eager,
    _filter_constraints,
    _sort_key,
    _truncate_top_elevation,
)

# The route's own logger name rather than `__name__`: these lines are the
# route's log, and `docs/CONFIGURATION.md` shows operators this name.
log = logging.getLogger("app.routes.analyze")


@dataclass(slots=True, frozen=True)
class Window:
    """The resolved window, and which endpoint answers it, from one reading
    of the clock (`_window_split`)."""

    start: datetime
    end: datetime
    source: WindowSource
    boundary: datetime


@dataclass(slots=True)
class Capped:
    """The final candidate set, and what the cap did to it."""

    destinations: list[dict]
    total_found: int | None
    truncated: bool


@dataclass(slots=True, frozen=True)
class Eager:
    """Which second fetches run for every candidate before the cut, rather
    than for the returned rows after it."""

    aqi: bool
    cloud: bool


@dataclass(slots=True)
class Fetched:
    """Each candidate's forecasts, index for index with the candidates."""

    wx: list[dict[str, Any] | None]
    aqi: list[dict[str, Any] | None]
    cloud: list[dict[str, Any] | None] | None


@dataclass(slots=True)
class Ranked:
    """The rows the response returns, the hours they cover, and how many rows
    matched the bounds before the cut."""

    results: list[DestinationResult]
    times: list[int]
    total_matched: int


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


def _check_window(request: AnalyzeRequest) -> Window | Failure:
    """The window, or the 400 for one that ends before it starts."""
    start, end = request.resolved_window()
    if start >= end:
        return Failure(
            ApiError(
                status_code=400,
                detail="The start date must be before the end date.",
                code=ErrorCode.validation,
            )
        )
    source, boundary = _window_split(request)
    return Window(start, end, source, boundary)


async def _find_candidates(
    request: AnalyzeRequest,
) -> AsyncGenerator[AnalyzeEvent | Done[list[dict]]]:
    """Discovery, the caller's own list, and the elevation band.

    Ends with `Done` and the candidates, which may be none, or with a
    `Failure`: a request that names nothing to analyze, types without a
    polygon, or a discovery failure.
    """
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
        yield Status("Searching for destinations…")

        # Overpass is one opaque request per mirror, so the only progress
        # signal is mirror failover. Run it on a task and surface those
        # status lines promptly via the queue.
        osm_queue: asyncio.Queue = asyncio.Queue()

        async def on_status(detail) -> None:
            # Mirror failover ("Trying backup map server 2 of 3…") rides the
            # optional `detail` field; `message` stays the stable phase
            # heading the overlay keys on.
            await osm_queue.put(Status("Searching for destinations…", detail))

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
    yield Done(destinations)


def _apply_cap(
    destinations: list[dict], request: AnalyzeRequest, noun: str
) -> Capped | Refusal | Result:
    """The empty answer, the over-cap refusal, or the final candidate set."""
    if not destinations:
        log.info("No destinations to analyze (none found, or none within the elevation band)")
        return Result(AnalyzeResponse(results=[], total_queried=0, total_matched=0))
    total_found: int | None = None
    truncated = False
    if len(destinations) > MAX_ANALYZE_PEAKS:
        if request.top_by_elevation:
            total_found = len(destinations)
            destinations = _truncate_top_elevation(destinations, MAX_ANALYZE_PEAKS)
            truncated = True
        else:
            suggestion = _suggest_elevation_floor(destinations, MAX_ANALYZE_PEAKS)
            return Refusal(_refusal_body(len(destinations), noun, suggestion=suggestion))
    return Capped(destinations, total_found, truncated)


def _pace_detail(count: int, noun: str, days: int) -> str:
    """The refusal of an analysis too large to run, over the destination-hour
    budget or past what the pacer would shed: what is wrong, and nothing else,
    in the over-cap refusal's manner (`_cap_detail`)."""
    return (
        f"This search covers {count:,} {noun}s over {days:,} days, which is too "
        "many for one analysis."
    )


def _check_pacing(
    destinations: list[dict],
    window: Window,
    api_key: str | None,
    noun: str,
    eager: Eager,
) -> Refusal | None:
    """Refuse an analysis too large to run, before it spends anything.

    Two bounds, one refusal. The destination-hour budget holds every caller,
    keyed or not (#624): each candidate's hourly series is held until the
    response is built, so candidates times window hours is what one analysis
    holds in memory, and over a year-long window the analysis cap alone was
    more than the pod has. `MAX_ANALYZE_DESTINATION_HOURS` has the measurement.

    The pacer bound holds an unkeyed caller alone (#581). The weighted pacer
    sheds any acquire that would wait longer than `UPSTREAM_WEIGHT_MAX_WAIT_S`,
    and on a long archive window an analysis's OWN batches pass that bound on
    an idle pod: each costs about 5.4 weighted calls a day, and the fourth or
    later batch queues behind the ones before it. It used to spend those first
    batches and then answer a 503 whose Retry-After no retry could honour.
    `plan_max_wait_s` runs the analysis's own weights through a scratch copy of
    the pacer, so the refusal and the shed are one rule and cannot drift. A
    keyed fetch skips the pacer (#317), so a keyed caller meets only the budget.

    Either way the refusal carries, as `limit`, the most destinations the window
    can take under both bounds at once, so a caller who sends that many is not
    refused a second time.
    """
    budget = ratelimit.WEATHER_WEIGHT
    concurrency = MAX_CONCURRENT_BATCHES * (2 if eager.cloud else 1)
    most = MAX_ANALYZE_DESTINATION_HOURS // max(1, window_hours(window.start, window.end))

    def fits(n: int) -> bool:
        if n > most:
            return False
        if api_key is not None:
            return True
        plan = weather.planned_weights(
            n,
            window.start,
            window.end,
            source=window.source,
            boundary=window.boundary,
            cloud=eager.cloud,
        )
        return budget.plan_max_wait_s(plan, concurrency) <= ratelimit.UPSTREAM_WEIGHT_MAX_WAIT_S

    count = len(destinations)
    if fits(count):
        return None
    # The largest count that fits, by bisection: more destinations never wait
    # less or hold less, so the answer is one edge.
    lo, hi = 0, min(count, most + 1)
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if fits(mid):
            lo = mid
        else:
            hi = mid
    days = (window.end.date() - window.start.date()).days + 1
    log.info(
        "Refusing an analysis of %d over %d days (%s): it fits %d",
        count,
        days,
        "keyed" if api_key is not None else "unkeyed",
        lo,
    )
    body = AnalysisRefusal(
        detail=_pace_detail(count, noun, days),
        error=ApiErrorInfo.for_code(ErrorCode.refusal),
        found=count,
        limit=lo,
    )
    return Refusal(body.model_dump(mode="json"))


def _eager_fetches(request: AnalyzeRequest) -> Eager:
    """Which second fetches the answer depends on before the cut.

    Air quality is fetched for every candidate ONLY when the answer depends
    on it before the cut: it is the ranking key (the order cannot be known
    without it), or a bound filters on it (a bound on an unfetched value
    drops nothing, since nulls pass). Otherwise it is display data for the
    returned rows alone and is attached after the cut — for a 908-peak
    default-sort analysis that is the difference between ~1,800 and ~1,000
    weighted calls.

    The cloud variables are the same question one step further: a second
    request per location that the ranking or a bound can depend on (issue
    #117). Fetched eagerly for every candidate only then, alongside the
    weather; a caller who only asked to SEE them gets them after the cut.
    """
    return Eager(
        aqi=request.sort_by.value.startswith("aqi") or _aqi_bounded(request),
        cloud=_cloud_eager(request),
    )


async def _fetch_forecasts(
    destinations: list[dict],
    window: Window,
    request: AnalyzeRequest,
    api_key: str | None,
    noun: str,
    eager: Eager,
) -> AsyncGenerator[AnalyzeEvent | Done[Fetched]]:
    """Every candidate's weather, with the second fetches `eager` names.

    Ends with `Done` and the forecasts, or with the `Failure` that
    `_upstream_failure` maps the fetch error to.
    """
    total_queried = len(destinations)
    telemetry.ANALYZE_DESTINATIONS.observe(total_queried)
    telemetry.ANALYZE_LIMIT.observe(request.limit)
    log.info("Fetching weather for %d destination(s)", total_queried)

    # Announce the retrieval phase WITH the final count the moment discovery
    # settles, so the overlay shows "Retrieving N forecasts…" immediately
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
                "Retrieving forecasts…",
                f"Open-Meteo quota: resuming in about {seconds}s",
            )
        )

    async def run_fetch() -> list[dict[str, Any] | None]:
        try:
            return await weather.fetch_weather_batch(
                destinations,
                window.start,
                window.end,
                on_progress,
                on_pace,
                request.forecast_model,
                api_key=api_key,
                source=window.source,
                boundary=window.boundary,
            )
        finally:
            await progress_queue.put(_STREAM_DONE)

    aqi_task = (
        asyncio.create_task(
            air_quality.fetch_aqi_batch(
                destinations,
                window.start,
                window.end,
                api_key=api_key,
            )
        )
        if eager.aqi
        else None
    )
    cloud_task = (
        asyncio.create_task(
            weather.fetch_cloud_batch(
                destinations,
                window.start,
                window.end,
                request.forecast_model,
                api_key=api_key,
                source=window.source,
                boundary=window.boundary,
            )
        )
        if eager.cloud
        else None
    )
    fetch_task = asyncio.create_task(run_fetch())
    try:
        async for event in _drain(progress_queue):
            yield event

        wx_list = await fetch_task
        aqi_list: list[dict[str, Any] | None] = (
            await aqi_task if aqi_task is not None else [None] * len(destinations)
        )
        cloud_list = await cloud_task if cloud_task is not None else None
    except Exception as e:
        yield _upstream_failure(e)
        return
    finally:
        # If the consumer went away (generator torn down) before the fetch
        # finished, don't leave the request running in the background.
        tasks = [t for t in (fetch_task, aqi_task, cloud_task) if t is not None]
        for task in tasks:
            if not task.done():
                task.cancel()
        # Then collect every outcome, because a side task that failed while
        # the weather fetch was still running is otherwise never awaited, and
        # asyncio logs an unretrieved exception at ERROR with its traceback.
        # That traceback chains the upstream `HTTPStatusError`, whose text is
        # the request URL, and a keyed request carries the caller's key in it.
        await asyncio.gather(*tasks, return_exceptions=True)
    yield Done(Fetched(wx_list, aqi_list, cloud_list))


def _rank_and_cut(
    destinations: list[dict], fetched: Fetched, request: AnalyzeRequest
) -> Ranked:
    """Assemble the rows, apply the forecast bounds, rank, and cut to `limit`.

    The bounds run before the cut, so `limit` cuts a field that already
    matches.
    """
    results, times = _assemble(
        destinations,
        fetched.wx,
        fetched.aqi,
        DestinationType.custom.value,
        include_series=request.include_series,
        cloud_list=fetched.cloud,
    )
    results = _filter_constraints(results, request)
    total_matched = len(results)
    results.sort(key=_sort_key(request.sort_by.value, request.sort_desc))
    return Ranked(results[: request.limit], times, total_matched)


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
            row.series.cloud_deck_ft = _aligned_cloud(times, cloud.get("series"))


# The three aggregate fields a cloud answer carries, in the order the result
# model declares them.
_CLOUD_FIELDS = (
    "cloud_deck_min_ft",
    "cloud_deck_avg_ft",
    "cloud_deck_max_ft",
)


async def _attach_late(
    ranked: Ranked,
    window: Window,
    request: AnalyzeRequest,
    api_key: str | None,
    eager: Eager,
) -> Failure | None:
    """The second fetches `eager` left for the returned rows alone.

    Air quality is best-effort and its service absorbs every failure except a
    refused key, so that is the one error caught here. The cloud fields were
    asked for by name, so any failure there fails the analysis like the
    weather does.
    """
    if not eager.aqi:
        try:
            await _attach_aqi(ranked.results, ranked.times, window.start, window.end, api_key)
        except InvalidApiKeyError as e:
            # Reachable when the weather half answered entirely from cache, so
            # the first upstream call the key made was the air-quality one.
            return _upstream_failure(e)
    if request.include_clouds and not eager.cloud:
        try:
            await _attach_cloud(
                ranked.results,
                ranked.times,
                window.start,
                window.end,
                request,
                api_key,
                window.source,
                window.boundary,
            )
        except Exception as e:
            return _upstream_failure(e)
    return None


def _result(ranked: Ranked, capped: Capped, request: AnalyzeRequest) -> Result:
    """The terminal success, and its one log line."""
    sort_field = request.sort_by.value
    total_queried = len(capped.destinations)

    def _fmt(r: DestinationResult) -> str:
        v = getattr(r, sort_field)
        return f"{v:.3f}" if v is not None else "—"

    results = ranked.results
    log.info(
        "Returning %d result(s) sorted by %s %s (best: %s, worst: %s)%s",
        len(results),
        sort_field,
        "desc" if request.sort_desc else "asc",
        _fmt(results[0]) if results else "—",
        _fmt(results[-1]) if results else "—",
        f" ({ranked.total_matched} of {total_queried} matched)"
        if ranked.total_matched != total_queried
        else "",
    )
    return Result(
        AnalyzeResponse(
            results=results,
            total_queried=total_queried,
            total_matched=ranked.total_matched,
            times=ranked.times,
            total_found=capped.total_found,
            truncated=capped.truncated,
        )
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
