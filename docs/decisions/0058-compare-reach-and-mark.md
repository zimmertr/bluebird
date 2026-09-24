# 0058. A compared line runs to its own model's reach, with one mark per short row

- Status: Accepted
- Date: 2026-09-23 (git: the merge of #500). #509 moved the mark the same day.
- Decider: TJ (git: author and merger of #500)
- Issues and PRs: #232, #493, #500, #508, #509
- Cited in code as: #232, #493, #508
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/utils/modelCompare.ts` bullet, from "Nothing cuts a line to another model's reach"

## Context

Compared models reach different distances ahead. #232 clamped every line to the shortest reach.

## Decision

Nothing cuts a line to another model's reach. `compareEndMs` is a spend decision: each model is asked only for the hours it has. The chart draws each end inside the window as a dashed `ReferenceLine` in the axis colour, never red, with no hover entry. A compared row that ends inside the window carries one mark, on its Model cell (`NOAA HRRR*` in the file), and one fixed footnote that names no model. The ranking model never carries it, because the calendar clamps the window to its reach.

## Evidence

No dated measurement.

## Alternatives rejected

- #232's clamp: it hid the longer models' hours and left the table's ragged aggregates standing anyway. Reversed by #493.
- #493's `*` after every weather aggregate: it read as part of a monospace number and put up to twelve marks on one row. Replaced by #508.

## Consequences

The footnote follows the Model column on both surfaces: hide the column and its marks and note go too. The CSV writes `Forecast end (<model>)` rows in its metadata block. Only the far end moves, because `forecast_hours` counts hours ahead of now and history is not model-limited.
