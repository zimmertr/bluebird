# 0015. Stacking order is one named table, LAYER

- Status: Accepted
- Date: 2026-08-02 (git: the merge of #235)
- Decider: TJ (git: author and merger of #235)
- Issues and PRs: #235
- Cited in code as: none
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/styles.ts` bullet

## Context

The model picker shipped behind the mobile drawer that contains it. The two z-index values had been chosen in different files and never compared.

## Decision

`LAYER` in `styles.ts` names the stacking order. Components take their z-index from it instead of choosing one at the call site.

## Evidence

The bug above. No measurement.

## Alternatives rejected

- A z-index chosen at each call site: how the picker ended up behind its own drawer.

## Consequences

`styles.test.ts` enforces that components compose the `styles.ts` roles.
