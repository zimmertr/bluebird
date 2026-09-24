# 0027. A window older than the forecast data goes to the archive endpoint, split at one seam

- Status: Accepted
- Date: 2026-09-13 (git: the merge of #334)
- Decider: TJ (git: author and merger of #334)
- Issues and PRs: #123, #334
- Cited in code as: #123
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "Since #123 that number is a boundary rather than a wall"

## Context

Past the data edge every model answers nulls (see [0013](0013-accept-edge-not-data-edge.md)). Open-Meteo has an archive endpoint for older hours.

## Decision

`PAST_DATA_DAYS` is a boundary, not a wall. A window older than it goes to `archive-api.open-meteo.com`. At 971fede the calendar reached back a year; `GET /api/capabilities` publishes today's reach as `limits.archive_days`. `windowSource` and `window_source` are the only classifier, and `archiveBoundaryMs` and `archive_boundary` the only seam. A window that spans the seam is two fetches, one per endpoint, joined per location in time order before the aggregation runs. The routes classify once and pass the source and the boundary down. The pacer is acquired per span, and the joined series caches as `spanning`. The seam is named on screen in one info line. An archive window sends no `models=`.

## Evidence

Measured 2026-09-13: the archive's pressure levels and freezing level answer null under the unit `undefined`, so archive rows carry the 10 m wind, the 2 m temperature and no freezing level. The archive answers an unknown `models=` with a 200 and plausible data. `GET /api/capabilities` publishes the reach as `limits.archive_days`.

## Alternatives rejected

- A wall at the data edge: the earlier state.
- Forwarding a model the archive ignores: it answers with plausible data for the wrong question.
- A service that works out the boundary for itself: the instant moves with the clock, so it could cut a window where the classification saw no seam.
- Mixing halves that disagree on `hourly_units`, or a stamp that arrives on both sides: dropped instead.

## Consequences

The reach is a product choice, so it is published. The classifier and the straddle day are mirror rows 11 and 12. `weather_vectors.json` never learns that some windows arrive in halves. The model picker is disabled for an archive window ([0029](0029-archive-disables-picker.md)), and the forecast grid is out of play over any archive hours ([0016](0016-overlays-not-knobs.md)).
