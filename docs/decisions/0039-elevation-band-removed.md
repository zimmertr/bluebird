# 0039. The app sends no elevation band

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #358)
- Decider: TJ (git: author and merger of #358)
- Issues and PRs: #341, #358
- Cited in code as: #341
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The app sends no elevation band"

## Context

The panel had an elevation minimum and maximum filter.

## Decision

The app sends no elevation band. `min_elevation_ft` and `max_elevation_ft` stay on `POST /api/analyze` and `POST /api/destinations` for API callers. An old share link's `minel` and `maxel` parse to nothing.

## Evidence

The filter was little used, and its placement fought the Metrics table (#341).

## Alternatives rejected

- Keeping the filter in the panel.

## Consequences

The browser path analyzes whatever the ring finds.
