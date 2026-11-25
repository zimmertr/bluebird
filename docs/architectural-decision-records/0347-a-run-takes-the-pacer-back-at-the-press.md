# 0347. A run takes the pacer back at the press: the grid and the comparison stop, and a cancelled booking is released

- Status: Proposed, in the reliability PR; accepted when the maintainer approves it and merges it. Amends [0075](0075-pacer-sliding-window.md)
- Date: 2026-11-25
- Decider: proposed by the reliability plan's mitigation 5 (`docs/RELIABILITY.md`), for the maintainer (TJ)
- Issues and PRs: #1001; #337, #394 and #560 for the behaviour it builds on
- Cited in code as: record 0347
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `openMeteo.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useModelCompare.ts` and `useForecastGrid.ts` bullets

## Context

The analysis, the forecast grid and the model comparison all book on one weighted pacer and share the forecast host's four open requests (records 0075, 0203). The audit of main on 2026-11-25 found two ways that cost the next Analyze a wait it had not earned:

- The grid stopped only when the new run's first rows landed, which is after the run's first batch had already queued behind the grid's bookings. At its cap the grid is about 780 weighted calls on its own, more than a minute's budget, so a grid left on plus one compared model could hold the run's first batch for close to two minutes. The comparison did not stop at all until the new report committed.
- A booking was pushed before its batch slept and stayed when the sleep was aborted. After a Cancel or a failure, the next run waited behind calls that were never sent, up to about a minute.

## Decision

- The grid and the comparison read "a run is under way" from the press of Analyze (`arriving || loading` in `App.tsx`), not from the first rows. At the press the grid's fetch aborts as it did at the first rows, and the comparison aborts every batch in flight, forgets the pairs it had not answered so a run that is put back asks them again, and zeroes its counts in flight. What either already holds stays.
- `WeightedBudget.acquire` removes its own booking when the sleep before it is aborted, so a batch that never left gives its share back. A booking whose request went out stays booked, because Open-Meteo counts a request that was answered, or that failed after it arrived, like any other.

## Consequences

- A grid or comparison cut short at the press resumes when the run ends, at the cost of asking again for what had not landed.
- Rows with no elevation are still asked again on every retry, as the audit found, because the cache holds rows reduced at an elevation and not the raw column: holding raw columns for every such row would cost tens of megabytes on a full run. Not built; logged for the maintainer.
