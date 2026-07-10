from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, field_validator, model_validator

MAX_POLYGON_AREA_KM2 = 50_000

# Every candidate inside the polygon gets a forecast (no silent sampling), so
# this ceiling is what actually bounds upstream cost per analysis: 1,000 peaks
# = 20 batched Open-Meteo calls. Beyond it the analysis refuses loudly and the
# user shrinks the polygon or narrows the elevation band.
MAX_ANALYZE_PEAKS = 1_000

# Open-Meteo serves roughly the last ~90 days of history through ~16 days
# ahead; the frontend blocks windows outside that band (urlState.ts). These
# looser bounds are a backstop for direct API callers — enough slack that a
# legitimate edge window never gets a false 422, while an egregious one (say,
# a year ahead) fails fast with a clear message instead of an upstream 400.
PAST_LIMIT_SLACK_DAYS = 95
FUTURE_LIMIT_SLACK_DAYS = 17


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class DestinationType(str, Enum):
    peak = "peak"
    trailhead = "trailhead"
    lake = "lake"
    custom = "custom"


class SortBy(str, Enum):
    precip_total = "precip_total_in"
    precip_max = "precip_max_in_hr"
    wind_avg = "wind_avg_mph"
    wind_max = "wind_max_mph"
    temp_min = "temp_min_f"
    temp_avg = "temp_avg_f"
    temp_max = "temp_max_f"
    aqi_avg = "aqi_avg"
    aqi_max = "aqi_max"


class GeoPolygon(BaseModel):
    type: Literal["Polygon"]
    coordinates: List[List[List[float]]]


def bbox_area_km2(ring: List[List[float]]) -> float:
    """Approximate bounding-box area in km² for a GeoJSON coordinate ring."""
    lats = [c[1] for c in ring]
    lons = [c[0] for c in ring]
    lat_km = (max(lats) - min(lats)) * 111.0
    avg_lat = (max(lats) + min(lats)) / 2.0
    lon_km = (max(lons) - min(lons)) * 111.0 * math.cos(math.radians(avg_lat))
    return lat_km * lon_km


class CustomDestination(BaseModel):
    name: str
    latitude: float
    longitude: float
    elevation_ft: Optional[float] = None


class AnalyzeRequest(BaseModel):
    polygon: Optional[GeoPolygon] = None
    destination_type: DestinationType
    start_datetime: datetime
    end_datetime: datetime
    limit: int = 10
    sort_by: SortBy = SortBy.precip_total
    # False ranks lowest values first (driest/calmest/coldest/cleanest);
    # True flips to highest-first (wettest/windiest/warmest/smokiest).
    sort_desc: bool = False
    # Optional elevation band. Applied to candidates before the weather fetch,
    # so a constrained analysis costs fewer upstream calls, and the returned
    # rows always fill `limit` when enough candidates qualify.
    min_elevation_ft: Optional[float] = None
    max_elevation_ft: Optional[float] = None
    custom_destinations: Optional[List[CustomDestination]] = None

    @field_validator("limit")
    @classmethod
    def limit_range(cls, v: int) -> int:
        if v < 1 or v > 200:
            raise ValueError("limit must be between 1 and 200")
        return v

    @field_validator("polygon")
    @classmethod
    def polygon_area_limit(cls, v: Optional[GeoPolygon]) -> Optional[GeoPolygon]:
        if v is None:
            return v
        area = bbox_area_km2(v.coordinates[0])
        if area > MAX_POLYGON_AREA_KM2:
            raise ValueError(
                f"Search area is too large (~{area:,.0f} km²). "
                f"Maximum allowed is {MAX_POLYGON_AREA_KM2:,} km². "
                "Draw a smaller polygon to stay within API rate limits."
            )
        return v

    @model_validator(mode="after")
    def window_within_servable_range(self) -> "AnalyzeRequest":
        now = datetime.now(timezone.utc)
        if _as_utc(self.start_datetime) < now - timedelta(days=PAST_LIMIT_SLACK_DAYS):
            raise ValueError(
                "start_datetime is beyond the ~90-day history limit of the "
                "weather API — move the window start closer to today."
            )
        if _as_utc(self.end_datetime) > now + timedelta(days=FUTURE_LIMIT_SLACK_DAYS):
            raise ValueError(
                "end_datetime is beyond the ~16-day forecast horizon of the "
                "weather API — move the window end closer to today."
            )
        return self


class DestinationResult(BaseModel):
    name: str
    type: str
    latitude: float
    longitude: float
    elevation_ft: Optional[float] = None
    osm_id: Optional[str] = None
    precip_total_in: float
    precip_avg_in_hr: float
    precip_max_in_hr: float
    temp_min_f: float
    temp_max_f: float
    temp_avg_f: float
    wind_min_mph: float
    wind_max_mph: float
    wind_avg_mph: float
    # PM2.5 US AQI over the window. Nullable: the air-quality forecast only
    # extends ~5 days out (vs ~16 for weather) and the fetch is best-effort.
    aqi_avg: Optional[int] = None
    aqi_max: Optional[int] = None


class AnalyzeResponse(BaseModel):
    results: List[DestinationResult]
    total_queried: int
    error: Optional[str] = None
