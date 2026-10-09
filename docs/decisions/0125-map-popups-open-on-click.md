# 0125. Every map popup opens on a click, through one system that ranks what is under it

- Status: Accepted
- Date: 2026-10-08
- Decider: the maintainer, on PR #700 (2026-10-08: "They should only have popups when you click on them, just like the behavior for markers today. The behavior of these two mechanisms ... should also be bound together behaviourly in bluebird's codebase so they behave the same. And future features integrate within the behavioral system. Just like our use of styles."; the design below approved as proposed, "I agree with your plan, proceed")
- Issues and PRs: #683, #700
- Cited in code as: TJ, 2026-10-08
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `mapPopups.ts`, `popups.ts`, `features.ts`, `drawRing.ts`, `resultsLayer.ts`, `poiPopup.ts`, `smoke.ts`, `wildfires.ts` and `closures.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `mapClick.ts` bullet; [`docs/USAGE.md`](../USAGE.md), the closures, wildfire and map popup paragraphs

## Context

The map's popups opened three ways. A fire perimeter, a closed area and a closed trail opened theirs on hover, with a grace timer so the cursor could reach the link inside; a click on a fire skipped its popup and opened NIFC's map in a new tab, and a click on a closure did nothing. A marker, a basemap peak or lake and a smoke plume opened theirs on a click. Each kind made its popup with its own options (the hover popups were a fixed 260px with no close button) and listened on its own layers, and which click won where two overlapped was a chain of special cases: a fire took every click on it, a marker inside one included, and the peak handler asked the marker and fire layers whether to stand down.

The hover popups opened over whatever the cursor crossed, which made a destination inside a fire or a closure hard to select (the maintainer, 2026-10-08), and a hover does not exist on a touch screen, so a phone could open no closure's popup at all.

## Decision

- **A popup opens on a click, never on a hover.** A fire, a closed area and a closed trail open their popups on a click, as a marker does. The fire's popup carries its NIFC link, which a click used to open directly. A hover changes only the cursor.
- **One system owns every popup and every click that opens one.** `map/mapPopups.ts` is where a thing on the map registers itself as a target: its layers, an optional hit margin, and how it opens. The module listens for the one click on the map, asks every registered layer what is under it, opens the highest-ranked target's popup, and clears the board first unless Shift is held. It sets the cursor from the same rule on every pointer move, and makes every popup through one `create` with the same options: the width rule, the close button, never `closeOnClick`, and a place on the board under its owner, so an overlay switched off takes its own popups down. A future layer gets all of this by registering.
- **It is enforced the way the design system is.** The linter's `map-popups-owned` check fails a `new Popup` or a `click`/hover listener anywhere under `src/map/` or in `MapView` outside `mapPopups.ts`, and `map-popups-system-declares` keeps that module to `mountMapPopups`. A drag's `mousedown` and `touchstart` are not covered: they move a handle.
- **The rank, small deliberate targets first.** A ring handle, then a ranked marker, then a basemap peak or lake, then a closed trail, road or site, then a fire perimeter, then a closed area, then a smoke plume (`MAP_TARGETS` in `utils/mapClick.ts`). A destination inside a fire or a closure takes the click. A fire outranks the closure drawn around it because the perimeter is the smaller shape and the hazard itself; smoke is last because a plume routinely covers states. Within one target, the earlier of its layers wins: a site before the line it sits on, the densest plume before the lighter ones nested under it.
- **In draw mode only the handles and the markers take a click.** Every overlay and basemap label is scenery a ring's corner may land on, so a ring can be drawn inside a fire or a closure, where a perimeter used to swallow the click.
- **A closed trail answers a click within 6px of it.** It is a 2.5px line, so an exact hit is what a hover forgave and a finger rarely lands (`CLOSURE_TRAIL_SLOP_PX`).

## Evidence

- Counted from the code before and after. Before, 30 layer-scoped pointer listeners were registered (the marker, the three peak and lake layers, the three smoke densities and the two draw handle layers for enter and leave; the fire, the closed area and the two closed trail layers for enter, move and leave), and MapLibre answers each one by querying its layer on every pointer move over the map. After, `features.test.ts` holds that no layer has one: the map takes one pointer move listener that asks every registered layer in at most two queries, one exact and one with the trail's margin.
- `utils/mapClick.test.ts` holds the rank pair by pair, the draw-mode scenery, and the cursor. `map/mapPopups.test.ts` holds the one click, the shared popup options, Shift, the margin and the held cursor. Each overlay's test holds its click popup, and that switching it off takes its popups down.

## Alternatives rejected

- Keeping the hover popups and only lowering their rank under a marker: a hover still opens over whatever the cursor crosses, and still does nothing on a touch screen.
- Keeping a fire's click as a jump to NIFC: it was the one click on the map that did not open a popup, and a reader who meant the destination inside the fire lost the map to a new tab. The link is one more click away, inside the popup.
- A rule per pair of layers, as before: every new layer had to be written into the others' handlers, which is how the peak handler came to query the marker and fire layers itself.

## Consequences

`map/click.ts` is gone into `map/mapPopups.ts`. `FIRE_POPUP_GRACE_MS`, `fireIdentity` and `closureIdentity`, which existed for the hover popups, are gone. The board's `track` and `closeAll` take an owner. The fire and closure popups take the shared width rule rather than a fixed 260px, and gain a close button. Smoke's popups now close when its layer is switched off, as every overlay's do. `testSupport/mapPopups.ts` mounts the real system on the stub map for each module's test, and `testSupport/stubMap.ts` can say what is under the cursor.
