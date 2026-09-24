# 0011. Discovery sends one Overpass query for every destination type

- Status: Accepted
- Date: 2026-07-31 (git: the guide text first appears in #229)
- Decider: TJ (git: author and merger of #229)
- Issues and PRs: #229
- Cited in code as: #229
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, step 2 of `POST /api/analyze`

## Context

Overpass is donated, and discovery is the slowest step of an analysis.

## Decision

`destination_types` is a set. Peaks, trailheads and lakes are found by one Overpass query whose clauses are unioned (`_CLAUSES` in `osm/query.py`), never by one request per type. Each element is classified from its own tags (`_classify`), so a row says what it is rather than what was asked for. An empty set skips discovery, which is how an analysis of only custom destinations is expressed. Discovery is cached about 10 minutes per polygon and sorted type set.

## Evidence

No dated measurement. The reasons are the donated server and the latency.

## Alternatives rejected

- One request per type: more load on a donated server, and more latency on the slowest step.

## Consequences

Order and duplicates in the type set cannot make a second cache entry. `IMPLEMENTED_TYPES` gates the types, and `GET /api/capabilities` publishes it. A new type follows the `add-destination-type` skill.
