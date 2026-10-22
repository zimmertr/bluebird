# 0220. At a desk the results wear the panel's edge where they meet the map

- Status: Accepted
- Date: 2026-10-22
- Decider: the maintainer (TJ), on PR #796, asking why the panel had a line beside the results and the map's other edges had none; of the options put to him, "Add top edge".
- Issues and PRs: #795, #796
- Cited in code as: none; `ResultsBar.tsx` cites the record by number
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsSheet.tsx`/`ResultsBar.tsx` bullet; [`docs/STYLES.md`](../STYLES.md), `PANEL_EDGE`

## Context

The panel wears `PANEL_EDGE` down its right edge, where it meets the map and the docked results (#697, record 0128). The docked results had no edge along their top, so the map's column was edged on one side and not the other. In dark theme the change of tone from the slate bar to the pale map marks that edge anyway, but in light the bar (`#e1e6ee`) and the basemap are both pale, and the panel's mid-grey edge stood beside a top with only a faint step in tone.

## Decision

At a desk the results bar, the top of the docked results, wears `border-t` in `PANEL_EDGE`. A phone's sheet draws its own top and takes none.

## Evidence

The colours above, from `index.css`, 2026-10-22. The edge adds 1px to the bar, which `useResultsLayout` measures (`barRef`), so the map's floor counts it; the one-line estimate, `RESULTS_BAR_PX`, was measured at 35px and rounded up to 36, which still holds.

## Alternatives rejected

- **No line where the tone changes** (the map's edges as they were): it holds in dark and leaves light's pale bar against a pale map.

## Consequences

`ResultsBar.test.tsx` holds the edge at a desk and its absence in a sheet.
