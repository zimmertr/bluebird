# 0021. The browser path is the only path for the app

- Status: Accepted
- Date: 2026-08-21 (git: the merge of #277)
- Decider: TJ (git: author and merger of #277)
- Issues and PRs: #240, #277
- Cited in code as: #240
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The browser path is the only path"

## Context

The app had an SSE fallback that sent an analysis through the pod's shared Open-Meteo quota.

## Decision

The browser path is the only path the app takes. `universe` is null only before the first committed analysis, every knob is live over every committed report, and an unreachable Open-Meteo fails the analysis with its existing message instead of spending the shared budget.

## Evidence

No dated measurement.

## Alternatives rejected

- The server fallback: it spent the shared budget whenever the browser path failed.

## Consequences

`POST /api/analyze` and `/api/analyze/stream` remain for API callers: see [0025](0025-keyed-analyze-api.md).
