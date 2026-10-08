# 0120. Snowfall over the window replaces snow depth as the ranking metric, and the pod holds no snow grid

- Status: Accepted. Supersedes 0053, 0054 and 0104.
- Date: 2026-10-07
- Decider: the maintainer, on #678 (2026-10-07: "remove snow depth as a ranking metric and replace it with snowfall")
- Issues and PRs: #678, #449, #463, #629, #446
- Cited in code as: #678
- Guide: [`CLAUDE.md`](../../CLAUDE.md), The Python and TypeScript mirrors (row 24) and the presentation knobs paragraph, the sentence on snowfall's bounds; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/aggregation.py` bullet

## Context

Snow depth joined the Metrics table in #449 as a ranking metric read off the daily SNODAS grid the pod downloaded from NSIDC and held ([0054](0054-snodas-snow-depth.md)), with a ceiling mark for the file's int16 limit ([0053](0053-snow-depth-ceiling.md)) and a refusal rule for a bad file ([0104](0104-refused-snow-file-is-no-grid.md)). It is an observation of today's snowpack, not a forecast, so a window has nothing to reduce: the row had no aggregate dropdown, the chart's picker left it out, the timeline held each marker on the one number, the forecast grid drew nothing under it, and ranking on it with models compared was refused. The maintainer asked on 2026-10-07 whether those gaps were deliberate; they were, and the metric was the wrong question to ask a forecast window. The map already carries the same analysis as the NOHRSC snow layer (#446).

## Decision

The `snow` family and its one key `snow_depth_in` leave the app and the API, with `min_snow_depth_in`, `max_snow_depth_in` and `snow_analysis_date`. A request naming one answers `422`, and a share link carrying `sort=snow_depth_in`, `minsnow` or `maxsnow` opens on the default ranking. The pod no longer downloads or holds the SNODAS grid, and `SNODAS_CACHE_TTL_S` and `SNODAS_RETRY_AFTER_FAILURE_S` are gone.

In its place is `snowfall`, Open-Meteo's hourly `snowfall` variable, asked for in the same weather request as every other hourly variable. It is reduced the way precipitation is, to a window total and an hourly average, minimum and maximum (`snowfall_total_in`, `snowfall_avg_in_hr`, `snowfall_min_in_hr`, `snowfall_max_in_hr`, at four decimals), and the series carries `snowfall_in`. It is reduced outside the precipitation, temperature and wind zip, the way the freezing level is ([0026](0026-freezing-level-outside-zip.md)), so an hour missing only snowfall cannot empty the other columns, and each aggregate is independently nullable. Its declared unit must read `inch`. Both bounds read `snowfall_total_in`, as precipitation's do, and nulls pass. The colour scale is the six cold shades snow depth wore, at ten times precipitation's window boundaries (0.1, 1.0, 2.5, 5.0 and 10.0 inches, by the 10:1 snow-to-liquid rule of thumb), with a rate scale at ten times precipitation's rate boundaries that playback reads, the way precipitation's total reads its rate scale. Both stay off the verdict ramp: snowfall takes snow depth's place in [0119](0119-one-verdict-ramp.md)'s list of exceptions, for that record's reason, and `colors.test.ts` names `snowfall` there. A cell links to Windy's new-snow overlay, `snowAccu`. The map's snow layer stays.

## Evidence

- Measured 2026-10-07 at the Rainier summit (46.8523, -121.7603), 72 hours, `precipitation_unit=inch`: every model answered `snowfall` in `inch`, with no nulls but HRRR's past its hour 45, which every variable shares (maxima 0.11 on GFS Seamless, 0.909 GEM, 0.055 ECMWF IFS, 0.0 HRRR, 0.551 UK Met Office, 0.0 ICON, 0.276 JMA, 0.524 Météo-France). The archive (2026-01-10 to 01-12) answered in `inch` with no nulls, maximum 0.634. Without the parameter the unit is `cm`. `docs/DATA.md` has the table.
- Open-Meteo's own `snow_depth` was rejected as a forecast of depth, measured 2026-09-16 at the same summit for one hour: GFS and HRRR 26.86 m, GEM 0.13 m, ECMWF 0.01 m, ICON 0.0 m, three models null.
- Windy's new-snow overlay token read off a live Windy tab on 2026-10-07: `W.overlays.snowAccu` has `trans` NEWSNOW, and a URL naming it rewrites to `/-New-snow-snowAccu`.
- The weight: snowfall is one more variable in a request already over the floor, so the factor moves from 1.4 to 1.5 on the pod (fifteen variables) and from 1.5 to 1.6 in the browser (sixteen). A 50-location 16-day batch costs 85.7 weighted calls on the pod, where it cost 80.0.

## Alternatives rejected

- Keep snow depth and add snowfall beside it: keeps a metric with four dead controls, the daily grid download, and a Metrics table one row longer on a phone.
- Forecast depth from Open-Meteo's `snow_depth`: not data at a summit (above).
- A `!` in the release title for the removed fields: it would cut 1.0.0, which the maintainer reserved, so the break ships as a minor and the release notes say so.

## Consequences

`weather_vectors.json` pins snowfall's reduction on both sides (mirror row 24, which was the snow depth ceiling). `mirrored_constants.json` loses `SNOW_DEPTH_CEILING_IN`. The pod's capacity figures move with the weight factor: an archive window past 51 days now costs one 50-location batch more than half a minute's budget, where it was past 55, and an eager cloud column beside a 16-day forecast window books its eighth batch a minute out, which reaches the pacer's wait bound and does not pass it. A stored column set from before this change (`columns7` and older) migrates with the four snowfall columns shown, under the new key `columns8`. A tile-discovered ring and a custom list still go to the pod with `elevation_lookup: false`, which snow depth was one reason for; whether they still need to is not decided here.
