import os

# Build identity, baked into the image by the Dockerfile's ARG->ENV block, which
# release.yml and pr-preview.yml populate. Nothing else sets these, so a local
# `uvicorn` run or a plain `docker compose up` honestly reports "dev" instead of
# impersonating a release.
#
# Read per call rather than into module constants so tests can drive them with
# monkeypatch.setenv without reimporting the app.

DEV = "dev"


def _env(name: str) -> str:
    # `or DEV` rather than a dict default: a workflow expression that resolves to
    # nothing passes an empty string, not an absent variable, and an empty
    # version is worse than an honest "dev".
    return os.environ.get(name) or DEV


def get_version() -> str:
    """Semantic version of the running build, or "dev" outside a release image."""
    return _env("APP_VERSION")


def get_commit() -> str:
    """Git SHA the running build came from, or "dev"."""
    return _env("APP_COMMIT")


def get_built_at() -> str:
    """ISO 8601 UTC build timestamp, or "dev"."""
    return _env("APP_BUILT_AT")
