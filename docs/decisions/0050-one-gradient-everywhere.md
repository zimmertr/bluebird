# 0050. Every scale on the map is drawn as one gradient

- Status: Accepted
- Date: 2026-09-22 (the guide: "TJ, 2026-09-22"; git: the merge of #461)
- Decider: TJ, as the guide records
- Issues and PRs: #121, #460, #461
- Cited in code as: #121, #460
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet from "Two styles over one set of samples" and the `src/utils/legendRamp.ts` bullet from "Every strip blends"; and [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the paragraph that opens "The popover hangs off a button", from "Blocks shows where the samples are"

## Context

The forecast grid had two styles over one set of samples, blocks and smooth, with blocks the default. The snow legend strip was hard-stopped. Markers take a continuous colour from `interpolateRgb`.

## Decision

Every scale on the map is one gradient. The grid is smooth by default: one raster layer, with `raster-resampling` `nearest` for blocks and `linear` for smooth, so the switch is a paint property. Every legend strip blends, at equal width per band. The blocks style and the `grid=` parameter stay, so the sample view is one press away and a `grid=blocks` link still opens it.

## Evidence

Strips are never to scale: 0.39 to 787 inches to scale is ten bands in two pixels (the guide's figure, not dated; git: first written in #459, 2026-09-17).

## Alternatives rejected

- Blocks as the default: blocks shows where the samples are and smooth hides how few there are. That reasoning held until #460, when TJ chose the field, because hard rectangles under continuously coloured markers read as two encodings of one scale.
- A hard-stopped snow strip: NOAA's bands are a classification, and a gradient shows depths NOAA never gave a colour. That is still true and is the accepted cost, because a strip of blocks beside a strip of gradient reads as two systems (TJ, 2026-09-22).
- #121's rejected raster, which interpolated between destinations across a valley: still rejected.

## Consequences

Smoothing is between model grid points, which the model already treats as continuous, and the legend states the pitch, so the honesty the blocks view carried rides on the pitch now. In a blended strip colour `i` lands at boundary `i + 1`.
