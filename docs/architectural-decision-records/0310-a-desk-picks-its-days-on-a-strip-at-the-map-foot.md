# 0310. A desk picks its days on a strip at the map's foot

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-18
- Decider: the maintainer, 2026-11-17 ("Plain days until a run")
- Issues and PRs: #825
- Cited in code as: record 0310
- Guide: `frontend/src/components/CLAUDE.md` (`DayStrip.tsx`, `TimelineTransport.tsx`, `MapStage.tsx`), `frontend/src/utils/calendar/CLAUDE.md` (`dayStrip.ts`)

## Context

The prototype put a sixteen-day strip along the map's foot: the days ahead at a glance, a press or a drag to choose them, and the hours of the analysed days scrubbed in the same place. The panel's calendar was a card two presses away, and the forecast player stood alone at the foot, so the window and the hours it plays were picked in two places a screen apart. The maintainer chose plain days before a run, so nothing on the strip is forecast before the Forecast button spends.

## Decision

At a desk a strip stands where the forecast player stood, bottom centre over the credit line. It holds one cell for every day from today to the last day the model reaches (`bandEnd`), each its weekday's initial and its date. A press picks that day, a drag picks the run of days it crosses, and a drag from a range's end moves that end, the calendar's own reducers. Shift with a press extends from the window's first day. The days are one tab stop, walked with the arrows, Home and End, and named as the calendar's grid is, `Forecast day`, so the strip adds no words.

Once a report spans hours, the forecast player stands under the days inside the strip, as it was, with its play button, scrubber and readout. Under a lens its axis reads `Score`. A phone keeps the player alone; its shell is still to come.

The strip looks ahead only. A window in the archive is still the When card's calendar, which pages back a year.

## Evidence

- `utils/calendar/dayStrip.test.ts` pins the days and the marks; `components/DayStrip.test.tsx` the press, the drag, Shift, a key and the arrows.

## Open

- The prototype widened the analysed days so the scrubber's hours lined up under them. Here the player keeps its own row under all the days.
