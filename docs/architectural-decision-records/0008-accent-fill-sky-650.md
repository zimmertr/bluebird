# 0008. The accent fill is the custom shade sky-650

- Status: Accepted
- Date: 2026-07-31 (git: the merge of #221)
- Decider: TJ (git: author and merger of #221)
- Issues and PRs: #165, #167, #168, #221
- Cited in code as: #165, #167
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc"

## Context

An accent fill with a white label owes two contrasts at once: 4.5:1 for the label on it (WCAG 1.4.3) and 3:1 for the fill against what sits beside it (1.4.11). The two bound the shade from opposite sides.

## Decision

The accent fill is the custom token `--color-sky-650`, defined and derived in `frontend/src/index.css`. The hover stays `sky-600`, on purpose.

## Evidence

Measured for #221 (git: 2026-07-31). On this palette the window that meets both contrasts is 0.0067 of relative luminance wide, and no Tailwind sky step is inside it. `sky-650` gives the white label 4.57:1, and the fill 3.21:1 on the panel, 3.04:1 on `DAY.range` and 3.91:1 on the segment track. `sky-600` fails the label at 4.02:1. `sky-700` fails the calendar at 2.37:1, where the ends of a selected range sink into the band between them. The measured slate-against-background table is in #165.

## Alternatives rejected

- `sky-600`: fails the label at 4.02:1.
- `sky-700`: fails the calendar at 2.37:1.
- A conformant hover: with a white label every lightening costs contrast, so it would have to darken. The hover at 4.02:1 is the one state under AA.

## Consequences

`styles.test.ts` pins every number, so a change forces a new measurement instead of a stale claim. That is how #167 shipped: the old comment said 4.6:1 where the truth was 4.02. `DAY.range` is the binding edge, so a change to that fill moves the floor and the shade must be derived again.
