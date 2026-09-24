# 0012. Unnamed peaks are off by default

- Status: Accepted
- Date: 2026-07-31 (git: the guide text first appears in #229)
- Decider: TJ (git: author and merger of #229)
- Issues and PRs: #229
- Cited in code as: #229
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, step 2 of `POST /api/analyze`

## Context

Many summits in OpenStreetMap have an elevation and no name.

## Decision

`include_unnamed_peaks` adds `_UNNAMED_PEAK_CLAUSES`: peaks with an `ele` and no `name`. It is off by default. Such a peak is named from its elevation, as in `Peak 5961`, the same string `basemapPoi.ts` builds for a clicked one, so both routes produce one destination. The flag joins the discovery cache key, and generated names dedup by OSM id.

## Evidence

The flag roughly triples the candidate count (the guide's figure, not dated).

## Alternatives rejected

- On by default: it triples the fan-out.
- Filtering one cached result by the flag: the flag is part of the cache key instead.
- Dedup by name: every unnamed summit at one elevation would collapse into a single row.

## Consequences

The name is mirror row 20 (`osm.query._ele_ft` and `basemapPoi.FEET_PER_METER`), held by a comment. Turning the flag on or off is a data knob and raises `types-changed`.
