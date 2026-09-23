# Contributing

Bluebird Forecast has one maintainer. For a large change, an issue first is a good idea: it lets the approach get discussed before you build it.

If you send a change:

- Every check CI runs is a `make` target at the repository root (`make test-frontend`, `make test-backend`, `make lint-backend`, and the rest), and each one runs in Docker. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) lists them.
- Every behavior change ships with a test in the same PR.
- A change to the weather or air-quality aggregation changes `backend/app/services/aggregation.py` first, regenerates `backend/tests/data/weather_vectors.json`, and mirrors the change in the TypeScript port, `frontend/src/utils/openMeteoAggregate.ts`. Both test suites read that one file, so CI fails the PR if either side no longer matches it.
- A change that touches what the first screen loads keeps the Lighthouse budgets in `.github/lighthouserc.js` green, and puts the before and after numbers on the PR.
- The page in `docs/` that owns the topic changes in the same PR. The table in `CLAUDE.md` says which page owns what.
- Frontend styling composes the roles in `frontend/src/styles.ts`. No component names its own color.
- A change to a route or a Pydantic model regenerates `backend/openapi.json` (`cd backend && python scripts/generate_openapi.py`) and the frontend types read off it (`cd frontend && npm run generate:api`). CI fails the PR otherwise.
- A new source file under `frontend/src` or `backend/app` gets a line in the layout list beside it — `frontend/src/CLAUDE.md` or `backend/CLAUDE.md` — saying what it owns and why it is separate.
