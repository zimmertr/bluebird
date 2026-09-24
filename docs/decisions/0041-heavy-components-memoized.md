# 0041. The three heavy components are memoized

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #372), the day of the measurement
- Decider: TJ (git: author and merger of #372)
- Issues and PRs: #185, #337, #372
- Cited in code as: #185, #337
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "The three heavy components are memoized, and their props must stay stable"

## Context

`App.tsx` held about 50 pieces of state, and most of them cannot change what `ResultsTable`, `TimeSeriesChart` and `MapView` draw. Every popover, overlay toggle and timeline tick re-rendered a row per destination and a chart line per destination.

## Decision

The three are wrapped in `React.memo`, and their props must stay stable: no inline arrow and no `?? []` in their elements. The empty times array is the hoisted `NO_TIMES`, and every function prop is a `useCallback`.

## Evidence

Measured 2026-09-14 on a 946-destination analysis: an overlay toggle cost 1,982 ms of synchronous React work before and 277 ms after. At the default limit of 200 it went from 349 ms to 57 ms.

## Alternatives rejected

- No memo: the cost above.

## Consequences

The linter's `map-stage-memo-props` check reads `MapView`'s element in `MapStage.tsx`, and `results-panels-memo-props` reads the table's and the chart's in `ResultsPanels.tsx`. The remaining cost of a coordinates keystroke is recharts drawing one line per displayed row, which is #185's cascade.
