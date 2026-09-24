# 0050. Every scale on the map is drawn as one gradient

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 74

**Two styles over one set of samples** (`GridStyle`, `blocks` | `smooth`, **smooth by default since #460**), which are ONE raster layer under two magnification filters — `raster-resampling` is `nearest` for blocks and `linear` for smooth, so the whole switch is a paint property and there is no second layer to keep in step.

## From `frontend/src/CLAUDE.md`, line 80

Blocks shows *where the samples are* and overstates only its edges; smooth shows the field and hides how few samples are under it. Blocks was the default on that reasoning until #460, when TJ chose the field: a map whose markers take a continuous colour from `interpolateRgb` and whose grid paints a hard rectangle per sample reads as two encodings of one scale, and the honesty the blocks view carried is carried by the pitch the legend states instead. The segment and the `grid=` parameter both stay, so the sample view is one press away and a shared `grid=blocks` link still opens what it named. **Smoothing is between MODEL GRID POINTS, which is what makes it legitimate where #121's rejected raster was not**: Open-Meteo answers a coordinate with its containing grid cell's value, so sampling at the model's pitch means neighbouring samples are neighbouring grid cells and the blend between them is one the model already treats as continuous. #121's objection was to interpolating between *destinations* across a valley, and it still stands.

## From `frontend/src/CLAUDE.md`, line 86

**Every strip blends** (#460) and every strip is equal-width per band, never to scale, because 0.39 to 787 inches to scale is ten bands in two pixels. The snow strip was hard-stopped until then, on the grounds that NOAA's bands are a classification and a gradient shows depths NOAA never assigned a colour to; that is still true and is the accepted cost, because one legend box holding a strip of blocks beside a strip of gradient reads as two systems and the reader meets the box long before the distinction (TJ, 2026-09-22).
