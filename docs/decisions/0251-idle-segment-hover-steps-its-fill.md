# 0251. An idle segment steps up to the raised fill under the pointer, and a choice row's label takes the accent

- Status: Accepted
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #799, 2026-10-30: the unchosen half of a segmented control changes its fill on hover, in both themes, in the open PR; and a checkbox or radio row's label takes the accent ink on hover, option 1 of the hover lab, the same day.
- Issues and PRs: #799, #823
- Cited in code as: the maintainer, 2026-10-30, on `SEGMENT_IDLE`
- Guide: [`docs/STYLES.md`](../STYLES.md), `SEGMENT_IDLE`, `CHOICE_ROW`
- Related: 0158 (the light theme behind semantic tokens), 0201 (one menu for every trigger)

## Context

Every segmented control (Current and Dates, All day and Hours, Lowest and Highest, Table, Chart and Both, the player's transport) draws its unchosen half with `SEGMENT_IDLE`. Its hover changed the label alone, from `ink-soft` to `ink`. In dark that is slate-400 to slate-200 and reads plainly; in light it is `#42474e` to `#181c21`, two near-blacks on white, and the maintainer could not see it at all. A checkbox or radio row had no hover of its own, only the browser's on the box, a slightly darker edge, which in light was as faint.

## Decision

Under the pointer the idle half also steps from the recessed fill to the raised one (`not-disabled:hover:bg-raised`), keeping the label's step. A disabled half does not light. Text fields keep no hover: their focus edge is their cue. Dropdowns keep the hover they already had, the accent edge and label (record 0201), and a checkbox or radio row takes the same accent on its label (`CHOICE_ROW`, `has-[:enabled]:hover:text-accent-ink`), not on a disabled row.

## Evidence

Measured 2026-10-30 from the theme tokens:

| | Label step | Fill step | Ink on the raised fill |
|---|---|---|---|
| Dark | 2.13:1 | 1.73:1 | 8.40:1 |
| Light | 1.83:1 | 1.25:1 | 13.66:1 |

The accent label on a choice row: 5.74:1 on the light panel, 6.13 on the light menu card, 5.14 on a light menu row's hover fill; 6.71 on the dark panel and card, 4.74 on a dark menu row's hover fill.

## Alternatives rejected

- Lightening the light theme's `ink-soft` so the label's own step shows: the token sets every caption and placeholder in the app.
- A fill step on dropdowns too: they already light their edge and label in the accent, as every menu trigger does.
- For a choice row, a soft accent halo round the box (Material's way), a row tint, and the label with the halo together (the hover lab, 2026-10-30): the halo is fussier, and the row tint barely parts from the light panel and needs padding on every row.
