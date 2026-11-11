# 0245. A pitched map fetches the box its view would cover lying flat

- Status: Accepted
- Date: 2026-10-27
- Decider: the maintainer (TJ), on #799, in the brief for its terrain phase. The implementation is git's.
- Issues and PRs: #799
- Cited in code as: #799
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `viewBox.ts` bullet

## Context

The 3D button tilts the map to 45 degrees and a reader can tilt it to 60. MapLibre's `getBounds()` answers the bounding box of what the camera sees, which on a tilted map runs toward the horizon. The fire perimeters, the closures and the trailhead and crag markers each fetched the pod for that box, so a tilted view asked for features across a region nobody could read at that distance.

## Decision

`utils/viewBox.ts` works out the box the canvas would cover at the same centre, zoom and bearing with the pitch at 0, in Web Mercator at MapLibre's 512px tile: the canvas's rectangle turned by the bearing, and the box around it. `viewBoxOf(map)` reads it off the map. The three viewport fetches ask for that box, and `fireDetailFor`'s width term reads its west and east edges. The pitch is not an argument.

## Evidence

- At bearing 0 the box is what `getBounds()` answers for a flat map: held to within a metre over Rainier at zoom 11 in a 1000 by 700 canvas, against edges worked out by hand from the Mercator formulas (`viewBox.test.ts`, 2026-10-27).
- With a bearing it is the box around the four turned corners, worked out the same way.

## Alternatives rejected

- **`getBounds()` as before**: the horizon's box.
- **Clipping `getBounds()` to some distance**: a number with no meaning at every zoom, where the flat box follows the zoom.

## Consequences

- The Layers menu's coverage test (`useLayerReach`) still reads `getBounds()`: it fetches nothing, and a wider box only greys a row less often, which is the safe way to be wrong.
- `viewBox.test.ts` holds the box; the landmark, wildfire and closure tests each hold their fetch to it on a pitched stub map whose `getBounds()` answers the horizon.
- The flat box is narrower than what a tilted map shows near the horizon, so a fire far up the screen may draw only after a pan brings it closer. That is the trade: the far edge of a tilted view is too small to read.
