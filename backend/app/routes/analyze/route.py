import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing

from fastapi import APIRouter, Depends, Request, Security
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import APIKeyHeader

from app import body_limit, ratelimit
from app.error_codes import INTERNAL_DETAIL, ApiError, ErrorCode
from app.models import (
    AnalysisRefusal,
    AnalyzeRequest,
    AnalyzeResponse,
    ErrorResponse,
    bbox_area_km2,
)
from app.routes.analyze.events import (
    AnalyzeEvent,
    Done,
    Failure,
    Refusal,
    Result,
)
from app.routes.analyze.phases import (
    Capped,
    Fetched,
    _apply_cap,
    _attach_late,
    _check_pacing,
    _check_window,
    _eager_fetches,
    _fetch_forecasts,
    _find_candidates,
    _rank_and_cut,
    _result,
)
from app.routes.analyze.sse import _render_sse, _sse_error, _with_keepalive
from app.services.ranking import (
    _LOWER_BOUNDS,
    _UPPER_BOUNDS,
    _noun,
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
# cut, AQI. `_run_analysis` holds that sequence once, one call per phase in
# `phases.py`, and yields what happens; each route renders the events it can
# show and drops the rest.
#
# A generator rather than a coroutine because the SSE route needs the events
# that arrive mid-flight. A coroutine could only hand back the last one.


async def _run_analysis(
    request: AnalyzeRequest, api_key: str | None, http_request: Request
) -> AsyncGenerator[AnalyzeEvent]:
    """Run one analysis, reporting what happens as it happens.

    Ends with exactly one terminal event — `Failure`, `Refusal` or `Result` —
    and returns. A caller iterates to exhaustion rather than abandoning the
    generator on the terminal event, so the `finally` blocks that cancel
    in-flight upstream tasks run promptly instead of at collection.

    It only orders the phases in `phases.py` and stops at the first terminal
    one. Each generator phase is read inside `aclosing`, which is what carries
    that promptness down a level: a consumer that goes away closes this
    generator, and `aclosing` closes the phase, whose `finally` cancels its
    tasks, before this one finishes closing.
    """
    window = _check_window(request)
    if isinstance(window, Failure):
        yield window
        return

    # A union (polygon + custom list) is a mixed set, so its messages say
    # "destinations" rather than any one type's noun.
    noun = _noun(request.destination_types, has_custom=bool(request.custom_destinations))

    # One discovery per client address at a time, shared with
    # `POST /api/destinations`, because every discovery spends the same
    # pod-wide Overpass slots (#627). The slot covers discovery and the
    # caller's own list, which is resolved against Overpass too, and nothing
    # after: the forecasts a keyed caller asks for spend its own quota, so
    # holding the slot through them would serialize one address's analyses
    # for no pod-wide saving (record 0103).
    found: list[dict] | None = None
    async with ratelimit.discovery_in_flight(http_request) as turned_away:
        if turned_away is not None:
            yield Failure(turned_away)
            return
        async with aclosing(_find_candidates(request)) as discovery:
            async for event in discovery:
                if isinstance(event, Done):
                    found = event.value
                else:
                    yield event
    if found is None:
        return

    capped = _apply_cap(found, request, noun)
    if not isinstance(capped, Capped):
        yield capped
        return

    eager = _eager_fetches(request)
    refused = _check_pacing(capped.destinations, window, api_key, noun, eager)
    if refused is not None:
        yield refused
        return
    fetched: Fetched | None = None
    async with aclosing(
        _fetch_forecasts(capped.destinations, window, request, api_key, noun, eager)
    ) as retrieval:
        async for step in retrieval:
            if isinstance(step, Done):
                fetched = step.value
            else:
                yield step
    if fetched is None:
        return

    ranked = _rank_and_cut(capped.destinations, fetched, request)
    failure = await _attach_late(ranked, window, request, api_key, eager)
    if failure is not None:
        yield failure
        return
    yield _result(ranked, capped, request)


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
        "analysis succeeded. Five event "
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
    # No 401: Open-Meteo tests the key only once the stream is open, so a
    # refused key arrives as an `error` event on the 200.
    responses={
        413: body_limit.TOO_LARGE_RESPONSE,
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
                            'data: {"type": "status", "message": "Searching for destinations…"}\n\n'
                            'data: {"type": "status", "message": "Searching for destinations…", '
                            '"detail": "Trying backup map server 2 of 3…"}\n\n'
                            'data: {"type": "progress", "processed": 50, "total": 120, "percent": 42}\n\n'
                            'data: {"type": "result", "data": {"results": [], "total_queried": 0, '
                            '"total_matched": 0}}\n\n'
                        ),
                    }
                }
            },
        }
    },
)
async def analyze_stream(
    request: AnalyzeRequest,
    http_request: Request,
    api_key: str | None = Security(open_meteo_key),
) -> StreamingResponse:
    async def generate() -> AsyncIterator[str]:
        log.info("Analyze request (stream): %s", _summarize_request(request))
        try:
            async with aclosing(_run_analysis(request, api_key, http_request)) as events:
                async for event in events:
                    yield _render_sse(event)
        except Exception:
            log.exception("Unexpected error in analyze_stream")
            yield _sse_error(INTERNAL_DETAIL, ErrorCode.internal)

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
        413: body_limit.TOO_LARGE_RESPONSE,
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
                "the window ends before it starts, the request sends neither "
                "`destination_types` nor `custom_destinations`, "
                "`destination_types` is non-empty with no `polygon`, a regional "
                "`forecast_model` has no coverage for the area, the "
                "candidate count exceeds the cap, the candidates times the "
                "window's hours pass `max_destination_hours`, or, for a request "
                "without an Open-Meteo key, the candidates over this window cost "
                "more than the deployment can pace. Over-cap refusals carry the "
                "structured remedy fields (`found`, `limit`, and a computed "
                "elevation-floor suggestion when one exists); send "
                "`top_by_elevation: true` to elect an explicit top-N analysis "
                "instead. A pacing refusal carries `found` and `limit`, the "
                "most destinations that window can take; a shorter window or "
                "fewer destinations clears either; a key clears only the pacing "
                "refusal."
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
    http_request: Request,
    api_key: str | None = Security(open_meteo_key),
) -> AnalyzeResponse | JSONResponse:
    log.info("Analyze request: %s", _summarize_request(request))

    terminal: AnalyzeEvent | None = None
    # Iterated to exhaustion rather than broken out of on the terminal event:
    # the generator's own `finally` blocks cancel in-flight upstream tasks, and
    # abandoning it would defer those to collection. Status and progress are
    # the stream's to show; a single response has nowhere to put them.
    async with aclosing(_run_analysis(request, api_key, http_request)) as events:
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
        detail=INTERNAL_DETAIL,
        code=ErrorCode.internal,
    )
