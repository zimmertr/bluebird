# 0042. Each shared fixture is one file that both test suites read

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 69

- **Keep the aggregation vectors in lockstep.** The browser reimplements the backend's weather/AQI aggregation (`frontend/src/utils/openMeteoAggregate.ts` ↔ `backend/app/services/aggregation.py`; `openMeteoAggregate.test.ts` holds them to the same functions in the same order), pinned by shared vectors. Any semantic change there: change the backend first, run `cd backend && python scripts/generate_weather_vectors.py`, and mirror the change in the TypeScript port. Pytest fails on a stale `backend/tests/data/weather_vectors.json` and Vitest fails on a drifted port. **There is ONE file, not a copy per side** — the browser's suite imports it by relative path out of `backend/tests/data/`, so nothing can drift and no CI job diffs anything. What that costs is a mount: the Vitest container takes the repo root rather than `frontend/` alone (`docs/DEVELOPMENT.md`), and `npm run build` typechecks through `frontend/tsconfig.build.json`, which leaves the test files out because the image's build context carries `frontend/` and not the fixture.

## From `CLAUDE.md`, line 70

- **Keep the mirrored constants in lockstep.** A vector pins an aggregation; it cannot pin a bare number or a shared sentence. Those ride `backend/tests/data/mirrored_constants.json`, written by `backend/scripts/generate_mirrored_constants.py` and read by both suites from there, the way the vectors are. Change a listed value on the backend, then run `cd backend && python scripts/generate_mirrored_constants.py` and move the browser's half. `test_mirrored_constants.py` fails on a stale manifest and `mirroredConstants.test.ts` fails on a browser value that no longer matches it. Adding a mirrored value means adding it to the script and to that test, and adding its row to the table below. The manifest holds values and the one shared sentence only: a formula belongs in the vectors, which exercise it (#380).
