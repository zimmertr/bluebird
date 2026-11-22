# 0329. A phone's foot holds the days and the Forecast button

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Supersedes the floating button of [0135](0135-phone-opens-on-the-map.md) and the corner placement of [0140](0140-phone-notices-on-the-map.md). The foot's height and days amended by [0333](0333-a-phone-matches-the-desk-after-a-forecast.md).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17 and 2026-11-21, keeping the prototype's phone and putting it third in the order of work; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0329
- Guide: `frontend/src/components/CLAUDE.md` (`PhoneFoot.tsx`, `DayStrip.tsx`, `MapStage.tsx`), `frontend/src/utils/results/CLAUDE.md` (`resultsSheet.ts`); `docs/STYLES.md` (`MAP_FOOT`)

## Context

The prototype's phone picks its days where the desk does, on a strip at the map's foot, with the Forecast button full width under the days. The build's phone had no strip (its days were in the Controls sheet's calendar) and a 56px floating Analyze button at the bottom right, with the scale and the (i) on the button's row at its left and the player standing on the button.

## Decision

- **One card across the map's foot**, 16px in from each edge and off whatever it stands on, 96px tall: the day strip's days (the desk's `DayStrip`, bare) over the full-width Forecast button, the desk bar's own button and label. It rides the results sheet's top edge as the floating button did, and keeps the badge at the button's corner.
- **The scale, the (i) and the opened credit line stand in the corner band on the card's top edge**, the band a desk keeps between its results and its player, and the credit line spans the map, since no button stands beside it now. `--map-fab-w` is gone.
- **The player stands over that band**, as a desk's stands over its results.
- **A full sheet leaves the card and the band**, 156px under the rows, where it left the button's 88px.
- **The days are plain on a phone**, before and after a forecast: the desk's sky and scrubbing (record 0323) stay a desk's, because the strip is 20px a day on a phone and the player already scrubs the hours there.

## Consequences

- A full results sheet stands 68px lower than it did, the price of the band and the taller card.
- A press picks one day; a drag across days picks a run with a mouse, and on touch only through the calendar in the Controls sheet, because a finger's drag captures the first day it lands on.
- No string is new: the days are the strip's, the button's words the bar's.
