# 0295. Snow depth returns beside snowfall, read over the window from a year of daily grids

- Status: Accepted. Supersedes [0120](0120-snowfall-replaces-snow-depth.md) in part (its snow depth half; its snowfall half stands), and reinstates [0053](0053-snow-depth-ceiling.md), [0054](0054-snodas-snow-depth.md) and [0104](0104-refused-snow-file-is-no-grid.md)
- Date: 2026-11-12
- Decider: the maintainer (TJ), on issue #849, 2026-11-03 ("File it, grid on the pod") and 2026-11-12
- Issues and PRs: #849, #921, #678, #449, #463, #629, #748
- Cited in code as: #849
- Guide: [`CLAUDE.md`](../../CLAUDE.md), The Python and TypeScript mirrors (rows 39 and 40) and the presentation knobs paragraph; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snodas.py`, `app/services/snow_history.py` and `app/routes/snow_depth.py` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `snowCeiling.ts` and `snowHistory.ts` bullets

## Context

Record 0120 took snow depth out of the ranking in favour of snowfall over the window: depth was one number for today, so a window had nothing to reduce, and the row had no aggregate, no chart line, no playback hour and no forecast grid. That answered the window's question and left the hiker's. A winter trip asks how much snow is on the ground before it asks how much will fall, and the maintainer's workaround on 2026-11-03 was a 22-day window ranked on `snowfall_total_in`, two Open-Meteo fetches per destination across the archive seam that still ignored melt, settling, rain on snow and whatever lay there before the window. On 2026-11-12 the maintainer asked for the metric back because it is the number a climb is packed for.

The first cut brought back today's one number, with no aggregate, no chart line and a `Snow depth as of {date}` caption. The maintainer refused to ship it: a chart that could not draw a ranked metric beside a table that could was "terrible and cannot go to prod" (2026-11-12). So the metric had to be read over the window's days like every other one.

## Decision

Snow depth is a ranking metric again, beside snowfall rather than in its place, read over the window.

- **A year of days in the database.** The pod still holds today's unmasked SNODAS grid, as record 0054 had it, with record 0104's refusal rule and record 0053's ceiling mark. One pod at a time also writes every day of the last year to PostgreSQL, the reach of the calendar (`limits.archive_days`), but only at the cells a place sits in: one `smallint[]` of millimetres per cell per month. A year back to 2003 was declined as more than any window can ask for.
- **Days after the newest read the newest.** Each UTC day of the window up to the newest day analyzed reads its own depth, and every later day counts as that newest depth, so a trip next week ranks on the snow there now. Analyze is not blocked for a window past today. The maintainer first chose a blocker, `Snow depth has no data after today.`, for a snow ranking past today, then reversed it the same day for this.
- **Three aggregates.** Avg, Min and Max, temperature's three, defaulting to Max, the most snow a trip in the window would meet. The floor reads Min and the ceiling Max. There is no Total: depth is a level, not an amount.
- **The chart draws what was measured.** Each day's depth spans its hours and the line stops at the newest day. Playback holds the newest depth past it, so a marker keeps the colour its column ranks it by. The forecast grid paints nothing under it, because no lattice cell is a place the server keeps, and ranking on it with models compared is refused, as air quality is. No caption names the analysis date.
- **One route.** `POST /api/snow-depth` answers a list of points and a window from the pod's own copy, asking no upstream, and the browser asks it once per analysis for the rows it forecasts; a held row keeps the depth it came with, because reuse is only legal within one window. The analyze routes fill the same three fields after their cap. `POST /api/destinations` carries no snow depth.
- **Colours.** The snow layer is this metric's field, the way the forecast grid is every other metric's. So the markers and cells wear NOAA's own colours at NOAA's band edges, and with the layer on one legend row keys both, crediting NOHRSC. NOAA's darker bands get a lighter ink of their hue on the dark panel (`darkInk`), and every band's ink clears 4.6:1 on its tint in both themes (measured 2026-11-12). The maintainer raised two legend rows with two palettes for one quantity on the preview; snowfall's shades were the first cut.
- **Glaciers.** A glacier's cell keeps its number, colour and rank, and the table does not mark it. The deepest glacier cells sit on the file's ceiling and print `≥1,290`, and the snow card names the glacier for a clicked point (#748). While snow depth ranks, the message list says how many displayed rows sit on the ceiling, as information, and that an upper bound leaves them out (`{n} destinations measure glacier snow. Set an upper bound to exclude them as outliers.`, the maintainer, 2026-11-13): those rows set the chart's scale and flatten every other line, and the bound is the existing remedy. The ceiling is the test because it costs nothing, so a deep glacier under it does not count.

The wire changes are additive apart from `snow_depth_in`, which never shipped in a release after #678 removed it. A share link's `sort=snow_depth_in` from before #678 opens on `snow_depth_max_in`, and its `minsnow`/`maxsnow` bounds read again.

## Evidence

- Open-Meteo's own `snow_depth` is still not data at a summit or below one. Measured 2026-09-16 at Rainier for one hour: GFS and HRRR 26.86 m, GEM 0.13 m, ECMWF 0.01 m, ICON 0, three models null (record 0120). Measured again 2026-11-12: GFS and HRRR read 28 m at Paradise while the SNOTEL station there read 0 to 2 in, and ECMWF and ICON read 0 at Rainier's summit (#849).
- Storage, measured 2026-11-12 on production: 1,250,049 places, 194,472 of them inside the grid's box in 181,417 distinct cells of 33.5 million. At 31 two-byte days per cell-month plus row overhead, a year is about 350 MB, where the whole grid would be 24 GB. Each of the database's three instances had about 1.0 to 1.15 GiB used of a 10 GiB volume.
- Backfill: an archive is 5.2 to 40 MB, about 20 MB on average, so the year is a one-time download of about 7.5 GB, taken 8 days a run every 5 minutes, about four hours.
- The grid as record 0054 measured it: 8,192 by 4,096 big-endian int16 millimetres, 64 MiB resident, one `struct.unpack_from` per lookup at about 3.5 µs. The day's tar lands at NSIDC around 13:15 UTC, 6.3 MB in October and 35 to 48 MB through a winter (#849).
- Glacier cells read tens of metres: Rainier's summit 68.62 m in September, Baker's 67.61 m in October, and the maintainer's card on 2026-11-03 read 2,703 in of depth over 1,620 in of water (#748, #849).

## Alternatives rejected

- Today's one number, with no aggregate, no chart line and a date caption: built first, refused by the maintainer because the chart and the table disagreed about a ranked metric.
- Ship today's number and add the history in a follow-up: refused for the same reason.
- Forecast depth from Open-Meteo's `snow_depth`: not data (above).
- Block Analyze for a snow ranking past today: chosen, then reversed for carrying the newest depth, because a trip is planned before it happens.
- Keep every cell of the grid: 24 GB a year for cells no destination stands in. A pasted coordinate in a cell no place shares reads the newest day alone, which is the cost accepted.
- History back to 2003: about 7.5 GB a year of downloads and 350 MB a year of rows for windows the calendar cannot ask for.
- Ask NOAA's `identify` per displayed row from the browser: one request per row against a render server that refuses caching, about 0.63 s each, 200 requests per analysis on top of the layer's renders.
- Hold today's grid in the shared cache's `snapshots` table: the table holds gzipped rows a pod loads whole, so each pod would download 64 MiB from the database instead of from NSIDC, saving nothing.
- A glacier cell that reads `Glacier` in place of its number and sorts last like `N/A`: the maintainer picked it first, then chose the number with the word after it on 2026-11-12, once it was clear the check answers after the report lands from tiles the browser fetches, so a ranking that depended on it would reorder under the reader or wait on the tiles.
- `Glacier` after the number in a glacier's cell, from the snow card's check asked for the rows on screen: built, then removed on 2026-11-12 (the maintainer). It read as a statement about the number where the number was this winter's few inches on a cell touching ice (Mount Saint Helens, 4.8 in), broke the column's right-aligned numbers, and cost a tile check per row for a case the ceiling mark already shows.
- Mask glacier cells to `N/A`: loses a true record winter at a bare cell in the same band.

## Consequences

The database grows by about 350 MB a year and holds a year at most: a month past a year is pruned. A fresh database downloads about 7.5 GB from NSIDC once, over about four hours, then one `HEAD` a run. Every pod still downloads the day's file once a day, 6 to 48 MB, and holds 64 MiB inside the chart's 512Mi request. `SNODAS_CACHE_TTL_S` and `SNODAS_RETRY_AFTER_FAILURE_S` return to the app and to the chart's `extraEnv`, beside `RATE_LIMIT_SNOW_DEPTH_PER_MINUTE` and `RATE_LIMIT_SNOW_DEPTH_BURST`, and the chart publishes `/api/snow-depth`. `SNOW_DEPTH_CEILING_IN` rejoins `mirrored_constants.json`. A glaciated summit can top a ranking on the deepest snow. A stored column set from before this change (`columns8` and older) migrates with the three snow depth columns shown, under the new key `columns9`. A deployment with no database reads today's grid alone: a window reaching today reads it for today and after, and a window that ends before today reads `N/A`.
