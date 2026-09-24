# 0042. Each shared fixture is one file that both test suites read

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #398)
- Decider: TJ (git: author and merger of #398)
- Issues and PRs: #380, #398, #434
- Cited in code as: #380, #434
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Keep the aggregation vectors in lockstep" and "Keep the mirrored constants in lockstep"

## Context

The browser reimplements the backend's aggregation and shares numbers and one sentence with it. `N_VARIABLES` and the browser's variable list disagreed for a release, and each side read correctly on its own (#380, in the guide's mirrors section).

## Decision

Each shared fixture is one file under `backend/tests/data/` that both suites read: `weather_vectors.json` for the aggregation, and `mirrored_constants.json` for bare numbers and the one shared sentence. The browser's suite imports them by relative path. A formula belongs in the vectors, which exercise it.

## Evidence

The #380 drift. No dated measurement.

## Alternatives rejected

- A copy for each side, diffed by a CI job.

## Consequences

The Vitest container mounts the repo root, not `frontend/` alone. `npm run build` typechecks through `frontend/tsconfig.build.json`, which leaves the tests out, because the image's build context does not carry the fixture. Pytest fails a stale file, and Vitest fails a drifted port or value.
