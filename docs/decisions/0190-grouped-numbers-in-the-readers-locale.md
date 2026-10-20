# 0190. Grouped numbers follow the reader's locale, except the over-cap refusal, which mirrors the backend in en-US

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #688, 2026-10-18, answering the audit's question on number grouping: the reader's locale everywhere, the over-cap refusal kept at `en-US`.
- Issues and PRs: #688, #380 (mirror row 18), #PRNUM
- Cited in code as: #690
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `numbers.ts` bullet

## Context

Thirteen sites grouped a number's thousands in two shapes: `toLocaleString()`, which takes the reader's locale, and `toLocaleString('en-US')`. In a German browser one session printed both `1.500` and `1,500`. The over-cap refusal says `1,500 destinations` in `en-US` because the backend writes the same sentence with Python's `f"{n:,}"`, and mirror row 18 holds the two to one wording.

## Decision

- `grouped` in `utils/numbers.ts` is the one way to group a whole number, in the reader's own locale.
- The over-cap refusal (`capDetail` in `clientAnalyze.ts`) keeps `en-US`, so it reads the same whether the browser or the pod refuses.
- A decimal legend tick keeps `toFixed`: grouping is for whole numbers.
- The `number-format-one-home` lint fails a bare `toLocaleString()` anywhere but `numbers.ts`, and an `en-US` one anywhere but `clientAnalyze.ts`.

## Evidence

Audited 2026-10-17 at f971335: 13 grouping sites, two shapes. In `de-DE`, `(1500).toLocaleString()` is `1.500` and `(1500).toLocaleString('en-US')` is `1,500`.

## Alternatives rejected

- **`en-US` everywhere.** It matches the backend, but a reader who groups with a point would see a comma that means a decimal to them.
- **The reader's locale everywhere, the refusal included.** That splits mirror row 18: the browser and the pod would word one refusal two ways.

## Consequences

A reader whose locale groups with a comma sees no change. Other readers now see their own separator on the legend's ticks and the snow card's inches of 1,000 and up, where the `en-US` comma used to show; the maintainer accepted that. Only the refusal differs from the rest of a session, and it says the same thing as the pod.
