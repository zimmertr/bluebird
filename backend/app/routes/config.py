import os

from fastapi import APIRouter

router = APIRouter()

# Runtime UI config surfaced to the pre-built SPA. Preview environments set these
# so the frontend can render a "you're on a preview" banner; production leaves
# them unset and the banner stays hidden.


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@router.get("/config")
async def config() -> dict:
    enabled = _truthy(os.environ.get("PREVIEW_BANNER"))
    return {
        "preview": {
            "enabled": enabled,
            "pr": os.environ.get("PREVIEW_PR") if enabled else None,
            "commit": os.environ.get("PREVIEW_COMMIT") if enabled else None,
        }
    }
