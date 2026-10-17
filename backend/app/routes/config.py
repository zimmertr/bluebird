import os

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import browser_upstreams

router = APIRouter()

# Runtime UI config surfaced to the pre-built SPA. Preview environments set these
# so the frontend can render a "you're on a preview" banner; production leaves
# them unset and the banner stays hidden.


class PreviewConfig(BaseModel):
    """Preview-environment banner state."""

    enabled: bool = Field(
        description="Whether this deployment is a PR preview rather than production."
    )
    pr: str | None = Field(
        description=(
            "Pull request number this preview was built from. Null unless enabled."
        )
    )
    commit: str | None = Field(
        description="Commit this preview was built from. Null unless enabled."
    )


class BrowserUpstreams(BaseModel):
    """Where the web app fetches the data it asks for itself.

    Production publishes the public hosts. A local stack that runs the
    supplier simulator publishes the simulator's addresses instead, and the
    page's Content-Security-Policy allows the same origins.
    """

    open_meteo_forecast: str = Field(
        description="Open-Meteo forecast endpoint the browser fetches the ranked field's weather from."
    )
    open_meteo_archive: str = Field(
        description="Open-Meteo archive endpoint for a window older than the forecast endpoint holds."
    )
    open_meteo_air_quality: str = Field(
        description="Open-Meteo air-quality endpoint the browser fetches US AQI from."
    )
    map_tiles: str = Field(
        description=(
            "Base of the basemap host. The style, its tiles, glyphs and sprites are "
            "paths under it."
        )
    )
    radar: str = Field(description="Base of the tile service behind the radar overlay.")
    snow: str = Field(description="NOAA map service behind the snow depth overlay.")


class ConfigResponse(BaseModel):
    """Runtime configuration the SPA reads on load.

    Deployment-specific, and not part of the analysis contract. For build
    identity use `GET /api/version`; for the limits requests are validated
    against use `GET /api/capabilities`.
    """

    preview: PreviewConfig
    upstreams: BrowserUpstreams


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@router.get(
    "/config",
    response_model=ConfigResponse,
    tags=["metadata"],
    summary="Report deployment-specific UI configuration",
)
async def config() -> ConfigResponse:
    enabled = _truthy(os.environ.get("PREVIEW_BANNER"))
    return ConfigResponse(
        preview=PreviewConfig(
            enabled=enabled,
            pr=os.environ.get("PREVIEW_PR") if enabled else None,
            commit=os.environ.get("PREVIEW_COMMIT") if enabled else None,
        ),
        # Read through the module, so a test that reloads it reaches the route.
        upstreams=BrowserUpstreams(
            open_meteo_forecast=browser_upstreams.OPEN_METEO_FORECAST,
            open_meteo_archive=browser_upstreams.OPEN_METEO_ARCHIVE,
            open_meteo_air_quality=browser_upstreams.OPEN_METEO_AIR_QUALITY,
            map_tiles=browser_upstreams.MAP_TILES,
            radar=browser_upstreams.RADAR,
            snow=browser_upstreams.SNOW,
        ),
    )
