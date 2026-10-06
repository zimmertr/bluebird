"""Small in-memory TTL caches for upstream results (issue #180).

Four things get cached, each because the same work was otherwise paid for
twice within minutes:

- Overpass discovery, keyed by (polygon ring, type): the browser flow calls
  ``POST /api/destinations`` and a fallback ``POST /api/analyze/stream``
  re-ran the identical query 2 seconds later; repeat Analyze clicks re-ran
  it again every ~60 seconds all night.
- Overpass elevation lookups for custom destinations, keyed by the coordinate
  set: a pasted list is re-analyzed at window after window, and the peaks
  standing on those coordinates do not move between clicks.
- Per-location Open-Meteo results, keyed by (coordinate, window, service):
  eight clicks on the same polygon re-bought ~1,800 weighted calls each
  time against a 600/minute budget.
- Nominatim place searches, keyed by (query, limit): Nominatim's usage policy
  asks callers to cache results, and every search otherwise waits its turn
  behind a per-pod gate set to their ~1 request per second (issue #571).

All of these caches are per pod and in-memory on purpose, like everything in
ratelimit: the goal is absorbing repeats, not exactness across replicas.
Entries expire by TTL (OSM data, from Overpass or Nominatim, drifts on a
human timescale; Open-Meteo
model runs update roughly hourly, so 15 minutes is conservative) and the
stores are LRU-bounded so an adversary drawing endless polygons cannot grow
memory without bound. The forecast store is bounded by bytes too, because one of its
entries grows with its window's hours (#624).

Coordinate keys are the values exactly as they appear in the destination
dicts. Deliberately NOT rounded coarsely: Open-Meteo interpolates per exact
coordinate (including elevation downscaling), so serving one peak a cached
neighbor's forecast would silently change displayed results. Repeat clicks
send bit-identical coordinates, which is the hit pattern that matters.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Callable, Sequence
from typing import Any

# Bump when the shape of cached values changes so a deploy never serves an
# old pod's idea of a result. Participates in every key.
CACHE_VERSION = 1

DISCOVERY_TTL_S = 10 * 60
DISCOVERY_MAX_ENTRIES = 64

# Same 10 minutes as discovery, and for the same reason: this is OSM data,
# which drifts on a human timescale. An entry is one list's coordinate→match
# map — a few hundred small dicts, far lighter than a discovery entry.
ENRICH_TTL_S = 10 * 60
ENRICH_MAX_ENTRIES = 64

FORECAST_TTL_S = 15 * 60
# A 1,500-destination analysis is up to 3,000 entries (weather + AQI); this
# holds a few of those over a forecast window. The count alone does not bound
# memory, because an entry carries its window's hourly series and a window can
# run a year (#123, #624). Measured 2026-10-06 in the backend test container,
# with the app's own aggregation over synthetic hours: one weather entry is
# 67.5 KB over 385 hours (16 days) and 1.58 MB over 9,407 (the longest window
# the request accepts); an AQI entry is 26.5 KB and 0.50 MB. Bounded by count
# alone, 5,000 year-long entries would be several GB.
FORECAST_MAX_ENTRIES = 5_000
# So the store is bounded by bytes as well, counted by `forecast_entry_bytes`.
# 256 MiB is an eighth of the pod's 2 GiB memory limit, and beside the
# measured steady state and two analyses at `MAX_ANALYZE_DESTINATION_HOURS`
# (limits.py) it leaves the pod under its limit. It still holds every entry of
# a 1,500-destination analysis over 16 days, which is the repeat it exists to
# absorb; an analysis at the budget over a long window outgrows it, and its
# oldest entries go first.
FORECAST_MAX_BYTES = 256 * 1024 * 1024

# What `forecast_entry_bytes` counts per hourly value, and per entry beside
# them. Measured 2026-10-06 (`sys.getsizeof` walked over real entries): 33.7
# bytes per value for a weather entry with every column present, 26.5 for an
# AQI entry, and 2.5 KB for a one-hour weather entry, whose aggregates are most
# of it. An epoch-ms stamp is a 32-byte int behind an 8-byte slot, so 40 is the
# most any value costs; `test_forecast_entry_bytes_never_counts_less_than_an_
# entry_holds` holds the count above the walk.
_BYTES_PER_HOURLY_VALUE = 40
_BYTES_PER_ENTRY = 4 * 1024

# OSM data again, so the discovery TTL. An entry is at most ten small place
# rows, so the bound is generous: it exists to stop an endless stream of
# distinct queries from growing memory, not to save any.
GEOCODE_TTL_S = 10 * 60
GEOCODE_MAX_ENTRIES = 512


class TTLCache:
    """LRU-bounded TTL map. Synchronous by design: every access happens on
    the single event loop, the same no-lock argument ratelimit makes.

    With `max_bytes`, the store is bounded by what `sizer` counts as well as by
    entry count: the least recently used entries go until both bounds hold, and
    an entry larger than `max_bytes` on its own is not stored at all, since
    keeping it would evict everything else and still not fit.
    """

    def __init__(
        self,
        max_entries: int,
        ttl_s: float,
        *,
        max_bytes: int | None = None,
        sizer: Callable[[Any], int] | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max = max(1, max_entries)
        self._ttl = ttl_s
        self._clock = clock
        self.max_bytes = max_bytes
        self._sizer = sizer if sizer is not None else (lambda _value: 0)
        self._data: OrderedDict[Any, tuple[float, Any, int]] = OrderedDict()
        self.bytes = 0
        self.hits = 0
        self.misses = 0

    def get(self, key: Any) -> Any | None:
        entry = self._data.get(key)
        if entry is None:
            self.misses += 1
            return None
        expires, value, _size = entry
        if self._clock() >= expires:
            self._drop(key)
            self.misses += 1
            return None
        self._data.move_to_end(key)
        self.hits += 1
        return value

    def put(self, key: Any, value: Any) -> None:
        size = self._sizer(value)
        if key in self._data:
            self._drop(key)
        if self.max_bytes is not None and size > self.max_bytes:
            return
        self._data[key] = (self._clock() + self._ttl, value, size)
        self.bytes += size
        while len(self._data) > self._max or (
            self.max_bytes is not None and self.bytes > self.max_bytes
        ):
            self._drop(next(iter(self._data)))

    def _drop(self, key: Any) -> None:
        _expires, _value, size = self._data.pop(key)
        self.bytes -= size

    def clear(self) -> None:
        self._data.clear()
        self.bytes = 0


def forecast_entry_bytes(value: Any) -> int:
    """An upper bound on what one forecast entry holds, from its hour counts.

    Counted rather than walked: a walk visits every value, which is tens of
    thousands of objects per entry over a long window and three thousand
    entries per analysis, on the event loop. The series are nearly all of an
    entry, so their lengths times the measured most per value, plus a fixed
    allowance for the aggregates, never falls under the real size (see the
    constants above).
    """
    values = 0
    series = value.get("series") if isinstance(value, dict) else None
    if isinstance(series, dict):
        values = sum(len(column) for column in series.values() if isinstance(column, list))
    return _BYTES_PER_ENTRY + values * _BYTES_PER_HOURLY_VALUE


DISCOVERY_CACHE = TTLCache(DISCOVERY_MAX_ENTRIES, DISCOVERY_TTL_S)
ENRICH_CACHE = TTLCache(ENRICH_MAX_ENTRIES, ENRICH_TTL_S)
FORECAST_CACHE = TTLCache(
    FORECAST_MAX_ENTRIES,
    FORECAST_TTL_S,
    max_bytes=FORECAST_MAX_BYTES,
    sizer=forecast_entry_bytes,
)
GEOCODE_CACHE = TTLCache(GEOCODE_MAX_ENTRIES, GEOCODE_TTL_S)


def discovery_key(ring: Sequence[Sequence[float]], type_value: str) -> tuple:
    """Cache key for one discovery query.

    Ring coordinates are rounded to 5 decimals (~1 m): enough that a
    URL-restored polygon and its freshly-drawn twin collide, far too fine
    for two genuinely different searches to. The elevation band is NOT part
    of the key — discovery is cached unfiltered and each request re-applies
    its own band, so one entry serves every band variation.
    """
    coords = tuple((round(lon, 5), round(lat, 5)) for lon, lat in ring)
    return (CACHE_VERSION, type_value, coords)


def custom_enrich_key(points: list[tuple[float, float]]) -> tuple:
    """Cache key for one custom list's elevation lookup.

    Coordinates are rounded to 5 decimals (~1 m), the same precision
    ``discovery_key`` and the frontend's ``geoKey`` use, then sorted: the
    question being asked is "what stands on this SET of points", so two
    pastes of the same peaks in a different order must hit the same entry.
    That is the reasoning behind ``pointsKey`` in ``fireProximity.ts`` too.
    """
    coords = tuple(sorted((round(lat, 5), round(lon, 5)) for lat, lon in points))
    return (CACHE_VERSION, "custom-enrich", coords)


def geocode_key(query: str, limit: int) -> tuple:
    """Cache key for one place search.

    The query is kept exactly as sent. Nominatim's answer to a query that
    differs only in case or spacing is usually, not always, the same, and a
    repeat search from the box sends the identical string, which is the hit
    pattern that matters. ``limit`` is part of the key because a shorter list
    cannot answer a request for a longer one.
    """
    return (CACHE_VERSION, "geocode", query, limit)


# Cached values are per-WINDOW results (aggregates and series computed over
# start..end hours), so the key must carry the exact window, not just its
# dates — two windows sharing a date span have different aggregates. Exact
# datetimes still hit on the pattern that matters: repeat clicks send
# identical picker values, and the point modes floor to the hour.
def forecast_key(
    service: str,
    latitude: Any,
    longitude: Any,
    start_iso: str,
    end_iso: str,
    model: str = "",
    elevation: Any = "",
    source: str = "",
) -> tuple:
    """Cache key for one location's windowed result from one Open-Meteo
    service (``service`` distinguishes weather from air quality).

    ``model`` is the weather model that answered. It must be part of the key
    or two models would share one entry and the second one asked for would be
    served the first one's numbers — the whole point of choosing a model being
    that they disagree. Empty for air quality, which has only one model.

    ``elevation`` joins the key for weather because the stored aggregates are
    computed AT that elevation (the wind column reports wind at the
    destination's own height, issue #257): the same coordinates asked at a
    different claimed elevation are a different question. Empty for air
    quality, which does not adjust by elevation.

    ``source`` is which Open-Meteo endpoint answered (issue #123): the archive
    carries no pressure-level winds, so its rows hold the 10 m wind where the
    forecast endpoint's hold wind at elevation, and the boundary between the two
    moves with the clock. Without it in the key, a window that changed sides
    while an entry was still live would be served the other endpoint's numbers.
    Empty for air quality, which has one endpoint.
    """
    return (
        CACHE_VERSION,
        service,
        str(latitude),
        str(longitude),
        start_iso,
        end_iso,
        model,
        str(elevation),
        source,
    )


# A cached "no data for this window" is a real answer, distinct from a miss.
NO_DATA = "NO_DATA"
