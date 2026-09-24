# 0040. CONTROL_W is 118px, set by the Metrics grid

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #358). The rule that a control never picks its own width came with #237 on 2026-08-02.
- Decider: TJ (git: author and merger of #358)
- Issues and PRs: #237, #341, #358
- Cited in code as: #341
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "A control sits beside its label, not beneath it, and never picks its own width"

## Context

Every panel control sits beside its label, wears `CONTROL_W`, and shares a baseline. The panel is 360px docked on a desktop and 100vw minus 2rem, capped at 360px, on a phone.

## Decision

`CONTROL_W` is 118px: 2 × `METRIC_BOX_W` plus the grid's `gap-x-1.5`, so the Forecast section's controls stand on the same edges as the Metrics bound boxes and the panel is one column. `SELECT` reserves `pr-6`, and there is one `SEGMENT_ITEM` inset of 4px. `CHART_METRIC_W` stays at 144px, because it lives in the results sheet and its labels carry units.

## Evidence

The column edges measure at 225 and 343. `CONTROL_W` was 144px, set by the widest segment label, until the metric row's label budget (`Freezing level` beside a dropdown and two boxes, in 327px of content) forced narrower boxes and left the two sections 26px apart. `UK Met Office` is 79.7px in the model picker's 84px of label. An 8px segment inset clips `Current` and `Highest` in a 57.5px half. `Freezing level (ft)` is 99.3px.

## Alternatives rejected

- 144px: the two sections stood 26px apart.
- `pr-8` on `SELECT`: 24px is the 16px glyph at its 8px offset and nothing more.
- An 8px segment inset: it clips two labels.

## Consequences

`styles.test.ts` does both sums against the measured words and fails any width `ControlPanel.tsx` spells for itself. The Metrics grid sizes nothing by the token. A control too wide to sit inline (the CSV textarea, the calendar) keeps its own block.
