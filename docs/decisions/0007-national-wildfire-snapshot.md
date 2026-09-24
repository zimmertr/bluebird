# 0007. The pod holds one national wildfire snapshot and filters it per request

- Status: Accepted
- Date: 2026-07-31 (git: the merge of #218)
- Decider: TJ (git: author and merger of #218)
- Issues and PRs: #203, #218
- Cited in code as: #203
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/nifc.py` bullet

## Context

Fire perimeters came from an ArcGIS query per visitor. ArcGIS refuses an exhausted quota with HTTP 200 and the error in the body, and the quota is shared across an organization.

## Decision

The pod holds one national snapshot for each fidelity: full resolution for API callers, and about 56 m simplified for the map picture and the proximity math. It is one paged query with no geometry filter. Features are held as the JSON text NIFC sent plus a bbox for each feature, so a request is a filter and a join. The cache is a `SnapshotCache`: singleflight, and stale tolerant, so an aged snapshot is served at once and refreshed behind the request.

## Evidence

Measured 2026-07-31 at 232 active fires: 16.5 MB full and 1.3 MB coarse, so the country fits in a pod. Parsing 861k coordinates costs about 100 MB in Python. A cold fetch measured 6.7 s.

## Alternatives rejected

- A query for each caller's bbox: it spends the shared quota once for each visitor, and a bbox has to handle the Aleutians straddling the antimeridian.
- Parsed geometry in memory: about 100 MB, and a viewport would then be a re-encode.

## Consequences

Nothing keys on the caller's bbox. The body of every answer is checked, because `raise_for_status` learns nothing from an over-quota 200. The coarse tolerance is mirror row 10 (`COARSE_OFFSET_DEG` and `COARSE_TOLERANCE_DEG`). Fire proximity reads this snapshot, which is why its `unavailable` state is rare: see [0020](0020-fire-warn-10-miles.md).
