# 0061. A pasted coordinate takes the elevation of the peak within 150 m

- Status: Accepted
- Date: 2026-07-30 (the measurement date; git: the merge of #209)
- Decider: TJ (git: author and merger of #209)
- Issues and PRs: #207, #209
- Cited in code as: #207
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` bullet, from "`enrich.py` is `enrich_custom`"

## Context

A custom destination arrives as a bare coordinate, so there is no OSM element to read an `ele` tag from. Resolving the point to the peak standing on it gives a pasted list the same elevation the other two ways in get for free.

## Decision

`enrich_custom` resolves each caller-supplied coordinate to the nearest peak within `CUSTOM_MATCH_RADIUS_M`, 150 m, in one batched `around` query, and fills elevation and `osm_id` only where the caller supplied none. It is best effort: every failure path returns the rows unchanged.

## Evidence

Measured 2026-07-30 against the bundled 100-peak Smoot list (the comment above `CUSTOM_MATCH_RADIUS_M` in `osm/enrich.py`): 97 of 100 matched, every match was the intended peak by name, the "Mix-up Peak" spelling variant included, and every matched node carried `ele`. 50 m lost four more to no match. 300 m bought one more at the cost of reaching further for it.

## Alternatives rejected

- 50 m: four more points with no match.
- 300 m: one more match, bought by reaching further.

## Consequences

The comment says to measure again before changing the radius. The query unions `natural=volcano` with `natural=peak`, because OSM tags volcanic summits as volcano instead of peak and Rainier, Baker and Adams would be missed. An analysis never fails over an elevation.
