# 0060. The discovery wait is narrated in tiers set by measured mirror times, with no promised ceiling

- Status: Accepted
- Date: 2026-07-29 (git: the merge of #181, which tiered the copy to measured times; #179 added the staged copy on 2026-07-28)
- Decider: TJ (git: author and merger of #181)
- Issues and PRs: #179, #180, #181
- Cited in code as: #180, #181
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/analyzeOverlay.ts` bullet

## Context

Discovery on a large polygon can take tens of seconds, and a paced analysis waits on purpose. A wait with nothing new on screen reads as a hang.

## Decision

The overlay's one detail line narrates the wait. During discovery its staged reassurance is tiered to the measured Overpass mirror behaviour, not to a round number, and it promises no ceiling: after `STILL_SEARCHING_AFTER_S` (20 s) it says a large analysis can take a while. During a paced fetch a countdown says the wait is scheduled. The heading carries the total and never a live fraction, which the bar underneath already draws.

## Evidence

The comment above `STILL_SEARCHING_AFTER_S` in `analyzeOverlay.ts` (not dated; git: #181, 2026-07-29): overpass-api.de answers big polygons in 12 to 42 s, and a failover adds the backup mirror's 38 to 45 s on top.

## Alternatives rejected

- "Up to 30 seconds", the earlier copy: it measured false the first time a search crossed it.
- A live fraction in the heading: the bar already draws it.

## Consequences

Tier one covers the common case, and both tiers now show the same message. The mirror order and budgets the times come from live in `osm/mirrors.py`.
