# 0188. Unused code is found on demand by Knip and Vulture, and every exception carries its reason

- Status: Accepted
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #688, 2026-10-17: option B, the tools in one pass, over the issue's recommended option C, the tools as CI gates.
- Issues and PRs: #688, #690, #772
- Cited in code as: #688
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), Coverage and unused code

## Context

`noUnusedLocals`, `no-unused-vars` and ruff's `F` rules see a name unused inside one file. None of them sees an export no module imports, a file nothing reaches, or a backend function, class or Pydantic field no caller reads. Unused code is a question about the import graph, and a person reading 280 files misses an export with one stale importer.

## Decision

- `make check-unused` runs Knip over `frontend/` and Vulture over `backend/app`, and fails on any finding.
- Knip lives in `frontend/tools/knip`, a package apart with its own lockfile, like the linter. It needs no TypeScript peer, but as a devDependency of the app every `npm ci` in the image build and the Frontend job would download it, and neither runs it. Dependabot bumps it on the same seven-day cooldown as the other npm entries.
- Vulture is pinned in `backend/requirements-dev.in`.
- Every deliberate exception sits beside its reason: `frontend/tools/knip/knip.jsonc` for the frontend, `backend/vulture_allowlist.py` for the backend, grouped under a comment per reason.
- Nothing runs it automatically. It is a check to run before a refactor lands.

## Evidence

Measured 2026-10-17 at f971335:

| Tool | Found | Outcome |
|---|---|---|
| Knip | 55 exported declarations that nothing outside their own file imports | `export` dropped; no code deleted |
| Knip | 2 dead re-exports, `constraintFields` from `clientAnalyze.ts` and `classifyWindow` from `urlState.ts` | removed |
| Knip | 32 exported assertion types in `api-compat.ts` | kept: exporting them is what keeps `tsc` from calling them unused |
| Vulture, 60% confidence | 168 names | 2 deleted (`SnapshotCache.snapshot_or_none`, `SnapshotCache.refreshes`); the rest allowlisted: 18 routes, 16 validators, about 120 Pydantic response fields read by serialization, logging and `HTMLParser` hooks, and test seams |

Review found more the tools could not: `SnapshotCache.clear`, the rate limiter's in-flight "0 disables it" mode, and branches no caller reaches. They went too.

## Alternatives rejected

- **A manual audit alone** (option A). A reader misses graph facts.
- **Knip and Vulture as CI gates** (option C, the issue's recommendation). The maintainer chose a run on demand.

## Consequences

Unused code returns at the rate it was created until someone runs the target. Vulture's allowlist carries line numbers that drift as files change. They are comments only, and `vulture app --make-whitelist` regenerates them. A Knip exception without a reason comment is a review finding, since nothing checks for the comment.
