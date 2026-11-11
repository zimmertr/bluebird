# 0227. Every group of checkboxes selects a range on Shift+Click, and a test holds it

- Status: Accepted. Amends [0209](0209-shift-range-and-standing-reset.md): the range reaches the destination types, and every group to come.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on #801: "Shift+Click should ALWAYS work for ranges of checkboxes on bluebird. I've had you fix this in multiple other places already. Clicking on Peaks, then shift-clicking on Trailheads, should select Crags and Lakes too."
- Issues and PRs: #801
- Cited in code as: record 0209, #801
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `rangeSelect.ts`; [`docs/USAGE.md`](../USAGE.md), destination types

## Context

Record 0209 gave the Columns, Models, Layers and model lists a Shift range, and the table's chart column had its own (`useChartBox`). The Polygon search's destination types (Peaks, Crags, Lakes, Trailheads) had none, and nothing would have caught the next group to miss it.

## Decision

The destination types take a Shift range through `useShiftRange` and `shiftHeld`, over the types that can be ticked, in the row's order. Every group of checkboxes does the same: `rangeSelect.test.ts` reads every component as text and fails one that draws a checkbox without `useShiftRange` or `useChartBox`, unless it is named there with why it has no group (the table's one select-all box, and the Metrics table's radio buttons).

## Evidence

An audit of every component that draws a checkbox on main (0f121ea), 2026-10-22: the destination types were the only group without a range.

## Alternatives rejected

- **A lint rule**: a check on a file's imports would have to list every file, and a new one would be missed, which is the failure this record exists to stop. Reading every component as text needs no list.

## Consequences

`DestinationsSection.test.tsx` holds a Shift-click over the types in both directions.
