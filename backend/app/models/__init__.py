"""Every request and response shape the API publishes, importable from one place.

The shapes live in the modules beside this one, and the limits and the model
table in `app.limits` and `app.forecast_models`. This file re-exports all of
them so `from app.models import X` keeps working wherever it was written. A
test that patches a name must patch it in the module that defines it: a patch
here never reaches the code that reads the name there.
"""

from __future__ import annotations

from app.forecast_models import (
    DEFAULT_FORECAST_MODEL,
    MODEL_INFO,
    ForecastModel,
    ModelInfo,
)
from app.limits import (
    ARCHIVE_DATA_DAYS,
    ARCHIVE_STRADDLE_DAYS,
    FUTURE_LIMIT_SLACK_DAYS,
    MAX_ANALYZE_PEAKS,
    MAX_LIMIT,
    MAX_POLYGON_AREA_KM2,
    MIN_LIMIT,
    PAST_DATA_DAYS,
    PAST_LIMIT_SLACK_DAYS,
    WindowSource,
    _as_utc,
    archive_boundary,
    window_source,
)
from app.models.analyze import (
    AnalysisRefusal,
    AnalyzeRequest,
    AnalyzeResponse,
    ApiErrorInfo,
    DestinationResult,
    ErrorResponse,
    HourlySeries,
)
from app.models.common import (
    _SNOW_DATE_DESCRIPTION,
    _SNOW_DEPTH_DESCRIPTION,
    CustomDestination,
    DestinationType,
    ForecastMode,
    GeoPolygon,
    SortBy,
    _check_polygon_area,
    _DiscoveryFields,
    bbox_area_km2,
)
from app.models.destinations import (
    DestinationsRequest,
    DestinationsResponse,
    DiscoveredDestination,
)

__all__ = [
    "MAX_POLYGON_AREA_KM2",
    "MAX_ANALYZE_PEAKS",
    "ARCHIVE_DATA_DAYS",
    "PAST_LIMIT_SLACK_DAYS",
    "FUTURE_LIMIT_SLACK_DAYS",
    "PAST_DATA_DAYS",
    "ARCHIVE_STRADDLE_DAYS",
    "WindowSource",
    "MIN_LIMIT",
    "MAX_LIMIT",
    "_as_utc",
    "archive_boundary",
    "window_source",
    "DestinationType",
    "ForecastMode",
    "ForecastModel",
    "DEFAULT_FORECAST_MODEL",
    "ModelInfo",
    "MODEL_INFO",
    "_SNOW_DEPTH_DESCRIPTION",
    "_SNOW_DATE_DESCRIPTION",
    "SortBy",
    "GeoPolygon",
    "bbox_area_km2",
    "CustomDestination",
    "_check_polygon_area",
    "_DiscoveryFields",
    "AnalyzeRequest",
    "HourlySeries",
    "DestinationResult",
    "ApiErrorInfo",
    "ErrorResponse",
    "AnalysisRefusal",
    "AnalyzeResponse",
    "DestinationsRequest",
    "DiscoveredDestination",
    "DestinationsResponse",
]
