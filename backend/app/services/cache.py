"""Small in-memory TTL caches for upstream results (issue #180).

Two things get cached, each because a real incident showed the same work
being paid for twice within minutes:

- Overpass discovery, keyed by (polygon ring, type): the browser flow calls
  ``POST /api/destinations`` and a fallback ``POST /api/analyze/stream``
  re-ran the identical query 2 seconds later; repeat Analyze clicks re-ran
  it again every ~60 seconds all night.
- Per-location Open-Meteo results, keyed by (coordinate, window, service):
  eight clicks on the same polygon re-bought ~1,800 weighted calls each
  time against a 600/minute budget.

Both caches are per pod and in-memory on purpose, like everything in
ratelimit.py: the goal is absorbing repeats, not exactness across replicas.
Entries expire by TTL (Overpass data drifts on a human timescale; Open-Meteo
model runs update roughly hourly, so 15 minutes is conservative) and the
stores are LRU-bounded so an adversary drawing endless polygons cannot grow
memory without bound.

Coordinate keys are the values exactly as they appear in the destination
dicts. Deliberately NOT rounded coarsely: Open-Meteo interpolates per exact
coordinate (including elevation downscaling), so serving one peak a cached
neighbor's forecast would silently change displayed results. Repeat clicks
send bit-identical coordinates, which is the hit pattern that matters.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any

# Bump when the shape of cached values changes so a deploy never serves an
# old pod's idea of a result. Participates in every key.
CACHE_VERSION = 1

DISCOVERY_TTL_S = 10 * 60
DISCOVERY_MAX_ENTRIES = 64

FORECAST_TTL_S = 15 * 60
# A 1,500-destination analysis is up to 3,000 entries (weather + AQI); this
# holds a few of those. Entries carry hourly series (~a few KB for a 16-day
# window), so the worst case is tens of MB per pod — bounded, and far
# cheaper than the upstream quota it saves.
FORECAST_MAX_ENTRIES = 5_000


class TTLCache:
    """LRU-bounded TTL map. Synchronous by design: every access happens on
    the single event loop, the same no-lock argument ratelimit.py makes."""

    def __init__(
        self,
        max_entries: int,
        ttl_s: float,
        *,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._max = max(1, max_entries)
        self._ttl = ttl_s
        self._clock = clock
        self._data: OrderedDict[Any, tuple[float, Any]] = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, key: Any) -> Any | None:
        entry = self._data.get(key)
        if entry is None:
            self.misses += 1
            return None
        expires, value = entry
        if self._clock() >= expires:
            del self._data[key]
            self.misses += 1
            return None
        self._data.move_to_end(key)
        self.hits += 1
        return value

    def put(self, key: Any, value: Any) -> None:
        self._data[key] = (self._clock() + self._ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()


DISCOVERY_CACHE = TTLCache(DISCOVERY_MAX_ENTRIES, DISCOVERY_TTL_S)
FORECAST_CACHE = TTLCache(FORECAST_MAX_ENTRIES, FORECAST_TTL_S)


def discovery_key(ring: list[list[float]], type_value: str) -> tuple:
    """Cache key for one discovery query.

    Ring coordinates are rounded to 5 decimals (~1 m): enough that a
    URL-restored polygon and its freshly-drawn twin collide, far too fine
    for two genuinely different searches to. The elevation band is NOT part
    of the key — discovery is cached unfiltered and each request re-applies
    its own band, so one entry serves every band variation.
    """
    coords = tuple((round(lon, 5), round(lat, 5)) for lon, lat in ring)
    return (CACHE_VERSION, type_value, coords)


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
) -> tuple:
    """Cache key for one location's windowed result from one Open-Meteo
    service (``service`` distinguishes weather from air quality)."""
    return (CACHE_VERSION, service, str(latitude), str(longitude), start_iso, end_iso)


# A cached "no data for this window" is a real answer, distinct from a miss.
NO_DATA = "NO_DATA"
