"""What the browser says happened to each run and map load (record 0339).

An analysis runs in the reader's browser against Open-Meteo, so the pod
never sees one succeed or fail. This route takes the browser's account of
each run and each map load and counts it, which is what lets the reliability
targets in docs/RELIABILITY.md be read at all. Every field is a closed set or
a bounded number, so a report can add no series a script could grow, and
nothing in it names a place or a person: no coordinates, no address, no
identifier of the reader.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app import ratelimit, telemetry
from app.forecast_models import ForecastModel
from app.limits import MAX_ANALYZE_PEAKS
from app.models import ErrorResponse
from app.models.common import _REQUEST_CONFIG

router = APIRouter()

# The destination counts the targets are stated at: 200 for a typical run, the
# cap for the largest. A count is folded into one of these so the label stays
# one of three values.
_TYPICAL_DESTINATIONS = 200


def _size(kind: str, destinations: int | None) -> str:
    if kind != "analysis" or destinations is None:
        return "none"
    return "typical" if destinations <= _TYPICAL_DESTINATIONS else "large"


class RunReport(BaseModel):
    model_config = _REQUEST_CONFIG

    kind: Literal["analysis", "map"] = Field(
        description="What is reported: one analysis, from the press to a table or a failure, or one load of the map."
    )
    outcome: Literal["success", "degraded", "failed", "refused", "cancelled", "abandoned"] = Field(
        description=(
            "How it ended. `degraded` is a table with a column the run could not "
            "fill; `refused` a run stopped before it spent anything; `abandoned` "
            "a run whose page closed while it was still going."
        )
    )
    stage: Literal["discovery", "weather", "air_quality", "snow", "basemap", "other"] | None = Field(
        default=None,
        description="The part that failed or degraded it, when one did.",
    )
    source: Literal["pod", "open-meteo", "mirror", "basemap", "other"] | None = Field(
        default=None,
        description="Who answered the failing request, when one did.",
    )
    duration_ms: int = Field(
        ge=0, le=3_600_000, description="Milliseconds from the press, or the page's start, to the end."
    )
    destinations: int | None = Field(
        default=None,
        ge=0,
        le=MAX_ANALYZE_PEAKS,
        description="How many destinations the analysis forecast. Counted only as typical (up to 200) or large.",
    )
    model: ForecastModel | None = Field(default=None, description="The forecast model the analysis asked for.")


@router.post(
    "/reports",
    status_code=204,
    tags=["metadata"],
    summary="Report how a run or a map load ended",
    description=(
        "The web app sends one report per analysis and one per map load, so "
        "this instance can count how often each succeeds and how long it "
        "takes, which it cannot see itself because the analysis runs in the "
        "browser. A report carries no coordinates and nothing that identifies "
        "the reader. Nothing is stored but counters."
    ),
    response_description="Counted.",
    responses={
        422: {"model": ErrorResponse, "description": "A field was missing, unknown or out of range."},
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is reporting faster than the per-address limit. "
                "`Retry-After` says how many seconds to wait. "
                "`GET /api/capabilities` publishes the limit."
            ),
        },
    },
    dependencies=[Depends(ratelimit.reports_rate_limit)],
)
async def report(body: RunReport) -> Response:
    size = _size(body.kind, body.destinations)
    telemetry.RUN_REPORTS.labels(
        kind=body.kind,
        outcome=body.outcome,
        stage=body.stage or "none",
        source=body.source or "none",
        size=size,
        model=body.model.value if body.model else "none",
    ).inc()
    telemetry.RUN_DURATION.labels(kind=body.kind, outcome=body.outcome, size=size).observe(body.duration_ms / 1000)
    return Response(status_code=204)
