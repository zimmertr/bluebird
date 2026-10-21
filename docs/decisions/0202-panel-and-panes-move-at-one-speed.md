# 0202. The desk panel pushes the map's edge and the results panes open and close, at one speed both ways, with menus at a faster one

- Status: Accepted
- Date: 2026-10-20
- Decider: the maintainer (TJ), on issue #714, 2026-10-20: "there is an animation when closing the sidepanel... there's no animation for opening it, it just pops open. We should probably have the same animation in both directions... Same thing when switching from chart/table to both." And: "When you close it, it looks like the results panel immediately jumps to the full width of the web page, and then the side panel is momentarily painted on top and then it slides to the left. This feels glitchy. Then when you open it, it feels like it just instantly pops open, taking much less time than when it closes." Of the options put to him, "Two speeds, smooth panel."
- Issues and PRs: #714, #759
- Cited in code as: #714
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `AppDrawer.tsx`, `MapStage.tsx` and `ResultsSheet.tsx`/`ResultsPanels.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useLayoutMotion.ts` and `usePaneMotion.ts`; [`docs/STYLES.md`](../STYLES.md), the `MOTION`, `DESK_PANEL`, `RESULTS_PANE` and `LAYOUT_HOLD` rows and Motion

## Context

The desk's controls panel was `absolute` and slid off over 300ms while shut, and `lg:static` with `lg:transition-none` while open, which came in with #25 and has no record. So a close took the panel's 360px out of the row in one frame: the map and the results widened at once, the panel was painted over the widened map, and only then slid away. An open snapped back in one frame. The Table, Chart and Both switch mounted and unmounted its panes in one frame too. TJ found the close glitchy, the open abrupt, and the two out of step with each other.

## Decision

- **Two speeds, each the same both ways.** A menu or a card fades and slides in 150ms (`MOTION.menu`). A panel, a sheet or a results pane moves in 300ms with the sheet's easing (`MOTION.slide`, `MOTION.push`, `MOTION.pane`, `PANEL_MS`), because it moves an edge the screen is laid out against. Each recipe names the one property it moves, so nothing a grip drags is ever animated, and every one drops to an instant change under a reduced-motion setting.
- **The desk panel pushes the map's edge** (`DESK_PANEL`). It stays in the row while it is shut, and its left margin goes from 0 to minus its own 360px and back. The map's column is the rest of the row, so it narrows and widens in the frames the panel moves in, its left edge on the panel's right edge in every frame, and nothing is painted over anything. `lg:transition-none` from #25 is gone. The panel is `inert` while shut, as before (#576).
- **A Table, Chart or Both press opens and closes the results panes at a desk** (`RESULTS_PANE`, `usePaneMotion`). Each pane is a frame with one grid row, `1fr` open and `0fr` shut, around a body that keeps its own height, so the chart is drawn once rather than once a frame. A closing pane stays mounted at the height it had until its frame has shut. The chart's body holds to the results bar and the table's to the column's foot, so Table to Chart wipes the boundary up the column, and Table to Both lifts the bar off a chart that stays where it will stand. A grip's drag, a double press and a window's resize change the body under a row that stays `1fr`, so they move at once, under the pointer.
- **While the layout moves, the map and the results hold one size** (`useLayoutMotion`, `LAYOUT_HOLD`), so a frame of the move shifts boxes rather than resizing the map's canvas or laying out the table again. The hold is worked out in the render that starts the move, as the difference between the layout asked for and the one the last move settled at, and let go at the move's `transitionend`. The map's box is the window's width while the panel moves and the window's height while a pane moves, centred on the map's column, which clips it. MapLibre keeps the centre on a resize, so the map shows what a true resize would at every size in between, and it is resized only where the box changes: at the start of a close, at the end of an open, and at both ends of a pane's move. While the panel moves, the table's box takes the window's width, so a close lays it out once at the start and an open once at the end, and the chart keeps the width it had and is drawn again once, at the end.
- **A phone keeps what it had.** The Controls sheet slides on `MOTION.slide` as before, and the results sheet's panes change at once, since its height feeds the map's bottom chrome through React on every change.

## Evidence

Measured 2026-10-20 at 946 destinations and 1440x900 in the pinned Playwright image (v1.64.0), whose headless Chromium draws the map in software, on a 12-core host that other runs were sharing. A frame is the interval into each animation frame from the press until the layout stops moving. Before is `origin/main` at be9dede, five presses of each; after is this change, ten presses of each panel move over two runs and five of each pane move.

| Press | Before | After |
|---|---|---|
| Close, Table | one 63 to 92ms frame (median 77) laying the map and the table out at full width, then 19 frames of the panel sliding over the map, 360px of it under the panel | 8 frames. The first, where the map and the table take the new width, 42 to 100ms (median 51); every other frame 27 to 55ms (median 34). The panel's edge on the map's in every frame |
| Open, Table | one 73 to 89ms frame | 11 frames of 29 to 44ms, then the frame where the map and the table take their width, 25 to 78ms (median 46) |
| Close, Both | a 178 to 223ms frame for the chart, then the slide over the map | 6 frames. The first 42 to 106ms (median 60), the rest median 40; then the chart drawn once at its new width |
| Open, Both | one frame, then 158 to 209ms for the chart | 8 frames. The first median 50, the rest median 47; then the chart |
| Table to Both | the chart mounts in a 397ms commit | the same mount, 506ms, then 7 frames, the longest a median 55ms |
| Both to Chart | a 74ms commit, then 187ms for the chart at its new height | the chart's redraw, frames of 132 and 211ms, swallows the move, which shows in 2 frames |
| Chart to Table | an 864ms commit, then 234ms | a 475ms commit for the table, 2 frames of move, then the chart's unmount, about 1s; settled about 700ms later |

In a move at Table the one frame that can pass 50ms is the one where the map and the table are laid out at their new size, the work the old close did in its one long frame. At Both the frames around it pass 50ms in some presses too, up to 112ms, as the chart is laid out beside them. At 946 rows a chart's redraw and a table's mount cost what they did before and take most of a pane's 300ms by themselves, so Both to Chart and Chart to Table barely move there. Chart to Table settles later because the closing chart is unmounted after its move rather than in the press's commit, and every pane press settles 300ms later than an instant one.

What the hold changed, measured the same day, closing and opening at Table:

- The push with nothing held drew frames of 133 to 230ms: the map was resized and the table laid out again in every frame.
- With the map hidden its frames took 64 to 73ms, with the results hidden 49 to 69ms, and with both hidden 19ms. Moving the edge costs nothing; the map's resize and the table's layout were the whole bill.
- A pan of the map at a fixed size drew at 16 to 17ms a frame, longest 19 to 22ms.
- A layer of its own (`will-change: transform`) for the panel and the map's column, or for the panes' bodies, made every frame slower in this renderer.

## Alternatives rejected

- **The slide as it was, made symmetrical**: the panel sliding in and out over a map already at its final width. Something is still painted over the map for 300ms, which is what TJ called glitchy.
- **One speed for everything**: a menu that takes 300ms to open reads as slow next to the hand that opened it. A panel at 150ms reads as a jump. Material's motion durations split the same way, short ones for small surfaces and medium ones for larger areas such as sheets.
- **Animating the panel's width rather than its margin**: the panel's own column would reflow under its controls in every frame, and its content would wipe off its right edge rather than slide.
- **A transform on the panel and the map's column (a FLIP)**: the map lays out once at its final width, but a close shifts the map by half the panel's width in its first frame, as MapLibre keeps the centre, and an open needs the column wider than the room it has, which leaves a gap at the right edge.
- **Resizing the map once at the transition's end**: in between, the canvas stands at its old size inside a column that has moved, so a close shows a widening strip of page at the map's right edge and an open clips it.
- **A results pane animating its height in pixels**: the same property a grip drags, so a drag would trail the pointer unless every drag turned the transition off and back on. The grid row moves only on a press.
- **A layer of its own for each box while it moves** (`will-change: transform`): every frame measured was slower (Evidence).
- **Setting the hold with a state update while rendering**, React's pattern for state that follows a prop: React dropped the update after a move whose end came after the fallback, and the next close ran unheld, its map resized and blank in most frames (2026-10-20). The hold and a pane's life are derived instead.
- **`@starting-style` for the opening pane**: it would also animate the first results arriving and the chevron's expand, while the collapse stays instant, which is the one-way motion this record removes.

## Consequences

`styles.test.ts` pins the two speeds, 150ms and `PANEL_MS`, the one property each recipe moves, `motion-reduce:transition-none` on every one, the panel's margin against its own width, and the panes' grid rows. `AppDrawer.test.tsx` holds the panel in the row while shut, `usePaneMotion.test.tsx` holds a pane's life, `useLayoutMotion.test.tsx` holds the hold's start and its release, and `ResultsPanels.test.tsx` holds a closing chart mounted at its height until its frame shuts. `e2e/panelMotion.spec.ts` reads the live layout frame by frame: one computed duration both ways, the map's left edge on the panel's right edge in every frame of a close and an open, the panel 360px open and the map the window's width shut, the map's canvas resized at most once a move, after a move whose end came late too, the change instant under a reduced-motion setting, and the map's foot on the results' top in every frame of a Table to Both press and back. `e2e/deskCorner.spec.ts` waits out the close before it reads the corner.

The hold moves the cost to the ends of a move. A close resizes the map and lays the table out in its first frame and draws the chart once at its end. An open does all three at its end. For those 300ms the map's box is wider or taller than its column, which clips it, and the chart keeps the width it had, so a close leaves a strip of the pane's own surface beside it until the chart is drawn again. At a desk every control on the map stands in `MapCorner`, outside the map's box, so the hold moves none of them. A closing pane's unmount moves from the press to the end of its move. The collapse chevron still shows and hides the panes at once, and `MOTION.menu` is defined here for the menus' own change to wear.
