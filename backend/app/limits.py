"""The limits every request is checked against, and where the archive begins.

Apart from the request models because they are plain numbers and one window
classification: the services, the capabilities route and the mirrored-constants
generator read them without needing a single Pydantic model.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

# Bounds the Overpass query, not Open-Meteo spend (the count cap below does
# that). Measured 2026-07-29 against overpass-api.de with the production peaks
# query: a ~103,000 km2 sparse box (Iowa) answered in 25.8s; a ~151,000 km2 box
# drew a dispatcher "too busy" 504; a ~50,000 km2 dense box (WA/OR Cascades)
# answered in 21.2s with 1,576 peaks. 100,000 sits inside measured-reliable
# territory with the [timeout:60] in osm/query.py as the true backstop. Re-measure
# before raising further.
MAX_POLYGON_AREA_KM2 = 100_000

# Every candidate inside the polygon gets a forecast (no silent sampling), so
# this ceiling is what actually bounds upstream cost per analysis, in
# Open-Meteo's own unit (see services/openmeteo_weight.py): 1,500 destinations
# is ~1,500 weighted weather calls (times 16/14 for the longest window) plus
# AQI for the displayed rows, against their 600/minute/IP budget — about three
# paced minutes worst case. Beyond it the analysis refuses loudly with
# remedies (narrow the elevation band, elect the top-N, shrink the polygon);
# truncation only ever happens when the request explicitly opts in.
MAX_ANALYZE_PEAKS = 1_500

# How far back a window may reach, which is the ARCHIVE endpoint's reach rather
# than the forecast endpoint's (issue #123). One year is a product choice, not a
# limit of the data: the archive holds decades, and a calendar offering them
# would page through forty years of months to reach last autumn. Probed
# 2026-09-12 at 46.85,-121.76 — with no `models=` the archive answers a window
# 365 days back with real precipitation, temperature and wind.
#
# GET /api/capabilities publishes this as `limits.archive_days`, so the calendar
# reads the reach rather than compiling one.
ARCHIVE_DATA_DAYS = 365

# Open-Meteo serves a year of history (via the archive endpoint, see above)
# through ~16 days ahead; the frontend blocks windows outside that band
# (urlState.ts). These looser bounds are a backstop for direct API callers —
# enough slack that a legitimate edge window never gets a false 422, while an
# egregious one (say, a year ahead) fails fast with a clear message instead of
# an upstream 400.
PAST_LIMIT_SLACK_DAYS = ARCHIVE_DATA_DAYS + 10
FUTURE_LIMIT_SLACK_DAYS = 17

# How far back the forecast endpoint still holds *data*, as opposed to how far
# back it accepts a date. The two are not the same and the difference was a
# live bug: the endpoint answers 200 for any start within ~93 days, but past
# roughly two months it answers with an hourly array of nulls, so the calendar
# offered ~30 days that could only ever come back empty.
#
# Probed 2026-08-01 at 47.42648,-120.85892, bisecting the last day back that
# returns any non-null hour, per model:
#
#   jma 69   gfs 64   ukmo 64   gem 63   ecmwf 62
#   meteofrance 60   hrrr 58   icon 58
#
# Every model is fully populated through 56 days back and ragged at 58, so this
# is one floor for all of them rather than another column in the table
# below: the spread is two weeks of jitter around a single ~2-month retention,
# not a per-model property worth modelling. Re-probe before raising it.
#
# Since #123 this is also the BOUNDARY between the two endpoints: a window older
# than this is served from the archive instead (`window_source` below), so the
# nulls it describes are no longer what a reader gets — they are what the
# forecast endpoint would answer if it were still the one asked.
PAST_DATA_DAYS = 55

# One local calendar day of tolerance on the forecast side of that boundary.
#
# The boundary is an instant and a calendar day is not: west of Greenwich a
# local day's last minute lands on the next UTC date, so a single day drawn in
# the calendar can straddle the boundary by up to 14 hours. Without the
# tolerance that one day would be split across two datasets and joined at a seam
# 14 hours into it, although the forecast endpoint holds the whole of it. It
# costs nothing in honesty: the forecast
# endpoint is measurably populated through 56 days back and ragged at 58 (see
# PAST_DATA_DAYS), so the extra day sits inside the margin that floor already
# carries.
ARCHIVE_STRADDLE_DAYS = 1

# A window that starts before the archive boundary and ends after it. Served by
# TWO fetches rather than refused: the hours before the boundary come from the
# archive, the hours from it on from the forecast endpoint, and each location's
# hourly arrays are concatenated in time order BEFORE the aggregation runs, so
# one report ranks one series (`weather.fetch_weather_batch`). Where the seam
# falls is stated on screen rather than left to be discovered.
WindowSource = Literal["forecast", "archive", "spanning"]

# Rows returned per analysis. Named rather than inline so the validator and
# GET /api/capabilities cannot drift apart. The ceiling equals the analysis
# cap on purpose: `limit` trims the response, never the upstream work, and a
# smaller server ceiling than the SPA's knob would make the rare server
# fallback reject requests the browser path accepts (issue #180). Response
# size stays bounded by the analysis cap regardless.
MIN_LIMIT = 1
MAX_LIMIT = MAX_ANALYZE_PEAKS


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def archive_boundary(now: datetime) -> datetime:
    """The instant the archive's hours end and the forecast endpoint's begin.

    `now - PAST_DATA_DAYS`, floored to the UTC day, because every fetch sends UTC
    hour stamps. One definition for two readers: `window_source` classifies a
    window against it, and `weather.fetch_weather_batch` splits a spanning window
    at it. A second spelling could put the seam an hour from where the
    classification believed it was.

    Mirrored by `archiveBoundaryMs` in `frontend/src/utils/forecastWindow.ts`.
    """
    return (_as_utc(now) - timedelta(days=PAST_DATA_DAYS)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def window_source(start: datetime, end: datetime, now: datetime) -> WindowSource:
    """Which Open-Meteo endpoint answers this window, or that both do.

    One boundary, defined once by `archive_boundary` above. A window entirely
    older than it is the archive's; one starting at it — within a local day, see
    ARCHIVE_STRADDLE_DAYS — is the forecast endpoint's; one that starts before it
    and ends after it is both endpoints', fetched twice and joined at the seam.

    The archive test comes first so the one-day overlap the straddle tolerance
    opens resolves to the archive, which holds every hour in it rather than
    relying on the forecast endpoint's ragged tail.

    Mirrored by `windowSource` in `frontend/src/utils/forecastWindow.ts`, with
    the same example table in both test suites.
    """
    boundary = archive_boundary(now)
    if _as_utc(end) < boundary:
        return "archive"
    if _as_utc(start) >= boundary - timedelta(days=ARCHIVE_STRADDLE_DAYS):
        return "forecast"
    return "spanning"
