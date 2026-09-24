# 0063. The smoke endpoint answers for all of North America, with no bbox

- Status: Accepted
- Date: 2026-08-04 (git: the merge of #245)
- Decider: TJ (git: author and merger of #245)
- Issues and PRs: #121, #203, #245
- Cited in code as: #121, #203, #245
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/smoke.py` bullet

## Context

The smoke overlay needs NOAA's plumes for the map's view. The wildfire endpoint filters its national snapshot by a bbox.

## Decision

`GET /api/smoke` answers with NOAA HMS plumes for the whole of North America and takes no bbox parameter. `analysis_date` rides as a foreign member beside `fetched_at`.

## Evidence

A busy day measured under half a megabyte (the guide's figure, not dated; git: #245, 2026-08-04). NIFC's full wildfire snapshot measured 16.5 MB on 2026-07-31 (see [0007](0007-national-wildfire-snapshot.md)).

## Alternatives rejected

- A bbox filter like the wildfire endpoint's: ceremony at under half a megabyte, where NIFC's 16.5 MB genuinely needed one.

## Consequences

HMS publishes one dated file a day and the first analyst pass lands around late morning Eastern, so before then the fetch falls back to yesterday, and `analysis_date` is the only field that says so. The feed itself is its own record: see [0017](0017-hms-smoke-feed.md).
