# 0334. The column retires the stacked desk

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Supersedes [0271](0271-desk-press-keeps-the-results-height.md) and [0220](0220-results-edged-where-they-meet-the-map.md), and [0202](0202-panel-and-panes-move-at-one-speed.md) and [0216](0216-desk-moves-paint-less.md) in part (the desk panel and the moves that ride it), [0226](0226-header-lockup-centred-tagline-italic.md) and [0229](0229-header-left-upright-no-the.md) in their header clauses (the panel's header went with it), and [0233](0233-a-failed-run-opens-its-messages.md) in part (a desk's shut panel opening again around a failure).
- Date: 2026-11-21
- Decider: the maintainer, through the from-scratch UI they asked for (#825), whose records [0312](0312-a-desk-stands-its-results-in-a-column.md), [0314](0314-the-sentence-bar-is-one-card.md) and [0321](0321-the-column-widens-over-the-map-for-every-column.md) left these standing until a pass could check each against the code; and on 2026-11-21, of the dead code that pass found: "Yes, Delete all dead code as part of this PR."
- Issues and PRs: #825
- Cited in code as: record 0334
- Guide: `frontend/src/components/CLAUDE.md` (`AppDrawer.tsx`, `ControlPanel.tsx`, `PanelFooter.tsx`); `frontend/src/hooks/CLAUDE.md` (`useLayoutMotion.ts`, `useOpenOnFailure.ts`, `useDrawer.ts`); `docs/STYLES.md` (Motion, `LAYOUT_HOLD`)

## Context

Record 0312 put a desk's results in a column down the map's right edge, 0314 put the controls in one card under the sentence bar, and 0321 moved the chart from under the map into the column widened over it. 0312 said five records described the stacked desk and would change status later. This record is that pass, checked against the code on 2026-11-21.

## Decision

- **0271 is superseded whole.** Its room below the map's grip, shared by the chart, the divider and the table, is gone with the panes under the map: `deskRoomPx`, `splitBoth` and `roomHoldPx` no longer exist. A desk's column holds the compact table at the column's height, and widened it holds every pane at the column's height (records 0320 and 0321).
- **0220 is superseded whole.** The results no longer meet the map along a top edge: the column meets it along its left, ruled by the column's own `border-l` (`RESULTS_COLUMN.column`).
- **0202 is superseded in part: the desk panel.** A desk opens each part of the controls as a card under the sentence bar (record 0314), so the docked panel that pushed the map's edge never opened, and it is removed: `AppDrawer` draws the card or nothing at a desk, and `DESK_PANEL`, `MOTION.push`, the panel's close button and the holds for its move (`LAYOUT_HOLD`'s `mapPush`, `table`, `chartClosing` and `chartOpening`) are gone. `useLayoutMotion` names one move, the panes'. The two speeds stand, and so do the pane frames, which open and close the panes inside the widened column (`RESULTS_PANE`, `usePaneMotion`).
- **0216 is superseded in part: the layers for the panel's move.** The moves it put on layers rode the desk panel, and `LAYOUT_HOLD.layer` is removed. A shut pane keeping its body still holds in the widened column.
- **0226 and 0229 are superseded in their header.** The panel's header, its logo, the name over "Weather Window Finder" and its round buttons, stood only in the docked panel, and `PANEL_HEADER` is removed. The sentence bar carries the logo and the name at a desk (record 0314), the Controls sheet its own head on a phone, and the welcome dialog keeps the tagline.
- **0233 is superseded in part: the shut panel.** A desk's list hangs from the sentence bar's button, which is always on the map, so there is no shut panel for a failure to open, and `useHeldFailure`, which held the count back while one moved, is removed. A failure still opens the list itself (`useOpenOnFailure`), and a refusal is still a blocker.
- **0218 stands.** The chart-only legend is still a pane between the chart's and the table's (`CHART_LEGEND`), now in the widened column.

## Consequences

- The dead code is removed in the same PR, with what only it reached: `ControlPanel`'s header and its desk footer, `PanelFooter`'s footer mode (it is the sentence bar's button alone, and a phone's sheet renders the document links itself), `BUTTON_FORECAST` (the bar wears `BUTTON_FORECAST_BAR`), `MESSAGE_BADGE.slot`, `useDrawer`'s desk start and `useOpenOnFailure`'s `enabled`. Knip and Vulture both report nothing unused afterwards (2026-11-21).
- The width sums in `styles.test.ts` that read the docked panel's 360px now read what stands: the desk card takes the sentence bar's width, and the results bar's words are held to the column's 420 to 640px and to the widened column at 1024.
- The results bar still wears `border-t` at a desk, where it now tops the column at the map's top edge.
