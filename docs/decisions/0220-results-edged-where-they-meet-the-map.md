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

At a desk the results bar, the top of the docked results, wears `border-t` in `PANEL_EDGE`. On neither side does it rule its foot, where the grip under it draws one. A phone's sheet draws its own top and takes no edge.

## Evidence

The colours above, from `index.css`, 2026-10-22. On the preview of PR #796 the bar first kept its foot's `border-frame` beside the new edge: a border colour sets every side, so the top rendered in the frame's `rgb(154,160,168)` rather than the edge's `rgb(114,120,127)`, and the foot stood on the grip's own top rule, a 2px line, at a desk and on a phone alike (`getComputedStyle`, light theme, 1389px and 500px wide, 2026-10-22). Moving the bar's one rule from its foot to its top keeps it 35px, so the one-line estimate, `RESULTS_BAR_PX` at 36, still holds.

## Alternatives rejected

- **No line where the tone changes** (the map's edges as they were): it holds in dark and leaves light's pale bar against a pale map.

## Consequences

`ResultsBar.test.tsx` holds the edge at a desk and its absence in a sheet.
