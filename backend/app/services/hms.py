"""NOAA HMS smoke plumes, fetched once per pod instead of once per visitor.

HMS is the Hazard Mapping System: analysts at NOAA look at GOES imagery and
trace the visible smoke by hand, classing each plume Light, Medium or Heavy.
That is why this overlay has no timeline of its own — roughly two passes land
per day, the first around late morning Eastern, so there is nothing to animate.
It is a picture of where the smoke is today, not a loop.

Three facts about the source shape everything below.

**It is a dated file, not a query.** Each day's analysis is one KML at a URL
containing that day's date, so "current" has to be computed rather than asked
for. The date is Eastern, because that is the shift the analysts work; before
the day's first pass lands the file 404s, which is why the fetch falls back to
yesterday rather than reporting an outage. The response says which date it
served under, so a caller is never guessing.

**It is small.** Measured 2026-08-04: 56 KB for a quiet day (18 plumes) and
447 KB for the day before (267 plumes). The whole country fits in one response,
so unlike ``nifc.py`` — where 16.5 MB forced a viewport filter and a
bytes-preserving cache — this parses to GeoJSON once, holds the finished body
as text, and serves it whole. A bbox parameter would be ceremony.

**Its density lives in the style, not the data.** Each Placemark carries a
``styleUrl`` of ``#Smoke_{Light,Medium,Heavy}_style`` and a description block
repeating the same word. The styleUrl is what upstream actually renders from,
so it is what is read here. Note the trap this replaced: the KML at
``ospo.noaa.gov/data/land/fire/smoke.kml`` is advertised as current and is
frozen at 2026-07-18 — one day before the numeric-to-named density switch, so
it does not even parse the same way.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import httpx

from app.services.errors import UpstreamError, classify_http_error
from app.services.snapshot import SnapshotCache

log = logging.getLogger(__name__)

PROVIDER = "NOAA HMS (smoke plumes)"

# NOAA's own file server. Deliberately not one of the ArcGIS-hosted mirrors of
# the same dataset: those share an organization quota with every other consumer,
# which is the exact failure mode #203 spent a release removing from the fire
# overlay. A static file server has no quota to lose.
BASE_URL = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML"

HEADERS = {"User-Agent": "Bluebird/1.0 (bluebirdforecast.com; personal weather tool)"}

# The analysts' own timezone. A UTC date would ask for tomorrow's file for five
# hours every evening, and get a 404 for every one of them.
ANALYSIS_TZ = ZoneInfo("America/New_York")

KML_NS = {"kml": "http://www.opengis.net/kml/2.2"}

# The three densities HMS publishes, in the order they are drawn and legended:
# lightest first, so heavier smoke paints over lighter and the legend reads as a
# ramp rather than a set.
DENSITIES = ("Light", "Medium", "Heavy")

_DENSITY_IN_STYLE = re.compile(r"Smoke_(Light|Medium|Heavy)", re.IGNORECASE)

# The description block is one CDATA div of "Label: value<br>" pairs. Read with
# a regex rather than an HTML parser because it is machine-generated text with a
# fixed shape, and because the only alternative in the stdlib parses it into a
# document to read four strings out of.
_DESCRIPTION_FIELD = re.compile(r"(Start Time|End Time|Density|Satellite):\s*([^<]*)", re.IGNORECASE)

# HMS stamps times as year plus day-of-year plus a UTC clock: "2026216 1200UTC"
# is 2026-08-04 12:00Z. Ordinal dates rather than calendar ones, which is a
# satellite-products convention and not something a reader guesses.
_HMS_TIME = re.compile(r"^\s*(\d{4})(\d{3})\s+(\d{2})(\d{2})\s*UTC\s*$", re.IGNORECASE)

# ~1 m. Matches nifc.py's GEOMETRY_PRECISION so the two overlays trim coordinate
# noise the same way; these plumes are continental and would survive far less.
GEOMETRY_PRECISION = 5

# Generous because this is one file off a government file server rather than a
# tuned API, and the busy-day copy is ~450 KB.
REQUEST_TIMEOUT_S = 60.0


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Ignoring non-integer %s=%r; using default %d", name, raw, default)
        return default


# Two analyst passes a day means nothing this cache serves is ever more than a
# few minutes staler than the truth, whatever the TTL. 30 minutes is chosen for
# the other end: it bounds how long after a new pass lands before visitors see
# it, at 48 fetches a day against a file server with no quota.
TTL_S = _env_int("SMOKE_CACHE_TTL_S", 1800)

# How long a failed refresh suppresses the next attempt, for the reason
# nifc.py's twin spells out: without it every request during an outage becomes
# its own upstream attempt, which is the hammering the cache exists to stop.
RETRY_AFTER_FAILURE_S = _env_int("SMOKE_RETRY_AFTER_FAILURE_S", 60)


@dataclass(frozen=True)
class Snapshot:
    """One day's analysis, already serialized.

    ``body`` is the finished response text rather than a feature list, because
    every caller wants the same whole-country answer and re-encoding it per
    request would be work with no question behind it. ``fetched_at_ms`` is wall
    time because it is shown to a person; freshness is tracked separately on the
    monotonic clock, which is the one that must not move when the host's clock
    is corrected.
    """

    fetched_at_ms: int
    analysis_date: str
    plumes: int
    body: str


def analysis_date(now: datetime | None = None) -> date:
    """The date whose analysis to ask for: today, in the analysts' timezone."""
    moment = now.astimezone(ANALYSIS_TZ) if now else datetime.now(ANALYSIS_TZ)
    return moment.date()


def kml_url(day: date) -> str:
    return f"{BASE_URL}/{day:%Y}/{day:%m}/hms_smoke{day:%Y%m%d}.kml"


def _parse_hms_time(raw: str) -> int | None:
    """"2026216 1200UTC" as epoch milliseconds, or None if it is not that shape.

    Returns None rather than raising: a plume with an unreadable stamp is still
    a plume worth drawing, and the popup simply omits the line.
    """
    match = _HMS_TIME.match(raw)
    if not match:
        return None
    year, day_of_year, hour, minute = (int(g) for g in match.groups())
    try:
        stamp = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(
            days=day_of_year - 1, hours=hour, minutes=minute
        )
    except (ValueError, OverflowError):
        return None
    return int(stamp.timestamp() * 1000)


def _text(element: ElementTree.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def _density(style_url: str, placemark_index: int) -> str:
    """Light / Medium / Heavy from the placemark's style reference.

    An unrecognized style draws as Light rather than being dropped: HMS has
    changed this vocabulary once already (numeric to named, 2022-07-19), and a
    plume nobody can classify is still smoke somebody is standing in. The raw
    value rides along in the feature's properties so a reader is not told it is
    light when the answer was really "we did not recognize this".
    """
    match = _DENSITY_IN_STYLE.search(style_url)
    if match:
        return match.group(1).capitalize()
    log.trace("HMS placemark %d has an unrecognized styleUrl %r", placemark_index, style_url)  # type: ignore[attr-defined]
    return DENSITIES[0]


def _ring(coordinates: str) -> list[list[float]]:
    """A KML coordinate string as a GeoJSON linear ring.

    KML triples are lon,lat,alt and GeoJSON wants lon,lat, so the altitude —
    always 0 in this product — is dropped rather than carried as a third
    ordinate that every consumer would then have to ignore.
    """
    ring: list[list[float]] = []
    for triple in coordinates.split():
        parts = triple.split(",")
        if len(parts) < 2:
            continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        ring.append([round(lon, GEOMETRY_PRECISION), round(lat, GEOMETRY_PRECISION)])
    return ring


def parse_kml(text: str) -> list[dict]:
    """Every smoke plume in one day's KML, as GeoJSON features.

    Placemarks without a usable outer ring are dropped: a polygon of two points
    cannot be drawn and would only be a feature every consumer has to skip.
    """
    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError as exc:
        raise UpstreamError("Smoke data could not be read.") from exc

    features: list[dict] = []
    for index, placemark in enumerate(root.iter(f"{{{KML_NS['kml']}}}Placemark")):
        rings = [
            _ring(_text(coords))
            for coords in placemark.iterfind(
                "kml:Polygon/kml:outerBoundaryIs/kml:LinearRing/kml:coordinates", KML_NS
            )
        ]
        rings = [r for r in rings if len(r) >= 4]
        if not rings:
            continue

        fields = {
            key.lower(): value.strip()
            for key, value in _DESCRIPTION_FIELD.findall(_text(placemark.find("kml:description", KML_NS)))
        }
        style_url = _text(placemark.find("kml:styleUrl", KML_NS))
        density = _density(style_url, index)
        properties: dict[str, object] = {
            "density": density,
            "satellite": fields.get("satellite") or None,
            "observed_start": _parse_hms_time(fields.get("start time", "")),
            "observed_end": _parse_hms_time(fields.get("end time", "")),
        }
        if not _DENSITY_IN_STYLE.search(style_url):
            properties["density_raw"] = style_url

        # One feature per outer ring rather than a MultiPolygon: HMS emits one
        # polygon per Placemark today, and a flat list is what the map's three
        # density fills filter over.
        for ring in rings:
            features.append(
                {
                    "type": "Feature",
                    "properties": properties,
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                }
            )
    return features


def collection_json(fetched_at_ms: int, day: date, features: list[dict]) -> str:
    """The response body: GeoJSON, plus when and for which day it was analyzed.

    Both extras ride as GeoJSON foreign members rather than response headers, so
    they survive being saved to a file or piped through a tool that keeps only
    the body — the same choice ``nifc.py`` makes and for the same reason. Map
    libraries ignore members they do not know.
    """
    payload = {
        "type": "FeatureCollection",
        "fetched_at": fetched_at_ms,
        "analysis_date": day.isoformat(),
        "features": features,
    }
    return json.dumps(payload, separators=(",", ":"))


async def fetch_snapshot(now: datetime | None = None) -> Snapshot:
    """Today's smoke analysis, falling back to yesterday's when today has none.

    The fallback is the normal morning state rather than an error path: the
    first pass of the day lands around late morning Eastern, so for the hours
    before it the dated file simply does not exist yet. Serving yesterday's
    plumes labelled with yesterday's date is a better answer than an empty map,
    and the label is what keeps it honest.
    """
    today = analysis_date(now)
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS) as client:
        for day in (today, today - timedelta(days=1)):
            response = await client.get(kml_url(day))
            if response.status_code == 404:
                log.info("HMS has no analysis for %s yet; falling back a day", day.isoformat())
                continue
            response.raise_for_status()
            features = parse_kml(response.text)
            fetched_at_ms = int(time.time() * 1000)
            return Snapshot(
                fetched_at_ms=fetched_at_ms,
                analysis_date=day.isoformat(),
                plumes=len(features),
                body=collection_json(fetched_at_ms, day, features),
            )
    raise UpstreamError("Smoke data is unavailable. Try again later.")


def smoke_cache(
    *,
    ttl_s: float = TTL_S,
    retry_after_failure_s: float = RETRY_AFTER_FAILURE_S,
    clock: Callable[[], float] = time.monotonic,
    fetch: Callable[[], Awaitable[Snapshot]] = fetch_snapshot,
) -> SnapshotCache[Snapshot]:
    """The shared snapshot cache, wired to this module's fetch and knobs."""
    return SnapshotCache(
        label=PROVIDER,
        fetch=fetch,
        ttl_s=ttl_s,
        retry_after_failure_s=retry_after_failure_s,
        describe=lambda s: f"{s.plumes} plumes analyzed {s.analysis_date}",
        clock=clock,
    )


PLUMES = smoke_cache()


def unavailable_message(exc: Exception) -> str:
    """The user-facing sentence for a cold-start failure."""
    if isinstance(exc, UpstreamError):
        return exc.message
    return classify_http_error(exc, PROVIDER)
