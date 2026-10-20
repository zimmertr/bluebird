# 0187. Coverage is a report run on demand, with no floor and no CI gate

- Status: Accepted
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #690, 2026-10-17: option A, a one-time run and triage, over the issue's recommended option B, a scheduled run. Mutation testing follows in its own pull request.
- Issues and PRs: #690, #688, #PRNUM
- Cited in code as: #690
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), Coverage and unused code

## Context

Neither suite ran a coverage tool, so nobody knew which modules no test reached. The issue grepped test files for module names and found 16 frontend modules no test named, but a parent component's test can still render a child, so a grep could not settle it. Coverage answers that question and no other: a test that runs a line and asserts nothing covers it.

## Decision

- `make coverage-frontend` runs Vitest with `@vitest/coverage-v8` and `make coverage-backend` runs pytest with `pytest-cov`, branches on. Each prints line and branch coverage per module and writes an HTML report.
- No threshold anywhere, and no workflow runs either target.
- Vitest serves every `?raw` import from a virtual module of its own (`rawAsText` in `frontend/vitest.config.ts`). V8 counted a source that a test read as text as loaded with no statements, and `branding.test.ts` reads every file under `src/` that way, so every module no test ran reported 0 of 0 lines and the totals came out high.
- The audit read every test against the report. Tests that asserted nothing were deleted, vague ones rewritten, and every gap the report showed got a test or a written reason.

## Evidence

Measured on the frontend at f971335 plus the tooling, 2026-10-17: about 97% of lines and 90.5% of branches before the `?raw` fix, 91.9% and 86.0% after it. The difference was the modules no test ran, each reported as 0 of 0.

Measured again at the audit's head, 2026-10-20, after the merge of #761:

| Suite | Lines | Branches |
|---|---|---|
| Frontend, Vitest | 94.8% (7,926 of 8,358) | 89.2% (6,017 of 6,748) |
| Backend, pytest without a database | 92.9% (4,534 of 4,878) | 90.7% (1,047 of 1,154) |
| Backend, leaving out `app/db/` and `app/services/places/` | 97.6% | 96.4% |

What the frontend report leaves unrun is `App.tsx` and `MapView.tsx`, which need MapLibre and a real canvas, so the browser suite runs them, plus the one-line page entries. What the backend report leaves low is the shared database: `make coverage-backend` runs with no database, so the tests marked `db` skip and `make test-backend-db` is what runs that code.

## Alternatives rejected

- **A scheduled workflow that publishes the reports** (option B, the issue's recommendation). A report nobody reads does nothing on its own, and the maintainer chose a run before work that needs it.
- **A gate on changed lines** (option C).
- **A coverage floor.** It rewards tests that run lines without asserting on them, which is the problem #690 exists to find.

## Consequences

Nothing enforces reading the report. `@vitest/coverage-v8` peers on Vitest's exact version, so Dependabot groups `vitest` and `@vitest/*` into one pull request. The reports land in `frontend/coverage/`, `backend/htmlcov/`, `backend/.coverage` and `backend/coverage.json`, which `.gitignore` and `.dockerignore` both leave out.
