# 0038. One Metrics table replaces Ranking and Filters, in two blocks with nothing between them

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #358)
- Decider: TJ (git: author and merger of #358)
- Issues and PRs: #341, #358, #449
- Cited in code as: #341, #449
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the paragraph that opens "The popover hangs off a button", from "The `Options` panel section is gone"

## Context

The panel had Options, Ranking and Filters sections.

## Decision

One Metrics table carries each metric's radio, aggregate dropdown and two bound boxes on one row. It reads in two blocks with nothing drawn between them: first the two wide controls, Rank by (one segment) and Max results; then the Min and Max headings and one row per rankable metric, alphabetical by noun. A snapshot family renders no aggregate dropdown and leaves that cell empty (#449). The units live in the boxes' placeholders.

## Evidence

Four of five per-row direction segments were always disabled. `Freezing level (ft)` does not fit beside three controls.

## Alternatives rejected

- A rule between the two blocks: tried in both weights and rejected, because that weight only ever says a new section begins.
- A direction segment on each row: the direction belongs to the ranking, not to a metric.

## Consequences

Shape tells the blocks apart: two wide controls over a table of narrow ones. The grid's four tracks line the bound boxes up with the wide controls, and `CONTROL_W` comes from this grid: see [0040](0040-control-width-from-metrics-grid.md).
