# 0034. On a phone the results are a sheet standing on the map

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #335)
- Decider: TJ (git: author and merger of #335)
- Issues and PRs: #249, #335, #422, #430, #454, #459
- Cited in code as: #249, #430, #454
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/resultsSheet.ts` bullet, and the `src/utils/forecastGrid.ts` bullet from "What was too short is fixed at the cause"

## Context

On a phone the results took a share of the map column, and the map was left too short for the legend stack.

## Decision

On a phone the results are a sheet standing on the map's bottom edge. The map keeps the whole column, and the legend stack, the timeline and MapLibre's bottom-right corner clear the sheet's top edge. The resting floor counts the timeline's band whether or not a bar is on screen, because an overlay must never resize the results. There are two floors: the resting one until the reader takes a grip, and a drag floor that keeps only the timeline's band and the button column's inset. Framing calls take a resting lift as bottom padding. Where the viewport is too short for two panels, the results bar disables Both and the sheet draws the one panel last chosen (#430), without rewriting the stored preference.

## Evidence

The legend stack needed 265px with four layer rows and a six-band key (2026-09-14), 313px once the snow section joined, and 182px measured 2026-09-17 at 402x874 after #454. At 182px a default-height table (408px) fits the 412px reserve instead of being clamped to 398. Two panels need 672px of viewport at 360px wide, measured 2026-09-16 against `draggedMapFloorPx(2)`.

## Alternatives rejected

- The results as a flex sibling that shrinks the map.
- A drag with no cap: the sheet pushed the transport through the Layers button and MapLibre's zoom stack.

## Consequences

`SHEET_HEADER_PX` is the one measured number; round it up if it is measured again. `resultsSheet.ts` is pure because `App.tsx` renders the map, which no Vitest project can stand up. A drag far enough closes the legends' box to nothing: the accepted limit of a sheet the reader pulls over the map.
