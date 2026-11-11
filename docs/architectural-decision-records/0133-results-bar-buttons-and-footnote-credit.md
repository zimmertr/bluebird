# 0133. The results bar's actions are buttons, the Open-Meteo credit joins the map's attribution line, and a short desk opens on the table

- Status: Accepted. Amended by 0223 (under touch the buttons are 44 wide and 32 tall, and press 44).
- Date: 2026-10-13, recorded with the change that ships it
- Decider: the maintainer (TJ), accepting rows R01 and R03 of the #687 visual audit, and placing the credit on #709 the same day
- Issues and PRs: #687, #709, #242, #430, #560
- Cited in code as: #687
- Guide: [`docs/STYLES.md`](../STYLES.md), Results bar fold point; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsBar.tsx` bullet; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `controls.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useResultsLayout.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `layout.ts` and `resultsSheet.ts` bullets; [`docs/USAGE.md`](../USAGE.md), The results

## Context

- **R01.** The results bar carried four control styles in one line: a segmented control, a chevron, and five underlined links, of which four were actions (Columns, Models, Removed, Download CSV) and one was a credit (Open-Meteo.com) standing among them as though it were a fifth.
- **R03.** The first report on a desk widens the results from Table to Both. At 1024x768 that opened the chart over a table pinned at its 120px floor, three rows under a 375px map, so the one panel a reader came for was the one squeezed.

## Decision

- **The four actions are one group in the mode switch's look** (`ACTION_GROUP`, `ACTION_ITEM`; the maintainer on #709, after the first cut, ghost buttons, wrapped to three rows on a 402px phone with Removed showing): the same bordered well, the same half and height on either pointer, the same idle fill, a divider between each two, each with its glyph from `icons.tsx` (`IconColumns`, `IconModels`, `IconRestore`, `IconDownload`) and its word. The group is right-justified against the bar's edge and the switch stands at the left of the folded line, at least 16px apart there and 24px on one line. The item's inset is 6px, so a glyph alone is 28px wide and 22px tall on a fine pointer and passes WCAG 2.2's target spacing as record 0130 settles the Metrics rows: a 24px circle on its centre stays inside its own width. `TAP.action` makes each 44px on a coarse pointer.
- **Words only where the line holds them all** (`BAR_LABEL`): where the bar's content is under 584px, every control on it, the switch's three included, is its glyph alone, named by its word (`aria-label`, the same approved string). The number is the measured line: both groups labelled with Removed showing, their gap, and two more digits of a Removed count. The linter's `style-results-bar` check requires the four items, the group and the rule on all seven words, and fails a link anywhere in the bar.
- **The Open-Meteo credit is a standing member of the map's attribution line**, the MapLibre control at the map's bottom right: the existing `Open-Meteo.com` link to `https://open-meteo.com/`, with no words added, built into the control where it is constructed (`OPEN_METEO_ATTRIBUTION` and `withOpenMeteo` in `map/controls.ts`) rather than attached to a layer, so it shows in every results mode, with or without a report. The library draws a control's own credits before the sources', so the line reads `MapLibre | Open-Meteo.com | OpenFreeMap © OpenMapTiles Data from OpenStreetMap`. On a phone the line folds behind the library's (i), as it already did, which the OpenStreetMap guideline allows.
- **The results carry no credit.** The table's foot is its notes alone and is drawn only when there is one, as it was before this change, and the chart has no foot.
- **A desk opens Both only where Both leaves the table above its floor** (`bothOpensWithRoom` in `layout.ts`, called from `useResultsLayout`). It asks `resolvePanelHeights` for the opening heights rather than comparing a window height, so the line moves with the panel defaults and the map floor. At today's 220px panels and docked map floor it falls at a results column of 790px. A reader who presses Both still gets it, and a stored choice still wins.

## Evidence

Measured 2026-10-13 against images built from `main` and from this change, Chromium (Playwright 1.63):

- At 1024x768 the first report opened on Both with the table at y=648 on `main`, and opens on Table with it at y=548 here. 1280x800 and 1440x900 still open on Both.
- The bar is 35px at 1440x900 and 59px at 1024x768, one line and two, on both builds.
- The labelled line, measured at 1440x900: the switch 176.7px, the group 273.4px, and 377.8px with `Removed (1)` (103px). At 1024x768 the bar's content is 640px and both groups stand labelled on one line, Removed or not.
- On a coarse pointer at 360, 390, 402 and 430 wide the bar's content is 336 to 406px, and the switch (136px) and the glyph group (136px, or 181px with Removed) stand on one line in every case, 19px apart at the narrowest. The sheet's header is 84px in all eight states, where it was 104 with links. `SHEET_HEADER_PX` is 84, and the phone's Both threshold (`draggedMapFloorPx(2)`) moves from 672px of viewport to 652.

## Alternatives rejected

- Ghost buttons, a word and a glyph with no fill at rest: the first cut. On a 402px phone with Removed showing they wrapped to three rows.
- Filled buttons of their own style: four blocks on the bar's block that matched nothing beside them.
- Keeping the credit in the bar at the micro step: it would still stand in a row of actions, and the bar is the surface whose height comes out of the ranking on a phone.
- The credit in the results' foot, which this change first shipped, as the table's last line and then right-justified beside its first note, with the chart's foot carrying it while the table was hidden: under a short table the link read as stray, and the chart had no foot of its own, so a second one had to be made for it. The map's attribution line is on screen in every mode and is already where a reader looks for the sources of what is drawn.
- A fixed window height for R03, the audit's "about 800": a number that would go stale the first time the panel defaults or the map floor moved.

## Consequences

The bar carried the credit in every mode before this change, and the map's attribution line does too, so no mode loses it; the results gain no line for it. `controls.test.ts` holds the credit on the line once, after the library's, as the bare link opening in a new tab, and `legal.test.ts` reads it there. `ResultsBar.test.tsx` holds the four buttons and no link, `ResultsTable.test.tsx` and `ResultsPanels.test.tsx` no credit in the table's foot or under the chart, and `layout.test.ts` and `useResultsLayout.test.tsx` the opening at 768 and 800. A member added to the bar is re-measured at 360px, because a glyph more than that line holds wraps the group and moves `SHEET_HEADER_PX`, and a word that grows moves `BAR_LABEL`.
