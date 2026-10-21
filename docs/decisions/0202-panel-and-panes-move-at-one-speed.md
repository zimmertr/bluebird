# 0202. The desk panel pushes the map's edge and the results panes open and close, at one speed both ways, with menus at a faster one

- Status: Accepted
- Date: 2026-10-20
- Decider: the maintainer (TJ), on issue #714, 2026-10-20: "there is an animation when closing the sidepanel... there's no animation for opening it, it just pops open. We should probably have the same animation in both directions... Same thing when switching from chart/table to both." And: "When you close it, it looks like the results panel immediately jumps to the full width of the web page, and then the side panel is momentarily painted on top and then it slides to the left. This feels glitchy. Then when you open it, it feels like it just instantly pops open, taking much less time than when it closes." Of the options put to him, "Two speeds, smooth panel." And on reviewing f70cc40 the same day: "is the Results Table/Chart using the same speed and whatnot as the others like the sidepanel close/open? Switching between Both/Table/Chart seems a bit janky/slow. And the chevron that opens/closes the entire results area seems near-instantaneous."
- Issues and PRs: #714, #759
- Cited in code as: #714
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `AppDrawer.tsx`, `MapStage.tsx` and `ResultsSheet.tsx`/`ResultsPanels.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useLayoutMotion.ts`, `usePaneMotion.ts` and `useRowFocus.ts`; [`docs/STYLES.md`](../STYLES.md), the `MOTION`, `DESK_PANEL`, `RESULTS_PANE` and `LAYOUT_HOLD` rows and Motion

## Context

The desk's controls panel was `absolute` and slid off over 300ms while shut, and `lg:static` with `lg:transition-none` while open, which came in with #25 and has no record. So a close took the panel's 360px out of the row in one frame: the map and the results widened at once, the panel was painted over the widened map, and only then slid away. An open snapped back in one frame. The Table, Chart and Both switch mounted and unmounted its panes in one frame too. TJ found the close glitchy, the open abrupt, and the two out of step with each other.

The first pass at the panes, at f70cc40, left three things. A press that showed a pane mounted its chart or its table in the press's commit, so nothing moved until the mount was done: at 946 rows that was 498ms for the chart and 719ms for the table before the first frame (2026-10-21). The chart-only legend came and went at the press, so Both to Chart and Chart to Table drew the chart again before or during the move. And the collapse chevron showed and hid the panes at once.

## Decision

- **Two speeds, each the same both ways.** A menu or a card fades and slides in 150ms (`MOTION.menu`). A panel, a sheet or a results pane moves in 300ms with the sheet's easing (`MOTION.slide`, `MOTION.push`, `MOTION.pane`, `PANEL_MS`), because it moves an edge the screen is laid out against. Each recipe names the one property it moves, so nothing a grip drags is ever animated, and every one drops to an instant change under a reduced-motion setting.
- **The desk panel pushes the map's edge** (`DESK_PANEL`). It stays in the row while it is shut, and its left margin goes from 0 to minus its own 360px and back. The map's column is the rest of the row, so it narrows and widens in the frames the panel moves in, its left edge on the panel's right edge in every frame, and nothing is painted over anything. `lg:transition-none` from #25 is gone. The panel is `inert` while shut, as before (#576).
- **A Table, Chart or Both press and the collapse chevron open and close the results panes at a desk** (`RESULTS_PANE`, `usePaneMotion`), one mechanism for both. Each pane is a frame with one grid row, `1fr` open and `0fr` shut, around a box of the pane's height. The chart's box holds to the results bar and the table's to the column's foot, so Table to Chart wipes the boundary down the column, and Table to Both lifts the bar off a table that stays where it stands. A grip's drag, a double press and a window's resize change the box under a row that stays `1fr`, so they move at once, under the pointer. A desk keeps the panels rendered while collapsed, so the chevron has frames to shut.
- **An opening pane mounts its body once its frame has opened.** At the press its frame opens around its grip and an empty box of the pane's height, and the chart or the table mounts at the frame's `transitionend`. The long commit lands after the move. A closing pane keeps its body at the height it had until its frame has shut, then unmounts it.
- **While a pane moves, a mounted body holds the size it was drawn at.** The chart and the table's scroller keep the height they had when the move began (`RESULTS_PANE.held`, `drawnPx`), the chart-only legend keeps the mode it was drawn for (`useHeldWhile`), and the box clips them. Each is drawn or laid out once, at the move's end, when `useLayoutMotion` lets go. The hold is the start size, so the press has nothing to draw. The end size would draw the chart once at the press and never at the end, and a draw at the press is the wait this change removes. The before column of Both to Chart measures that option, since f70cc40 drew the legend at the press: at 946 rows the press took 145ms to its first frame and the redraw swallowed the move.
- **While the layout moves, the map and the results hold one size** (`useLayoutMotion`, `LAYOUT_HOLD`), so a frame of the move shifts boxes rather than resizing the map's canvas or laying out the table again. The hold is worked out in the render that starts the move, as the difference between the layout asked for and the one the last move settled at, and let go at the move's `transitionend`. The map's box is the window's width while the panel moves and the window's height while a pane moves, centred on the map's column, which clips it. MapLibre keeps the centre on a resize, so the map shows what a true resize would at every size in between, and it is resized only where the box changes: at the start of a close, at the end of an open, and at both ends of a pane's move. While the panel moves, the table's box takes the window's width, so a close lays it out once at the start and an open once at the end, and the chart keeps the width it had and is drawn again once, at the end.
- **A phone keeps what it had.** The Controls sheet slides on `MOTION.slide` as before. The results sheet's panes and its collapse change at once, since the sheet's height feeds the map's bottom chrome through React on every change.
- **A row's press keeps one callback across a desk's collapse** (`useRowFocus`). The table stays mounted while its pane shuts, and the callback was keyed on the collapse, so the chevron's press drew all 946 rows again: 71ms of the first collapse's 114ms commit (2026-10-21). It is now keyed on whether a press lowers a phone's sheet first.

## Evidence

The panel, measured 2026-10-20 at 946 destinations and 1440x900 in the pinned Playwright image (v1.64.0), whose headless Chromium draws the map in software, on a 12-core host that other runs were sharing. A frame is the interval into each animation frame from the press until the layout stops moving. Before is `origin/main` at be9dede, five presses of each; after is this change, ten presses of each over two runs.

| Press | Before | After |
|---|---|---|
| Close, Table | one 63 to 92ms frame (median 77) laying the map and the table out at full width, then 19 frames of the panel sliding over the map, 360px of it under the panel | 8 frames. The first, where the map and the table take the new width, 42 to 100ms (median 51); every other frame 27 to 55ms (median 34). The panel's edge on the map's in every frame |
| Open, Table | one 73 to 89ms frame | 11 frames of 29 to 44ms, then the frame where the map and the table take their width, 25 to 78ms (median 46) |
| Close, Both | a 178 to 223ms frame for the chart, then the slide over the map | 6 frames. The first 42 to 106ms (median 60), the rest median 40; then the chart drawn once at its new width |
| Open, Both | one frame, then 158 to 209ms for the chart | 8 frames. The first median 50, the rest median 47; then the chart |

In a move at Table the one frame that can pass 50ms is the one where the map and the table are laid out at their new size, the work the old close did in its one long frame. At Both the frames around it pass 50ms in some presses too, up to 112ms, as the chart is laid out beside them.

What the hold changed, measured the same day, closing and opening at Table:

- The push with nothing held drew frames of 133 to 230ms: the map was resized and the table laid out again in every frame.
- With the map hidden its frames took 64 to 73ms, with the results hidden 49 to 69ms, and with both hidden 19ms. Moving the edge costs nothing; the map's resize and the table's layout were the whole bill.
- A pan of the map at a fixed size drew at 16 to 17ms a frame, longest 19 to 22ms.
- A layer of its own (`will-change: transform`) for the panel and the map's column, or for the panes' bodies, made every frame slower in this renderer.

The panes and the chevron, measured 2026-10-21 in the same image at 1440x900, at the 167-peak ring TJ uses and at 946 destinations, three presses of each, medians. Before is f70cc40, the first pass; after is this change. The commit is the press to the first frame. A frame moved if the map, the bar or a pane frame stood somewhere new in it, and the end's own frame, where a body mounts, unmounts or is drawn again, is left out of that count and reported below. Settled is the press to the last frame anything changed in.

At 167 destinations:

| Press | Commit (ms) | Frames that moved | Longest of them (ms) | Settled (ms) |
|---|---|---|---|---|
| Table to Both | 98 → 39 | 18 → 17 | 22 → 20 | 401 → 415 |
| Both to Table | 32 → 33 | 17 → 16 | 23 → 22 | 387 → 381 |
| Table to Chart | 111 → 36 | 12 → 14 | 29 → 33 | 406 → 421 |
| Chart to Both | 90 → 34 | 13 → 15 | 26 → 21 | 398 → 504 |
| Both to Chart | 38 → 42 | 13 → 9 | 33 → 37 | 358 → 432 |
| Chart to Table | 82 → 43 | 15 → 17 | 23 → 17 | 415 → 494 |
| Collapse | 84 → 38 | one jump → 15 | none → 33 | 84 → 383 |
| Expand | 134 → 31 | one jump → 18 | none → 22 | 134 → 441 |

At 946 destinations:

| Press | Commit (ms) | Frames that moved | Longest of them (ms) | Settled (ms) |
|---|---|---|---|---|
| Table to Both | 498 → 48 | 5 → 9 | 89 → 46 | 821 → 851 |
| Both to Table | 53 → 52 | 7 → 10 | 61 → 47 | 1,195 → 1,114 |
| Table to Chart | 664 → 50 | 12 → 7 | 39 → 45 | 960 → 895 |
| Chart to Both | 588 → 47 | 2 → 16 | 48 → 20 | 925 → 810 |
| Both to Chart | 145 → 51 | one jump → 7 | none → 60 | 500 → 614 |
| Chart to Table | 719 → 49 | one jump → 17 | none → 17 | 1,850 → 1,365 |
| Collapse | 944 → 51 | one jump → 5 | none → 91 | 944 → 1,054 |
| Expand | 1,621 → 32 | one jump → 17 | none → 22 | 1,621 → 1,067 |

Every press now commits in 31 to 52ms, and every move shows. The long work comes in the frame where the move ends: 15 to 166ms at 167 destinations and 67 to 1,029ms at 946, the most where Chart to Table mounts the table and unmounts the chart together. Chart to Both and Both to Chart draw the chart again one frame later, in 44 and 61ms at 167 and 162 and 160ms at 946. So the chevron, which settled in one jump, settles about 300ms later at 167 destinations. At 946 a frame that moves the table's own frame costs up to 109ms, most of it paint and pre-paint over the rows. A move beside a table that stays put costs about 22ms a frame, and one with no table mounted 16ms (traced 2026-10-21). Both columns draw the chart once a move, and the after column only once the move has ended.

The chevron's first pass at this change committed in 114ms at 946, 71ms of it the whole table drawn again: its rows' focus callback was keyed on the collapse (`useRowFocus`). Keyed on what a press does, the commit is 51ms.

## Alternatives rejected

- **The slide as it was, made symmetrical**: the panel sliding in and out over a map already at its final width. Something is still painted over the map for 300ms, which is what TJ called glitchy.
- **One speed for everything**: a menu that takes 300ms to open reads as slow next to the hand that opened it. A panel at 150ms reads as a jump. Material's motion durations split the same way, short ones for small surfaces and medium ones for larger areas such as sheets.
- **Animating the panel's width rather than its margin**: the panel's own column would reflow under its controls in every frame, and its content would wipe off its right edge rather than slide.
- **A transform on the panel and the map's column (a FLIP)**: the map lays out once at its final width, but a close shifts the map by half the panel's width in its first frame, as MapLibre keeps the centre, and an open needs the column wider than the room it has, which leaves a gap at the right edge.
- **Resizing the map once at the transition's end**: in between, the canvas stands at its old size inside a column that has moved, so a close shows a widening strip of page at the map's right edge and an open clips it.
- **A results pane animating its height in pixels**: the same property a grip drags, so a drag would trail the pointer unless every drag turned the transition off and back on. The grid row moves only on a press.
- **A layer of its own for each box while it moves** (`will-change: transform`): every frame measured was slower (Evidence).
- **Setting the hold with a state update while rendering**, React's pattern for state that follows a prop: React dropped the update after a move whose end came after the fallback, and the next close ran unheld, its map resized and blank in most frames (2026-10-20). The hold is derived instead, and a pane's life is set by its frame's end or an effect. The height a body keeps through a move (`useHeldWhile`) is still tracked while rendering, as a closing pane's height was: a dropped update there holds a height one render old.
- **`@starting-style` for the opening pane**: it would also animate the first results arriving, and it starts from the commit that mounts the body, so the mount would still come before the move.
- **Holding a moving body at the size its move ends at**: the chart would be drawn once, at the press, and the move would wait for it (Decision).
- **Mounting an opening pane's body at the press**, as the first pass did: at 946 rows the move waited 498ms behind the chart's mount and 719ms behind the table's (Evidence).

## Consequences

`styles.test.ts` pins the two speeds, 150ms and `PANEL_MS`, the one property each recipe moves, `motion-reduce:transition-none` on every one, the panel's margin against its own width, the panes' grid rows, and a box that clips the body it holds. `AppDrawer.test.tsx` holds the panel in the row while shut. `usePaneMotion.test.tsx` holds a pane's life: the body mounted once the frame has opened, kept until it has shut, and held at its drawn height while a pane moves. `useLayoutMotion.test.tsx` holds the hold's start and its release, the chevron's included. `ResultsPanels.test.tsx` holds a closing chart mounted at its height until its frame shuts, an opening one mounted only once its frame has opened, the chevron shutting both, and the legend and the chart's height held through a move. `ResultsSheet.test.tsx` keeps the panels at a desk while collapsed, and `useRowFocus.test.tsx` keeps one callback across a desk's collapse. `e2e/panelMotion.spec.ts` reads the live layout frame by frame: one computed duration both ways, the map's left edge on the panel's right edge in every frame of a close and an open, the panel 360px open and the map the window's width shut, the map's canvas resized at most once a move, after a move whose end came late too, the change instant under a reduced-motion setting, and the map's foot on the results' top in every frame of a Table to Both press and back and of the chevron both ways. It also holds an opening chart unmounted in every frame its pane moves, and the chart at one size through Both to Chart until the move ends and through Chart to Table until it goes. `e2e/deskCorner.spec.ts` waits out the close before it reads the corner.

The hold moves the cost to the ends of a move. A close resizes the map and lays the table out in its first frame and draws the chart once at its end. An open does all three at its end. For those 300ms the map's box is wider or taller than its column, which clips it, and the chart keeps the width it had, so a close leaves a strip of the pane's own surface beside it until the chart is drawn again. At a desk every control on the map stands in `MapCorner`, outside the map's box, so the hold moves none of them. A pane's mount and unmount move to the end of its move, so a press settles about 300ms later than it did when nothing moved, and at 946 destinations the end's one frame can take a second. A pane move resizes the map at both ends, as before: holding its box at the taller of the column's two heights would make that one resize, but needs the end height in pixels before the move starts. `MOTION.menu` is defined here for the menus' own change to wear.
