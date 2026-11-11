# 0033. Each compared line wears its own colour and a full name, with no key and no model cap

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #333)
- Decider: TJ, in the #232 review (the key was removed in round four); git: author and merger of #333
- Issues and PRs: #232, #333, #513, #514
- Cited in code as: #232
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/modelCompare.ts` bullet

## Context

A comparison draws one line per destination and model: three destinations under three models is nine lines.

## Decision

There is no cap on compared models. Every line is solid, and colour is the only channel. Every destination and model pair wears its own colour from the app's one allocator, `allocateColors`; the pair of a destination and the ranking model keeps the destination's colour. Every entry is named rank, then destination, then model. `ModelCompare.tsx` carries no key.

## Evidence

No measurement. The calls came from the #232 review.

## Alternatives rejected

- `MAX_COMPARE_MODELS`: removed in the #232 review, because the ceiling hid the control that set it; the Analyze click bounds the spend.
- A line style for each model: `styles.ts` has no stroke pattern table, and a point-sample window draws dots.
- A colour for each model: two lines of one model would share a hue.
- A key that named the destination on one line and the model on the next: the review's second finding.
- A row of chips naming each model in its colour: built and removed (TJ, #232 review, round four), because the hover box already names every entry and the chips repeated the picker.

## Consequences

The linter's `compare-notes-no-control` check keeps `ModelCompare.tsx` free of controls. The chart-only legend reads the same pairs (#513).
