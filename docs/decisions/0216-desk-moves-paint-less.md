# 0216. A desk's layout moves paint less: layers while the panel moves, and shut panes keep their bodies

- Status: Accepted. Amends [0202](0202-panel-and-panes-move-at-one-speed.md): a closing pane no longer unmounts its body once its frame has shut, and the chart-only legend no longer changes at the press.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on the review of PR #789. The report, 2026-10-22: "the animation that plays when updating the results from table or chart to both is really laggy and slow and not good when compared to other animations like opening and closing the side panel. Actually, opening the side panel appears kind of sloppy and choppy now too." On the build below: "the animations are much smoother now ... LGTM". The mechanisms are Claude's, measured below.
- Issues and PRs: #786, #789, #714, #759
- Cited in code as: #786
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `AppDrawer.tsx`, `MapStage.tsx` and `ResultsSheet.tsx`/`ResultsPanels.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `usePaneMotion.ts`; [`docs/STYLES.md`](../STYLES.md), the `RESULTS_PANE` and `LAYOUT_HOLD` rows and Motion; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), the render probe

## Context

Record 0202 moves the panel by its left margin and the panes by a grid row, so every frame of a move lays the page out and paints it again. Its holds keep the map, the table and the chart at one size, but anything that moves is still painted again where it now stands: the whole panel, and the table and the chart when the panel moves.

A pane press also built what it opened. Table to Both mounted the chart in the press's commit, Chart to Both mounted the table, and Both to Chart drew the chart again, because the chart-only legend arrived at the press and took height from the plot. The move could not start until that work was done.

The cost tracks load. On the maintainer's Mac at idle, main already drew every move in 30 to 33 of a 300 ms move's 36 frames at 120 Hz. With other work on the machine it drew a panel close in 9 to 12 and Chart to Both in 7 to 11, after 95 to 130 ms of nothing.

## Decision

- **While the panel moves, what moves with it stands on a layer of its own** (`LAYOUT_HOLD.layer`, `will-change: transform`): the panel, the map's column, the results and each pane's body of fixed height. A frame then shifts layers the GPU already holds rather than painting them again. Only while it moves, because a layer is a containing block for anything fixed inside it, and the table's column-drag ghost is. Not while the panes move: the table stands still on the screen then, the chart is cheap to paint where it now stands, and lifting both onto layers at the press painted them whole.
- **A shut pane keeps its body at a desk.** A body mounts the first time its pane is shown and stays mounted while the pane is shut, at the height it last had, `inert`, and drawing nothing new (`Held` in `ResultsPanels`, a memo that skips its children while held). A press opens a frame around a body already drawn, and a body that missed a change while shut draws once as it opens. A phone still mounts a pane only while it is shown.
- **The chart-only legend comes and goes where the panes stand still**, held through a pane move, so the chart is drawn again once the move has ended rather than in its first frame.

## Evidence

`frontend/e2e/perf/layoutMotion.spec.ts`, headless Chromium in Docker at 1440x900, a 200-row report with every line charted, main (818b6bd, three samples) against this change (five), dark theme, 2026-10-22. Paint is the main thread's painting across one move and the 900 ms after the press.

| Move | Main | This change |
|---|---|---|
| Panel close, painting | 195 ms | 34 ms |
| Panel open, painting | 220 ms | 35 ms |
| Table to Both, press to first moving frame | 120 ms, 75 of them mounting the chart (trace) | 54 ms |
| Chart to Both, press to first moving frame | 144 ms | 69 ms |
| Both to Chart, press to first moving frame | 103 ms | 76 ms |
| Both to Table, press to first moving frame | 46 ms | 70 ms (the `inert` restyle, 7 ms in a trace, and noise) |

At a quarter of the CPU (`CPU_SLOWDOWN=4`, three samples, dark): Table to Both started after 183 ms rather than 357, Chart to Both after 154 rather than 486, Both to Chart after 202 rather than 431, and the panel's open drew 13 frames rather than 5. Both to Table started after 185 ms rather than 131 in that run and 43 against 36 in the trace at full speed.

On the maintainer's Mac at idle, 62 rows, 120 Hz, five samples each: main and an earlier build of this change both drew every move in 30 to 33 of 36 frames, and Table to Both started after 34 ms against main's 50.

## Alternatives rejected

- **Move the panel and the panes by transform** (FLIP): a compositor move holds 120 Hz under any load, but the map's column holds overlays anchored to each of its edges and its centre, each of which would need its own counter-move, and the panel would cover the map as it slid where 0202 has the map's edge follow it.
- **Layers on every move, panes included**: the press painted the chart and the table whole; Both to Table started after 237 ms rather than 131 at a quarter of the CPU.
- **A layer on each pane's frame**: the table stands on its frame's foot, so its rows moved inside the growing layer and were painted again in every frame of Chart to Both.
- **Keep shut bodies drawing in the background** (React's `Activity`): the player's ticks would draw a hidden chart for nothing, and `display: none` throws away its layout, which revealing it pays back.

## Consequences

A desk holds the chart and the table in the page once each has been shown, so a theme switch restyles a shut one too. A sort, a cut or a removal made while a pane is shut is drawn when it opens, at the press, as before this change. The legend's arrival after Both to Chart shortens the plot once the move has ended.
