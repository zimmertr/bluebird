# 0048. The map legend is one box, in alphabetical order, anchored at the top

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #459); the guide records the order and the strip as TJ, 2026-09-17
- Decider: TJ (git: author and merger of #459); the section order and the in-strip numbers are TJ's, 2026-09-17
- Issues and PRs: #249, #446, #454, #459
- Cited in code as: #249, #446, #454
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet, from "The map's legend is ONE box"

## Context

Five separate legend boxes cost about 100px of a phone map that can be 161px tall: each box brings a border, a gap and a backdrop.

## Decision

The map legend is one box. It gains and loses sections as layers toggle and as the ranking changes, and the metric colour key is one of its sections. Sections read in alphabetical order by the label they render, sorted at run time because one label is the ranked metric's. A key on a single value is a row; a key on a scale is a strip with its numbers inside it, along the bottom edge, on a scrim. The stack is anchored at the top, under the Layers button, grows downward, and clears the button column by one of the column's 4px gaps (`LEGEND_TOP`).

## Evidence

Merging the last two boxes took the stack from 313px to 182px (measured 2026-09-17 at 402px wide, every layer on). The button column ends at 92 and 108 (measured 2026-09-14), and `LEGEND_TOP` is 132 and 156 while the Controls button is in the column. Numbers inside the strip save 14px a section over two sections (git: #459, 2026-09-17). A column pushed to its end edge overflows past its start and is unreachable (measured at 402x874 with four of five boxes; git: first written in #248, 2026-08-05).

## Alternatives rejected

- A box for each layer: the border, gap and backdrop each.
- Numbers under the strip: two lines where one does.
- A bottom anchor: the stack rode up and down with every panel drag and ended under the forecast player; `justify-end` or an auto margin puts content where no scroll reaches.
- `top-16`: it cut through the Layers button and, rendering later, painted over it.

## Consequences

The linter's `map-stage-anchors` check fails either end-anchor pattern. `LEGEND_TOP` is two numbers, one for a pointer and one for a coarse pointer, because `TAP` floors the search row and the Layers button at 44 for a finger. Re-measure `LEGEND_STACK_PX` when a section joins, not when a band does.
