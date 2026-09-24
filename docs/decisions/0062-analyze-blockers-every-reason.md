# 0062. Analyze names every reason it is blocked, not the first

- Status: Accepted
- Date: 2026-07-31 (git: `analyzeBlockers` first appears in #225)
- Decider: TJ (git: author and merger of #225)
- Issues and PRs: #225
- Cited in code as: none
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/analyzeGate.ts` bullet

## Context

Several independent guards can block Analyze, among them an oversized polygon and a window the models cannot serve.

## Decision

`analyzeBlockers` returns every blocker, not the first. It is non-empty exactly when `canAnalyze` is false, over every combination of the flags, including ones the panel cannot produce, so the button can never go dead without saying why. Mid-analysis it returns nothing, because the button already says it is busy.

## Evidence

No measurement. A reader with both an oversized polygon and an unservable window fixed the polygon and was then met by a second sentence that had been true the whole time.

## Alternatives rejected

- Returning the first blocker: the guards are independent, so a second reason stayed hidden until the first was fixed.

## Consequences

Every blocker renders in the one notice block below the button (see [0028](0028-notices-below-analyze.md)). `commitNeeded` follows the same rule for a stale report: every reason, one bullet each (see [0003](0003-analyze-is-spend-boundary.md)).
