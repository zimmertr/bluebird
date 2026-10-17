"""The hosts the browser bundle calls, as the pod tells it to (#224).

One home for the six addresses because two things read them and must agree:
``GET /api/config`` publishes them, so the web app knows where to fetch, and
``security_headers.py`` builds connect-src and img-src from their origins, so
the policy allows exactly what the app was told to call. A sim that moves one
without the other would either blank a layer or leave the policy open to a
host nothing uses.

Each is read once, at import, through ``env_url``. Unset, every value is the
production host the frontend also compiles in as its fallback, so the
published config and the CSP string are the ones production has always sent.
Imports nothing from ``app`` but ``env.py``, so ``security_headers.py`` can
read it without pulling in a route.

Overpass, Nominatim, NIFC, the Forest Service's closure layers and NOAA's HMS
smoke files are not here: the pod fetches those, and their knobs live beside
the code that calls them.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from app.env import env_url

# frontend/src/utils/openMeteo.ts: the ranked field's forecasts.
OPEN_METEO_FORECAST = env_url(
    "BROWSER_OPEN_METEO_FORECAST_URL", "https://api.open-meteo.com/v1/forecast"
)
# frontend/src/utils/openMeteo.ts: reanalysis for a window older than the
# forecast endpoint holds (#123).
OPEN_METEO_ARCHIVE = env_url(
    "BROWSER_OPEN_METEO_ARCHIVE_URL", "https://archive-api.open-meteo.com/v1/archive"
)
# frontend/src/utils/openMeteo.ts: US AQI, fetched beside the weather.
OPEN_METEO_AIR_QUALITY = env_url(
    "BROWSER_OPEN_METEO_AIR_QUALITY_URL",
    "https://air-quality-api.open-meteo.com/v1/air-quality",
)
# frontend/src/map/basemap.ts and utils/peakTiles.ts: the basemap style, and
# every tile, glyph and sprite that style names. MapLibre reaches the map host
# five ways (the style JSON, its TileJSON, vector tiles, glyphs and sprites)
# and all five resolve to this one origin, checked against the served style
# document rather than assumed.
MAP_TILES = env_url("BROWSER_MAP_TILES_URL", "https://tiles.openfreemap.org")
# frontend/src/utils/radar.ts: the NEXRAD frames behind the radar overlay.
RADAR = env_url("BROWSER_RADAR_URL", "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0")
# frontend/src/utils/snowDepth.ts: the NOHRSC snow analysis, rendered per tile
# by NOAA's own map service, which the browser asks directly (#446).
SNOW = env_url(
    "BROWSER_SNOW_URL",
    "https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer",
)


def _origin(url: str) -> str:
    """``scheme://host[:port]``, which is all a CSP source expression names."""
    parts = urlsplit(url)
    # rpartition drops any user:password@ a URL carries, which a policy must
    # never print.
    return f"{parts.scheme}://{parts.netloc.rpartition('@')[2]}"


def _distinct_origins(urls: tuple[str, ...]) -> tuple[str, ...]:
    # dict.fromkeys keeps first-seen order: a sim that serves all six from one
    # origin collapses the list to that origin rather than repeating it.
    return tuple(dict.fromkeys(_origin(url) for url in urls))


def fetch_origins() -> tuple[str, ...]:
    """Every origin the browser fetches from, and so connect-src beyond 'self'.

    Air quality comes before the archive here, unlike the config's order,
    because that is the order the policy has always printed them in and an
    unset deployment must send the same string.
    """
    return _distinct_origins(
        (OPEN_METEO_FORECAST, OPEN_METEO_AIR_QUALITY, OPEN_METEO_ARCHIVE, MAP_TILES, RADAR, SNOW)
    )


def image_origins() -> tuple[str, ...]:
    """The origins above that also serve raster images, for img-src.

    MapLibre fetches raster tiles with fetch and decodes them to an ImageBitmap,
    so connect-src carries the common path; an engine without
    createImageBitmap falls back to an Image element instead, which is what
    these entries cover.
    """
    return _distinct_origins((MAP_TILES, RADAR, SNOW))
