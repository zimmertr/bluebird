# 0037. A change to Rank by discards the reader's column order

- Status: Accepted
- Date: 2026-09-14 (the guide: "TJ chose to let ranking win (2026-09-14)"; git: shipped in #358)
- Decider: TJ, as the guide records
- Issues and PRs: #358
- Cited in code as: none
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/utils/tableColumns.ts` bullet, from "`applyColumnOrder`"

## Context

A reader can reorder the results columns. A ranking lifts its own metric group to the front.

## Decision

A change to Rank by discards the reader's column order. The order is stored under `bluebird_forecast_view.columnOrder` and is not in the URL. The CSV follows the screen.

## Evidence

No measurement.

## Alternatives rejected

- Keeping the reader's order over a new ranking: TJ chose to let ranking win.
- The order in the URL: a shared link opens in the standard order.

## Consequences

A `rankedOnce` ref guards the discard, because the effect that watches `sortBy` also fires on mount and was wiping a stored order on every page load.
