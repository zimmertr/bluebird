# 0014. Forecast models are listed in an editorial order, and gfs_seamless is the default

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 138

The same split governs the far end per model: `forecast_model` bounds the band inside `FUTURE_LIMIT_DAYS`, and unlike it the model edge is soft — asking past it returns nulls, not an error. That per-model reach IS published, by `/api/capabilities` under `forecast_models[].forecast_hours`, so the calendar reads it rather than compiling it; `FUTURE_LIMIT_DAYS` remains the one edge nothing publishes. **`forecast_models` is published in `MODEL_INFO`'s declaration order and must be rendered as given**: that order is an editorial ranking for mountain terrain (grid spacing over the Cascades weighted above forecast length) and is roughly the *reverse* of sorting by reach, so a client that re-sorts undoes it. `DEFAULT_FORECAST_MODEL` is `gfs_seamless` because it is measurably two models — HRRR's 3 km grid to hour 45, GFS's out to sixteen days — with no coverage cliff, which raw `gfs_hrrr` cannot offer.
