# 0036. Windy links follow a grammar measured against the live site

- Status: Accepted
- Date: 2026-09-14 (the guide's measurement date; git: the text first appears in #358)
- Decider: TJ (git: author and merger of #358)
- Issues and PRs: #358, #449
- Cited in code as: #449
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/windy.ts` bullet

## Context

A metric cell and a popup row link to Windy, and Windy's deep-link grammar is undocumented.

## Decision

`windy.ts` builds links from a grammar measured against the live site, and the file's head comment is the record of it. Model tokens come from Windy's own `W.products` registry, matched by provider, so a reader who picked the Met Office lands on the Met Office's model. Snow depth opens `snowcover` at Windy's own now, because it names no hour.

## Evidence

Measured 2026-09-14: the time token is UTC, Windy snaps the hour to the model's own step, and it ignores an hour in the past. A regional token outside its domain falls back to ECMWF on Windy's side.

## Alternatives rejected

- Coverage polygons in the app: Windy's own fallback makes them unneeded.
- An hour for a snow depth link: the metric names no hour (#449).

## Consequences

A change on Windy's side needs a new measurement, recorded in the head comment.
