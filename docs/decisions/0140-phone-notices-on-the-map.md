# 0140. On a phone, the notices that ask for an action stand on the map, on the sheet's edge

- Status: Accepted. Amends 0028 on a phone (the block splits between the map and the Controls sheet; on a desk it stays one block under Analyze).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696: frame 9 of the phone flow mockup approved 2026-10-14; placement B of the band comparison (frames A, B and C) and the split between action and information chosen the same day
- Issues and PRs: #696, #708, #253, #123
- Cited in code as: #696
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Every notice renders in the one block under the Analyze button; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx` and `PhoneFoot.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `notices.ts` and `resultsSheet.ts`

## Context

Record [0028](0028-notices-below-analyze.md) puts every notice in one block under the panel's Analyze button. A phone now opens on the map with the panel shut and Analyze at the map's foot (record [0135](0135-phone-opens-on-the-map.md)), so the cue that says a report no longer matches the panel, `A new forecast range requires a new analysis.` and its siblings, would be inside a closed panel, where the reader who needs it cannot see it. The first cut moved the whole block onto the map, above the scale and the credit, which put the arrival line `Provide at least one destination to analyze.` on the map at every first visit, and left three things stacked over the sheet.

## Decision

- **Only the lines that ask for an action ride the map** (`ridesTheMap` in `utils/notices.ts`): every commit cue (`cue:*`) and every error, a failed run with its retry among them. The lines that only inform, the arrival line, the archive and horizon lines, a model's clamp and a settings contradiction, stay with the controls they are about, at the foot of the Controls sheet (record 0141). A desk keeps one block under Analyze.
- **One ledger, one element.** `PanelFooter` renders its boxes from one `FooterNotice` element into two homes, the map's band by a portal (`noticeHome`) and the panel in place, so the #253 dismissals and the retry are the same in both. `style-footer-notice` pins the one portal and the one element.
- **The band stands on the sheet's edge** (placement B), on the results sheet's top edge or the Controls sheet's, or on the map's foot before there is a sheet, 10px off it (`noticeBottomPx`, `CORNER_MARGIN_PX`), which is the gap the scale and the (i) kept above the sheet on main (measured at 390x844: the (i) 10px, the scale 11px). It keeps its box shape, 12px off each side, on the drawer's own slate-800 so the boxes' translucent tints read as they do in the panel.
- **At most three lines, then it scrolls inside itself** (`NOTICE_BAND_MAX_PX`, 66px: three 16px lines of the box's 12px type, its 8px padding top and bottom and its 1px border). It never climbs the map past that.
- **The Analyze button rises 16px over the band**, and the scale and the (i) move up onto the button's row at its left, each centred on the button's middle (`phoneCornerLiftPx`). The opened credit line wraps upward, left of the button, never under it or the band.

## Evidence

Measured 2026-10-14 in Playwright's Chromium with a coarse pointer, `A new destination requires a new analysis.` on the map:

| Viewport | Sheet top | Band | Gap | Button | Scale, (i) centres |
|---|---|---|---|---|---|
| 360x740 | 462 | 390 to 452 | 10 | 318 to 374 | 347, 346 (button 346) |
| 390x844 | 516 | 444 to 506 | 10 | 372 to 428 | 401, 400 (button 400) |
| 430x932 | 604 | 532 to 594 | 10 | 460 to 516 | 489, 488 (button 488) |

A one-line box is 62px on a coarse pointer, where the dismiss target makes the row 44px; three lines of one message fill the 66px, and a second message scrolls.

## Alternatives rejected

- **The whole block on the map** (the first cut): the arrival line on every first visit, and an informing line far from the control it is about.
- **The band full width on the sheet's edge, as frame B drew it:** it lost the boxes' shape and the panel's tints read differently edge to edge.
- **The band above the scale and the credit** (frame A): three layers stacked over the sheet and the button 160px up.

## Consequences

`ControlPanel` and `AppDrawer` thread `noticeHome` and `phone` to `PanelFooter`; `App.tsx` hands the band to every phone. Every footer line must still fit one line at 360px. A second action line scrolls the band rather than growing it.
