# 0133. The results bar's actions are buttons, the Open-Meteo credit joins the map's attribution line, and a short desk opens on the table

- Status: Accepted
- Date: 2026-10-13, recorded with the change that ships it
- Decider: the maintainer (TJ), accepting rows R01 and R03 of the #687 visual audit, and placing the credit on #709 the same day
- Issues and PRs: #687, #709, #242, #430, #560
- Cited in code as: #687
- Guide: [`docs/STYLES.md`](../STYLES.md), Results bar fold point; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsBar.tsx` bullet; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `controls.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useResultsLayout.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `layout.ts` and `resultsSheet.ts` bullets; [`docs/USAGE.md`](../USAGE.md), The results

## Context

- **R01.** The results bar carried four control styles in one line: a segmented control, a chevron, and five underlined links, of which four were actions (Columns, Models, Removed, Download CSV) and one was a credit (Open-Meteo.com) standing among them as though it were a fifth.
- **R03.** The first report on a desk widens the results from Table to Both. At 1024x768 that opened the chart over a table pinned at its 120px floor, three rows under a 375px map, so the one panel a reader came for was the one squeezed.

## Decision

- **The four actions are `BUTTON_GHOST` buttons**, each with its glyph from `icons.tsx` (`IconColumns`, `IconModels`, `IconRestore`, `IconDownload`) and its word, at `TEXT.control`. No fill at rest, because the bar is already a slate-700 block and four more blocks on it would be louder than what they replace; the hover fill says "press me" under the pointer. The linter's `style-results-bar` check requires the four and fails a link anywhere in the bar.
- **The Open-Meteo credit is a standing member of the map's attribution line**, the MapLibre control at the map's bottom right: the existing `Open-Meteo.com` link to `https://open-meteo.com/`, with no words added, built into the control where it is constructed (`OPEN_METEO_ATTRIBUTION` and `withOpenMeteo` in `map/controls.ts`) rather than attached to a layer, so it shows in every results mode, with or without a report. The library draws a control's own credits before the sources', so the line reads `MapLibre | Open-Meteo.com | OpenFreeMap © OpenMapTiles Data from OpenStreetMap`. On a phone the line folds behind the library's (i), as it already did, which the OpenStreetMap guideline allows.
- **The results carry no credit.** The table's foot is its notes alone and is drawn only when there is one, as it was before this change, and the chart has no foot.
- **A desk opens Both only where Both leaves the table above its floor** (`bothOpensWithRoom` in `layout.ts`, called from `useResultsLayout`). It asks `resolvePanelHeights` for the opening heights rather than comparing a window height, so the line moves with the panel defaults and the map floor. At today's 220px panels and docked map floor it falls at a results column of 790px. A reader who presses Both still gets it, and a stored choice still wins.

## Evidence

Measured 2026-10-13 against images built from `main` and from this change, Chromium (Playwright 1.63):

- At 1024x768 the first report opened on Both with the table at y=648 on `main`, and opens on Table with it at y=548 here. 1280x800 and 1440x900 still open on Both.
- The bar is 35px at 1440x900 and 59px at 1024x768, one line and two, on both builds.
- On a 402x874 phone the sheet's header is 108px, up from 104: Columns and Models fit beside the mode switch and Download CSV wraps onto a row of 24px buttons where the links wrapped onto an 18px one. `SHEET_HEADER_PX` is 108, and the phone's Both threshold (`draggedMapFloorPx(2)`) moves from 672px of viewport to 676.

## Alternatives rejected

- Filled buttons: four blocks on the bar's block.
- Keeping the credit in the bar at the micro step: it would still stand in a row of actions, and the bar is the surface whose height comes out of the ranking on a phone.
- The credit in the results' foot, which this change first shipped, as the table's last line and then right-justified beside its first note, with the chart's foot carrying it while the table was hidden: under a short table the link read as stray, and the chart had no foot of its own, so a second one had to be made for it. The map's attribution line is on screen in every mode and is already where a reader looks for the sources of what is drawn.
- A fixed window height for R03, the audit's "about 800": a number that would go stale the first time the panel defaults or the map floor moved.

## Consequences

The bar carried the credit in every mode before this change, and the map's attribution line does too, so no mode loses it; the results gain no line for it. `controls.test.ts` holds the credit on the line once, after the library's, as the bare link opening in a new tab, and `legal.test.ts` reads it there. `ResultsBar.test.tsx` holds the four buttons and no link, `ResultsTable.test.tsx` and `ResultsPanels.test.tsx` no credit in the table's foot or under the chart, and `layout.test.ts` and `useResultsLayout.test.tsx` the opening at 768 and 800. A label added to the bar is re-measured at 402px, because a third row moves `SHEET_HEADER_PX`.
