# 0337. A phone draws the cloud sea, and a sheet the tour holds opens at half the screen

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Supersedes [0310](0310-the-cloud-sea-is-drawn-from-the-report.md) in part (the layer and its row a desk's alone).
- Date: 2026-11-21
- Decider: the maintainer, on the from-scratch UI PR (#825), asked whether the cloud sea could stay a desk's: "No, should be supported on phone too." The half-screen sheet is Claude's.
- Issues and PRs: #825
- Cited in code as: record 0337
- Guide: `frontend/src/components/CLAUDE.md` (`BottomSheet.tsx`, `LayersPopover.tsx`); `docs/USAGE.md`, the layers table; `docs/STYLES.md` (`BOTTOM_SHEET`)

## Context

Record 0310 drew the cloud sea at a desk alone, and kept its **Cloud deck** row off a phone's Layers sheet with the one spread the `style-layer-rows` check allowed. The reason was room: the tutorial's Layers card stands between the Layers button and the top of the sheet it holds open (`sheetBetween`), and a sheet as tall as its rows left the card no room once Layers had a fourteenth (the browser suite's phone tour, 2026-11-18).

## Decision

- **A phone draws the cloud sea**, from the same deck the desk draws, and its Layers sheet carries **Cloud deck** in the Forecast group where the desk's card does. Every row stands in both lists again, and `style-layer-rows` bans every spread in `MAP_LAYERS`.
- **A sheet the tutorial holds open for a step opens at half the screen at most** (`BOTTOM_SHEET.toured`), its rows scrolling under that, where any other sheet opens to its rows up to the screen less 100px. The card then has the upper half of the screen whatever the sheet holds. The two sheets the tour holds are Layers and Messages; the demonstration's two messages fit either way.

## Consequences

- A phone's Layers sheet, during the tutorial alone, scrolls its later rows. **Active wildfires**, which the step switches on, is the first row under Hazards, after the four Base map rows, so it stands inside the half the sheet shows.
- A phone fetches the terrain tiles the cloud sea reads, as a desk does, only while a report holds a field and the row is on.
