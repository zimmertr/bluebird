# 0271. At a desk a press on Table, Chart or Both keeps the results' height

- Status: Accepted. Supersedes [0218](0218-chart-legend-is-a-pane.md) in part: its second Decision bullet, Chart sizing the chart the way Both does.
- Date: 2026-11-04
- Decider: the maintainer (TJ), on PR #851, 2026-11-04: "Can we also make sure that when we switch to Chart-only the vertical size of the results area doesn't change?" Asked whether for the tutorial alone or everywhere: "Everywhere. Lets fold it into this PR though." Told that this reverses record 0218's chart at one size in every mode: "Yes, area keeps its height". The remembered split, the legend measured inside the room and the hold while the panes move are Claude's, for review on the PR.
- Issues and PRs: #850, #851, #795, #789
- Cited in code as: #850
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsSheet.tsx`/`ResultsPanels.tsx` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `layout.ts`; [`docs/STYLES.md`](../STYLES.md), Motion; [`docs/USAGE.md`](../USAGE.md), Viewing the results

## Context

Record 0218 (2026-10-22) held the chart at one size in every mode at a desk. Chart kept the table's 120px floor free under the chart for the legend, so a press drew the chart at the same size. The results did change height, though. Both to Chart traded the chart's grip, the divider and the table for the legend: at the opening 220px panels the results stood 228px shorter less the legend's 39 to 71px, and the map grew by that much. Both to Table took the chart's 228px away. Testing the tutorial on PR #851, the maintainer asked for the results to keep their height when Chart is picked, and then for the rule to hold everywhere.

## Decision

- **At a desk a press on the segment keeps the results' height.** The panes stand in one room below the map's grip: the chart, the divider and the table in Both, the chart and its legend in Chart, the table in Table (`deskRoomPx` in `utils/layout.ts`). The mode pressed takes that room:
  - Both to Chart: the chart takes the chart, the divider and the table, and the legend opens inside that room. The legend is measured once it is laid out (`legendRef`), since its chips wrap by the names and the width, and its height comes out of the chart.
  - Both to Table: the table takes the room.
  - Chart to Table and Table to Chart: the same room carries over.
  - Chart to Both and Table to Both: the room less the divider is split the way Both last split it (`splitBoth`). Before Both has been left, that is its opening 220 and 220, in their ratio when the room differs.
  - Floors and the map's floor still apply through `resolvePanelHeights`, so a room at a panel's floor can grow when Both needs two.
- **The tutorial's Results and Chart cards switch the view the same way** (record 0267), since a step's view is the move a press makes.
- **Not a press:** the automatic widening to Both when a report lands opens Both at its split, the opening heights until Both is left, as before. The chevron, a grip and a window's resize are not presses either.
- **While a press's panes move, the results hold their height** (`roomHoldPx`), for `PANEL_MS`, and the panes move inside it, clipped. The opening pane is drawn at its end size from the press, as record 0202 has it, so the room it is handed overlaps the closing pane's until that has shut. The table's frame stands at the results' foot, so in a press to Both the gap between the panes closes from above as the chart's pane opens. The map does not move.
- **Heights stay session state.** The stored mode means what it meant: the mode a press chose.
- **A phone is unchanged.** Its sheet sizes its own panes.

## Evidence

Computed from the layout constants, not measured in a browser. At 1280x1000 Both opens at two 220px panels, a room of 448px with the divider. Chart then draws the chart at 448px less the legend, 409px over the tutorial's one row of chips (39px), and Table draws the table at 448. At 1280x720 Both stands at 166 and 120 under the 434px docked map floor, a room of 294.

`layout.test.ts` holds `deskRoomPx` and `splitBoth`. In `useResultsLayout.test.tsx`, "a desk's press on the segment" holds:
- the room handed to each mode and split back, the measured legend out of the chart, and a moved room shared in Both's last split
- the hold, for a press only, released after `PANEL_MS` and at once by the chevron
- no change while folded, and a phone left alone

In `frontend/e2e/panelMotion.spec.ts`, the browser suite's motion project, "the results keep one height through every press" reads the results' top in every frame of Both to Chart, Chart to Both, Both to Table and Table to Chart: one position throughout. It also holds that the chart is drawn taller in Chart and back at Both's size in Both. "A press on Both opens the chart pane at the panel speed, holding the map still" reads the map's foot in every frame.

## Alternatives rejected

- **Keeping record 0218's one chart size**: the results change height on every press, which is what the maintainer asked to stop.
- **A fixed room for the legend**, its 71px tallest strip: a one-row legend would leave 32px of blank strip under the chips, or the results would change height by the difference.
- **Panes that change at once on a press**: no overlap while they move, but record 0202's press motion would go, and a press would read as a cut.

## Consequences

A press now draws the chart again at its new size, which record 0218 had avoided. The opening pane stands at its end size from the press, so a press from Both to Chart shows the chart at full height at once, while the table and the legend move under it.
