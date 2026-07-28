import os

from fastapi import APIRouter
from pydantic import BaseModel, Field

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


class ConfigResponse(BaseModel):
    """Runtime configuration the SPA reads on load.

    Deployment-specific, and not part of the analysis contract. For build
    identity use `GET /api/version`; for the limits requests are validated
    against use `GET /api/capabilities`.
    """

    preview: PreviewConfig


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
        )
    )
