# 0328. A phone wears the sentence bar, and its search heads the Controls sheet

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0135](0135-phone-opens-on-the-map.md) and [0313](0313-a-desk-searches-from-the-where-card.md). Amended by [0331](0331-a-phone-stands-its-map-tools-in-a-column.md) (the tools leave the first row for a column).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17 and 2026-11-21, keeping the prototype's phone and putting it third in the order of work; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0328
- Guide: `frontend/src/components/CLAUDE.md` (`SentenceBar.tsx`, `MapRows.tsx`, `PhoneFoot.tsx`, `AppDrawer.tsx`); `docs/STYLES.md` (`SENTENCE_BAR`)

## Context

The prototype's phone opens on the same sentence as the desk: what, where and when along the map's top, the tools down its right, and the Forecast button at its foot. The build's phone still opened on the old shell: the search pill across the top, a `☰ Current · NOAA GFS` chip that raised the Controls sheet, and a button that read `Analyze` where the desk's named its spend.

## Decision

- **The bar stands where the search pill stood**, one 32px line across the top row less the 3D and locate buttons: the logo, then the phrases (`Peaks in this view on Sat 22 – Sun 23`), each cutting its words before the line grows. One line rather than the prototype's wrap, because every phone anchor below the rows (the draw bar, the compass, the room the sheets and the player leave) is worked out from the two rows' fixed heights.
- **Each phrase raises the Controls sheet**, and the same phrase lowers it. The `☰` summary chip goes; the When phrase takes the keyboard back when the sheet's Done goes inert, as the chip did.
- **The place search heads the Controls sheet**, over the panel, as it heads the desk's Where card (record 0313). A pick lowers the sheet so the camera's move is seen.
- **The map's button names the spend** while its word is `Analyze`: `Forecast 247 peaks`, `Forecast 31 new`, `Up to date`, the same label the desk's bar reads, from the same `forecastLabel`. `Analyzing…` and `Try again` still replace it.
- **The bar has no button and runs nothing**: the map's button is a phone's one Forecast, and the sheet's panel runs the one run a link asks for, as it did.

## Consequences

- The button keeps its corner for now. The prototype's full-width button under the day strip is the next task, because it moves the scale, the credit line and the player, which all stand on the button's row.
- No string is new: the phrases and the labels are the desk's.
- A search now takes two presses on a phone (a phrase, then the field), where the pill took one.
