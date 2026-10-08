"""The analysis helpers the browser ports, in one module.

The SPA ranks a field without the server (`frontend/src/utils/clientAnalyze.ts`
and `constraints.ts`), so every decision here is written twice, once per
language: which field each forecast bound compares, which requests need a
fetch for every candidate, how rows are assembled and aligned onto the weather
grid, how they rank, and how the over-cap refusal is worded. Mirror rows 3, 17,
18, 28 and 29 in the root `CLAUDE.md` name this module, and a change here is
mirrored there in the same PR. It holds no route and no fetch, so a reader can
set it beside its ports and compare the two.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

from app.models import (
    MAX_ANALYZE_PEAKS,
    AnalyzeRequest,
    DestinationResult,
    DestinationType,
    HourlySeries,
)

# Which result field each forecast bound compares.
#
# A ceiling reads the window's worst hour and a floor its best, so a bound is a
# promise about every hour rather than about an average that can hide a bad
# afternoon: max_gust_mph=30 admits no destination that gusts to 45 at noon.
# The freezing level reads the same way in the one family where neither end is
# the bad one: its floor asks that the level never dropped below the value and
# its ceiling that it never rose above it.
# Precipitation, snowfall and AQI have no minimum aggregate to read — a
# per-hour precipitation floor would be 0.000 almost everywhere — so both of
# their bounds compare a single field, the window total and the worst hour.
_LOWER_BOUNDS = (
    ("min_precip_total_in", "precip_total_in"),
    ("min_temp_f", "temp_min_f"),
    ("min_wind_mph", "wind_min_mph"),
    ("min_gust_mph", "gust_min_mph"),
    ("min_freeze_ft", "freeze_min_ft"),
    ("min_snowfall_total_in", "snowfall_total_in"),
    ("min_aqi", "aqi_max"),
    ("min_cloud_deck_ft", "cloud_deck_min_ft"),
)
_UPPER_BOUNDS = (
    ("max_precip_total_in", "precip_total_in"),
    ("max_temp_f", "temp_max_f"),
    ("max_wind_mph", "wind_max_mph"),
    ("max_gust_mph", "gust_max_mph"),
    ("max_freeze_ft", "freeze_max_ft"),
    ("max_snowfall_total_in", "snowfall_total_in"),
    ("max_aqi", "aqi_max"),
    ("max_cloud_deck_ft", "cloud_deck_max_ft"),
)


def _aqi_bounded(request: AnalyzeRequest) -> bool:
    """Does this request bound AQI, and therefore need it for every candidate?

    Lazy AQI (fetched only for the rows about to be returned) is the whole
    reason this question is asked separately from the ranking's. A bound
    applied to a value that was never fetched would drop nothing at all, since
    nulls pass — the filter would silently do nothing on exactly the requests
    that asked for it.
    """
    return request.min_aqi is not None or request.max_aqi is not None


def _filter_constraints(
    results: list[DestinationResult], request: AnalyzeRequest
) -> list[DestinationResult]:
    """Drop rows outside the request's forecast bounds.

    Runs after aggregation and before the ranking, so `limit` cuts a field
    that already matches: "the ten driest destinations that stay under 20 mph",
    never "whichever of the ten driest happened to be calm".

    A null value passes every bound. A missing AQI means the window outran the
    ~5-day air-quality horizon or a best-effort fetch failed; a missing
    freezing level or gust means the chosen model publishes none at all.
    Neither is evidence about the weather, and dropping those rows would
    quietly empty every long-window analysis that set an AQI ceiling, or every
    analysis under a model that carries no freezing level or no gust.
    It is the same call `_filter_elevation` makes for an untagged
    summit and `_sort_key` makes for a nullable ranking key.
    """
    lower = [(f, v) for attr, f in _LOWER_BOUNDS if (v := getattr(request, attr)) is not None]
    upper = [(f, v) for attr, f in _UPPER_BOUNDS if (v := getattr(request, attr)) is not None]
    if not lower and not upper:
        return results

    def keep(r: DestinationResult) -> bool:
        for field, bound in lower:
            value = getattr(r, field)
            if value is not None and value < bound:
                return False
        for field, bound in upper:
            value = getattr(r, field)
            if value is not None and value > bound:
                return False
        return True

    return [r for r in results if keep(r)]


def _truncate_top_elevation(destinations: list[dict], cap: int) -> list[dict]:
    """The explicit opt-in cut: the ``cap`` highest-elevation candidates.

    Unknown-elevation rows are dropped first — a row that cannot prove any
    elevation cannot claim to be among the highest. Never called without the
    request's ``top_by_elevation`` flag; silent truncation stays impossible.
    """
    known = [d for d in destinations if d.get("elevation_ft") is not None]
    known.sort(key=lambda d: d["elevation_ft"], reverse=True)
    return known[:cap]


def _cap_detail(count: int, noun: str) -> str:
    """The over-cap refusal: what is wrong, and nothing else.

    It used to advise the remedies in play ("Draw a smaller polygon...") and
    quote the computed elevation floor. TJ removed both (2026-08-22, #253's
    PR): the message states the problem, and the structured fields carry the
    machine-readable remedies for API callers.
    """
    return (
        f"This search covers {count:,} {noun}s. The analysis limit is "
        f"{MAX_ANALYZE_PEAKS:,} destinations."
    )


def _sort_key(sort_field: str, descending: bool = False) -> Callable[[DestinationResult], tuple[int, float]]:
    # AQI fields are nullable (short forecast horizon / best-effort fetch);
    # None sorts after every real value in either direction so it never wins
    # a ranking — hence negating values rather than sort(reverse=True).
    def key(r: DestinationResult) -> tuple[int, float]:
        v = getattr(r, sort_field)
        if v is None:
            return (1, 0.0)
        return (0, -v if descending else v)

    return key


_NOUNS = {
    DestinationType.peak: "peak",
    DestinationType.trailhead: "trailhead",
    DestinationType.lake: "lake",
    DestinationType.custom: "destination",
}


def _noun(types: Sequence[DestinationType], *, has_custom: bool = False) -> str:
    """What to call the things a refusal is counting.

    A request can now discover several types at once and union a caller's list
    on top, so the message has to name the *set*, not a type. It only reaches
    for a specific noun when the set genuinely holds one kind — "1,842 peaks"
    is better than "1,842 destinations" when peaks is all there is — and
    otherwise merges to the general one rather than listing types, because a
    refusal is read for its remedy and "1,842 peaks, lakes and trailheads"
    buries that behind an inventory.
    """
    kinds = set(types)
    if has_custom or len(kinds) != 1:
        return "destination"
    return _NOUNS.get(next(iter(kinds)), "destination")


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
    lookup = dict(zip(aqi_series["times"], aqi_series["aqi"], strict=False))
    return [lookup.get(t) for t in times_ms]


def _aligned_cloud(
    times_ms: list[int], cloud_series: dict | None
) -> list[float | None] | None:
    """The cloud deck aligned onto the weather grid, null where absent.

    The two requests ask for the same hours, so the grids agree whenever both
    answered; aligning by stamp rather than by index is what keeps a short or
    missing answer from sliding a value onto the wrong hour. No series at all
    is no arrays at all, which is what a row whose analysis never asked for
    the cloud fields carries: a column of nulls would be bytes that say less.
    """
    if not cloud_series:
        return None
    deck = dict(zip(cloud_series["times"], cloud_series["cloud_deck_ft"], strict=False))
    return [deck.get(t) for t in times_ms]


def _assemble(
    destinations: list,
    wx_list: list,
    aqi_list: list,
    type_value: str,
    *,
    include_series: bool = True,
    cloud_list: list | None = None,
) -> tuple[list[DestinationResult], list[int]]:
    """Zip destinations with their weather + AQI results into rows, baking the
    hourly series (AQI aligned onto the weather grid) into each.

    Rows whose weather came back None are dropped. Weather dicts without a
    `series` key (e.g. stubbed in tests) degrade cleanly to `series=None`.

    `include_series=False` is the caller asking for aggregates alone, and this
    is the one seam where that is honored: the hours are still fetched and
    still reduced, they are simply not carried into the row. `times` is
    unaffected, because it says which hours the aggregates cover.

    A row's `type` prefers the destination dict's own tag — a union response
    mixes discovered and custom rows — falling back to the request-level value.
    """
    times = _canonical_times(wx_list)
    clouds = cloud_list if cloud_list is not None else [None] * len(destinations)
    results: list[DestinationResult] = []
    for dest, wx, aqi, cloud in zip(destinations, wx_list, aqi_list, clouds, strict=False):
        if wx is None:
            continue
        aqi = aqi or {}
        cloud = cloud or {}
        wx_series = wx.get("series")
        agg = {k: v for k, v in wx.items() if k != "series"}
        aqi_stats = {k: v for k, v in aqi.items() if k != "series"}
        cloud_stats = {k: v for k, v in cloud.items() if k != "series"}
        series = None
        if wx_series and include_series:
            series = HourlySeries(
                precip_in=wx_series["precip_in"],
                temp_f=wx_series["temp_f"],
                wind_mph=wx_series["wind_mph"],
                freeze_ft=wx_series["freeze_ft"],
                snowfall_in=wx_series["snowfall_in"],
                gust_mph=wx_series["gust_mph"],
                aqi=_aligned_aqi(wx_series["times"], aqi.get("series")),
                cloud_deck_ft=_aligned_cloud(wx_series["times"], cloud.get("series")),
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
                **cloud_stats,
                series=series,
            )
        )
    return results, times
