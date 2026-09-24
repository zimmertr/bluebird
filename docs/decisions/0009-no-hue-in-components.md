# 0009. No component names a hue

- Status: Accepted
- Date: 2026-07-31 (git: the merge of #221)
- Decider: TJ (git: author and merger of #221)
- Issues and PRs: #167, #221
- Cited in code as: #167
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc"

## Context

Every hue in the app carries a meaning: the accent says "this acts", and green, amber and red say how an analysis is going. #167 found three ambers, four notice boxes in three shapes, and a primary button one shade off the blocks it was meant to match.

## Decision

No component names a hue. ESLint fails any colour utility in a non-slate hue anywhere under `components/`, `map/` or `App.tsx`. A hue is the design system's decision in `styles.ts`, not a call site's. Slate stays compositional: it is the surface system the roles already cover.

## Evidence

The #167 audit above. No dated measurement.

## Alternatives rejected

- Hues chosen at the call site: how the three ambers and four notice boxes happened.

## Consequences

Every new colour is a role in `styles.ts`, with its reason in a comment and an assertion in `styles.test.ts`. Tailwind v4 resolves competing colour utilities by stylesheet order, not class-list order, so a call site could not override a role's colour anyway.
