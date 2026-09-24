# 0049. A legend strip prints three ticks and no unit

- Status: Accepted
- Date: 2026-09-17 (the guide: "TJ, 2026-09-17"; git: shipped in #459)
- Decider: TJ, as the guide records
- Issues and PRs: #454, #459
- Cited in code as: #454
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/utils/legendRamp.ts` bullet, from "`scaleTicks` prints THREE"

## Context

A scale strip names its bands with numbers drawn on it.

## Decision

`scaleTicks` prints three of a metric scale's five boundaries. A tick is the threshold itself, formatted, and it carries no unit: the section's label does (`metricLabel`, reading the scale's unit). The snow layer reads `Snow depth (in) (NOHRSC)`, its unit in its own parentheses and the credit in a second pair.

## Evidence

Five ticks land 27px apart on a 162px strip, and the freezing level's are 28 to 33px wide, so they overlapped into one run of digits (Chrome, 2026-09-17).

## Alternatives rejected

- Five ticks: they overlap.
- Captions written beside the strip: a caption can disagree with the colour it names.
- A unit on each tick: TJ chose the label, which keeps `AQI` a bare noun and the strip's widest label three characters shorter (2026-09-17).

## Consequences

Playback's swap to `in/hr` relabels the strip together with its bands. No strip on the map carries a unit among its numbers.
