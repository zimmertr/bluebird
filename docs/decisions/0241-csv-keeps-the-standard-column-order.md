# 0241. Every CSV has the same columns in the same order

- Status: Accepted; amends 0037
- Date: 2026-10-29
- Decider: the maintainer (TJ), after PR #824
- Issues and PRs: #824
- Cited in code as: none
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `tableColumns.ts` and `exportCsv.ts` bullets; [`frontend/src/utils/results/CLAUDE.md`](../../frontend/src/utils/results/CLAUDE.md), `resultsCsv.ts`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useTableView.ts`; [`USAGE.md`](../USAGE.md), Columns can be moved and Downloading the Table

## Context

The downloaded CSV followed the screen. It took the reader's dragged order, dropped the Wildfire and Closure columns while hidden or before their checks answered, carried Model only while comparing, and collapsed a single-hour window to one column per metric. Two files of the same kind of report could carry different columns in different places.

## Decision

Every file carries every column a window has, in the standard order: `Rank`, Name, Model, Type, Elevation, the ranked family, the other families with every aggregate, Wildfire, Closure. Nothing on screen changes it: not visibility, not a dragged order, not a phone's order (record 0239), not a single-hour window, which repeats its one value under each aggregate. Model names the analysis's own model when nothing is compared. A flag check that has not answered writes `N/A` in every ranked row, never a blank, which would read as checked and clear. Rows still follow the table's sort.

## Evidence

No measurement. A file is read by scripts and spreadsheets, which find a column by its place or its name; one header for every file serves them better than one that mirrors a screen. The linter's `export-csv-fire-gate` and `export-csv-closure-gate`, which enforced the old visibility rule, are removed.

## Alternatives rejected

- The file following the screen, as since #125: two downloads could differ.
- Leaving a flag column out until its check answers (#256): it kept a blank from reading as clear, which `N/A` does too, without changing the header.
- Keeping the single-hour collapse: files from an hour and from a window would differ.
