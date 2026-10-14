# 0132. On a phone, drawing a ring puts its readout, Done and Cancel in a bar on the map

- Status: Accepted
- Date: 2026-10-13, recorded with the change that ships it
- Decider: the maintainer (TJ), accepting row M08 of the #687 visual audit
- Issues and PRs: #687, #478, #249
- Cited in code as: #687
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Every notice renders in the one block under the Analyze button; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MapDrawBar.tsx`, `DrawReadout.tsx`, `DestinationsSection.tsx` and `MapStage.tsx` bullets; [`docs/USAGE.md`](../USAGE.md), Drawing a polygon

## Context

Draw polygon closes the drawer on a phone, because the map is what the reader draws on. Done and Cancel stayed in the drawer with the readout that says how many points are placed, so a reader halfway through a ring could not see how many more it needed, and could not finish or cancel it without reopening Controls over the map they were drawing on. A desk never had the problem: its panel is docked beside the map.

## Decision

- While a ring is drawn on a phone, `MapDrawBar` stands on the map: the readout, Done and Cancel, the same three the panel shows and wired to the same handlers. Done is disabled under three points, as it is in the panel.
- The readout is one component, `DrawReadout`, which the panel and the bar both render, so its four states (more points needed or a ring ready, each while drawing and after) are written once. The linter's `style-draw-readout` check pins its four `STATUS` colours and `style-draw-counter` keeps the panel's other two.
- It wears `DRAW_BAR`: a `raised` floating box at the map's inset off both sides, standing where the player stands (`transportBottomPx`), which it replaces while it is up. The legend stack clears it as it clears the player.
- Phone only. `MapStage` takes `isDesktop` and draws the bar only without it.
- No new copy. The readout, Done and Cancel are the panel's approved strings.

## Evidence

- Measured 2026-10-13 at 390x844 on a coarse pointer, against an image built from this change: the bar is 366 by 58 at y=742, its 44px buttons and the box's padding, clear of the scale bar and MapLibre's credit.
- On `main` the same two taps left the map with the zoom buttons, the compass and nothing to finish the ring with.

## Alternatives rejected

- Keeping the drawer open while drawing: the drawer covers the map that is being drawn on.
- A floating Done alone: Cancel and the count are what a reader halfway through a ring needs, and Done without them is a button that does nothing until a count nobody can see reaches three.

## Consequences

`MapStage.test.tsx` holds the bar on a phone and its absence on a desk. A change to the readout's wording changes both surfaces at once. The bar takes the player's band while a ring is drawn, so the player is gone until Done or Cancel, which is the same moment the report it plays would change anyway.
