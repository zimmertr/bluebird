# 0202. The desk panel pushes the map's edge and the results panes open and close, at one speed both ways, with menus at a faster one

- Status: Accepted
- Date: 2026-10-20
- Decider: the maintainer (TJ), on issue #714, 2026-10-20: "there is an animation when closing the sidepanel... there's no animation for opening it, it just pops open. We should probably have the same animation in both directions... Same thing when switching from chart/table to both." And: "When you close it, it looks like the results panel immediately jumps to the full width of the web page, and then the side panel is momentarily painted on top and then it slides to the left. This feels glitchy. Then when you open it, it feels like it just instantly pops open, taking much less time than when it closes." Of the options put to him, "Two speeds, smooth panel." And on reviewing f70cc40 the same day: "is the Results Table/Chart using the same speed and whatnot as the others like the sidepanel close/open? Switching between Both/Table/Chart seems a bit janky/slow. And the chevron that opens/closes the entire results area seems near-instantaneous." And on reviewing 7b3e455, 2026-10-21: "when opening, it opens to full height first, and then the results chart/table pops in. So in the middle of that sequence you can see the results area, but both panes are empty/blank. The data should be shown as the results area is growing. And shrinking, if it's not already. This also happens when you switch from Table or Chart to Both. The table/chart pane pops up, and then the data appears after. I think the data should be there as it extends up." And on the trace of a row centred inside the first report's move, 2026-10-21: "Fix on this PR."
- Issues and PRs: #714, #759
- Cited in code as: #714
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `AppDrawer.tsx`, `MapStage.tsx`, `MapView.tsx` and `ResultsSheet.tsx`/`ResultsPanels.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useLayoutMotion.ts`, `usePaneMotion.ts` and `useRowFocus.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `centring.ts`; [`docs/STYLES.md`](../STYLES.md), the `MOTION`, `DESK_PANEL`, `RESULTS_PANE` and `LAYOUT_HOLD` rows and Motion

## Context

The desk's controls panel was `absolute` and slid off over 300ms while shut, and `lg:static` with `lg:transition-none` while open, which came in with #25 and has no record. So a close took the panel's 360px out of the row in one frame: the map and the results widened at once, the panel was painted over the widened map, and only then slid away. An open snapped back in one frame. The Table, Chart and Both switch mounted and unmounted its panes in one frame too. TJ found the close glitchy, the open abrupt, and the two out of step with each other.

The first pass at the panes, at f70cc40, left three things. A press that showed a pane mounted its chart or its table in the press's commit, so nothing moved until the mount was done: at 946 rows that was 498ms for the chart and 719ms for the table before the first frame (2026-10-21). The chart-only legend came and went at the press, so Both to Chart and Chart to Table drew the chart again before or during the move. And the collapse chevron showed and hid the panes at once.

The second pass, at 7b3e455, moved the chevron and took the mount out of the press: an opening pane opened around an empty box and mounted its chart or its table once its frame had opened. Every press then committed in about 50ms, but the pane grew blank and its data popped in at the end, which TJ rejected in the words above. He chose the press's commit over the blank pane.

## Decision

- **Two speeds, each the same both ways.** A menu or a card fades and slides in 150ms (`MOTION.menu`). A panel, a sheet or a results pane moves in 300ms with the sheet's easing (`MOTION.slide`, `MOTION.push`, `MOTION.pane`, `PANEL_MS`), because it moves an edge the screen is laid out against. Each recipe names the one property it moves, so nothing a grip drags is ever animated, and every one drops to an instant change under a reduced-motion setting.
- **The desk panel pushes the map's edge** (`DESK_PANEL`). It stays in the row while it is shut, and its left margin goes from 0 to minus its own 360px and back. The map's column is the rest of the row, so it narrows and widens in the frames the panel moves in, its left edge on the panel's right edge in every frame, and nothing is painted over anything. `lg:transition-none` from #25 is gone. The panel is `inert` while shut, as before (#576).
- **A Table, Chart or Both press and the collapse chevron open and close the results panes at a desk** (`RESULTS_PANE`, `usePaneMotion`), one mechanism for both. Each pane is a frame with one grid row, `1fr` open and `0fr` shut, around a body that keeps its own height. The chart's body holds to the results bar and the table's to the column's foot, so the chart comes down from the bar and the table up from the foot: Table to Chart wipes the boundary down the column, and Table to Both lifts the bar off a table that stays where it stands. A grip's drag, a double press and a window's resize change the body under a row that stays `1fr`, so they move at once, under the pointer. A desk keeps the panels rendered while collapsed, so the chevron has frames to shut.
- **An opening pane mounts its body at the press, at its end size.** The chart or the table mounts in the press's commit at the height `useResultsLayout` gives the mode pressed, and the frame uncovers it as it opens, so the data is on screen the whole way. A chart that stays open takes its end size at the press too, the chart-only legend included, so a press draws the chart once, at its final size, and nothing is drawn again when the move ends. The press's commit is the cost, and TJ chose it over a blank pane.
- **A closing pane keeps its body as it was until its frame has shut**, then unmounts it. This is the one place a pane move holds a body at the size it had when the move began, because a closing pane has no end size: its height, and for the chart the legend it was drawn with (`useHeldWhile`), so the chart is not drawn again as it goes.
- **While the layout moves, the map and the results hold one size** (`useLayoutMotion`, `LAYOUT_HOLD`), so a frame of the move shifts boxes rather than resizing the map's canvas or laying out the table again. The hold is worked out in the render that starts the move, as the difference between the layout asked for and the one the last move settled at, and let go at the move's `transitionend`. The map's box is the window's width while the panel moves and the window's height while a pane moves, centred on the map's column, which clips it. MapLibre keeps the centre on a resize, so the map shows what a true resize would at every size in between, and it is resized only where the box changes: at the start of a close, at the end of an open, and at both ends of a pane's move. While the panel moves, the table's box takes the window's width, so a close lays it out once at the start and an open once at the end, and the chart keeps the width it had and is drawn again once, at the end.
- **A phone keeps what it had.** The Controls sheet slides on `MOTION.slide` as before. The results sheet's panes and its collapse change at once, since the sheet's height feeds the map's bottom chrome through React on every change.
- **A row's press keeps one callback across a desk's collapse** (`useRowFocus`). The table stays mounted while its pane shuts, and the callback was keyed on the collapse, so the chevron's press drew all 946 rows again: 71ms of the first collapse's 114ms commit (2026-10-21). It is now keyed on whether a press lowers a phone's sheet first.
- **A row's centring flies again where the map is resized under it** (`map/centring.ts`). `flyTo` fixes its target's pixel in the canvas when it starts. The hold's box is centred on the column, so the resize at a move's end moves the canvas's origin, and a row pressed inside the move landed its marker under the results bar with its card off the map. A centring still in the air at a resize now flies again from where the camera stands, aimed at the canvas as it stands, in the time it had left. It heads for the same point on screen, since the held box and the column share a centre. A ranked row's centring and a pending row's both go this way. A flight that has landed, or that another camera move or the reader's hand has stopped, is forgotten at its `moveend`, so a resize never moves a camera at rest. MapLibre observes its container too and redraws as it resizes, which draws a frame of the first flight at the new size. `MapView` therefore makes its own observer before the map, since observers hear of a resize in the order they were made.

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

The panes and the chevron, measured 2026-10-21 in the same image at 1440x900, at the 167-peak ring TJ uses and at 946 destinations, three presses of each, medians. Before is 7b3e455, which mounted an opening pane's body once its frame had opened; after is this change. The commit is the press to the first frame. A frame moved if the map, the bar or a pane frame stood somewhere new in it, not counting the frame after the move where a body unmounts. Settled is the press to the last frame anything changed in. A blank frame is one where a pane stood part open without its body.

At 167 destinations:

| Press | Commit (ms) | Frames that moved | Longest of them (ms) | Settled (ms) | Blank frames |
|---|---|---|---|---|---|
| Table to Both | 35 → 84 | 16 → 17 | 19 → 23 | 382 → 382 | 16 → 0 |
| Both to Table | 33 → 34 | 15 → 16 | 25 → 20 | 395 → 381 | 0 → 0 |
| Table to Chart | 37 → 100 | 15 → 14 | 27 → 26 | 413 → 406 | 15 → 0 |
| Chart to Both | 44 → 100 | 16 → 12 | 18 → 30 | 476 → 406 | 16 → 0 |
| Both to Chart | 34 → 62 | 15 → 11 | 27 → 45 | 395 → 365 | 0 → 0 |
| Chart to Table | 31 → 101 | 17 → 15 | 17 → 30 | 461 → 439 | 16 → 0 |
| Collapse | 31 → 41 | 16 → 14 | 29 → 39 | 369 → 371 | 0 → 0 |
| Expand | 25 → 142 | 17 → 15 | 18 → 28 | 441 → 430 | 17 → 0 |

At 946 destinations:

| Press | Commit (ms) | Frames that moved | Longest of them (ms) | Settled (ms) | Blank frames |
|---|---|---|---|---|---|
| Table to Both | 38 → 407 | 9 → 9 | 35 → 54 | 917 → 733 | 8 → 0 |
| Both to Table | 43 → 48 | 8 → 11 | 41 → 54 | 1,290 → 1,138 | 0 → 0 |
| Table to Chart | 59 → 503 | 5 → 15 | 88 → 27 | 917 → 821 | 4 → 0 |
| Chart to Both | 52 → 383 | 16 → 2 | 25 → 85 | 1,167 → 704 | 15 → 0 |
| Both to Chart | 47 → 98 | 6 → 2 | 69 → 81 | 682 → 455 | 0 → 0 |
| Chart to Table | 53 → 448 | 16 → 1 | 19 → none | 1,656 → 1,326 | 16 → 0 |
| Collapse | 44 → 48 | 6 → 6 | 88 → 87 | 1,205 → 1,128 | 0 → 0 |
| Expand | 44 → 707 | 16 → 5 | 22 → 109 | 1,333 → 1,016 | 16 → 0 |

No pane grows blank now, and a closing pane shows its data in every frame it shrinks in, which 7b3e455 already did. At 167 destinations a press that mounts a body commits in 84 to 142ms, and each move then runs 11 to 17 frames, the longest 20 to 45ms. At 946 mounting the chart or the table takes 383 to 503ms, and a chart that stays open is drawn again in the first frame of the move, 184 to 233ms, so Chart to Both, Both to Chart and Chart to Table show one or two frames of motion there. Expand mounts both bodies, 707ms. Every press settles within a few milliseconds of 7b3e455 at 167 destinations and sooner at 946, because a mount no longer waits for the move to end. The first pass, f70cc40, mounted at the press too and committed in up to 134ms at 167 destinations; the chevron did not move then.

In this change's second pass the chevron's commit was 114ms at 946, 71ms of it the whole table drawn again: its rows' focus callback was keyed on the collapse (`useRowFocus`). Keyed on what a press does, the commit is 51ms (both 2026-10-21).

The centring, measured 2026-10-21 in the same image at 1440x900 with the panel open. A row was pressed in the first frame of the first report's move, while the canvas stood 900px tall; the move left it 409px tall. Before, the marker landed at (900, 450), 41px below the canvas's foot, in 3 runs of 3. After, it lands at (900, 113) with its card from 113 to 391px, in 10 runs of 10. A press after the move lands at the same point. With `MapView`'s observer made after the map, the second flight started from the frame MapLibre had drawn at the old pixel: the marker dropped to 446 and flew back up.

## Alternatives rejected

- **The slide as it was, made symmetrical**: the panel sliding in and out over a map already at its final width. Something is still painted over the map for 300ms, which is what TJ called glitchy.
- **One speed for everything**: a menu that takes 300ms to open reads as slow next to the hand that opened it. A panel at 150ms reads as a jump. Material's motion durations split the same way, short ones for small surfaces and medium ones for larger areas such as sheets.
- **Animating the panel's width rather than its margin**: the panel's own column would reflow under its controls in every frame, and its content would wipe off its right edge rather than slide.
- **A transform on the panel and the map's column (a FLIP)**: the map lays out once at its final width, but a close shifts the map by half the panel's width in its first frame, as MapLibre keeps the centre, and an open needs the column wider than the room it has, which leaves a gap at the right edge.
- **Resizing the map once at the transition's end**: in between, the canvas stands at its old size inside a column that has moved, so a close shows a widening strip of page at the map's right edge and an open clips it.
- **A results pane animating its height in pixels**: the same property a grip drags, so a drag would trail the pointer unless every drag turned the transition off and back on. The grid row moves only on a press.
- **A layer of its own for each box while it moves** (`will-change: transform`): every frame measured was slower (Evidence).
- **Setting the hold with a state update while rendering**, React's pattern for state that follows a prop: React dropped the update after a move whose end came after the fallback, and the next close ran unheld, its map resized and blank in most frames (2026-10-20). The hold is derived instead, and a pane's life is set by its frame's end or an effect. A closing pane's height and its chart's legend (`useHeldWhile`) are still tracked while rendering: a dropped update there holds them one render old.
- **`@starting-style` for the opening pane**: it would also animate the first results arriving, and it has no exit, so a close would need a second mechanism.
- **Mounting an opening pane's body once its frame has opened** (7b3e455): every press committed in about 50ms, but the pane grew blank and its data popped in at the end. TJ, 2026-10-21: "The data should be shown as the results area is growing."
- **Holding a chart that stays open at its start size until the move ends** (7b3e455): it saved the press a draw, but the chart then changed size after the move had stopped, a second step for the eye.
- **Aiming a centring at the settled frame when it starts**: no pixel chosen at the press is right on both sides of the resize. The settled frame's middle is the held box's middle (450 of 900) until the resize and 204 of 409 after it, and the tutorial's cut has landed before the resize comes.
- **Starting the flight once the move ends**: it lands right, but a press would show nothing for up to 300ms, and the map would have to be told when a move ends.
- **Flying again at any resize within a set time of the press**, as a pasted list's fit does: a resize after the flight had landed, such as a grip's drag, would move a camera at rest.

## Consequences

`styles.test.ts` pins the two speeds, 150ms and `PANEL_MS`, the one property each recipe moves, `motion-reduce:transition-none` on every one, the panel's margin against its own width, and the panes' grid rows. `AppDrawer.test.tsx` holds the panel in the row while shut. `usePaneMotion.test.tsx` holds a pane's life: the body mounted at the press at its end height, and kept, at the height it had, until its frame has shut. `useLayoutMotion.test.tsx` holds the hold's start and its release, the chevron's included. `ResultsPanels.test.tsx` holds a closing chart mounted at its height until its frame shuts, an opening one mounted at the press at its end height, the chevron shutting both with their bodies and opening them with them, and the legend drawn for the mode pressed and kept by a closing chart. `ResultsSheet.test.tsx` keeps the panels at a desk while collapsed, and `useRowFocus.test.tsx` keeps one callback across a desk's collapse. `e2e/panelMotion.spec.ts` reads the live layout frame by frame: one computed duration both ways, the map's left edge on the panel's right edge in every frame of a close and an open, the panel 360px open and the map the window's width shut, the map's canvas resized at most once a move, after a move whose end came late too, the change instant under a reduced-motion setting, and the map's foot on the results' top in every frame of a Table to Both press and back and of the chevron both ways. It also holds an opening chart mounted and drawn at its end size in every frame its pane moves, no pane standing part open without its body in any frame of the chevron both ways or of Chart to Table, the chart drawn at its end size before the table's frame is half shut in Both to Chart, and the chart at one size through Chart to Table until it goes. `e2e/deskCorner.spec.ts` waits out the close before it reads the corner.

`map/centring.test.ts` holds a second flight to the time the first had left, and holds that a flight is forgotten at its `moveend`, past its time, or as a cut. `e2e/centring.spec.ts` presses a row in the first frame of the first report's move at 1440x900 and holds the marker and its whole card on the settled map. The second flight opens the card again for the canvas as it stands, so a card placed for the held box is placed again for the column. A grip dragged while a flight is in the air aims it again in each frame of the drag.

The hold moves the cost to the ends of a move. A close resizes the map and lays the table out in its first frame and draws the chart once at its end. An open does all three at its end. For those 300ms the map's box is wider or taller than its column, which clips it, and the chart keeps the width it had, so a close leaves a strip of the pane's own surface beside it until the chart is drawn again. At a desk every control on the map stands in `MapCorner`, outside the map's box, so the hold moves none of them. A pane press commits its mount before it moves, as TJ chose, and a closing pane's unmount waits for its frame to shut. A pane move resizes the map at both ends, as before: holding its box at the taller of the column's two heights would make that one resize, but needs the end height in pixels before the move starts. `MOTION.menu` is defined here for the menus' own change to wear.
