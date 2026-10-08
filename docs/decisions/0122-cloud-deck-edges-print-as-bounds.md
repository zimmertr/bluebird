# 0122. A cloud deck at either edge of its walk prints as a bound

- Status: Accepted
- Date: 2026-10-08
- Decider: the maintainer, on #683 (2026-10-08: "I approve of the strings")
- Issues and PRs: #683, #684, #670
- Cited in code as: TJ, 2026-10-08
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `cloudDeckMark.ts` bullet

## Context

The cloud deck walks the column from 1000 hPa to 300 hPa ([0113](0113-cloud-deck.md)). Two of its readings are not heights. A column that never reaches 95 % humidity reads `CLOUD_DECK_CEILING_FT`, 30,066 ft, the standard height of 300 hPa. A saturated bottom level reads its own standard height, 364 ft, and the real deck is there or lower; under a mountain that level is below the ground and its humidity is the model's extrapolation. Once every report carried the deck ([0121](0121-cloud-deck-fetched-on-every-analysis.md)), the maintainer saw 30,066 and 364 across the table and asked whether they should print as bounds.

## Decision

A cloud deck value at the ceiling prints `≥30,000`, and one at the floor prints `≤364`, in the table, the marker popup, the downloaded file (ungrouped, `≥30000`) and the chart's tooltip. `cloudDeckMark` in `utils/cloudDeckMark.ts` is the one place that decides, and the three cloud columns' own `format` and `csv` call it, so every surface that reads a column prints the mark. The ranking, the bounds, the colour band, the Windy link and the API keep the plain number, the snow depth ceiling's rule ([0053](0053-snow-depth-ceiling.md)). The floor is derived from the mirrored level table, not typed. A value below 364 is a low destination's own 2 m point and prints as its number.

## Evidence

- Measured 2026-10-08 against Open-Meteo's GFS forecast for the next 72 hours: the 1000 hPa level reached 95 % in 10 hours at Mount Baker, 2 at Rainier and 4 at Snoqualmie Pass, each of which reads 364.
- 85 of 96 hours at Rainier were dry on 2026-10-06 ([0113](0113-cloud-deck.md)), so a window's Max reads the ceiling almost everywhere.

## Alternatives rejected

- `≤500` for the floor: a deck interpolated between 364 and 500 would print as a number beside rows claiming "500 or lower". The ceiling rounds because almost no deck lands in the 66 ft between 30,000 and 30,066.
- Printing the plain numbers: each states a measurement the walk never made.

## Consequences

The Avg column averages every hour, a ceiling hour at the ceiling's number, so a window clear for part of the day reports an Avg that is no single hour's height. That is settled: "Avg is avg, it should factor in ceiling hours" (the maintainer, 2026-10-08). The chart's axis keeps the plain number, because a tick is a scale mark rather than a reading.
