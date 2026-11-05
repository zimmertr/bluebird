# 0205. The retrieval heading carries the percentage, and the pace line is written like the legend's wait

- Status: Accepted
- Date: 2026-10-21
- Decider: the maintainer (TJ), reviewing PR #784's preview on 2026-10-21
- Issues and PRs: #784, #394 (the pacer's countdown owned once), #783
- Cited in code as: record 0205, in `utils/analyzeOverlay.ts`, `utils/pacing.ts` and `components/AnalysisOverlay.tsx`
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `usePacedFetch.ts` + `pacing.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeOverlay.ts` bullet; [`docs/USAGE.md`](../USAGE.md), What happens when you analyze

## Context

Analyzing a 3,729 km² ring on PR #784's preview, the maintainer watched `Retrieving 635 forecasts…` over `Open-Meteo quota: resuming in 35s` and a bar at 31 % for three minutes, and asked whether the line could say how many forecasts a minute Open-Meteo allows. The rate is derivable: the pacer spends 550 weighted calls a minute (record 0075), and a destination costs 2.6 of them at a window up to 14 days (weather 1.6, cloud 1) and 2.86 at 16 days, so about 210 forecasts a minute at Current and about 190 at the longest window.

The overlay card is 280px wide with 24px of padding a side, 230px for text, on every device. Measured on 2026-10-21 in Chrome on the maintainer's Mac, in the card itself with the roles it uses (`PROSE.heading` at 14px, `TEXT.caption` at 12px):

| Line | Role | Width | Lines |
|---|---|---|---|
| `Retrieving 635 forecasts…` (before) | heading | 179px | 1 |
| `Retrieving 635 forecasts · 31% Complete` | heading | 276px | 2 |
| `Retrieving 635 forecasts · 31%` | heading | 207px | 1 |
| `Retrieving 1500 forecasts · 100%` (the cap) | heading | 224px | 1 |
| `Open-Meteo quota: resuming in 35s` (before) | caption | 205px | 1 |
| `Open-Meteo quota: about 210 forecasts a minute, resuming in 35s` | caption | 375px | 2 |
| `Open-Meteo Rate Limiting · resuming in 35s.` | caption | 253px | 2 |
| `210 forecasts/min · resuming in 35s` | caption | 201px | 1 |
| `Open-Meteo quota · resuming in 35s` | caption | 208px | 1 |
| `About 210 forecasts a minute.` | caption | 169px | 1 |

## Decision

The maintainer chose two lines that each fit, and left the rate out:

- The retrieval heading carries the count and the percentage landed: `Retrieving 635 forecasts · 31%`, and `Retrieving forecast · 0%` for exactly one. The bar under it draws the same percentage, and the mono percentage that stood under the bar is gone. The tail labels (`Retrieving air quality…`, `Retrieving cloud data…`, `Retrieving elevation…`) and the gap label `Retrieving forecasts…` do not change, and `Elapsed Ns` still stands under the indeterminate bar of a search.
- The pace line is `Open-Meteo quota · resuming in 35s`, with the dot the forecast grid's legend already uses for `Waiting · 45s`. `paceWaitLine` in `pacing.ts` is still the one spelling, so the model comparison's line changes with it.

## Alternatives rejected

- The rate in the line, `Open-Meteo quota: about 210 forecasts a minute, resuming in 35s`, which the maintainer first picked: 375px, two lines in the card.
- `210 forecasts/min · resuming in 35s`, one line at 201px. The maintainer dropped the rate once the two-line layout above was on the table.
- A second caption, `About 210 forecasts a minute.`, under the countdown. Fits, but adds a third line of text to the card.
- Widening the card. One line with the rate needs about 400px, more than a phone offers.

## Consequences

`analyzeOverlay.test.ts` pins the heading with its percentage, `pacing.test.ts` and `ModelCompare.test.tsx` the one wait line, and `AnalysisOverlay.test.tsx` that the percentage is printed once, in the heading. The pod's own stream line, `Open-Meteo quota: resuming in about 34s` in `routes/analyze/phases.py`, is the API's and does not change. The number the maintainer asked for is not shown anywhere; this record keeps how to derive it.
