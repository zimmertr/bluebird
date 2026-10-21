# 0129. The calendar opens from a field as a popover, with 28px day rows under a fine pointer

- Status: Accepted. Amended by 0201 (the card stands 4px under its field at the field's width, or over it where it fits only there, and the field stays drawn while it is open).
- Date: 2026-10-13
- Decider: the maintainer, on #687 (2026-10-13: the audit's two P05 options approved as one, "a one-line date field that opens the calendar as a popover, with 28px day rows on a fine pointer"; the round-2 mockup confirmed the form). Then on the maintainer's third look at #707 the same day: the field is drawn only when it has something to show, and the open card stands in its place. And on the fourth: a close with no day picked goes back to Current, Current closes everything in one frame, and the card gets a Done button
- Issues and PRs: #687, #707
- Cited in code as: #687
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the paragraph that begins "A control sits beside its label"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ForecastCalendar.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), Forecast window

## Context

Choosing Dates grew the Forecast section from 111px to 424px at 1440x900 (the Hours row, the month bar and a grid of 36px rows in a bordered well), and to 550px on a phone, which put the hidden part of the panel body at 452px and 927px. The calendar was the tallest thing in the panel, and once a range was picked it said what it said in a block nobody needed to see again.

## Decision

- Under Dates the panel shows one full-width field, `SELECT`-styled with `ICON_ADORNMENT`'s arrow, holding the selected window in the words the results bar prints for an analyzed one (`windowCaption`), so the field adds no string. It is named by the When label and those words. It is drawn only when it has something to show: with no range picked there is no field, because an empty box above the card said nothing, and while the card is open the card stands in its place.
- The field is the one panel control that may stand two lines tall (`CALENDAR_FIELD`), because the longest window, an hourly one with a year (about 322px at 12px), cannot fit its 261 to 293px of text room and an ellipsis cut off the end time; it aligns to its top, so the first line and the arrow stand where a one-line field puts them and the box grows only when the words need it.
- A press opens the Hours row, the month bar and the grid in a card on `Popover.tsx`'s surface, standing where the field stood with its top on the field's top (`usePopover`'s `cover`, placed against the slot under When, which stays in the layout while the field is not drawn), on `CALENDAR_GROUND`: the well's slate-900 fill without its border, because the card draws the edge. The keyboard lands on the selected day. Escape, a press outside and Tab past either edge close it; Escape also abandons a half-made range. Picking stays open, so a range takes two presses in one visit. A footer under the grid holds `Done`, right-justified, in draw mode's `BUTTON_ACCENT` and its word, so closing is a control and not only a press outside; it closes the way every other close does, and the keyboard lands on the field, or on Current when no day was picked. The footer sits outside the scrolling ground, so a card capped by a short window keeps Done in view.
- Choosing Dates with no range to bring back opens the card on its own, where the field would stand. Closing it without a pick, by Escape, a press outside or Tab, puts the arm back on Current, because Dates with no day holds nothing (keeping the card open until a pick was declined); a close over a picked range keeps Dates and the field. A link that carries Dates with no day shows the segment alone, and Dates pressed again opens the card. Bringing a range back opens nothing. Current closes the card, the field and the Hours row in one render: the segment is exempt from the card's press-outside dismissal (`usePopover`'s `ownPressRef`), because that dismissal closed the card on pointerdown and the arm changed on the click a moment later. The page, the anchor and the remembered range stay the calendar's own state, so a close is not a reset.
- Day rows are 28px on a fine pointer and 44 under touch (`DAY.cell`); the weekday initials keep the 36px the rows had (`DAY.head`).
- Full width, like the calendar it replaces: record 0040's exception for a control too wide to sit beside its label.

## Evidence

Measured 2026-10-13 in Chromium in the pinned Playwright image, with tomorrow and the day after selected and a ring drawn:

| | 1440x900 before | after | 390x844 touch before | after |
|---|---|---|---|---|
| Forecast section | 424px | 149px | 550px | 201px |
| Hidden part of the body | 452px | 147px | 927px | 520px |
| The popover card | | 317 x 309px | | 325 x 453px |

The field is 30px tall on a fine pointer and 44 under touch. The card at 309px holds five week rows of 28px and the Done footer (44px of it); without Done it was 265px, and at 36px rows it was 40px taller again. The hidden figures include this PR's other rows (the 57px header, the 32px Metrics pitch and the Destinations changes of record 0137). At 1440x900 the open card's top is the field's top, 497px, with the range picked and without one, and it still fits below it (its bottom at 806px of 892). On a phone it cannot: the field's top is 608px and the 453px card has 228px under it, so `cover` pushes it up to 385px at 390x844 (223px) and 341px at 360x800 (267px), as far as it must and no further; without Done it rose 163px and 207px. With no range the When row is the segment alone, open or closed, and no field is drawn (measured in the same run). `ForecastCalendar.test.tsx` holds the field's words, the card opening on the selected day in the field's place, no field under Dates with no range, Escape and a press outside with no day picked going back to Current, a close over a range keeping Dates and the field, a link's dateless Dates opening the card, Current leaving the card standing on pointerdown and taking it and the field away together on the click, Done over a range keeping Dates with the keyboard on the field, Done with no day going back to Current with the keyboard there, a range picked in one visit, the keyboard, Escape handing the field back, and Current closing the card.

## Alternatives rejected

- **28px rows alone** (the audit's option A): saved 40 to 48px and left the 384px grid standing in the panel.
- **The field alone with 36px rows** (option B as first drawn): the merged form takes the shorter rows too, because a mouse needs no more.
- **An empty field under Dates, and the card beside the field** (built in this PR, reversed on the maintainer's third look, 2026-10-13): with no range picked an empty box stood above the open card, and with one the card hung under or over a field that repeated the window it was choosing.
- **The grid on the card's own slate-800**, as the mockup drew it: `DAY.range` is sky-950, which reads against slate-800 by hue alone (1.05:1) and against slate-900 at 1.28:1, so the calendar keeps its ground; the mockup's range had no day between its two ends, so the band was never on screen to judge.

## Consequences

`SURFACE_GROUP` and `SURFACE_GROUP_BLEED` are gone with the well, and with them the gap between the well and the panel's scroll bar that #697 measured. `CALENDAR_GROUND` holds the calendar's ratios, and `DAY.range` and `--color-sky-650` are unchanged. The card is placed by `usePopover` with `cover`, against the slot under When, so it stands where the field stands and moves up only as far as the screen needs, which on a phone is most of its height. The keyboard goes back to the field on a close when there is one, and to Dates when there is not.
