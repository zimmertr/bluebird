# 0051. Metric column headers do not name the elevation method

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 138

**No column header names the method** (#457, 2026-09-22, reversing the headers #361 and #443 added): Open-Meteo lapses `temperature_2m` to the coordinate's 90 m DEM height by default on both endpoints (measured within 12 to 155 m of four Cascade summits, where the grid-cell means sat 700 to 900 m under), precipitation and air quality are the cell's surface values at the destination with no pressure-level variant (`precipitation_925hPa` and `pm2_5_925hPa` both 400), and the freezing level is a height of its own — so every metric column stands at the destination's elevation, and `at elevation` beside two of them read as a difference in place where the difference is the method. `metricLabel` takes no qualifier and `ColDef` carries none; `tableColumns.test.ts` fails a label that matches `at (elevation|N meters)`. The method lives in `docs/DATA.md`, where the grid's terrain-height note already does. What the measurement did NOT overturn is the physics behind #443: the lapsed value carries the surface layer of the cell's ground up with it, so a summit can still read below freezing under a freezing level thousands of feet higher, and the free-air interpolation remains the method the table uses.
