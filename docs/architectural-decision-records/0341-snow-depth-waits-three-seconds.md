# 0341. A finished table waits three seconds for the snow depth, then fills it in late

- Status: Proposed, in the reliability PR; accepted when the maintainer merges it.
- Date: 2026-11-25
- Decider: the maintainer, in the reliability plan's mitigation 4 ("snow depth given 3 s and filled in late")
- Issues and PRs: #849, #1001
- Cited in code as: record 0341
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `snowHistory.ts` and `clientAnalyze.ts`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useAnalyze.ts` and `useAnalysisReport.ts`; [`docs/RELIABILITY.md`](../RELIABILITY.md), Mitigations

## Context

`runClientAnalysis` asked `POST /api/snow-depth` beside the weather and then awaited it before the report committed. The request carries `API_DEADLINE_MS`, 110 s, so a pod that accepted the connection and never answered held a finished table for up to 110 s, for one column that is best effort and is not the default ranking (audit of main at 86e397f6, 2026-11-25).

## Decision

- Once the forecasts are in, the report waits at most `SNOW_DEPTH_WAIT_MS`, 3 s, for the snow depth. Past it the rows commit with the three snow depth columns at N/A.
- The answer still out comes back on `lateSnow`. When it lands, `useAnalyze` fills the committed rows and the held field through `useAnalysisReport.fill`, the same swap the elevation lookup's patch uses, with no new report and no sequence moved. The heights still waiting on the lookup stay waiting.
- A late answer that failed fills nothing, so the columns stay N/A, as an answer in time that failed always did. An answer that arrives after the next Analyze or a reset is dropped.
- An elevation patch built before the depth landed takes the landed depth across (`withSnowOf`), since the depth belongs to the coordinate and not the height.

## Evidence

- 2026-11-25: the pod answers the snow depth from its own database; the request starts with the weather, so it has landed long before the forecasts on every run measured. The 3 s bound is reached only by a pod that hangs.

## Consequences

- A ranking on snow depth over a run whose depth came late reorders once when it lands, the way a ranking on a height-read number does when the lookup lands (record 0114).
- A re-analysis inside the reuse window that starts before a late depth lands keeps the held rows at N/A, because reuse never asks the pod again for a held row.
