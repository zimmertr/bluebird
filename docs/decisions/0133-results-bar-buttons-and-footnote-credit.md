# 0133. The results bar's actions are buttons, the Open-Meteo credit stands right-justified in the table's foot, and a short desk opens on the table

- Status: Accepted
- Date: 2026-10-13, recorded with the change that ships it
- Decider: the maintainer (TJ), accepting rows R01 and R03 of the #687 visual audit
- Issues and PRs: #687, #242, #430, #560
- Cited in code as: #687
- Guide: [`docs/STYLES.md`](../STYLES.md), Results bar fold point; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsBar.tsx` and `ResultsTable.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useResultsLayout.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `layout.ts` and `resultsSheet.ts` bullets; [`docs/USAGE.md`](../USAGE.md), The results

## Context

- **R01.** The results bar carried four control styles in one line: a segmented control, a chevron, and five underlined links, of which four were actions (Columns, Models, Removed, Download CSV) and one was a credit (Open-Meteo.com) standing among them as though it were a fifth.
- **R03.** The first report on a desk widens the results from Table to Both. At 1024x768 that opened the chart over a table pinned at its 120px floor, three rows under a 375px map, so the one panel a reader came for was the one squeezed.

## Decision

- **The four actions are `BUTTON_GHOST` buttons**, each with its glyph from `icons.tsx` (`IconColumns`, `IconModels`, `IconRestore`, `IconDownload`) and its word, at `TEXT.control`. No fill at rest, because the bar is already a slate-700 block and four more blocks on it would be louder than what they replace; the hover fill says "press me" under the pointer. The linter's `style-results-bar` check requires the four and fails a link anywhere in the bar.
- **The Open-Meteo credit stands in the results table's foot, right-justified on its first line**, sharing that line with the first note when there is one and standing alone there when there is none; further notes keep a line each under it. It is a `LINK` in a `TEXT.micro` line: a credit is attribution, which the micro step exists for. The note shrinks and wraps beside it and the credit never shrinks, so a long note ends short of it rather than running under it. The table's foot now renders whether or not there is a footnote. The maintainer placed it so on 2026-10-13, on #709, where the first cut gave it a line of its own under the notes.
- **While the table is not drawn, the same line is the chart's foot**: Chart on a desk, and the chart view on a phone. Open-Meteo is credited on screen whenever its data is drawn, and never twice, so Table and Both carry it in the table's foot alone. `OpenMeteoCredit` is the one source of the line for both places; each call site supplies only its placement.
- **A desk opens Both only where Both leaves the table above its floor** (`bothOpensWithRoom` in `layout.ts`, called from `useResultsLayout`). It asks `resolvePanelHeights` for the opening heights rather than comparing a window height, so the line moves with the panel defaults and the map floor. At today's 220px panels and docked map floor it falls at a results column of 790px. A reader who presses Both still gets it, and a stored choice still wins.

## Evidence

Measured 2026-10-13 against images built from `main` and from this change, Chromium (Playwright 1.63):

- At 1024x768 the first report opened on Both with the table at y=648 on `main`, and opens on Table with it at y=548 here. 1280x800 and 1440x900 still open on Both.
- The bar is 35px at 1440x900 and 59px at 1024x768, one line and two, on both builds.
- At 390x844 the longest note, the terrain-height note (103 characters), wraps to two lines in the 269px left of the credit, which stands 85px wide at the line's right end with 12px between them and no overlap. At 1440x900 the same note and the credit share one line.
- On a 402x874 phone the sheet's header is 108px, up from 104: Columns and Models fit beside the mode switch and Download CSV wraps onto a row of 24px buttons where the links wrapped onto an 18px one. `SHEET_HEADER_PX` is 108, and the phone's Both threshold (`draggedMapFloorPx(2)`) moves from 672px of viewport to 676.

## Alternatives rejected

- Filled buttons: four blocks on the bar's block.
- Keeping the credit in the bar at the micro step: it would still stand in a row of actions, and the bar is the surface whose height comes out of the ranking on a phone.
- A fixed window height for R03, the audit's "about 800": a number that would go stale the first time the panel defaults or the map floor moved.

## Consequences

The bar carried the credit in every mode before this change, so the move had to keep it on screen in Chart too, where the table and its foot are not drawn; the map's credit line names MapLibre and the tile server's sources only and could not stand in. The chart's foot takes a line of the chart panel's height in that mode. `ResultsPanels.credit.test.tsx` holds one credit in Table, in Both and in Chart, and one across every change of mode. `ResultsBar.test.tsx` holds the four buttons and no link, `ResultsTable.test.tsx` the credit at the right end of the first note's line, the second note on a line of its own and the first note still a link target, `ResultsPanels.credit.test.tsx` the credit once in every mode, and `layout.test.ts` and `useResultsLayout.test.tsx` the opening at 768 and 800. A label added to the bar is re-measured at 402px, because a third row moves `SHEET_HEADER_PX`.
