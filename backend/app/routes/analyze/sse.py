"""The analysis as Server-Sent Events: one `data:` line per event, and a
keepalive through silences.

Only `POST /api/analyze/stream` reads this module. It is apart from the route
so the rendering of each event, which is contract for every stream consumer,
reads as one unit, and so `test_error_codes.py` can check every `error` event
built here carries its code.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from app.error_codes import ErrorCode, error_object
from app.routes.analyze.events import (
    AnalyzeEvent,
    Failure,
    Progress,
    Refusal,
    Status,
)


def _sse(event_type: str, **kwargs) -> str:
    return f"data: {json.dumps({'type': event_type, **kwargs})}\n\n"


def _sse_error(message: str, code: ErrorCode, **kwargs) -> str:
    """A terminal `error` event.

    The stream has no status code to carry the failure, so the `error` member
    the JSON routes answer with rides here too, beside the `message` a plain
    consumer renders and whatever extra fields that failure already sent.
    """
    return _sse("error", message=message, error=error_object(code), **kwargs)


def _render_sse(event: AnalyzeEvent) -> str:
    """One analysis event as its `data:` line.

    An optional field is left out of the payload rather than sent as null: a
    consumer tests for the key, and a healthy status event has never carried a
    `detail` member.
    """
    if isinstance(event, Status):
        detail = {"detail": event.detail} if event.detail is not None else {}
        return _sse("status", message=event.message, **detail)
    if isinstance(event, Progress):
        counters = {
            k: v
            for k, v in (
                ("batches_done", event.batches_done),
                ("total_batches", event.total_batches),
                ("message", event.message),
            )
            if v is not None
        }
        return _sse(
            "progress",
            processed=event.processed,
            total=event.total,
            percent=event.percent,
            **counters,
        )
    if isinstance(event, Failure):
        # The status code has nowhere to go on a stream that is already 200.
        return _sse_error(event.error.detail, event.error.code, **(event.extra or {}))
    if isinstance(event, Refusal):
        # The same structured remedy fields the HTTP 400 carries — the `error`
        # member among them — message first so a plain consumer can render it.
        body = dict(event.body)
        return _sse("error", message=body.pop("detail"), **body)
    # Result, the last member of the union.
    return _sse("result", data=event.response.model_dump())


# Cloudflare closes proxied connections idle for ~100 seconds, and a paced
# analysis can legitimately go quiet for most of a minute while the weighted
# budget refills. Emitted often enough to keep a healthy margin.
KEEPALIVE_INTERVAL_S = 25.0


async def _with_keepalive(source, interval_s: float = KEEPALIVE_INTERVAL_S) -> AsyncIterator[str]:
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
