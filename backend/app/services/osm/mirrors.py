"""Discovery against Overpass, and the public mirrors every Overpass request is sent to.

Apart from the query text because this half is the network: the mirror table,
its per-mirror budgets and timeouts, and the two ways of asking it, a chain
that fails over from one mirror to the next and a race inside one deadline.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

from app import ratelimit, telemetry
from app.models import DestinationType, GeoPolygon
from app.services import cache
from app.services.errors import PartialResultError, UpstreamError, classify_http_error, log_reason
from app.services.http import HEADERS
from app.services.osm import rules
from app.services.osm.query import (
    SERVER_TIMEOUT_TOKEN,
    _build_query,
    _classify,
    _ele_ft,
    _polygon_to_overpass,
    check_implemented,
)

# The service's one logger name, kept across the split so a log query written
# against it still matches every line.
log = logging.getLogger("app.services.osm")

# The name every Overpass message leads with. "OpenStreetMap (Overpass)"
# until 2026-10-21, when the maintainer dropped the parenthetical because
# "OpenStreetMap (Overpass) took too long. Try again later." was 324px in the
# panel notice's 281px (12px, Mac) and every other line it headed wrapped
# too; "OpenStreetMap took too long. Try again later." is 258px (record 0206).
# The metrics keep their own per-mirror labels below, so nothing reads this.
PROVIDER = "OpenStreetMap"

# Called with a user-facing detail line when the chain falls over to a backup
# mirror. Overpass is a single opaque request per mirror, so failover is the
# only progress signal available for the search phase.
StatusCallback = Callable[[str], Awaitable[None]]

# Which question a chain is asking, as the Overpass metrics label it.
OverpassPath = Literal["discovery", "enrichment", "update"]


@dataclass(frozen=True)
class OverpassMirror:
    """One public Overpass endpoint and the per-mirror beliefs that go with it.

    Order, timeout, and concurrency cap live together on purpose: issue #177
    traced a 30s-per-analysis tax to these beliefs drifting apart from the
    endpoint list they described.
    """

    url: str
    # The whole of one attempt, from connect to the last byte of the answer,
    # unless the caller passes a shorter `attempt_timeout_s` to the chain,
    # and also the `[timeout:N]` the query carries on this mirror, so the
    # server stops working on a query the pod has stopped waiting for. A longer
    # server timeout held one of the address's two slots busy for up to 35s
    # after the pod gave up (#545). A total rather than httpx's own timeout,
    # which is per operation and restarts its read timer on every chunk, so a
    # mirror that trickled its answer held a pod-wide slot without limit (#630).
    timeout_s: float
    # Pod-wide cap on in-flight calls to THIS mirror. Limits are per operator,
    # not per provider: overpass-api.de documents ~2 slots per IP, and the
    # other mirrors are separate operators with separate capacity.
    budget: ratelimit.UpstreamBudget


# Measured 2026-09-30 (issue #545): production telemetry over 30 days, plus
# live probes at 17:00 UTC. Re-measure before reordering or retuning; the
# bluebird_forecast_overpass_* families (#77) are where the next numbers come from.
#
#   overpass-api.de  62 tries, 40 ok: 38% <2.5s, 48% <5s, 75% <10s, 93% <15s;
#                    22 x 504 "too busy", each after 8-16s
#   maps.mail.ru     11 tries, 7 ok, most <15s (one 25-45s); 2 x 45s timeout, 2 x 504
#
# Both get 25s: past it the primary has either answered or said it is busy, and
# the fallback's one slow success is not worth another 20s on every chain that
# reaches it. overpass.kumi.systems is gone: 0 of 8 in 30 days, and a live probe
# was accepted and sent no bytes in 60s, so it only ever added 45s to a chain
# that was going to fail anyway. The sum of the timeouts is the worst case an
# analysis can wait on this table, 50s where it was 115s.
OVERPASS_MIRRORS = [
    OverpassMirror(
        url="https://overpass-api.de/api/interpreter",
        timeout_s=25.0,
        budget=ratelimit.UpstreamBudget(
            "OpenStreetMap (overpass-api.de)", ratelimit.UPSTREAM_CONCURRENCY_OVERPASS
        ),
    ),
    OverpassMirror(
        url="https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        timeout_s=25.0,
        budget=ratelimit.UpstreamBudget(
            "OpenStreetMap (maps.mail.ru)", ratelimit.UPSTREAM_CONCURRENCY_OVERPASS
        ),
    ),
]

# How long a mirror that just failed goes to the back of the chain. The
# primary's busy spells on 2026-09-30 came in bursts over tens of minutes with
# successes in between, so a short cooldown routes the next analysis past a
# mirror that just failed without abandoning it: it is still tried, last, and
# its first success restores its place. A status ping cannot replace this, since
# overpass-api.de reported "2 slots available now" in the same minute its
# queries answered 504.
MIRROR_COOLDOWN_S = 120.0

# Last failure per mirror URL, on the monotonic clock. Per pod, so replicas
# learn separately; that costs at most one slow attempt each.
_last_failure: dict[str, float] = {}

# Read through the module rather than bound at call sites, so a test can move
# this clock without moving the event loop's.
_clock: Callable[[], float] = time.monotonic


def reset_mirror_health() -> None:
    """Forget every recorded failure, so each test starts from the table order."""
    _last_failure.clear()


def _cooling(mirror: OverpassMirror, now: float) -> bool:
    failed_at = _last_failure.get(mirror.url)
    return failed_at is not None and now - failed_at < MIRROR_COOLDOWN_S


def _attempt_order() -> list[OverpassMirror]:
    """The table with every mirror inside its cooldown moved to the back.

    Moved, never dropped: an analysis makes as many attempts as it did before
    this existed, and a healthy mirror is simply asked first.
    """
    now = _clock()
    return [m for m in OVERPASS_MIRRORS if not _cooling(m, now)] + [
        m for m in OVERPASS_MIRRORS if _cooling(m, now)
    ]


async def query_osm(
    polygon: GeoPolygon,
    destination_types: Sequence[DestinationType],
    on_status: StatusCallback | None = None,
    include_unnamed_peaks: bool = False,
    deadline: float | None = None,
) -> list[dict[str, Any]]:
    """Return every named destination of the given types inside the polygon.

    One Overpass request however many types are asked for, and every row comes
    back tagged with the type it actually is rather than the type that was
    requested.

    With a ``deadline`` (on the loop's clock) the mirrors are raced inside it
    rather than asked in turn (`_race`), and there is no failover for
    ``on_status`` to narrate.

    Deliberately uncapped: the ranking is only exact if every candidate gets a
    forecast, so the analysis-size ceiling lives in the route (loud refusal),
    not here (silent truncation).
    """
    # Order never changes the answer, so it must not change the cache key
    # either — a peaks+lakes analysis and a lakes+peaks one are one query.
    types = sorted(set(destination_types), key=lambda t: t.value)
    if not types:
        return []
    check_implemented(types)

    # Discovery is cached post-parse for ~10 minutes: the browser flow calls
    # /api/destinations and its server fallback re-runs the identical query
    # seconds later, and repeat Analyze clicks re-run it every minute. Only
    # complete results can land here — a partial (remark) response raises in
    # _post_with_fallback before this point. Hits are DEEP copies: a shallow
    # list copy would share the destination dicts, and the first caller to
    # mutate one in place would silently corrupt every response served from
    # this entry for the rest of its TTL.
    type_key = ",".join(t.value for t in types)
    # Part of the key, not a filter on the result: the two questions return
    # different sets, so they cannot share a cache entry.
    if include_unnamed_peaks:
        type_key += "+unnamed"
    cache_key = cache.discovery_key(polygon.coordinates[0], type_key)
    cached = cache.DISCOVERY_CACHE.get(cache_key)
    if cached is not None:
        log.info(
            "OSM discovery served from cache: %d destination(s) for types=%s",
            len(cached),
            type_key,
        )
        return copy.deepcopy(cached)

    poly_str = _polygon_to_overpass(polygon)
    query = _build_query(types, poly_str, include_unnamed_peaks)

    log.info("Querying OSM Overpass for types=%s", type_key)
    log.trace("Overpass query:\n%s", query)  # type: ignore[attr-defined]
    # Budgets are per mirror and acquired per attempt inside the failover
    # chain, so a failover releases mirror A before it queues on mirror B.
    if deadline is None:
        data = await _post_with_fallback(query, on_status, path="discovery")
    else:
        data = await _race(query, path="discovery", deadline=deadline)

    asked = {t.value for t in types}
    results: list[dict[str, Any]] = []
    order: list[tuple[Any, ...]] = []
    mergeable: list[bool] = []
    seen_generated: set[Any] = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        classified = _classify(element["type"], tags)
        # A feature the rules do not recognise is no destination, and one they
        # read as a kind nobody asked for is not this search's: a summit node
        # that also carries a crag's tags is a peak, and a crags-only ring
        # leaves it out, the same answer the places table gives (#760).
        if classified is None or classified[0] not in asked:
            continue
        kind, named = classified
        elevation_ft = _ele_ft(tags)
        if named:
            name = tags["name"]
        else:
            # An unnamed summit is named for the height it is drawn with, the
            # same way the map labels it and the same string the browser builds
            # for a clicked one (basemapPoi.ts), so a peak added both ways is
            # one destination rather than two spellings of it. Its OSM id is
            # its only identity: every unnamed 5,961 ft peak in a range shares
            # the name.
            if not include_unnamed_peaks or elevation_ft is None:
                continue
            if element["id"] in seen_generated:
                continue
            seen_generated.add(element["id"])
            name = f"Peak {round(elevation_ft)}"

        if element["type"] == "node":
            lat = element.get("lat")
            lon = element.get("lon")
        else:
            center = element.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")

        if lat is None or lon is None:
            continue

        results.append(
            {
                "name": name,
                # Carried per row rather than applied by the caller: a union
                # response holds several types at once, and this is what the
                # row's badge and its name's link are chosen from.
                "type": kind,
                "latitude": lat,
                "longitude": lon,
                "elevation_ft": elevation_ft,
                "osm_id": f"{element['type']}/{element['id']}",
            }
        )
        order.append((rules.preference(tags), rules.ELEMENT_ORDER[element["type"]], element["id"]))
        mergeable.append(named)
        log.trace("  OSM element: %s (%.4f, %.4f) ele=%s", name, lat, lon, elevation_ft)  # type: ignore[attr-defined]

    # Type, name and place are the identity rule for a mapped feature (#760):
    # OSM carries a summit twice, or a trailhead as a node beside the lot named
    # for it, and those are one destination; two places that only share a name
    # are two. A crag named for the peak it stands on stays a second row (#715),
    # since the type is part of the rule.
    results = rules.merge_neighbours(results, order, mergeable)

    log.info("OSM returned %d named destination(s)", len(results))
    # Deep copy on store too: the fresh path returns `results` to its caller,
    # so a shallow-stored entry would share dicts with that caller the same
    # way a shallow hit would.
    cache.DISCOVERY_CACHE.put(cache_key, copy.deepcopy(results))
    return results


def _attempt_outcome(exc: Exception) -> str:
    """The metric outcome for one failed mirror attempt. Timeout is split from
    the other transport errors because it is the one this table's timeouts are
    retuned from (TimeoutException must be tested first: it IS an HTTPError)."""
    if isinstance(exc, PartialResultError):
        return "partial"
    # The attempt's own deadline ends in the builtin TimeoutError, which is the
    # same fact as httpx timing out one operation of it.
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return "timeout"
    if isinstance(exc, httpx.HTTPStatusError):
        return "http_error"
    if isinstance(exc, httpx.HTTPError):
        return "network_error"
    return "error"


async def _attempt(
    client: httpx.AsyncClient,
    mirror: OverpassMirror,
    query: str,
    *,
    path: OverpassPath,
    timeout_s: float,
    deadline: float | None = None,
    cut_cools: bool = False,
) -> dict[str, Any]:
    """Ask one mirror once, counted in its metrics and its cooldown.

    Raises whatever ended the attempt. ``deadline``, on the loop's clock, ends
    the queue for the mirror's slot early and shortens the request to the time
    left once it holds one. ``cut_cools`` says what a cancellation means: the
    caller's own slice running out, which cools the mirror, or a caller that
    no longer needs the answer, which says nothing about it.
    """
    host = urlparse(mirror.url).hostname or mirror.url
    loop = asyncio.get_running_loop()
    outcome = "error"
    elapsed: float | None = None
    cancelled = False
    try:
        log.info("Trying Overpass endpoint: %s", mirror.url)
        # The slot is held only while this mirror's request is in flight;
        # parsing and validation happen after release. The duration is timed
        # the same way, inside the slot, so a queue wait never inflates a
        # mirror's measured latency.
        slot_wait = None if deadline is None else deadline - loop.time() - _MIN_ATTEMPT_S
        async with mirror.budget.slot(wait_s=slot_wait):
            if deadline is not None:
                timeout_s = min(timeout_s, deadline - loop.time())
            # A plain replace rather than str.format: Overpass QL is full of
            # braces and quotes, and only this one token is the mirror's to fill.
            body = query.replace(SERVER_TIMEOUT_TOKEN, str(max(1, int(timeout_s))))
            attempt_start = time.perf_counter()
            try:
                # httpx's own timeout stays beside the total, so an attempt
                # that stalls in one phase still fails as an httpx timeout
                # whose message names that phase.
                async with asyncio.timeout(timeout_s):
                    resp = await client.post(mirror.url, data={"data": body}, timeout=timeout_s)
            finally:
                elapsed = time.perf_counter() - attempt_start
        resp.raise_for_status()
        data = resp.json()
        # Overpass reports mid-query timeouts/errors via `remark` on an
        # otherwise-200 response carrying PARTIAL elements. Accepting it would
        # present a truncated candidate list as a complete ranking (a
        # Ptarmigan Traverse box came back 19 of 29 named peaks this way), so
        # a remark fails this mirror and the chain moves on.
        remark = data.get("remark")
        if remark:
            raise PartialResultError(f"Overpass returned a partial result: {remark}")
        outcome = "success"
        _last_failure.pop(mirror.url, None)
        log.info("Overpass query succeeded via %s", mirror.url)
        return data
    except ratelimit.BudgetExhausted:
        # The pod's own saturation, counted where it happened, in ratelimit.
        # No request was made, so it says nothing about the mirror.
        raise
    except Exception as exc:
        outcome = _attempt_outcome(exc)
        _last_failure[mirror.url] = _clock()
        # The total deadline's TimeoutError carries no message, and neither
        # does a connection the server reset (seen 2026-10-07 from
        # overpass-api.de), which is not a timeout and must not read as one in
        # the log.
        log.warning(
            "Overpass endpoint %s failed: %s",
            mirror.url,
            log_reason(exc, deadline_s=timeout_s),
        )
        raise
    except asyncio.CancelledError:
        # The caller ended this attempt, not the mirror's timeout, so it is no
        # outcome to count: "error" here would read as the mirror breaking,
        # and a duration cut short by someone else would understate the
        # mirror's latency. A caller that runs a slice (the elevation lookup)
        # cancels only on its own deadline, so there the cut means the mirror
        # did not answer in the time it was given, and it cools down so the
        # next caller starts on another one (#655). Without a slice the
        # cancellation is a caller going away, such as an analyze stream whose
        # client disconnected mid-discovery, or a race another mirror won,
        # which says nothing about the mirror. Only an attempt whose request
        # was in flight either way: a cut while queued for the slot asked the
        # mirror nothing, the same as a shed.
        cancelled = True
        if cut_cools and elapsed is not None:
            _last_failure[mirror.url] = _clock()
        raise
    finally:
        # `elapsed` stays None when the budget shed before any HTTP left the
        # pod: nothing was asked, so nothing is recorded.
        if elapsed is not None and not cancelled:
            telemetry.OVERPASS_DURATION.labels(mirror=host, path=path).observe(elapsed)
            telemetry.OVERPASS_REQUESTS.labels(mirror=host, outcome=outcome, path=path).inc()


async def _post_with_fallback(
    query: str,
    on_status: StatusCallback | None = None,
    *,
    path: OverpassPath = "discovery",
    attempt_timeout_s: float | None = None,
) -> dict[str, Any]:
    """Ask each mirror in turn until one answers.

    ``attempt_timeout_s`` replaces every mirror's own ``timeout_s`` for this
    chain, in the attempt's total and in its ``[timeout:N]`` alike. It exists
    for a caller whose whole wait is shorter than one mirror's timeout: without
    it that caller's deadline fires inside the first attempt and the next
    mirror is never asked (#655).
    """
    last_exc: Exception = RuntimeError("No Overpass mirrors configured")
    order = _attempt_order()
    total = len(order)
    # No client-level timeout: each attempt sets its own from the mirror table
    # (httpx would otherwise apply its 5s default to any request that missed one).
    async with httpx.AsyncClient(timeout=None, headers=HEADERS) as client:
        for i, mirror in enumerate(order, start=1):
            host = urlparse(mirror.url).hostname or mirror.url
            # Failover is news the user can act on (the wait just got longer);
            # the healthy first attempt needs no narration.
            if i > 1 and on_status is not None:
                await on_status(f"Trying backup map server {i} of {total}…")
            try:
                return await _attempt(
                    client,
                    mirror,
                    query,
                    path=path,
                    timeout_s=mirror.timeout_s if attempt_timeout_s is None else attempt_timeout_s,
                    cut_cools=attempt_timeout_s is not None,
                )
            except ratelimit.BudgetExhausted:
                # This mirror is saturated pod-wide, but the next one is a
                # different operator with its own capacity. Only the LAST
                # mirror's saturation is terminal, preserving the 503 +
                # Retry-After mapping the routes already apply.
                if i == total:
                    raise
                telemetry.OVERPASS_FALLBACK.labels(mirror=host, path=path).inc()
                log.warning(
                    "Overpass mirror %s budget saturated; trying next mirror", mirror.url
                )
            except Exception as exc:  # noqa: BLE001 — try the next mirror on any failure
                if i < total:
                    telemetry.OVERPASS_FALLBACK.labels(mirror=host, path=path).inc()
                last_exc = exc
    # Every mirror failed — surface the last failure as an actionable message.
    raise UpstreamError(classify_http_error(last_exc, PROVIDER)) from last_exc


# The least time worth giving one attempt: Overpass takes its `[timeout:N]` in
# whole seconds, and an attempt started with less than this cannot answer.
_MIN_ATTEMPT_S = 1.0


async def _race(query: str, *, path: OverpassPath, deadline: float) -> dict[str, Any]:
    """Ask every mirror at once and take the first good answer, all before ``deadline``.

    For a caller with one deadline shorter than two attempts in turn, where a
    chain would spend it on the first mirror and never reach the second. The
    rest are cancelled the moment one answers, which cools none of them. A
    mirror inside its cooldown is held back and asked only once every other
    one has failed, if time is left, so a mirror that keeps failing is not
    asked on every search; when every mirror is cooling they race as one.

    Racing costs each operator a slot per search where a chain asked the
    second operator only when the first failed, and a cancelled query keeps
    the loser's server working until its `[timeout:N]`, which is no longer
    than the time left (#545). Accepted because this is the fallback for a
    search the places table could not answer, rare since #760, and because
    the per-mirror slots still cap what the pod holds of each operator.
    """
    loop = asyncio.get_running_loop()
    now = _clock()
    healthy = [m for m in OVERPASS_MIRRORS if not _cooling(m, now)]
    cooling = [m for m in OVERPASS_MIRRORS if _cooling(m, now)]
    rounds = [healthy, cooling] if healthy and cooling else [OVERPASS_MIRRORS]
    failure: Exception | None = None
    shed: ratelimit.BudgetExhausted | None = None
    async with httpx.AsyncClient(timeout=None, headers=HEADERS) as client:
        for mirrors in rounds:
            if deadline - loop.time() < _MIN_ATTEMPT_S:
                break
            tasks = [
                asyncio.create_task(
                    _attempt(
                        client,
                        m,
                        query,
                        path=path,
                        timeout_s=m.timeout_s,
                        deadline=deadline,
                    )
                )
                for m in mirrors
            ]
            try:
                for finished in asyncio.as_completed(tasks):
                    try:
                        return await finished
                    except ratelimit.BudgetExhausted as exc:
                        shed = exc
                    except Exception as exc:  # noqa: BLE001  the next answer may still win
                        failure = exc
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    if failure is not None:
        raise UpstreamError(classify_http_error(failure, PROVIDER)) from failure
    # Saturation keeps its type when it is all that happened, so the routes'
    # 503 + Retry-After mapping still applies.
    if shed is not None:
        raise shed
    raise UpstreamError(classify_http_error(TimeoutError(), PROVIDER))
