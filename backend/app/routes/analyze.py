import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import AnalyzeRequest, AnalyzeResponse, DestinationResult, DestinationType
from app.services import air_quality, osm, weather
from app.services.errors import UpstreamError


def _sort_key(sort_field: str):
    # AQI fields are nullable (short forecast horizon / best-effort fetch);
    # None sorts after every real value so it never wins a ranking.
    def key(r: DestinationResult):
        v = getattr(r, sort_field)
        return (v is None, 0 if v is None else v)

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


@router.post("/analyze/stream")
async def analyze_stream(request: AnalyzeRequest):
    async def generate():
        try:
            if request.start_datetime >= request.end_datetime:
                yield _sse("error", message="start_datetime must be before end_datetime")
                return

            noun = _noun(request.destination_type)

            if request.destination_type == DestinationType.custom:
                if not request.custom_destinations:
                    yield _sse("error", message="custom_destinations is required for custom type")
                    return
                destinations = [
                    {"name": d.name, "latitude": d.latitude, "longitude": d.longitude,
                     "elevation_ft": d.elevation_ft, "osm_id": None}
                    for d in request.custom_destinations
                ]
                yield _sse("status", message=f"Loaded {len(destinations)} custom {noun}(s) — fetching forecasts…")
            else:
                if not request.polygon:
                    yield _sse("error", message="polygon is required for non-custom destination types")
                    return
                yield _sse("status", message=f"Searching OpenStreetMap for {noun}s in your area…")
                cap = min(request.limit * 5, 200)

                # Overpass is one opaque request per mirror, so the only progress
                # signal is mirror failover. Run it on a task and surface those
                # status lines promptly via the queue.
                osm_queue: asyncio.Queue = asyncio.Queue()

                async def on_status(message):
                    await osm_queue.put(_sse("status", message=message))

                async def run_osm():
                    try:
                        return await osm.query_osm(
                            request.polygon, request.destination_type, cap, on_status
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

                if not destinations:
                    yield _sse("result", data=AnalyzeResponse(results=[], total_queried=0).model_dump())
                    return

                n = len(destinations)
                plural = f"{n} {noun}{'s' if n != 1 else ''}"
                yield _sse("status", message=f"Found {plural} — fetching weather forecasts…")

            total_queried = len(destinations)

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
                        message=f"Retrieving forecasts — {processed} of {total} {noun}s…",
                    )
                )

            async def run_fetch():
                try:
                    return await weather.fetch_weather_batch(
                        destinations,
                        request.start_datetime,
                        request.end_datetime,
                        on_progress,
                    )
                finally:
                    await progress_queue.put(_STREAM_DONE)

            # Air quality rides alongside the weather fetch; it never raises
            # (failures degrade to None entries), so awaiting it is safe.
            aqi_task = asyncio.create_task(
                air_quality.fetch_aqi_batch(
                    destinations, request.start_datetime, request.end_datetime
                )
            )
            fetch_task = asyncio.create_task(run_fetch())
            try:
                async for event in _drain(progress_queue):
                    yield event

                wx_list = await fetch_task
                aqi_list = await aqi_task
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
                    if not task.done():
                        task.cancel()

            results: list[DestinationResult] = []
            for dest, wx, aqi in zip(destinations, wx_list, aqi_list):
                if wx is None:
                    continue
                results.append(DestinationResult(
                    name=dest["name"], type=request.destination_type.value,
                    latitude=dest["latitude"], longitude=dest["longitude"],
                    elevation_ft=dest.get("elevation_ft"), osm_id=dest.get("osm_id"),
                    **wx, **(aqi or {}),
                ))

            sort_field = request.sort_by.value
            results.sort(key=_sort_key(sort_field))
            results = results[: request.limit]

            yield _sse("result", data=AnalyzeResponse(results=results, total_queried=total_queried).model_dump())

        except Exception as e:
            log.exception("Unexpected error in analyze_stream")
            yield _sse("error", message=f"Unexpected error: {e}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    log.info(
        "Analyze request: type=%s window=%s→%s limit=%d",
        request.destination_type.value,
        request.start_datetime.strftime("%Y-%m-%dT%H:%M"),
        request.end_datetime.strftime("%Y-%m-%dT%H:%M"),
        request.limit,
    )

    if request.start_datetime >= request.end_datetime:
        raise HTTPException(
            status_code=400, detail="start_datetime must be before end_datetime"
        )

    # Resolve destinations
    if request.destination_type == DestinationType.custom:
        if not request.custom_destinations:
            raise HTTPException(
                status_code=400,
                detail="custom_destinations is required when destination_type is 'custom'",
            )
        destinations = [
            {
                "name": d.name,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "elevation_ft": d.elevation_ft,
                "osm_id": None,
            }
            for d in request.custom_destinations
        ]
    else:
        if not request.polygon:
            raise HTTPException(
                status_code=400,
                detail="polygon is required for non-custom destination types",
            )
        cap = min(request.limit * 5, 200)
        try:
            destinations = await osm.query_osm(
                request.polygon, request.destination_type, cap
            )
        except NotImplementedError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except UpstreamError as e:
            raise HTTPException(status_code=502, detail=e.message)
        except Exception as e:
            raise HTTPException(
                status_code=502, detail=f"OSM query failed: {e}"
            )

    if not destinations:
        log.info("No destinations found for the given polygon/type")
        return AnalyzeResponse(results=[], total_queried=0)

    total_queried = len(destinations)
    log.info("Fetching weather for %d destination(s)", total_queried)

    aqi_task = asyncio.create_task(
        air_quality.fetch_aqi_batch(
            destinations, request.start_datetime, request.end_datetime
        )
    )
    try:
        wx_list = await weather.fetch_weather_batch(
            destinations, request.start_datetime, request.end_datetime
        )
    except UpstreamError as e:
        aqi_task.cancel()
        raise HTTPException(status_code=502, detail=e.message)
    except Exception as e:
        aqi_task.cancel()
        raise HTTPException(
            status_code=502, detail=f"Weather API request failed: {e}"
        )
    aqi_list = await aqi_task

    results: list[DestinationResult] = []
    for dest, wx, aqi in zip(destinations, wx_list, aqi_list):
        if wx is None:
            continue
        results.append(
            DestinationResult(
                name=dest["name"],
                type=request.destination_type.value,
                latitude=dest["latitude"],
                longitude=dest["longitude"],
                elevation_ft=dest.get("elevation_ft"),
                osm_id=dest.get("osm_id"),
                **wx,
                **(aqi or {}),
            )
        )

    sort_field = request.sort_by.value
    results.sort(key=_sort_key(sort_field))
    results = results[: request.limit]

    def _fmt(r: DestinationResult) -> str:
        v = getattr(r, sort_field)
        return f"{v:.3f}" if v is not None else "—"

    log.info(
        "Returning %d result(s) sorted by %s (best: %s, worst: %s)",
        len(results),
        sort_field,
        _fmt(results[0]) if results else "—",
        _fmt(results[-1]) if results else "—",
    )
    return AnalyzeResponse(results=results, total_queried=total_queried)
