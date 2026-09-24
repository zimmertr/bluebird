# 0053. A snow depth at the file's ceiling prints as a bound, not a number

- Status: Accepted
- Date: 2026-09-22 (git: shipped in #463)
- Decider: TJ (git: author and merger of #463)
- Issues and PRs: #449, #463
- Cited in code as: #449
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/snowCeiling.ts` bullet

## Context

SNODAS stores depth as int16 millimetres, so 32,767 mm is all the file can hold. The model holds more over deep ice, and the file clips it.

## Decision

A depth at the ceiling, `SNOW_DEPTH_CEILING_IN = 1290.04`, prints as `≥1,290`, without a group separator in the downloaded file. The cell keeps its colour band, its Windy link and its rank, and ceiling rows tie. The API answers the plain number.

## Evidence

NOAA's own map service reported 68.62 m at Rainier's summit on 2026-09-16, where the tar read 32.77 m. 86 cells sat on the ceiling on 2026-09-22, Rainier, Baker and Adams among them.

## Alternatives rejected

- Printing the clipped number: a row there is not a measurement.
- Folding the mark into `unavailableCell.ts`: that module owns a number that was never available, and this one owns a number that was clipped.

## Consequences

The constant mirrors `snodas.SNOW_DEPTH_CEILING_IN` and is pinned by `mirrored_constants.json` (mirror row 24): the mark is honest only while both sides agree where the file stops.
