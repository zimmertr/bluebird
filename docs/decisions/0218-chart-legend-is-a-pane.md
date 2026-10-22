# 0218. At a desk the chart's legend is a pane of its own, and the chart keeps one size in every mode

- Status: Accepted. Amends [0216](0216-desk-moves-paint-less.md): the chart-only legend is no longer held through a pane move.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on PR #789, of three options mocked up on the real build: "Lets try #1 first".
- Issues and PRs: #795
- Cited in code as: #795
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsSheet.tsx`/`ResultsPanels.tsx` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `layout.ts`; [`docs/STYLES.md`](../STYLES.md), the `CHART_LEGEND` row and Motion

## Context

The chart-only legend stood in the chart's box and took its 39 to 71px from the plot, so the chart was drawn at a new height whenever it came or went. Record 0216 held it through a pane move, so the redraw came once the move had ended. TJ, 2026-10-22: from Chart to Both the legend rose with the chart and vanished at the top, and from Both to Chart it popped in from the bottom and compressed the chart, "disjointed and chaotic" next to the side panel, where nothing changes size while the panel moves.

The chart's height also differed between the two modes on a short column. Both keeps the table's floor under the chart and Chart did not, so at 1280x720 Both stood the chart at 150px and Chart at its 220px default.

## Decision

- At a desk the legend is a results pane of its own between the chart's and the table's (`CHART_LEGEND`), held to the foot like the table, open in Chart alone, kept mounted and inert while shut. Chart to Both shuts it as the table opens, at the panes' speed.
- At a desk Chart sizes the chart the way Both does: it keeps the table's floor (`PANEL_FLOOR_PX`, 120px) free under the chart, at rest and as a drag's ceiling, and the legend opens inside that room. The map keeps what the legend leaves.
- A phone keeps the legend in the chart's box. Its panes change at once and its Chart fills the sheet.

## Evidence

`frontend/e2e/panelMotion.spec.ts`, "the chart keeps one size through every press", reads the chart's drawn size in every frame of Both to Chart, Chart to Both, Table to Chart and Chart to Table at 1280x720: one size throughout, with the legend's frame part open in moving frames. It passed locally in the pinned Playwright image on 2026-10-22.

The legend's tallest strip is 71px (two rows of 26px chips, their 6px gap, 6px of padding above and below, a 1px edge), inside the table's 120px floor. `styles.test.ts` sums it from the role's classes.

## Alternatives rejected

- **The legend in Both too**: nothing changes between modes, but in Both it repeats the table's checkbox column and takes plot height there.
- **The legend floating over the plot's foot**: it takes no height and could fade with the move, but it covers the bottom of the plot and the time axis, and something inside the chart still changes during a move.
- **Holding the legend until the panes stand still** (record 0216): the redraw it saved at the press came at the end instead.

## Consequences

In Chart at a desk the chart's drag stops 120px short of where it used to, the room Both keeps for the table. A chart dragged to that ceiling in Chart stands at the same height in Both.
