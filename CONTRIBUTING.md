# Contributing

Bluebird Forecast has one maintainer. For a large change, an issue first is a good idea: it lets the approach get discussed before you build it.

If you send a change:

- The test and lint commands live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Run `ruff check backend/` from the repository root, not from `backend/`, or it orders imports differently than CI, and at the version CI pins (`ruff==0.16.0`), because ruff's default rule set changes between releases.
- Every behavior change ships with a test in the same PR.
- A change to the weather or air-quality aggregation changes the backend first, regenerates `backend/tests/data/weather_vectors.json`, and mirrors the change in the TypeScript port. Both test suites read that one file, so CI fails the PR if either side no longer matches it.
- A change that touches what the first screen loads keeps the Lighthouse budgets in `.github/lighthouserc.js` green, and puts the before and after numbers on the PR.
- The page in `docs/` that owns the topic changes in the same PR. The table in `CLAUDE.md` says which page owns what.
- Frontend styling composes the roles in `frontend/src/styles.ts`. No component names its own color.
- A change to a route or a Pydantic model regenerates `backend/openapi.json` (`cd backend && python scripts/generate_openapi.py`) and the frontend types read off it (`cd frontend && npm run generate:api`). CI fails the PR otherwise.
