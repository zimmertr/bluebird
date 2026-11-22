# 0334. The column retires the stacked desk

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Supersedes [0271](0271-desk-press-keeps-the-results-height.md) and [0220](0220-results-edged-where-they-meet-the-map.md), and [0202](0202-panel-and-panes-move-at-one-speed.md) and [0216](0216-desk-moves-paint-less.md) in part (the desk panel and the moves that ride it).
- Date: 2026-11-21
- Decider: the maintainer, through the from-scratch UI they asked for (#825), whose records [0312](0312-a-desk-stands-its-results-in-a-column.md), [0314](0314-the-sentence-bar-is-one-card.md) and [0321](0321-the-column-widens-over-the-map-for-every-column.md) left these standing until a pass could check each against the code
- Issues and PRs: #825
- Cited in code as: record 0334
- Guide: `frontend/src/components/CLAUDE.md` (`AppDrawer.tsx`); `docs/STYLES.md` (`DESK_PANEL`)

## Context

Record 0312 put a desk's results in a column down the map's right edge, 0314 put the controls in one card under the sentence bar, and 0321 moved the chart from under the map into the column widened over it. 0312 said five records described the stacked desk and would change status later. This record is that pass, checked against the code on 2026-11-21.

## Decision

- **0271 is superseded whole.** Its room below the map's grip, shared by the chart, the divider and the table, is gone with the panes under the map: `deskRoomPx`, `splitBoth` and `roomHoldPx` no longer exist. A desk's column holds the compact table at the column's height, and widened it holds every pane at the column's height (records 0320 and 0321).
- **0220 is superseded whole.** The results no longer meet the map along a top edge: the column meets it along its left, ruled by the column's own `border-l` (`RESULTS_COLUMN.column`).
- **0202 is superseded in part: the desk panel.** A desk opens each part of the controls as a card under the sentence bar (record 0314), so the docked panel that pushed the map's edge never opens: `AppDrawer` is always handed a card at a desk, and its docked branch and `DESK_PANEL` are unreachable. The two speeds stand, and so do the pane frames, which open and close the panes inside the widened column (`RESULTS_PANE`, `usePaneMotion`).
- **0216 is superseded in part: the layers for the panel's move.** The moves it put on layers rode the desk panel. A shut pane keeping its body still holds in the widened column.
- **0218 stands.** The chart-only legend is still a pane between the chart's and the table's (`CHART_LEGEND`), now in the widened column.

## Consequences

- The docked branch of `AppDrawer`, `DESK_PANEL` and the tests that pin them are dead code. Removing them is a cleanup for review: the width sums in `styles.test.ts` that read the panel's 360px also stand for the cards, which share the width.
- The results bar still wears `border-t` at a desk, where it now tops the column at the map's top edge.
