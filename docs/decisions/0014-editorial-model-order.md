# 0014. Forecast models are listed in an editorial order, and gfs_seamless is the default

- Status: Accepted
- Date: 2026-08-01 (git: the merge of #231)
- Decider: TJ (git: author and merger of #231)
- Issues and PRs: #230, #231
- Cited in code as: #230
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "The same split governs the far end per model"

## Context

The eight forecast models differ in grid spacing and in reach. A list sorted by reach puts the coarse global models first.

## Decision

`GET /api/capabilities` publishes `forecast_models` in `MODEL_INFO`'s declaration order, and a client renders it as given. That order is an editorial ranking for mountain terrain: grid spacing over the Cascades weighs more than forecast length. Each model's reach is published as `forecast_models[].forecast_hours`, and the calendar reads it. `DEFAULT_FORECAST_MODEL` is `gfs_seamless`.

## Evidence

The guide at 971fede: `gfs_seamless` is measurably two models, HRRR's 3 km grid to hour 45 and then GFS out to sixteen days, with no coverage cliff. The comment above `DEFAULT_FORECAST_MODEL` in `forecast_models.py` dates that measurement 2026-08-01 at Mount Rainier: `gfs_seamless` is byte-identical to `gfs_hrrr` for hours 0 to 45. The guide's hour 45 and the published reach differ: `GET /api/capabilities` publishes each model's reach as `forecast_models[].forecast_hours`, and at 971fede that was 42 for `gfs_hrrr`, a floor under its measured 49 and 42. A model's far edge is soft: asking past it returns nulls, not an error.

## Alternatives rejected

- Sorting by reach: roughly the reverse of the editorial order, so it undoes the ranking.
- Raw `gfs_hrrr` as the default: it has a coverage cliff.

## Consequences

The model picker and its chips show the published order: see [0031](0031-model-picker-listbox.md).
