# 0333. A phone matches the desk after a forecast

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0329](0329-a-phone-foot-holds-the-days-and-the-forecast-button.md) (the foot's height and its days), [0322](0322-the-legend-stands-at-the-column-foot.md) (the key's place on a phone) and [0307](0307-a-score-with-lenses-ranks-the-field.md) (the score column's header).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, answering the phone side-by-side review
- Issues and PRs: #825
- Cited in code as: record 0333
- Guide: `frontend/src/components/CLAUDE.md` (`DayStrip.tsx`, `MapStage.tsx`, `ResultsSheet.tsx`); `frontend/src/utils/CLAUDE.md` (`tableColumns.ts`); `frontend/src/utils/results/CLAUDE.md` (`resultsSheet.ts`); `docs/STYLES.md` (`MAP_FOOT`, `RESULTS_COLUMN.footPhone`)

## Context

Side by side with the prototype on a phone, three things after a forecast differed from the desk. The phone's days stayed plain while the desk's drew each day's sky. The score key stayed behind the `Legend` chip, a tap away from the rows it explains. And the score column read `Score` whatever the lens, so a reader on `Calm summit` saw a number with no word for what it scored.

## Decision

- **The phone's days draw each day's sky after a forecast**, the window's days widened, as the desk's do ([0323](0323-the-day-strip-plays-the-window-after-a-forecast.md)). The Forecast button under them keeps reading `Up to date`. The days scrub the hours only while the forecast player is on, a phone's default being off: with it off a press on a day picks that day, and no playhead is drawn (`StripZoom.scrub`).
- **The foot keeps one height, 120px** (`FAB_PX`, `MAP_FOOT.card`'s `h-30`), from 96. Before a forecast each day's sky track stands empty on the recessed ground, so the foot does not grow under the reader when a report lands.
- **The phone's key stands at the compact results sheet's foot once a report stands**, as the desk's stands at the column's (record 0322), and under a folded sheet too, where the map it keys is open. The `Legend` chip keys the map before a report, and while Every column has widened the sheet: that sheet is the chart's and the full table's room, mostly over the map, and the 56px cost the tour's four stacked plots two of them in CI. The foot is one fixed height, `h-14` (`SHEET_KEY_PX`, 56px, one ramp section), which the compact sheet's chrome counts beside its header, because a map overlay must never change the height of the results; a second section scrolls inside it.
- **The score column's header is the lens's name** (`Bluebird`, `Calm summit`, `Clean air`, `Fresh snow`, `Warmest`), at both widths and in the CSV (`labelScore`). One label for the table and the file, as every column has.

## Consequences

- The window's days widen to the desk's share only where the row has room: never so far that a day outside the window is drawn under 18px (`windowGrow`, `STRIP_DAY_MIN_PX`). At the desk's share a phone's other days ran their numbers together (the preview, 2026-11-21). On a 360px phone two window days widen a little; on a desk nothing changes.
- On a 740px-tall phone with the chart up and the forecast player on, the player has no room: the chart's own height holds the sheet's top at 343px, and the player needs the map to reach 352 to stand between the rows and the foot (it needed 328 before). It shows again in Table, and on a phone 780px tall. The browser test that taps the chart moved to 360 by 780 for it (CI, 2026-11-21).
- The phone's map floor under a dragged sheet rises by the foot's growth: `DRAGGED_MAP_PX` is 268, and `draggedMapFloorPx(2)` 428.
- A phone's compact sheet header estimate is 56px taller, so its table at rest is 56px shorter.
- The tutorial's Chart and Panels cards hold a phone's sheet at full screen, over the map's rows, rather than at the drag's cap: at the cap the taller foot left the Panels card's four stacked panels one short at 390 by 844 (CI, 2026-11-21). A reader's own fourth panel already grows the results as far as the window allows.
- The Controls sheet keeps its 256px: the foot now stands taller than that under its dim, as the button always has (record 0207), and the sheet still leaves the rows.
- A score ramp's key fits the foot with room to spare; a column's ramp fills it.
- No new strings: the header reuses the lens chips' approved names.
