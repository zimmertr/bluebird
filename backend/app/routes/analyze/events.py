"""What one analysis says as it runs, and the queue that relays it.

`_run_analysis` yields these events and both analyze routes read them: the SSE
route renders each one, and the JSON route answers the terminal one. They live
apart from both so a reader of either presenter, or of the analysis, finds the
vocabulary in one place. `_drain` is here rather than beside the stream
because the analysis itself uses it, to interleave progress with an upstream
call it runs on a task.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from app.error_codes import ApiError
from app.models import AnalyzeResponse


@dataclass(slots=True)
class Status:
    """A phase heading, with an optional line of mid-phase news under it."""

    message: str
    detail: str | None = None


@dataclass(slots=True)
class Progress:
    """Counters for the retrieval phase."""

    processed: int
    total: int
    percent: int
    batches_done: int | None = None
    total_batches: int | None = None
    message: str | None = None


@dataclass(slots=True)
class Failure:
    """A terminal failure, carried rather than raised.

    The `ApiError` holds everything a JSON caller gets — status, sentence,
    code, `Retry-After` — and the stream reads the two members an event can
    carry off the same object. `extra` is for whatever one failure sends
    beyond that: an upstream rate limit names its scope and its resume
    estimate, which a response puts in a header and an event cannot.
    """

    error: ApiError
    extra: dict | None = None


@dataclass(slots=True)
class Refusal:
    """The over-cap 400, whose body is `AnalysisRefusal` rather than a plain
    error: it carries remedy fields, so it is rendered from the model rather
    than rebuilt member by member on either side."""

    body: dict


@dataclass(slots=True)
class Result:
    """The terminal success."""

    response: AnalyzeResponse


AnalyzeEvent = Status | Progress | Failure | Refusal | Result


@dataclass(slots=True)
class Done[T]:
    """A phase's value, handed back through the event stream.

    A phase that relays events while it waits is an async generator, and a
    generator cannot return a value to the loop that reads it. So it yields
    its value last, wrapped in this. `_run_analysis` takes it off the stream,
    and no route ever sees one: it is not an `AnalyzeEvent`.
    """

    value: T


# Sentinel pushed onto a progress queue once the backing task has finished.
_STREAM_DONE = object()


async def _drain(queue: asyncio.Queue) -> AsyncIterator[Any]:
    """Yield items from `queue` until the done sentinel.

    Lets the analysis interleave progress with a coroutine it runs on a
    separate task: the task pushes items as work happens, then pushes
    `_STREAM_DONE` in its `finally` to end the drain.
    """
    while True:
        item = await queue.get()
        if item is _STREAM_DONE:
            return
        yield item
