# 0307. A score with lenses ranks the field, and every metric stays a sortable column

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves the formula and merges it.
- Date: 2026-11-17
- Decider: the maintainer, 2026-11-17 ("Score, metrics as columns")
- Issues and PRs: #825
- Cited in code as: record 0307
- Guide: [`frontend/src/utils/score/CLAUDE.md`](../../frontend/src/utils/score/CLAUDE.md)

## Context

The ranking opened on air quality, the first row of the alphabetical Metrics table, and a reader who wanted "the best day out" had to pick one metric and hold the rest in their head. The from-scratch prototype ranked by one number built from the hours a hiker cares about, and the maintainer chose that, on the condition that no metric is lost: every one stays a column a reader can sort by, and the forecast bounds become limits.

## Decision

Each hour is scored from seven factors, each 0 to 1 and piecewise linear (sky from the summit against the cloud deck's base and top, wind, comfort, warmth, dry, air and fresh snow). The hour's score is 100 times their weighted geometric mean, each floored at 0.05, a factor with no answer left out and the rest renormalized. Five lenses weight the factors (Bluebird, Calm summit, Clean air, Fresh snow, Warmest). Only daylight hours count, at least 30 minutes of the hour between sunrise and sunset from NOAA's solar equations. A row's window score is 0.75 times its best run of four consecutive daylight hours in one solar day plus 0.25 times the mean of its daylight hours. The headline counts the places at 80 or better, or at the highest multiple of ten anything reached. The score's colour is one ramp, fog to bluebird, stretched over the field's own range from its 5th percentile to its best.

The score is computed in the browser over the held field, so changing the lens re-presents data already fetched and is a presentation knob like sort and limit (record 0003). It is never sent to or computed by the pod.

While a lens ranks, the markers wear the score too, the window's or, during playback, the hour's (`score_hours`), on the light ramp, because the map's ground ignores the theme. The legend keys it as `Score` and the table's arrow stands on the Score column. The forecast grid still paints the metric, which the score cannot be drawn across without each lattice point's daylight hours, so while it is on the legend keys it in the metric's own label under the score's. Each Score cell carries the row's hour strip: one bar per lit hour the score read, a gap where a night falls, and the best stretch drawn taller, hidden from a screen reader beside the number. The Score cells, their strips, the markers and the legend read one stretch, `scoreRange` over the rows the headline counts, and the legend's ticks are the field's own scores at the ramp's steps (`scoreScale`).

## Evidence

- The curves, weights and rules are the table in the PR body, for the maintainer's approval before merge.
- `utils/score/*.test.ts` pins every curve's points, each lens weighing to one, the almanac's sunrise and sunset at Seattle on both solstices within four minutes, and the window arithmetic.

## Alternatives rejected

- Rank by one metric, as before: the reader holds the other five in their head, which is the job the score does.
- An arithmetic mean of the factors: a calm, dry hour in the cloud would read two thirds good.
- The verdict ramp for the score: the colour is stretched over the field, so green would call the best of a wet week a good day.
