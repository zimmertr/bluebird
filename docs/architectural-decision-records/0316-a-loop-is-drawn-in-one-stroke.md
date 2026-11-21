# 0316. A loop is drawn in one stroke

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, keeping the prototype's idea that a loop is drawn freehand in one stroke; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0316
- Guide: `frontend/src/map/CLAUDE.md` (`drawRing.ts`), `frontend/src/utils/CLAUDE.md` (`drawGeometry.ts`)

## Context

The prototype draws a search area as one freehand stroke: press, trace the shape, let go. Its design notes count a hand-drawn loop as three presses (the draw tool, the stroke, Forecast). The build drew a ring a click at a point and finished it with Done, so a ring of twelve corners was fourteen presses.

## Decision

In draw mode a press and drag over open map is one stroke (`startStroke` in `map/drawRing.ts`). The stroke is drawn on the map as it goes. On letting go, `simplifyLoop` in `utils/drawGeometry.ts` keeps the corners the stroke turned (Douglas-Peucker in screen pixels, from 3 px, widening until the ring fits under `limits.max_polygon_points`), closes the loop back to its first point, commits it as the ring and ends draw mode. A stroke smaller than 12 px across, or one that turned fewer than three corners, leaves the ring as it was.

Nothing else is taken away. A click that does not move still places one point, so a ring can still be built corner by corner, and the vertex and midpoint handles still drag. A press a handle takes is that handle's drag, not a stroke. Draw mode claims the press, so the map does not pan under the hand while it is on; the wheel still zooms.

The draw buttons keep their approved name, `Draw polygon`.

## Evidence

- `drawGeometry.test.ts` pins the corners kept from a traced square, a traced circle drawn within 3 px of its line, the cap honoured with the closing repeat counted, and a slip, a line and a small stroke answering nothing. `drawRing.test.ts` pins a mouse stroke becoming the ring and ending the mode, a one-finger stroke, a press that hardly moved leaving the ring alone, no stroke outside draw mode or on a handle or under two fingers, and the published cap.

## Open

- The prototype's name for the tool is "Draw a loop". Renaming the buttons waits on the maintainer's word on the string.
