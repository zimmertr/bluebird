# 0135. A phone opens on the map, with the search field across its top and Controls, Layers and Analyze in one row under it

- Status: Accepted. Amends 0019 (on a phone the Layers button stands in a row beside Controls and Analyze, not in a column under the search field), 0034 (a searched place is framed for the sheet it is about to open, and a sheet holding only pending rows shows the table alone) and 0035 (the camera's padding for a search is the resting lift of a sheet that is not open yet).
- Date: 2026-10-13
- Decider: the maintainer (TJ), on issue #696, 2026-10-13: direction 1 of the round-one mockups as the base ("the drawer starts closed on a phone, a full-width search field runs across the top of the map"), option C for the found place, options A and D declined, and placement A of the round-two mockups for Analyze, with its summary composed from the When arm and the model's label
- Issues and PRs: #696, #687, #336, #693
- Cited in code as: #696
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the paragraph that opens "The popover hangs off a button"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the map chrome and `MapStage.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useResultsLayout.ts` and `useDrawer.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeGate.ts`, `controlsSummary.ts` and `resultsSheet.ts` bullets; [`docs/USAGE.md`](../USAGE.md), On a phone

## Context

On a phone, finding the forecast for one named place took five steps across three surfaces (TJ, on an Android phone, 2026-10-08). The drawer opened over the map at every width, so the search field the Destinations section named was under it. A picked place was framed for a map with no sheet, and the sheet then opened over its label; a reader whose saved mode was Both met an empty chart frame over a single row of dashes. And the only Analyze was back inside the drawer they had just closed, with the cue that said so beside it.

## Decision

- **A phone opens on the map, a shared link included.** The drawer starts closed below the desktop breakpoint and open above it (`useDrawer`), read once at mount. A desktop is unchanged.
- **The search field spans the map's top edge on a phone, with one row under it:** Controls, Layers and Analyze, in the order of the flow. Controls shows its word and a line under it composed of two words the panel already shows, the When arm and the model's label, `Current · NOAA GFS` (`controlsSummary`; the arm words are spelled once, in `WHEN_ARM_LABEL`, which the calendar reads). It is in the row whether or not the drawer is open, so the row never reflows under a closing drawer. The desktop's column, and its Controls standing in it only while the panel is closed, are unchanged.
- **The map's Analyze is the panel's command, not a second one.** It calls the same `handleAnalyze`, opens and closes on the same gate (`analyzeGateFor`, which the panel builds its gate with too), reads `Analyzing…` while a run is under way, and cancels and fails exactly as the panel's does. It never explains itself: every blocker and every commit cue stays under the panel's Analyze ([0028](0028-notices-below-analyze.md)). That is the accepted cost of a second Analyze.
- **A searched place is framed for the sheet it is about to open.** `useResultsLayout` publishes `sheetPadBottomPx`, the resting lift the sheet will take once it is shown, which reads nothing that depends on `showTable`; `MapStage` hands it to `flyToPlace`. The camera keeps using the RESTING lift, never the live one.
- **A phone sheet holding only pending rows shows the table alone** (`heldResultsMode`), without writing the reader's saved mode, which comes back with the first report. A press on the segment while the hold stands is the reader's answer and wins. A desktop is never held.
- **The vendor's zoom stack starts below the row on a phone** (`MAP_EDGE.belowRow`, read by `map.css`), and the legend stack hangs under the row at the short column's height.

## Evidence

- Measured 2026-10-13 at 390x844 on a coarse pointer against the built image: a pick of Mount Rainier put the marker at y 248 and its label at 272, above a sheet whose top edge stood at 496.
- The row's fit, measured the same day in the Playwright image's Chromium (`docs/STYLES.md`, Phone row fit): every member 44px tall; with `Dates · UK Met Office` Analyze is 130.2px wide at 390 and 100.2px at 360, and nothing truncates; only `Meteo-France ARPEGE` truncates the summary at 360, where Analyze stops at its word, 69.4px.
- The column the row replaced was three rows (search, Controls, Layers) and ended at 156px on a finger. The row ends at 108, and the legend card's header takes the third row, so the sheet rests where it did (`LEGEND_TOP_PX` is still 156).

## Alternatives rejected

- **Option A, the search field at the top of the drawer on a phone:** the fly-to would happen behind the drawer, out of sight, and the phone would carry two search fields feeding one `registerPlace`.
- **Option D, an analysis run by the search pick itself when nothing else waits:** it would narrow [0003](0003-analyze-is-spend-boundary.md), and the maintainer kept it whole: no analysis ever runs without a press of Analyze.
- **Option E, Analyze in the results bar:** out of place there, it costs the sheet's height, and it wraps the bar's second line.
- **Directions 2 and 3 of the round-one mockups**, one bottom sheet and a drawer with an action bar: too cluttered and confusing (the maintainer).
- **Placements B, C and D of round two:** B drops the summary that tells a new reader what Controls holds; C hides the one primary action behind a new glyph with no room for its reasons; D makes Controls and Layers icons, which record 0090 rules out for a control whose name a reader must see.
- **Fully rounded pills, as the mockups drew them:** the search field above and the legend under them are both the floating box, and one cluster in two radii read as two kinds of object.

## Consequences

`MapButtonColumn` takes the row's props (`phoneRow`, `controlsSummary`, `analyzeEnabled`, `analyzing`, `onAnalyze`), `LayersPopover` an `inRow` flag, `SearchBox` a `wide` flag, and `MapView`'s `flyToPlace` an optional bottom padding. The new roles are `MAP_BUTTON`, `MAP_PILL`, `MAP_PILL_TEXT`, `MAP_PILL_SUMMARY`, `MAP_ANALYZE`, `MAP_ROW`, `MAP_ROW_W`, `MAP_EDGE.right` and `MAP_EDGE.belowRow`, held in `styles.test.ts` and the `style-map-*` checks. Two Analyze buttons share a name on a phone, one inert inside the closed drawer, so a browser test there picks it through the main landmark. The panel's Map group still only rings the search field on hover; the handle `MapStage` holds on the field has no caller. A phone browser suite for the whole flow waits on #693.
