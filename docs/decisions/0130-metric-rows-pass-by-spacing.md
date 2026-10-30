# 0130. The Metrics rows pass WCAG 2.2's target spacing by a 32px pitch, not by bigger targets

- Status: Accepted. Amended by 0223 (under touch the label is 32px) and 0242 (the radio label is gone, so the rows are their 22px controls at a 28px pitch, which passes by 2px each side, and `METRIC_LABEL_PITCH` with it).
- Date: 2026-10-13
- Decider: the maintainer, on #687 (2026-10-13: the 32px pitch chosen over 24px targets from the round-2 mockup)
- Issues and PRs: #687
- Cited in code as: #687
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MetricsTable.tsx` bullet; [`docs/STYLES.md`](../STYLES.md), `METRIC_LABEL_PITCH`

## Context

Each metric's radio label is 16px tall and each bound box 22px, at a 28px row pitch. By the spacing test of WCAG 2.2 SC 2.5.8 (AA), a 24px circle centred on each undersized target must meet no other target, and every metric row #687's audit reached failed it on a fine pointer: 5 to 10 targets per viewport, depending on how many rows the window showed (2026-10-13). A touch screen already passes, because `TAP.row` makes the label 44px.

## Decision

5px of margin above and below each metric's radio label on a fine pointer (`METRIC_LABEL_PITCH`, `my-[5px] touch:my-0`), which makes each row 26px and, with the grid's 6px row gap, sets the rows 32px apart. Nothing anyone presses changes size: the radio, the aggregate dropdown and the boxes keep theirs, and pass by spacing.

## Evidence

- The arithmetic, pinned in `styles.test.ts`: a 16px label with 5px above and below is 26px, past the 22px boxes beside it, plus the 6px gap is 32. A 24px circle on the label reaches 4px past it, inside its own 5px margin.
- Measured 2026-10-13 at 1440x900: the Metrics section goes from 359 to 387px. Under touch it is unchanged at 575px on a 390x844 phone.

## Alternatives rejected

- **24px targets at a 30px pitch** (round 2's option A): the radio label grows from 188x16 to 188x24 and every bound box from 56x22 to 56x24 on every pointer, the section to 375px. It passes by size, and it changes the size of every box in the section, Max results included, since that is the same role.

## Consequences

The section is 28px taller on a fine pointer, which the panel's scroll shadows mark when it runs below the fold. A change to the label's line height, the boxes' height or the grid's row gap moves the pitch and fails `styles.test.ts`.
