# 0251. A segment and a choice row light their label in the accent under the pointer, as every trigger does

- Status: Accepted. Extends 0201's hover to segments and choice rows.
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #799, 2026-10-30: the hover must show in light, and one hover must hold for every control on a recessed ground. Option 1 of the hover lab for checkbox and radio rows, and the accent label for segments over a fill step, after a fill step on segments stood beside Columns' accent label in the results bar ("the type of inconsistency I hate").
- Issues and PRs: #799, #823
- Cited in code as: record 0251
- Guide: [`docs/STYLES.md`](../STYLES.md), `SEGMENT_IDLE`, `CHOICE_ROW`
- Related: 0158 (the light theme behind semantic tokens), 0201 (one menu for every trigger, whose hover is the accent label and edge)

## Context

Every segmented control (Current and Dates, All day and Hours, Lowest and Highest, Table, Chart and Both, the player's transport) draws its unchosen half with `SEGMENT_IDLE`. Its hover took the label from `ink-soft` to `ink`. In dark that is slate-400 to slate-200 and reads plainly; in light it is `#42474e` to `#181c21`, two near-blacks on white (1.83:1 between them), and the maintainer could not see it. A checkbox or radio row had no hover of its own, only the browser's on the box, a slightly darker edge, as faint in light.

A fill step on the idle segment was tried first, the same day. It showed in light, but in the results bar it stood beside Columns, whose hover since 0201 is the accent label, so two controls side by side answered the pointer two ways.

## Decision

One hover for every control on a recessed ground: its label takes the accent ink, and its edge too where it has one of its own. That is what dropdowns, menu triggers, chips and links already did; the idle segment (`not-disabled:hover:text-accent-ink`) and the checkbox or radio row (`has-[:enabled]:hover:text-accent-ink` on `CHOICE_ROW`) now do it too, not when disabled. A solid button still deepens its own fill, and a row in a list (a menu option, a table row, a calendar day) still takes a tint. Text fields keep no hover: their focus edge is their cue.

## Evidence

Measured 2026-10-30 from the theme tokens. The accent ink on a segment's recessed fill: 6.45:1 light, 8.17 dark. In light it parts from the resting label by hue; its luminance step is 1.45:1, under the 1.83 that could not be seen, and the accent label on Columns beside it showed plainly in the maintainer's screenshot. On a choice row: 5.74:1 on the light panel, 6.13 on the light menu card, 5.14 on a light menu row's hover fill; 6.71 on the dark panel and card, 4.74 on a dark menu row's hover fill.

## Alternatives rejected

- A fill step on the idle segment: tried and taken back the same day, for standing beside the accent label of the triggers.
- A fill step on every control, triggers and chips included: reverses 0201's hover across the app for no gain in light.
- Lightening the light theme's `ink-soft` so the label's own step shows: the token sets every caption and placeholder in the app.
- For a choice row, a soft accent halo round the box (Material's way), a row tint, and the label with the halo together (the hover lab): the halo is fussier, and the row tint barely parts from the light panel and needs padding on every row.
