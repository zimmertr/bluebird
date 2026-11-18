# 0307. Alpenglow is the one button that spends a forecast

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer merges it.
- Date: 2026-11-17
- Decider: the maintainer, 2026-11-17 (the prototype's Forecast button, built into a PR)
- Issues and PRs: #825
- Cited in code as: record 0307
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Style through the design system

## Context

Analyze is a spend boundary (record 0003): it is the press that costs upstream calls against donated APIs. It wore the same sky accent as every other control that acts, so nothing about it said that this press, unlike the others, spends.

## Decision

A warm accent, alpenglow, is worn by the Forecast button and by nothing else. It is three tokens with a value in each theme, `act`, `act-hover` and `on-act`, behind the `ACT` role in `styles.ts`, and the hue ban covers them. The label is a dark ink, because a warm fill light enough to stand out on a dark map cannot carry a white label at 4.5:1.

## Evidence

Measured 2026-11-17 and pinned in `styles.test.ts`: dark, label 7.37:1 on `#e8925a` and the fill well over 3:1 on the panel; light, label 4.71:1 on `#cf6530`, the fill 3.37:1 on the panel and 3.01:1 on a raised surface. The light hover `#d96f38` lightens to gain label contrast (5.33:1) and stands 2.98:1 on the panel, the one state under 3:1, for the reason the sky accent's dark hover is (record 0008).

## Alternatives rejected

- The sky accent: says "this acts", which every control does.
- A white label: on a fill dark enough for it, the warm hue reads brown.
