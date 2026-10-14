# 0129. The calendar opens from a field as a popover, with 28px day rows under a fine pointer

- Status: Accepted
- Date: 2026-10-13
- Decider: the maintainer, on #687 (2026-10-13: the audit's two P05 options approved as one, "a one-line date field that opens the calendar as a popover, with 28px day rows on a fine pointer"; the round-2 mockup confirmed the form)
- Issues and PRs: #687
- Cited in code as: #687
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the paragraph that begins "A control sits beside its label"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ForecastCalendar.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), Forecast window

## Context

Choosing Dates grew the Forecast section from 111px to 424px at 1440x900 (the Hours row, the month bar and a grid of 36px rows in a bordered well), and to 550px on a phone, which put the hidden part of the panel body at 452px and 927px. The calendar was the tallest thing in the panel, and once a range was picked it said what it said in a block nobody needed to see again.

## Decision

- Under Dates the panel shows one full-width field, `SELECT`-styled with `ICON_ADORNMENT`'s arrow, holding the selected window in the words the results bar prints for an analyzed one (`windowCaption`), so the field adds no string. It is named by the When label and those words. Empty until a day is picked.
- The field is the one panel control that may stand two lines tall (`CALENDAR_FIELD`), because the longest window, an hourly one with a year (about 322px at 12px), cannot fit its 261 to 293px of text room and an ellipsis cut off the end time; it aligns to its top, so the first line and the arrow stand where a one-line field puts them and the box grows only when the words need it.
- A press opens the Hours row, the month bar and the grid in a card on `Popover.tsx`'s surface, on `CALENDAR_GROUND`: the well's slate-900 fill without its border, because the card draws the edge. The keyboard lands on the selected day. Escape, a press outside and Tab past either edge close it; Escape also abandons a half-made range. Picking stays open, so a range takes two presses in one visit.
- Choosing Dates with no range to bring back opens the card on its own; bringing a range back opens nothing; Current closes it. The page, the anchor and the remembered range stay the calendar's own state, so a close is not a reset.
- Day rows are 28px on a fine pointer and 44 under touch (`DAY.cell`); the weekday initials keep the 36px the rows had (`DAY.head`).
- Full width, like the calendar it replaces: record 0040's exception for a control too wide to sit beside its label.

## Evidence

Measured 2026-10-13 in Chromium in the pinned Playwright image, with tomorrow and the day after selected and a ring drawn:

| | 1440x900 before | after | 390x844 touch before | after |
|---|---|---|---|---|
| Forecast section | 424px | 149px | 550px | 201px |
| Hidden part of the body | 452px | 181px | 927px | 568px |
| The popover card | | 317 x 265px | | 325 x 393px |

The field is 30px tall on a fine pointer and 44 under touch. The card at 265px holds five week rows of 28px; at 36px it was 40px taller. The hidden figures include this PR's other rows (the 57px header and the 32px Metrics pitch). `ForecastCalendar.test.tsx` holds the field's words, opening on the selected day, a range picked in one visit, a press outside, the keyboard, Escape handing the field back, and Current closing the card.

## Alternatives rejected

- **28px rows alone** (the audit's option A): saved 40 to 48px and left the 384px grid standing in the panel.
- **The field alone with 36px rows** (option B as first drawn): the merged form takes the shorter rows too, because a mouse needs no more.
- **The grid on the card's own slate-800**, as the mockup drew it: `DAY.range` is sky-950, which reads against slate-800 by hue alone (1.05:1) and against slate-900 at 1.28:1, so the calendar keeps its ground; the mockup's range had no day between its two ends, so the band was never on screen to judge.

## Consequences

`SURFACE_GROUP` and `SURFACE_GROUP_BLEED` are gone with the well, and with them the gap between the well and the panel's scroll bar that #697 measured. `CALENDAR_GROUND` holds the calendar's ratios, and `DAY.range` and `--color-sky-650` are unchanged. The card is placed by `usePopover`, so on a phone it opens over whatever side of the field has the room, which is usually above it.
