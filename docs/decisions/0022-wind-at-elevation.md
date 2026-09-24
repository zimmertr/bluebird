# 0022. Wind is reported at the destination's elevation

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 138

A sixth is the elevation-adjusted wind (#257): `_WIND_LEVELS`/`_wind_at_elevation` in `aggregation.py` ↔ `WIND_LEVELS`/`windAtElevation` in `openMeteoAggregate.ts` — every wind number is the free-air wind interpolated between the two ISA-height pressure levels bracketing the destination's `elevation_ft`, floored at the 10 m value, with every gap (no elevation, below ~762 m, a null level) degrading to the 10 m wind. It is part of the vector-pinned aggregation, so the pair changes by the vectors process like the aggregation itself, and elevation joins the per-location forecast cache key on both sides. The forecast-grid lattice sends no DESTINATION elevations, but it is not unadjusted: `fetchWeather`'s `terrainElevation` flag makes each sample read Open-Meteo's own resolved terrain height for that coordinate (#288), so the grid paints wind at the GROUND's elevation under markers that carry wind at the DESTINATION's — documented in `DATA.md` rather than on the legend (a second legend line was tried and rejected for its vertical cost, TJ 2026-08-21).
