# 0071. A committed report moves the map only when none of its rows is in view

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #579
- Issues and PRs: #579, #589
- Cited in code as: #579
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `mapFraming.ts` bullet

## Context

Analyze never moved the map. The camera moved only for a link's opening frame, a pasted list, a search, a click on a row's rank and Edit Polygon. A reader who analyzed a pasted list or pinned places after panning away could get a full table and no marker on screen (the Round 5 readiness review, F07-7, 2026-10-01).

## Decision

When a report commits and none of its displayed rows is on the part of the map the reader can see, the map fits to those rows, the same fit a pasted list gets. When at least one row is in view, the camera does not move. Only a commit can move it (`analysisSeq`), never a live knob, and the tutorial's demonstration commits nothing. The move is an app move, so it puts a camera into a share link only where one is already being written.

## Evidence

`anyPointInView` in `utils/mapFraming.ts` answers on projected pixels, edge-inclusive, over the canvas less the phone sheet's padding: the same measurement `framePolygon` uses for Edit Polygon.

## Alternatives rejected

- Never move the map, and say so in USAGE.md. A report with nothing on screen reads as an empty answer.
- Fit to the rows after every Analyze. A reader who parked the camera on part of the field loses that view for no gain.

## Consequences

`mapFraming.test.ts` pins the predicate. The trigger is an effect in `App.tsx` that no unit test can render, because MapLibre cannot run under Vitest.
