# 0054. Snow depth comes from one national SNODAS grid the pod holds

- Status: Accepted
- Date: 2026-09-22 (git: shipped in #463)
- Decider: TJ (git: author and merger of #463)
- Issues and PRs: #449, #463
- Cited in code as: #449
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snodas.py` bullet

## Context

Ranking by snow depth needs a depth at every destination in an analysis.

## Decision

The pod holds one national SNODAS grid. It takes the unmasked snow depth member, product code `1036`, out of each day's NSIDC tar, reads the geometry from the header beside it, and keeps the 8192x4096 array of big-endian int16 millimetres as 64 MiB of bytes in memory. A lookup is one `struct.unpack_from` at a computed offset. The fetch checks the held grid's date first, so an hourly refresh is one `HEAD`, and a 404 falls back one day. No request waits for a cold grid: it answers nulls, schedules the refresh, and the rows read `N/A`, which is the same answer a destination outside the grid gets.

## Evidence

A lookup costs about 3.5 us (git: #463, 2026-09-22), so a 1,500-destination analysis (the candidate cap at 971fede; `GET /api/capabilities` publishes today's) costs no upstream call. The day's tar is published around 13:15 UTC (the guide's figure, not dated; git: #463). The grid covers 24.1N to 58.23N and 130.5W to 62.25W: the contiguous United States, southern Canada and northern Mexico, which is the same box the map's snow layer draws.

## Alternatives rejected

- A copy on disk: the pod runs `readOnlyRootFilesystem`.
- An assumed geometry: NSIDC has moved the masked extent once.
- An upstream call per destination.
- Waiting for a cold grid inside a request.

## Consequences

A report with no depths carries no `snow_analysis_date`. `warm_up()` in the lifespan makes a cold grid rare, and `conftest.py` neutralizes it and the cache so no test reaches NSIDC. The ceiling of the file is its own record: see [0053](0053-snow-depth-ceiling.md).
