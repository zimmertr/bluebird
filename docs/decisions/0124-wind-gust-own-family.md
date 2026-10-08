# 0124. Wind gust as its own family

- Status: Accepted
- Date: 2026-10-08
- Decider: the maintainer, on #584 (2026-10-08: option A, a `gust` family of its own with the noun "Wind gust")
- Issues and PRs: #584, #257, #295, #678
- Cited in code as: #584
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the paragraph after "No column header names the method" and The Python and TypeScript mirrors (row 35); [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/aggregation.py` bullet

## Context

The app had no gust data. Every wind number was the sustained wind, interpolated to the destination's elevation ([0022](0022-wind-at-elevation.md)), and the Metrics table's wind ceiling was hinted as "The gustiest hour must be at most this." although it read the windiest sustained hour. For a ridge or a summit the gust is the number that turns a party around, and Open-Meteo serves it as `wind_gusts_10m` on the same request the app already makes. #584 asked whether to add it as a fourth wind aggregate, a column with no ranking, or a ranked metric of its own.

## Decision

1. Request `wind_gusts_10m` in the one hourly weather request, on both the pod and the browser, and rank, bound, colour, chart and play it back like the other weather metrics.
2. It is a family of its own, `gust`, not a fourth aggregate on the wind row. Keys `gust_avg_mph`, `gust_max_mph`, `gust_min_mph`; the default ranking key is `gust_max_mph`. The floor bound `min_gust_mph` reads `gust_min_mph` and the ceiling `max_gust_mph` reads `gust_max_mph`.
3. The noun is "Wind gust" and the unit mph, so the Metrics row sorts straight after Wind.
4. The wind row's ceiling hint becomes "The windiest hour must be at most this."; the gust row reads "The calmest hour must be at least this." and "The gustiest hour must be at most this."
5. The colour scale is `VERDICT_RAMP` on [15, 25, 35, 46, 58] mph. 46 and 58 are the National Weather Service's Wind Advisory and High Wind Warning gust criteria; wind's own 5/15/25/35/50 would paint nearly every gust orange or worse.
6. The gust is the 10 m value as served and is not adjusted to elevation, so the family is not in `HEIGHT_FAMILIES` and no header names its height ([0051](0051-no-method-in-headers.md)). It is reduced outside the precipitation, temperature and wind zip, as the freezing level is ([0026](0026-freezing-level-outside-zip.md)), and each aggregate is independently nullable. Its declared unit must read `mp/h`.

## Evidence

- Measured 2026-10-08 at the Rainier summit (46.8523, -121.7603), `forecast_days=3`, `wind_speed_unit=mph`. Hours with a gust, then the 10 m wind average, the gust average and the gust maximum in mph: GFS Seamless 72 of 72, 11.6, 18.8, 49.9; GEM 72, 6.6, 8.3, 44.1; ECMWF IFS 0.25° 72, 4.0, 14.3, 33.8; HRRR 67 of 72, 12.2, 20.1, 49.9; UK Met Office 72, 3.7, 9.2, 25.5; ICON 72, 5.3, 34.6, 78.1; JMA 0 of 72 under the unit `undefined`, wind 6.3; Météo-France 72, 3.1, 12.0, 31.3. The archive (2026-07-01 to 07-03) answered 72 of 72 in `mp/h`, average 24.5, maximum 31.5. `docs/DATA.md` has the table.
- `wind_gusts_925hPa` answers HTTP 400 (2026-10-08), so there is no level gust to interpolate at a summit's height.
- Windy's gust overlay token, read off Windy's index.js v51.3.2 on 2026-10-08: `ident: 'gust'`, shown as "Wind gusts".
- The weight: one more variable in a request already over the floor, so the factor moves from 1.5 to 1.6 on the pod (sixteen variables) and from 1.6 to 1.7 in the browser (seventeen). A 50-location 16-day batch costs 91.4 weighted calls on the pod, where it cost 85.7, and 97.1 in the browser.

## Alternatives rejected

- A fourth wind aggregate (`wind_gust_mph` on the wind row): a gust and a sustained wind are two readings with two sets of thresholds, and one dropdown cannot give a gust its own scale or its own pair of bounds.
- A column with no ranking: everything else the table shows ranks, and a column that cannot be asked about would be the one exception.
- Interpolating a gust to the destination's elevation from the level winds: there is no level gust, and a ratio applied to the level wind would be a number no model produced.

## Consequences

`weather_vectors.json` pins the gust's reduction on both sides (mirror row 35), and `mirrored_constants.json` moves `N_VARIABLES` to 16. The pod's capacity figures move with the weight factor, measured 2026-10-08 through `_check_pacing` with the cloud batches every analysis now prices ([0121](0121-cloud-deck-fetched-on-every-analysis.md)): an unkeyed archive analysis is first refused at 30 days, where it was 31, and the most destinations it may take falls from 249 to 248 at 31 days, from 150 at 61 days to 150 at 59, from 99 at 62 to 99 at 60, and to 26 at 357 days, where it was 28 at 355. The 16-day forecast window still books its last batch at the pacer's 120 s wait bound and does not pass it, so 1,500 destinations stay allowed whole. A stored column set from before this change (`columns8` and older) migrates with the three gust columns shown, under the new key `columns9`. JMA's rows read `N/A` in the gust columns, in the table and the file, with no note on hover; ranking by the gust under JMA orders nothing, and the model comparison has no check for a gust ranking that compares JMA, where it blocks Analyze for a freezing-level ranking that compares a model without one. Either would need a sentence the maintainer has not approved.
