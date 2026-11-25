"""Where the browser asks for forecasts, in the order it should ask them.

Every analysis used to depend on Open-Meteo's three public hosts alone, so a
host that hung or refused failed the run however long it lasted (record 0340).
This module is the list the browser walks instead: a deployment names its own
copies of Open-Meteo in ``OPEN_METEO_MIRRORS``, and ``/api/capabilities``
publishes them ahead of the public hosts, which stay last as the source that
is always there. With nothing configured the list is the public hosts alone,
which is exactly how the app behaved before.

A mirror is a self-hosted Open-Meteo, so one base URL answers both
``/v1/forecast`` and ``/v1/air-quality``. It answers no archive: past windows
stay on Open-Meteo's archive host (``docs/RELIABILITY.md``, Past Windows). And
it is not paced, because the free tier's weighted-call quota is Open-Meteo's,
counted per visitor address, and a deployment's own copy has none.

The list is read once, at import, because the Content-Security-Policy is built
from it at import too (``security_headers.py``): a mirror the page may not
connect to would be published and then blocked by the browser.
"""

from __future__ import annotations

import logging
import os
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


class OpenMeteoSource(BaseModel):
    """One place the browser can ask for forecasts."""

    name: Literal["open-meteo", "mirror"] = Field(
        description=(
            "`open-meteo` for Open-Meteo's own public hosts, `mirror` for a copy "
            "this deployment runs. The name a run report gives the source that "
            "failed it."
        )
    )
    forecast_url: str | None = Field(
        description="Where this source answers forecast windows, or null when it answers none."
    )
    archive_url: str | None = Field(
        description="Where this source answers windows older than the forecast endpoint holds, or null."
    )
    air_quality_url: str | None = Field(
        description="Where this source answers US AQI, or null when it answers none."
    )
    paced: bool = Field(
        description=(
            "Whether a client must pace its requests to this source under Open-Meteo's "
            "free-tier weighted-call quota, which counts per client address."
        )
    )


PUBLIC_SOURCE = OpenMeteoSource(
    name="open-meteo",
    forecast_url=FORECAST_URL,
    archive_url=ARCHIVE_URL,
    air_quality_url=AIR_QUALITY_URL,
    paced=True,
)


def _mirror(raw: str) -> OpenMeteoSource | None:
    """A mirror from its base URL, or None when the value cannot be one.

    Only an https origin with no path, query or fragment is accepted, so the
    value is exactly what the CSP's connect-src names and nothing a typo could
    turn into a path the page then fetches.
    """
    value = raw.strip().rstrip("/")
    if not value:
        return None
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.netloc or parts.path or parts.query or parts.fragment:
        log.warning("Ignoring OPEN_METEO_MIRRORS entry %r: it must be an https origin like https://host", raw)
        return None
    return OpenMeteoSource(
        name="mirror",
        forecast_url=f"{value}/v1/forecast",
        archive_url=None,
        air_quality_url=f"{value}/v1/air-quality",
        paced=False,
    )


def read_sources(raw: str | None) -> tuple[OpenMeteoSource, ...]:
    """The mirrors in ``raw`` (comma-separated origins), in order, then the public hosts."""
    mirrors = [m for m in (_mirror(part) for part in (raw or "").split(",")) if m is not None]
    return (*mirrors, PUBLIC_SOURCE)


SOURCES = read_sources(os.environ.get("OPEN_METEO_MIRRORS"))


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def mirror_origins(sources: tuple[OpenMeteoSource, ...] = SOURCES) -> tuple[str, ...]:
    """The origins of every configured mirror, for the page's connect-src."""
    return tuple(
        dict.fromkeys(
            origin_of(url)
            for source in sources
            if source.name == "mirror"
            for url in (source.forecast_url, source.air_quality_url)
            if url is not None
        )
    )
