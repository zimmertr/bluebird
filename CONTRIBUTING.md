# Contributing

Bluebird has one maintainer. A feature starts as an issue: open one and get a yes before you write code. A large unrequested pull request is likely to be declined, which wastes your time before it wastes mine.

If you do send a change:

- Both test suites run inside Docker, never on the host. The commands live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Run `ruff check backend/` from the repository root, not from `backend/`.
- Every behavior change ships with a test in the same PR.
- Frontend styling composes the roles in `frontend/src/styles.ts`. No component names its own color.
- A change to a route or a Pydantic model regenerates `backend/openapi.json` (`cd backend && python scripts/generate_openapi.py`). CI fails the PR otherwise.
- User-facing copy is approved by the maintainer before it ships.
