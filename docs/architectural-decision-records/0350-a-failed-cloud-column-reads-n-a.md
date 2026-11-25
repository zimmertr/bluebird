# 0350. A cloud column that fails reads N/A, and the run lands

- Status: Approved by the maintainer on 2026-11-25; accepted when the reliability PR merges. Amends 0121.
- Date: 2026-11-25
- Decider: the maintainer, on PR #1001 (2026-11-25: "Read N/A, run lands", and the message's wording approved the same day)
- Issues and PRs: #1001, #683
- Cited in code as: record 0350
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The cloud column is fetched with the weather"; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `clientAnalyze.ts`, `forecastReuse.ts`, `panelMessages.ts` and `unavailableCell.ts` bullets

## Context

Record 0121 made the cloud deck part of every analysis, and with it a cloud failure failed the analysis, as a weather failure does. The cloud column is a second Open-Meteo request per batch on the same forecast host, so every outage of that host had two chances to fail a run, and a run whose weather had landed was thrown away for one column. The reliability plan's goal (record 0339) is that no single failure stops an analysis, and a table with one empty column is a degraded success there, tracked as its own share.

## Decision

- In the browser, a cloud fetch that fails (anything but the run's own cancel) leaves every row it was fetching with no cloud deck, and the run commits. The weather and air quality are not aborted by it any more.
- The empty Cloud deck cells read `N/A`, the mark the freezing level and snow depth already wear for a number that was never available. A dry column reads the ceiling rather than null, so a null deck is never the weather's own answer.
- The Analyze button's messages carry `Cloud data unavailable. Try again later.`, a warning in the overlays' words, and it opens the list, because nothing else on screen says why one column is empty.
- A field whose cloud column failed is not reused by the next run, so the next Analyze asks for all of it again rather than carrying the gap forward. A cloud failure is rare enough that re-buying the weather costs less than tracking which rows still need a column.
- The run's report says `degraded` with the stage `cloud`.
- The pod's own analyze routes keep failing on a cloud failure: their response has no field to say a column is missing, and a new one would be a contract change for direct callers that nobody has asked for.

## Consequences

- An outage of the forecast host that the weather survives, through the hedge or the retry, no longer fails the run through its second request.
- A ranking on the cloud deck over a failed column ranks every row on nulls, last in either direction, which the message explains.
