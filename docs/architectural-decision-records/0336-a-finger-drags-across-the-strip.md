# 0336. A finger drags across the strip's days

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0311](0311-a-desk-picks-its-days-on-a-strip-at-the-map-foot.md) (how the strip follows a drag) and [0329](0329-a-phone-foot-holds-the-days-and-the-forecast-button.md) (a phone's days take a drag, not a press alone).
- Date: 2026-11-21
- Decider: the maintainer, on the from-scratch UI PR (#825), asked whether a phone's run of days should take a drag: "Yes, add this to this PR." The mechanism is Claude's.
- Issues and PRs: #825
- Cited in code as: record 0336
- Guide: `frontend/src/components/CLAUDE.md` (`DayStrip.tsx`); `docs/USAGE.md`, the strip of days

## Context

The strip picked a run of days with a mouse drag: a press on one day, then each day the pointer entered moved the run's end (record 0311). A finger did nothing of the kind. A touch pointer is captured by the element it pressed, so no other day ever heard it enter, and the browser read a sideways move as a pan of the page and cancelled the press. On a phone a run of days therefore took five presses through the When sheet: the phrase, Dates, two days and Done, before Forecast.

## Decision

- **The strip reads the day under the pointer from its x** on every move, from the days' own boxes, rather than from the day the pointer enters. One path serves a mouse and a finger.
- **The row takes the gesture** (`touch-action: none`, on `DAY_STRIP.row` and `rowBare`), so a finger's drag along the days is the strip's and never the page's pan. The strip stands in the phone's foot apart from the map's canvas and the sheet's grip, so neither loses a gesture it had: a pan starts on the map, and the sheet drags from its handle.
- **A cancel picks nothing.** If the browser takes the gesture after all (`pointercancel`), the drag ends with the selection as it was, and a scrub of the hours ends the same way.

## Consequences

- A phone's run of days is a drag along the strip and a press on Forecast: 2 presses where it was 5.
- A drag inside a forecast window still scrubs the hours, and now does so under a finger too, because the row no longer hands the move to the browser.
- A sideways swipe that starts on the strip no longer scrolls anything. Nothing on the strip scrolled.
