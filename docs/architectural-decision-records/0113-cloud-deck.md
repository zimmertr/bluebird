# 0113. The one cloud metric is the cloud deck, read over the whole column, and a dry column reads a ceiling

- Status: Accepted. Supersedes 0056. Amends 0057 (the fetch-on-request rule stands; the variable list and the weight change); that rule is superseded by 0121. Amended by 0119 (the colour sentence: the deck wears the verdict ramp reversed).
- Date: 2026-10-06
- Decider: the maintainer, on #670 (2026-10-06)
- Issues and PRs: #670, #587, #117, #483
- Cited in code as: #670
- Guide: [`CLAUDE.md`](../../CLAUDE.md), The Python and TypeScript mirrors, the paragraph under the table that opens "The cloud deck detects saturation"

## Context

#117 shipped two cloud families, cloud base and cloud cover. The base walked the column from the destination's own elevation up, so a saturated layer below a summit was invisible by construction: #587 measured Mount Baker on 2026-10-01 with 3 hours in 96 where a level below the summit was saturated and the summit was clear, and the report showed a base above the summit for each. A dry column fell back to Espy's parcel base over the destination, which under a deck reading would put a deck below a summit on a dry day. The cover was the grid cell's total over every layer and said nothing about height. The maintainer decided that two cloud options are one too many.

## Decision

There is one cloud family, `cloud_deck`, with the wire keys `cloud_deck_min_ft`, `cloud_deck_avg_ft` and `cloud_deck_max_ft` and the series field `cloud_deck_ft`. Each hour walks every standard level from 1000 hPa to 300 hPa, with the destination's 2 m relative humidity inserted at its elevation when the elevation is known. The first point at or above `CLOUD_SATURATION_RH` (95 %) ends the walk; between it and the last dry point below it the height is interpolated in humidity, and a saturated first point is its own height. A column that answered and is dry all the way up reads `CLOUD_DECK_CEILING_FT`, the ISA height of 300 hPa in whole feet (30,066). A column with no level answered, which is every archive hour, is null whatever the 2 m point says. Saturation is still detected on relative humidity and never on the level cloud fraction (0056's decision, carried over). Espy's fallback, cloud cover, and the cloud request's `temperature_2m`, `dew_point_2m` and `cloud_cover` are gone, so the request carries nine variables, a weight factor of 1 rather than 1.2. The column stays fetched only when a ranking or a bound names it (0057). The colour scale stays the freezing level's height ramp, because a deck has no universal good end. The table strings are `Cloud deck` and `Cloud deck · Min/Avg/Max (ft)`. The share link's bounds are `minclouddeck`/`maxclouddeck`, and the retired cloud base and cloud cover keys parse to nothing.

## Evidence

- Measured 2026-10-06 with one direct Open-Meteo request per point (GFS Seamless, 96 hours, relative humidity on 1000 to 300 hPa and at 2 m): Mount Rainier (API elevation 4,380 m) had 85 dry hours of 96, Paradise 85, a valley point near Mount Si 63. A dry column is the common case, so what it reads matters more than the walk.
- Measured 2026-10-06 against 72 hours of routine METARs at KSEA, KBFI and KPAE (2026-10-04 05Z to 2026-10-07 04Z, 216 station-hours, 61 ceilings below 3,000 ft): the walk found the low deck in 47 of 61 hours on GFS Seamless and 50 of 61 on ECMWF IFS 0.25°, 47 of them within 1,000 ft on both, a median 280 ft under the ceiling. Of the 149 hours with no ceiling, GFS read a deck under 3,000 ft in 4 (all with low scattered cloud or fog nearby) and ECMWF in 56, 37 from a saturated 1000 hPa and 19 from a saturated 2 m point, nearly all at night under a clear sky. `docs/DATA.md` has the table.
- Open-Meteo's `elevation` is the 90 m DEM height at the coordinate, not the model's ground (#587), so there is no published ground height to start a walk from.

## Alternatives rejected

- Keep the cloud base and add a second value for a deck below the destination (#587 Option B): two cloud numbers, which the maintainer rejected.
- Keep both columns and only correct the docs (#587 Option A): rejected by the maintainer on 2026-10-06.
- A null for a dry column: ranking, bounds, the chart and the colour scale would each need a null case for the most common hour.
- Espy's parcel base for a dry column (#117's fallback): under the deck's meaning it can read as a deck below a summit on a dry day.
- A floor under the walk (skipping levels that may be under the model's ground): not decided here. The METAR check above shows the false low decks are model-dependent, and the choice of floor is the maintainer's.

## Consequences

`weather_vectors.json` pins the walk on both sides (mirror row 25), and `mirrored_constants.json` pins `CLOUD_SATURATION_RH`, `CLOUD_DECK_CEILING_FT`, the ISA heights and `N_CLOUD_VARIABLES` (rows 26 and 27). The keyed API loses six response fields, six sort keys and four bounds, which the deck's three fields, three sort keys and two bounds replace; a request still sending a retired one is a `422`. A stored column set from before this change (`columns6` and older) migrates with the deck's three columns shown, under the new key `columns7`. An extrapolated 1000 hPa or 2 m saturation under a clear sky reads as a low deck, more often on ECMWF than on GFS.
