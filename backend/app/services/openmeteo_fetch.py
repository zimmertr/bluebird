"""The pipeline both Open-Meteo services run.

Weather and air quality ask one provider the same shape of question: a list of
locations and a window, answered in batches. Everything between the caller's
list and the rows it gets back used to be written twice, line for line — the
cache-miss scan, the chunking, the per-analysis fairness gate, the weighted
pacer, the pod's in-flight slot, the timed request and its telemetry, the
classification of what came back, and the write-back. It lives here once, so a
pacing or caching change lands in one place instead of drifting between two.

What the two services do NOT share is what to do when a batch fails, and that
rides as a REQUIRED ``on_error`` argument rather than a default, because getting
it wrong is silent: weather raises and fails the analysis, while air quality is
best-effort and degrades to null rows. Spend is the reason the difference
matters — a degrading service that kept fetching after a 429 would burn the rest
of the minute's budget to learn the same thing, which is what the 2026-07-29
incident's "zombie" AQI batches did (issue #180).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Literal, NamedTuple

import httpx

from app import ratelimit, telemetry
from app.services import cache
from app.services.errors import (
    InvalidApiKeyError,
    UpstreamError,
    UpstreamRateLimited,
    classify_http_error,
    is_invalid_api_key,
    parse_rate_limit,
    rate_limit_message,
)

log = logging.getLogger(__name__)

# Measured 2026-07-31 (issue #182), not guessed. Upstream accepts far more than
# 50 per request, but raising this buys nothing and costs headroom:
#   - Weight is per LOCATION, so the pacer caps locations/min identically at any
#     batch size. A 1,500-destination analysis is budget-bound at ~3 min either
#     way; only the request count changes.
#   - Open-Meteo's nginx returns 414 above an 8,192-byte request URI. At 29
#     bytes per location (7-decimal coordinates, the precision OSM hands back)
#     250 locations already spends 7,485 of it, and `custom_destinations`
#     coordinates are never rounded, so a caller's float repr can spend more.
#   - A failed batch loses everything in it, and a big one has no sibling to
#     hide its tail latency behind.
# Re-measure if the URI cap moves or the pacer stops being the binding
# constraint; switching these calls to POST would lift the 414 ceiling.
BATCH_SIZE = 50
# In-flight fairness cap per analysis, so one giant polygon doesn't hog every
# slot. Rate protection is NOT this number's job: the WeightedBudget passed in
# as `Pacing.budget` paces the pod's spend in weighted calls per minute, the
# unit Open-Meteo actually meters (see services.openmeteo_weight).
MAX_CONCURRENT_BATCHES = 4
# The pace narration exists so a long wait does not read as a hang. Under a few
# seconds there is no hang to explain, so the callback stays quiet.
_PACE_NARRATE_S = 3

# Called as each batch completes: (processed_destinations, total_destinations,
# batches_done, total_batches). Lets the SSE route emit incremental progress.
ProgressCallback = Callable[[int, int, int, int], Awaitable[None]]

# Called when the weighted budget is about to pace us (estimated seconds).
# Lets the SSE route narrate the wait instead of appearing hung.
PaceCallback = Callable[[int], Awaitable[None]]

# What a failed batch does. Never defaulted: the two services differ here, and a
# service that inherited the wrong one would either fail an analysis it could
# have served or spend a quota it was supposed to protect.
ErrorPolicy = Literal["raise", "degrade"]

# What a degrading request returns in place of a body. A sentinel rather than
# None, because the caller expands a failure into one null row per location and
# must not confuse "the provider failed" with "the provider answered nothing".
DEGRADED: Any = object()

# A caller's own reading of a refusal this module cannot make for it, called
# with the error and the quota label it would be counted under. It either raises
# its own exception or returns, leaving the generic handling below to run.
StatusErrorHook = Callable[[httpx.HTTPStatusError, str], None]

# What stands in for a caller's key wherever text could persist. The pod
# forwards a paid credential and must forget it, so a log line is the one
# place it could survive the request.
_REDACTED = "[redacted]"


def redacted_params(params: dict[str, Any]) -> dict[str, Any]:
    """`params` with any caller API key replaced, for logging.

    Every request below logs its full params at TRACE, which is exactly where a
    forwarded key would come to rest. Nothing logs `params` directly.
    """
    if "apikey" not in params:
        return params
    return {**params, "apikey": _REDACTED}


def redacted_error(exc: Exception, api_key: str | None) -> str:
    """An upstream exception's text with the caller's key removed.

    `raise_for_status` builds its message out of the request URL, and a keyed
    request carries the key in that URL's query string, so interpolating the
    exception straight into a log line would persist the credential that
    `redacted_params` was careful not to.
    """
    text = str(exc)
    return text.replace(api_key, _REDACTED) if api_key else text


def quota_label(api_key: str | None) -> str:
    """Whose Open-Meteo quota a batch spends: the caller's key, or this pod's.

    A metric label, so it names the owner and never the key.
    """
    return "caller" if api_key else "pod"


class Pacing(NamedTuple):
    """How a batch spends the pod's own Open-Meteo quota.

    Passing `None` in place of one is how a keyed request says it spends a
    CALLER's quota instead (issue #317): the pacer meters this pod's free tier,
    which a keyed batch never touches, so pacing one would queue a caller behind
    spend it does not share. The in-flight slot still applies either way,
    because that guards the pod's own concurrency rather than anybody's quota.
    """

    budget: ratelimit.WeightedBudget
    # One weight per upstream request the chunk will make, each priced on that
    # request's own hours: a window spanning two endpoints is two requests and
    # spends twice, and pricing it once would bill both halves at one half's
    # length.
    weights: Callable[[list[dict[str, Any]]], Sequence[float]]
    on_pace: PaceCallback | None = None


async def fetch_batched(
    destinations: list[dict[str, Any]],
    *,
    label: str,
    cache_key: Callable[[dict[str, Any]], tuple],
    fetch_chunk: Callable[
        [list[dict[str, Any]]], Awaitable[list[dict[str, Any] | None]]
    ],
    slots: ratelimit.UpstreamBudget,
    pacing: Pacing | None,
    on_error: ErrorPolicy,
    on_progress: ProgressCallback | None = None,
    on_degraded: Callable[[str], None] | None = None,
) -> list[dict[str, Any] | None]:
    """Cached, chunked, paced fan-out over `destinations`, in input order.

    `fetch_chunk` is the only part a service writes itself: one batch of
    locations in, one row (or None) per location out. `label` names the fetch in
    this module's log lines. `on_degraded` is how a degrading service counts
    what it lost; under `on_error="raise"` it is never called.
    """
    if not destinations:
        return []

    # Serve repeats from the per-location cache first, then fetch only the
    # misses. A repeat Analyze on the same polygon and window costs zero
    # upstream calls; a partially-overlapping polygon pays only for what
    # actually changed. Each key is built once and kept for the write-back, so
    # the two halves cannot describe different entries.
    total = len(destinations)
    results: list[dict[str, Any] | None] = [None] * total
    miss_indices: list[int] = []
    miss_keys: list[tuple] = []
    for i, dest in enumerate(destinations):
        key = cache_key(dest)
        hit = cache.FORECAST_CACHE.get(key)
        if hit is None:
            miss_indices.append(i)
            miss_keys.append(key)
        else:
            results[i] = None if hit == cache.NO_DATA else hit

    misses = [destinations[i] for i in miss_indices]
    chunks = [misses[i : i + BATCH_SIZE] for i in range(0, len(misses), BATCH_SIZE)]
    total_batches = len(chunks)
    cached_count = total - len(misses)

    log.info(
        "Fetching %s: %d destination(s), %d cached, %d across %d batch(es)",
        label,
        total,
        cached_count,
        len(misses),
        total_batches,
    )

    processed = cached_count
    if on_progress is not None and cached_count:
        await on_progress(processed, total, 0, total_batches)
    if not misses:
        return results

    # Set by the first 429 a degrading service sees. Every batch after it would
    # spend budget (and the shared minute window) to learn the same thing.
    rate_limited = asyncio.Event()
    sem = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)

    async def run(
        index: int, chunk: list[dict[str, Any]]
    ) -> tuple[int, list[dict[str, Any] | None]]:
        # Per-analysis fairness slot first, then the pod's weighted spend, then
        # a pod-wide in-flight slot. The weight acquire happens BEFORE the
        # in-flight slot so a pace sleep never holds a slot another analysis
        # could be using.
        async with sem:
            if rate_limited.is_set():
                return index, [None] * len(chunk)
            try:
                if pacing is not None:
                    for weight in pacing.weights(chunk):
                        if pacing.on_pace is not None:
                            estimate = pacing.budget.wait_estimate_s(weight)
                            if estimate > _PACE_NARRATE_S:
                                await pacing.on_pace(int(estimate) + 1)
                        await pacing.budget.acquire(weight)
                async with slots.slot():
                    return index, await fetch_chunk(chunk)
            except ratelimit.BudgetExhausted:
                # Wedged, not merely busy. Raising fails the analysis with a
                # 503; degrading loses this batch and keeps the rest.
                if on_error == "raise":
                    raise
                if on_degraded is not None:
                    on_degraded("budget")
                log.warning("%s budget exhausted; degrading this batch", label)
                return index, [None] * len(chunk)
            except UpstreamRateLimited as exc:
                if on_error == "raise":
                    raise
                if on_degraded is not None:
                    on_degraded("rate_limited")
                log.warning(
                    "%s rate limited (%s); skipping the remaining batches",
                    label,
                    exc.scope or "unknown",
                )
                rate_limited.set()
                return index, [None] * len(chunk)

    # Each batch's results land at its own index, so input order survives, while
    # progress is still reported in completion order via as_completed.
    chunk_results_by_index: list[list[dict[str, Any] | None]] = [[] for _ in chunks]
    batches_done = 0
    tasks = [asyncio.create_task(run(i, chunk)) for i, chunk in enumerate(chunks)]

    try:
        for future in asyncio.as_completed(tasks):
            index, chunk_results = await future
            chunk_results_by_index[index] = chunk_results
            processed += len(chunk_results)
            batches_done += 1
            if on_progress is not None:
                await on_progress(processed, total, batches_done, total_batches)
    except BaseException:
        # A batch failed (or the client disconnected) — don't leak the siblings.
        for task in tasks:
            task.cancel()
        raise

    fetched = [item for sublist in chunk_results_by_index for item in sublist]
    # A rate-limited run produced None rows that mean "unknown", not "no data
    # for this window" — caching those would freeze the outage into the TTL.
    # Only real answers are cached, and a real empty window is cached as
    # NO_DATA.
    if not rate_limited.is_set():
        for key, result in zip(miss_keys, fetched, strict=False):
            cache.FORECAST_CACHE.put(key, cache.NO_DATA if result is None else result)
    for i, result in zip(miss_indices, fetched, strict=False):
        results[i] = result
    return results


async def request_openmeteo(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, Any],
    *,
    service: str,
    provider: str,
    api_key: str | None,
    on_error: ErrorPolicy,
    on_status_error: StatusErrorHook | None = None,
) -> Any:
    """One batched request: timed, counted, and classified.

    Returns the decoded body, or `DEGRADED` when the policy is to degrade and
    the provider failed. Two failures are raised under BOTH policies, because
    neither is this request's to absorb: a refused key (the caller's credential,
    and the same one rides every batch) and a 429 (the caller decides whether to
    resume or to stop spending). A caller with a third — weather reads the 400
    that means its model misses the batch — passes `on_status_error` and raises
    its own.

    `service` is the telemetry label, `provider` the name a user-facing message
    carries — they differ, and both are the caller's to choose. The client is
    passed in rather than reached for, so the pooled connections stay the
    caller's to own (see services.http).
    """
    quota = quota_label(api_key)
    log.trace("%s request params: %s", provider, redacted_params(params))  # type: ignore[attr-defined]
    # One duration observation per HTTP attempt, failures included, so the
    # histogram and the outcome counter tally the same events.
    attempt_start = time.perf_counter()
    try:
        try:
            resp = await client.get(url, params=params)
        finally:
            telemetry.OPENMETEO_DURATION.labels(service=service, quota=quota).observe(
                time.perf_counter() - attempt_start
            )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if is_invalid_api_key(exc):
            # The caller's credential, not our outage: raised so the route can
            # answer 401 instead of a 502 no retry would fix.
            telemetry.OPENMETEO_REQUESTS.labels(
                service=service, outcome="invalid_key", quota=quota
            ).inc()
            log.warning("%s rejected the supplied API key", provider)
            raise InvalidApiKeyError() from exc
        if on_status_error is not None:
            on_status_error(exc, quota)
        if exc.response.status_code == 429:
            scope, retry_after = parse_rate_limit(exc)
            telemetry.OPENMETEO_REQUESTS.labels(
                service=service, outcome="rate_limited", quota=quota
            ).inc()
            telemetry.OPENMETEO_RATE_LIMITED.labels(
                service=service, scope=scope or "unknown", quota=quota
            ).inc()
            log.warning(
                "%s rate limited (%s): %s",
                provider,
                scope or "unknown",
                redacted_error(exc, api_key),
            )
            raise UpstreamRateLimited(
                provider, scope, retry_after, rate_limit_message(provider, scope)
            ) from exc
        telemetry.OPENMETEO_REQUESTS.labels(
            service=service, outcome="http_error", quota=quota
        ).inc()
        log.warning("%s request failed: %s", provider, redacted_error(exc, api_key))
        if on_error == "degrade":
            return DEGRADED
        raise UpstreamError(classify_http_error(exc, provider)) from exc
    except httpx.HTTPError as exc:
        telemetry.OPENMETEO_REQUESTS.labels(
            service=service, outcome="network_error", quota=quota
        ).inc()
        log.warning("%s request failed: %s", provider, redacted_error(exc, api_key))
        if on_error == "degrade":
            return DEGRADED
        raise UpstreamError(classify_http_error(exc, provider)) from exc

    telemetry.OPENMETEO_REQUESTS.labels(
        service=service, outcome="success", quota=quota
    ).inc()
    return resp.json()
