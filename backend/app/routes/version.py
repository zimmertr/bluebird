from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.version import get_built_at, get_commit, get_version

router = APIRouter()


class VersionResponse(BaseModel):
    """Build identity of the running service."""

    version: str = Field(
        description='Semantic version of the running release, or "dev".',
        examples=["0.28.0"],
    )
    commit: str = Field(
        description='Git SHA the image was built from, or "dev".',
        examples=["bce6660f1a2b3c4d5e6f708192a3b4c5d6e7f809"],
    )
    built_at: str = Field(
        description='ISO 8601 UTC timestamp of the image build, or "dev".',
        examples=["2026-07-27T18:42:11Z"],
    )


@router.get(
    "/version",
    response_model=VersionResponse,
    tags=["metadata"],
    summary="Report the running build",
    description=(
        "Answers what release is actually live, without cross-referencing the "
        "GitHub release, the Docker Hub tag, and the manifests repo. Preview "
        "builds report `pr-<number>`. Local and Docker Compose builds report "
        "`dev` for every field, because nothing baked a real identity in."
    ),
)
async def version() -> VersionResponse:
    return VersionResponse(
        version=get_version(),
        commit=get_commit(),
        built_at=get_built_at(),
    )
