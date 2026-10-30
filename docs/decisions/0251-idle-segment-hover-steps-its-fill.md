# 0251. An idle segment steps up to the raised fill under the pointer

- Status: Accepted
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #799, 2026-10-30: the unchosen half of a segmented control changes its fill on hover, in both themes, in the open PR.
- Issues and PRs: #799, #823
- Cited in code as: the maintainer, 2026-10-30, on `SEGMENT_IDLE`
- Guide: [`docs/STYLES.md`](../STYLES.md), `SEGMENT_IDLE`
- Related: 0158 (the light theme behind semantic tokens), 0201 (one menu for every trigger)

## Context

Every segmented control (Current and Dates, All day and Hours, Lowest and Highest, Table, Chart and Both, the player's transport) draws its unchosen half with `SEGMENT_IDLE`. Its hover changed the label alone, from `ink-soft` to `ink`. In dark that is slate-400 to slate-200 and reads plainly; in light it is `#42474e` to `#181c21`, two near-blacks on white, and the maintainer could not see it at all.

## Decision

Under the pointer the idle half also steps from the recessed fill to the raised one (`not-disabled:hover:bg-raised`), keeping the label's step. A disabled half does not light. Text fields keep no hover: their focus edge is their cue. Dropdowns keep the hover they already had, the accent edge and label (record 0201).

## Evidence

Measured 2026-10-30 from the theme tokens:

| | Label step | Fill step | Ink on the raised fill |
|---|---|---|---|
| Dark | 2.13:1 | 1.73:1 | 8.40:1 |
| Light | 1.83:1 | 1.25:1 | 13.66:1 |

## Alternatives rejected

- Lightening the light theme's `ink-soft` so the label's own step shows: the token sets every caption and placeholder in the app.
- A fill step on dropdowns too: they already light their edge and label in the accent, as every menu trigger does.
