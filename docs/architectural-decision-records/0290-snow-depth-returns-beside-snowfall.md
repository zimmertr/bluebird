# 0290. Snow depth returns beside snowfall, read off the grid each pod holds, and a glacier's cell is named without moving its rank

- Status: Accepted. Supersedes [0120](0120-snowfall-replaces-snow-depth.md) in part (its snow depth half; its snowfall half stands), and reinstates [0053](0053-snow-depth-ceiling.md), [0054](0054-snodas-snow-depth.md) and [0104](0104-refused-snow-file-is-no-grid.md)
- Date: 2026-11-12
- Decider: the maintainer (TJ), on issue #849, 2026-11-03 ("File it, grid on the pod") and 2026-11-12
- Issues and PRs: #849, #921, #678, #449, #463, #629, #748
- Cited in code as: #849
- Guide: [`CLAUDE.md`](../../CLAUDE.md), The Python and TypeScript mirrors (row 39) and the presentation knobs paragraph; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snodas.py` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `snowCeiling.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useGlacierCells.ts` bullet

## Context

Record 0120 took snow depth out of the ranking in favour of snowfall over the window: depth is one number for today, so a window has nothing to reduce, and the row had no aggregate, no chart line, no playback hour and no forecast grid. That answered the window's question and left the hiker's. A winter trip asks how much snow is on the ground before it asks how much will fall, and the maintainer's workaround on 2026-11-03 was a 22-day window ranked on `snowfall_total_in`, two Open-Meteo fetches per destination across the archive seam that still ignored melt, settling, rain on snow and whatever lay there before the window. On 2026-11-12 the maintainer asked for the metric back because it is the number a climb is packed for.

## Decision

Snow depth is a ranking metric again, beside snowfall rather than in its place. The pod downloads the day's unmasked SNODAS grid from NSIDC and holds it, as record 0054 had it, with record 0104's refusal rule and record 0053's ceiling mark, and both `POST /api/destinations` and `POST /api/analyze` fill `snow_depth_in` on every row and `snow_analysis_date` beside them. The wire changes are additive: the field, its sort key and its two bounds come back, and nothing of snowfall moves.

The gaps record 0120 named are accepted this time, because they are the right shape for an observation: the Metrics row has no aggregate menu and an empty Aggregate cell, the chart's metric list leaves it out, playback holds each marker on the one number, the forecast grid paints nothing under it, and ranking on it with models compared is refused, as air quality is. The results header names the analysis date in place of the window, `Snow depth as of {date}`.

Its colours are snowfall's six cold shades in snowfall's order, banded at five of the snow layer's own edges (3.9, 9.8, 39, 98 and 197 in), so a marker and the layer under it turn at the same depth.

A cell whose 1 km square touches a glacier OpenStreetMap has mapped reads `Glacier` after its number, from the check the snow card names a glacier with (#748), asked for the rows on screen while the column is shown. The word marks the cell and nothing else: the number, its colour and its rank stay.

The grid stays per pod rather than in the shared cache's `snapshots` table.

## Evidence

- Open-Meteo's own `snow_depth` is still not data at a summit: measured 2026-09-16 at Rainier for one hour, GFS and HRRR 26.86 m, GEM 0.13 m, ECMWF 0.01 m, ICON 0, three models null (record 0120).
- The grid as record 0054 measured it: 8,192 by 4,096 big-endian int16 millimetres, 64 MiB resident, one `struct.unpack_from` per lookup at about 3.5 µs. The day's tar lands at NSIDC around 13:15 UTC, 6.3 MB in October and 35 to 48 MB through a winter (#849).
- Glacier cells read tens of metres: Rainier's summit 68.62 m in September, Baker's 67.61 m in October, and the maintainer's card on 2026-11-03 read 2,703 in of depth over 1,620 in of water (#748, #849).

## Alternatives rejected

- Forecast depth from Open-Meteo's `snow_depth`: not data at a summit (above).
- Ask NOAA's `identify` per displayed row from the browser: one request per row against a render server that refuses caching, about 0.63 s each, 200 requests per analysis on top of the layer's renders.
- Hold the grid in the shared cache's `snapshots` table: the table holds gzipped rows a pod loads whole, so each pod would download 64 MiB from the database instead of from NSIDC, saving nothing.
- A glacier cell that reads `Glacier` in place of its number and sorts last like `N/A`: the maintainer picked it first, then chose the number with the word after it on 2026-11-12, once it was clear the check answers after the report lands from tiles the browser fetches, so a ranking that depended on it would reorder under the reader or wait on the tiles.
- Mask glacier cells to `N/A`: loses a true record winter at a bare cell in the same band.

## Consequences

Every pod downloads the day's file once a day, 6 to 48 MB, and holds 64 MiB inside the chart's 512Mi request, which was set for the wildfire snapshot and held the grid before. `SNODAS_CACHE_TTL_S` and `SNODAS_RETRY_AFTER_FAILURE_S` return to the app and to the chart's `extraEnv`. `SNOW_DEPTH_CEILING_IN` rejoins `mirrored_constants.json`. A glaciated summit can top a ranking on the deepest snow, marked as a glacier. A stored column set from before this change (`columns8` and older) migrates with the snow depth column shown, under the new key `columns9`. A past window still reads today's grid; reading the grid of that window's own date is left for a later issue.
