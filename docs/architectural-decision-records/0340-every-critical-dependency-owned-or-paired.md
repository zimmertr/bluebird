# 0340. Every dependency on an analysis's path is owned or paired

- Status: Proposed, in the reliability PR; accepted when the maintainer approves it and merges it. Would supersede [0296](0296-outlast-a-stuck-open-meteo-host.md)'s minute of outage waits once a second weather source exists.
- Date: 2026-11-25
- Decider: the maintainer set the goal on 2026-11-25; this is the proposed architecture
- Issues and PRs: #934, #760
- Cited in code as: record 0340
- Guide: [`docs/RELIABILITY.md`](../RELIABILITY.md), The Architecture

## Context

One weather provider, one tile host, one house and one tunnel sit alone on the path from opening the site to a ranked table. Retrying harder cannot meet a target of "a provider down for a week stops nothing". The places table (record 0176) and the shared snapshots (record 0182) already showed the way out for discovery and the overlays: own the data.

## Decision

- Every dependency on the path is owned (it runs on our machines, or its data is copied somewhere we control) or paired with a second source that fails for different reasons, and the path used in a failure is the one used every day.
- The page and its hashed assets are served from static hosting at the edge, keeping the last few builds' assets; only `/api/*` reaches the house.
- Weather comes from a list of sources the pod publishes, asked in order with a hedged request, a circuit breaker per source and one time budget per run. The second source is a copy of Open-Meteo, which gives the same numbers, and it must prove its freshness and agreement or take itself out of service.
- Discovery reads an edge copy of the places table first, and the pod second.
- The map mounts its tools without the remote style.
- Past windows stay on Open-Meteo's archive host, protected only by the retries, because a faithful archive mirror is as large as the forecast one.
- Cloudflare-wide incidents are accepted and left out of the budget, unless the maintainer decides otherwise.

## Evidence

- 2026-11-25, `s3://openmeteo`: files a mirror must hold for all eight models at about 58 days back come to 350 GB measured as a floor, 450 to 600 GB estimated with every blend member and both wind components; the elevation model is 10.5 GB; the archive's ECMWF part is about 32 GB per variable per year.
- 2026-11-13: `api.open-meteo.com` hung for over a minute and every analysis failed (#934).
- 2026-11-25, Prometheus: the two Overpass mirrors answered 21 of 152 requests over 30 days.

## Consequences

- Where the weather copy runs, and who pays for it, is the maintainer's call; the app treats it as configuration.
- Each "rides it out" claim becomes a browser-suite spec that makes a host fail.
