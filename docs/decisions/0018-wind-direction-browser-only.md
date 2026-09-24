# 0018. Only the browser fetches the wind direction

- Status: Accepted
- Date: 2026-08-04 (git: `wind_direction_10m` joined the browser's fetch in #245; the guide text dates from #398)
- Decider: TJ (git: author and merger of #245)
- Issues and PRs: #121, #245, #398
- Cited in code as: #121, #245
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "The wind bearing the map's playback arrows read"

## Context

Timeline playback draws wind arrows, which need a bearing. Nothing the backend computes uses one.

## Decision

Only the browser fetches `wind_direction_10m`. It rides `HourlySeries` as an optional field the client fills in, the way `series_times` does, and it is not part of `weatherSeries`.

## Evidence

It costs nothing: the weight factor is `max(1, vars × models / 10)`, and at 971fede the bearing was one variable in a request that carried fifteen from the browser and fourteen from the pod.

## Alternatives rejected

- Adding it to `weatherSeries`: a semantic change to a shared aggregation that `weather_vectors.json` pins byte for byte, for the sake of a picture.

## Consequences

Mirror row 8 is off by one on purpose: `HOURLY_VARIABLES` has one more entry than `N_VARIABLES`. This pair must not become a mirror.
