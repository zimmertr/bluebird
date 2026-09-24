# 0052. One N/A mark, with a cause that differs by metric

- Status: Accepted
- Date: 2026-09-22 (the guide: "TJ, 2026-09-22"; git: shipped in #463)
- Decider: TJ, as the guide records
- Issues and PRs: #295, #449, #463
- Cited in code as: #295, #449
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/unavailableCell.ts` bullet

## Context

Two metrics can be missing for a reason that is not the weather: the freezing level, because five of the eight models publish none (#295), and snow depth, because the destination is outside the SNODAS grid or the pod holds none. Three surfaces draw the mark: the table, the marker popup and the downloaded file.

## Decision

`unavailableCell.ts` owns one `N/A` mark and which columns can wear it. It does not own the cause, which differs: the freezing level's hover text names the models a reader can switch to, and snow depth carries none, because there is no remedy to name.

## Evidence

No measurement.

## Alternatives rejected

- The dash a missing hour gets: neither case is a gap in a series.
- A blank in the file: a spreadsheet has nothing beside it saying what a blank means.
- One cause text for both metrics.

## Consequences

The key list reads `FAMILY_KEYS`, so an aggregate added to either family cannot be marked in the table and missed here. A clipped number has its own mark: see [0053](0053-snow-depth-ceiling.md).
