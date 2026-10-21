# 0140. On a phone, the notice block stands on the map, on the sheet's edge

- Status: Accepted. Amends 0028 on a phone (the whole block stands on the map; on a desk it stays under Analyze). Amended by 0207 (the band rides the Controls sheet's edge over its dim, and the Analyze button, the scale and the (i) stay at the map's foot under it).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696: frame 9 of the phone flow mockup approved 2026-10-14; placement B of the band comparison (frames A, B and C) chosen the same day; the split between action and information that day's cut made, reversed by the maintainer on a Pixel the same evening, with the corner bottom-aligned
- Issues and PRs: #696, #708, #253, #123
- Cited in code as: #696
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Every notice renders in the one block under the Analyze button; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx` and `PhoneFoot.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`

## Context

Record [0028](0028-notices-below-analyze.md) puts every notice in one block under the panel's Analyze button. A phone now opens on the map with the panel shut and Analyze at the map's foot (record [0135](0135-phone-opens-on-the-map.md)), so the cue that says a report no longer matches the panel, `A new forecast range requires a new analysis.` and its siblings, would be inside a closed panel, where the reader who needs it cannot see it. The first cut moved the whole block onto the map, above the scale and the credit, which put the arrival line `Provide at least one destination to analyze.` on the map at every first visit, and left three things stacked over the sheet.

## Decision

- **The whole block rides the map**, every line of it: the commit cues, the errors and a failed run's retry, and the lines that only inform, the arrival line `Provide at least one destination to analyze.` among them, which therefore shows on the map at arrival. The Controls sheet carries no notice block, so its height goes to the controls (record 0141). A desk keeps one block under Analyze.
- **One region, one element.** `PanelFooter` renders its one live region from one `FooterNotice` element and hands it to the map's band by a portal (`noticeHome`), so the #253 dismissals and the retry are the panel's ledger wherever the block stands. `style-footer-notice` pins the one portal and the one `role="status"`, so the block cannot split between two homes again.
- **The band stands on the sheet's edge** (placement B), on the results sheet's top edge or the Controls sheet's, or on the map's foot before there is a sheet, 10px off it (`noticeBottomPx`, `CORNER_MARGIN_PX`), which is the gap the scale and the (i) kept above the sheet on main (measured at 390x844: the (i) 10px, the scale 11px). It keeps its box shape, 12px off each side, on the drawer's own slate-800 so the boxes' translucent tints read as they do in the panel.
- **At most three lines, then it scrolls inside itself** (`NOTICE_BAND_MAX_PX`, 66px: three 16px lines of the box's 12px type, its 8px padding top and bottom and its 1px border). It never climbs the map past that.
- **The Analyze button rises 16px over the band**, and the scale and the (i) move up onto the button's row at its left, each with its bottom on the button's bottom edge (`phoneCornerLiftPx`). The opened credit line grows upward from that same edge, left of the button and 8px short of it, never under it or the band.

## Evidence

Measured 2026-10-14 in Playwright's Chromium with a coarse pointer, `A new destination requires a new analysis.` on the map:

| Viewport | Sheet top | Band | Gap | Button | Scale, (i) centres |
|---|---|---|---|---|---|
| 360x740 | 462 | 390 to 452 | 10 | 318 to 374 | 347, 346 (button 346) |
| 390x844 | 516 | 444 to 506 | 10 | 372 to 428 | 401, 400 (button 400) |
| 430x932 | 604 | 532 to 594 | 10 | 460 to 516 | 489, 488 (button 488) |

Measured again 2026-10-14 after the maintainer's review, at the same three sizes with a ring analysis landed and the results sheet at rest: the button's bottom, the scale's bottom and the (i)'s bottom on one edge, at 446, 500 and 588, and the opened credit line's bottom on it too, its right edge 8px short of the button and its top at 280, 374 and 522. The arrival line stands in the band at arrival, 62px tall. `phoneCorner.spec.ts` pins the shared bottom at 360 and 390.

A one-line box is 62px on a coarse pointer, where the dismiss target makes the row 44px; three lines of one message fill the 66px, and a second message scrolls.

## Alternatives rejected

- **The action lines on the map and the informing lines at the foot of the Controls sheet** (this record's first cut, built and shipped to the preview as 0e92e10): it spent a fixed foot of the sheet's height on lines the reader mostly does not need, and put the block in two places. The maintainer took the sheet's space back on a Pixel and accepted the arrival line on the map.
- **The scale and the (i) centred on the button's middle** (the same first cut): the opened credit line rose above the button's top and the collapsed controls stood 6px higher than its foot.
- **The whole block on the map, above the scale and the credit** (an earlier cut): three layers stacked over the sheet and the button 160px up. The band on the sheet's edge keeps the whole block and drops the stacking.
- **The band full width on the sheet's edge, as frame B drew it:** it lost the boxes' shape and the panel's tints read differently edge to edge.

## Consequences

`ControlPanel` and `AppDrawer` thread `noticeHome` and `phone` to `PanelFooter`; `App.tsx` hands the band to every phone. On a phone the footer is the document links alone, the last thing in the Controls sheet's scrolling body. Every footer line must still fit one line at 360px. A second action line scrolls the band rather than growing it.
