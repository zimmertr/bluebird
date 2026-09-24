# 0020. A destination within 10 miles of an active fire is flagged, and an unchecked one is never shown as clear

- Status: Accepted
- Date: 2026-08-17 (git: the merge of #275)
- Decider: TJ (git: author and merger of #275)
- Issues and PRs: #203, #256, #275
- Cited in code as: #203, #256, #275
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/utils/fireProximity.ts` bullet

## Context

A result near an active fire needs a flag, and a missing flag must never read as a clear check.

## Decision

A destination within 10 miles of an active fire perimeter is flagged (`FIRE_WARN_MILES`). The lookup runs once per analysis over the whole candidate field, keyed on `pointsKey`, and reads the coarse snapshot. It returns a status (`idle`, `loading`, `ready`, `unavailable`) and an `uncovered` key set. A destination outside WFIGS coverage reads `N/A` in the Wildfire (mi) column, distinct from the mark a cleared check leaves.

## Evidence

25 miles was tried in the #275 review and rejected as too wide. The coarse copy's ~56 m of simplification is 0.035 mi against the 10-mile threshold shown at 0.1 mi, at a thirteenth of the bytes.

## Alternatives rejected

- 25 miles: too wide.
- A lookup keyed on the displayed rows: a NIFC query for every knob change.
- One empty map for every failure: the feature's failure could not be told from its all-clear.

## Consequences

WFIGS is US only, and the server publishes its coverage outline on `/api/wildfires`. `FIRE_UNCOVERED_NOTE` and `FIRE_UNAVAILABLE_NOTE` separate the two causes of `N/A`. Since #203 `unavailable` is rare, because the snapshot is served past its refresh deadline: see [0007](0007-national-wildfire-snapshot.md).
