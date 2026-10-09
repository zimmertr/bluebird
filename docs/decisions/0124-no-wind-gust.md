# 0124. No wind gust metric

- Status: Accepted
- Date: 2026-10-08
- Decider: the maintainer, on #584 and PR #685 (2026-10-08: drop the gust, after the gust at elevation measured below)
- Issues and PRs: #584, #685
- Cited in code as: #584
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the paragraph that begins "No column header names the method"; [`docs/DATA.md`](../DATA.md), the wind caveats

## Context

#584 asked for the wind gust: for a ridge or a summit the gust is the number that turns a party around, and Open-Meteo serves `wind_gusts_10m` on the request the app already makes. Record [0051](0051-no-method-in-headers.md) settled that every metric column stands at the destination's elevation, which is why no header names a method: the wind and the temperature are read in the free air at the summit's height, precipitation and air quality are the cell's surface values at the destination, and the freezing level is a height of its own. PR #685 built the gust three ways (a family of its own, then an option of the Wind row) as the 10 m value, and the maintainer then asked for it at the destination's elevation like the wind. No way of getting there held up, so the app carries no gust.

## Decision

The app has no gust metric: no column, no ranking, no bound, no chart line, no request variable. The Wind row's ceiling compares the windiest sustained hour, and its hint says so ("The windiest hour must be at most this.", approved 2026-10-08), where it used to name a gust the app never had.

## Evidence

- Open-Meteo publishes no gust above the surface: `wind_gusts_925hPa` answers HTTP 400 (measured 2026-10-08), so there is no level gust to interpolate at a summit's height the way `_wind_at_elevation` interpolates the wind.
- The 10 m gust contradicts the wind beside it. On Mount Rainier under `gfs_seamless` the table showed a 58.8 mph strongest gust beside a 75.6 mph strongest wind, because the wind is the free air at the summit's height and the gust is 10 m over the model's ground.
- The 10 m gust factor (gust divided by wind, each hour) is each model's own representation of surface turbulence, not a property of the free air. Measured 2026-10-08 at Rainier, Baker, Adams, Glacier Peak and Stuart, `forecast_days=7`, over the hours whose 10 m wind was at least 5 mph (the archive over 2026-07-01 to 07-07):

| Source | Hours with both | Hours used (≥ 5 mph) | Median | p90 | p95 | p99 | Max | Min |
|---|---|---|---|---|---|---|---|---|
| GFS Seamless | 840 | 395 | 1.37 | 2.02 | 2.18 | 2.71 | 3.15 | 0.67 |
| GEM | 840 | 188 | 1.45 | 2.43 | 2.76 | 3.08 | 3.22 | 1.00 |
| ECMWF IFS 0.25° | 840 | 249 | 3.66 | 5.05 | 5.74 | 7.21 | 8.94 | 1.10 |
| HRRR | 245 | 233 | 1.48 | 2.08 | 2.18 | 2.50 | 2.84 | 0.98 |
| UK Met Office | 785 | 183 | 2.57 | 3.40 | 3.58 | 4.33 | 4.78 | 1.23 |
| ICON | 840 | 470 | 5.15 | 7.00 | 7.82 | 9.03 | 9.66 | 2.17 |
| JMA | 0 | 0 | none | none | none | none | none | none |
| Météo-France | 515 | 6 | 5.07 | 6.55 | 6.74 | 6.89 | 6.92 | 3.23 |
| Archive | 840 | 218 | 3.78 | 4.75 | 4.93 | 5.10 | 5.32 | 2.52 |
| Seven models pooled | | 1,724 | 2.32 | 5.73 | 6.48 | 8.15 | 9.66 | 0.67 |

  JMA publishes no gust at all (a column of nulls under the unit `undefined`), and 33 of the 1,724 pooled hours had a factor below 1.
- Each candidate, as the window's strongest gust in mph, measured live 2026-10-08 over `forecast_days=3` with the wind at elevation read by the app's own `_wind_at_elevation`:

| Destination | Model | Strongest wind at elevation | 10 m gust | Ratio, no cap | Ratio, cap 8.15 (pooled p99) | Ratio, cap 3.08 (GEM p99) | Ratio, cap 2.71 (GFS p99) | Wind plus spread | Larger of gust and wind |
|---|---|---|---|---|---|---|---|---|---|
| Mount Rainier | GFS Seamless | 75.6 | 58.8 | 222.1 | 222.1 | 171.5 | 171.5 | 106.0 | 75.6 |
| Mount Adams | GFS Seamless | 67.8 | 60.2 | 119.6 | 119.6 | 119.6 | 119.6 | 91.8 | 67.8 |
| Little Tahoma | GFS Seamless | 60.7 | 72.9 | 118.0 | 118.0 | 106.7 | 106.7 | 91.9 | 72.9 |
| Mount Rainier | ICON | 76.4 | 80.8 | 507.9 | 507.9 | 235.3 | 207.0 | 139.1 | 80.8 |
| Mount Adams | ICON | 70.5 | 82.8 | 418.4 | 418.4 | 217.0 | 190.9 | 138.1 | 82.8 |
| Little Tahoma | ICON | 56.6 | 80.8 | 376.5 | 376.5 | 174.4 | 153.4 | 119.3 | 80.8 |
| Mount Rainier | ECMWF IFS 0.25° | 67.4 | 32.2 | 266.9 | 266.9 | 207.7 | 182.7 | 89.1 | 67.4 |
| Mount Adams | ECMWF IFS 0.25° | 66.3 | 34.7 | 292.7 | 292.7 | 204.2 | 179.6 | 88.6 | 66.3 |
| Little Tahoma | ECMWF IFS 0.25° | 53.6 | 32.2 | 179.6 | 179.6 | 165.0 | 145.2 | 74.4 | 53.6 |

## Alternatives rejected

- **The 10 m gust as served**, as a column, as a ranked family of its own, or as a Gust option of the Wind row (each built on PR #685): it stands at a different height from every other metric, which breaks 0051, and on a summit it reads below the wind beside it (Rainier, 58.8 against 75.6). Two heights in one table read as a contradiction. The family of its own was also rejected on its own terms: two ranking rows for wind and wind gust read as two unrelated measurements.
- **The ratio scaled to elevation**, the free-air wind times that hour's 10 m gust factor, floored at 1 and capped at a measured percentile: the surface factor multiplies the much stronger free-air wind, so its worst hours are those where the 10 m wind is light under a strong upper wind. Even GFS gives Rainier a 222 mph gust under the pooled p99 cap and 171 mph under its own; ICON reaches 508 mph uncapped. No measured cap brings it near a number a forecast could stand behind.
- **The wind at elevation plus the surface spread** (gust minus wind at 10 m), never below the wind: bounded in mph rather than multiplied, but it still carries each model's surface turbulence into the free air, so the same summit and hour read 106 mph under GFS and 139 under ICON, a difference in the models' gust schemes rather than in the weather.
- **The larger of the 10 m gust and the wind at elevation**: it never contradicts the wind, but on a windy summit it IS the wind (75.6 at Rainier on GFS, 67.4 on ECMWF), so the column says nothing the Wind column does not, exactly where a reader wants a gust.

## What would reopen it

A source that publishes gusts on pressure levels, or at a requested height, so a gust can be read at the destination's elevation the way the wind is. Open-Meteo's answer to `wind_gusts_925hPa` is the thing to re-check.
