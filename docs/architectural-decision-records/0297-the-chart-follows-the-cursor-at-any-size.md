# 0297. The chart raises the line under the cursor at any size

- Status: Accepted. Supersedes the hover budget (`tracksCursor`, `CURSOR_POINT_BUDGET`, #213) and [0255](0255-chart-metrics-as-panels.md)'s rule that every drawn panel spends it
- Date: 2026-11-13
- Decider: the maintainer (TJ), on PR #921, 2026-11-13
- Issues and PRs: #921, #935, #213, #499, #828
- Cited in code as: #921
- Guide: [`frontend/src/utils/chart/CLAUDE.md`](../../frontend/src/utils/chart/CLAUDE.md), the `chartData.ts` bullet

## Context

Since #213 the chart stopped raising the nearest line and ordering the hover card by nearness once hours times charted lines passed 25,000 (`CURSOR_POINT_BUDGET`), with each drawn panel counted again (0255). The number was calibrated by the maintainer on 2026-07-31, when every line was an SVG path Recharts rebuilt from all its points on each hover. Since #828 (2026-10-30) the lines are drawn on a canvas, so that reason no longer held. The cut-off showed nothing when it applied, and the maintainer, ranking 100 peaks over two months for #849, read the missing emphasis as a fault.

## Decision

There is no budget. Every hover raises the nearest line and brings its row to the top of the card, whatever the window and the line count. With no cut-off there is no message to show.

## Evidence

Measured 2026-11-13 with the budget lifted, fake Open-Meteo answers and the built image, in the Playwright image's Chromium in Docker with no GPU: the median from a mouse move to the next frame, about 22 ms with almost nothing drawn.

| Lines | Window | Panels | Median | p90 |
|---|---|---|---|---|
| 5 | 2 days | 1 | 22 ms | 25 ms |
| 100 | 2 days | 1 | 22 ms | 29 ms |
| 100 | 15 days | 1 | 23 ms | 31 ms |
| 40 | 45 days | 1 | 25 ms | 30 ms |
| 100 | 45 days | 1 | 36 ms | 43 ms |
| 100 | 57 days | 1 | 37 ms | 41 ms |
| 100 | 57 days | 2 | 49 ms | 63 ms |
| 20 | 45 days | 1 | 83 ms | 90 ms |

The slowest case was one the old budget allowed (21,600 points): up to `CROWDED_PAST` lines are drawn wider, and a wide stroke over a long window is what costs the canvas, not the point count. The maintainer then judged the lifted build on a preview (#935) in Chrome on a Mac, desktop and phone, over 58 days: fast at 100 lines and at 20.

## Alternatives rejected

- A new budget counted on stroke width and path length: nothing measured on real hardware needs one.
- Redrawing only the hovered line on a layer of its own: worth doing if a slow device turns up, not before.
- A message when the emphasis is off: moot with no cut-off.

## Consequences

A very slow device may lag behind the pointer on a long window. If that is reported, the hovered-line layer above is the fix.
