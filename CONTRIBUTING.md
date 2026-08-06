# Contributing

Bluebird has one maintainer. A feature starts as an issue: open one and get a yes before you write code.

If you do send a change:

- The test and lint commands live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Run `ruff check backend/` from the repository root, not from `backend/`, or it orders imports differently than CI.
- Every behavior change ships with a test in the same PR.
- Frontend styling composes the roles in `frontend/src/styles.ts`. No component names its own color.
- A change to a route or a Pydantic model regenerates `backend/openapi.json` (`cd backend && python scripts/generate_openapi.py`). CI fails the PR otherwise.
