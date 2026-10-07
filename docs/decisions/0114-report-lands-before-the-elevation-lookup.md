# 0114. A run with no polygon lands its report when the forecasts do, and takes the elevation lookup's answer when it comes

- Status: Accepted
- Date: 2026-10-07
- Decider: the maintainer (TJ), on issue #673 (option B)
- Issues and PRs: #673, #643, #655, #207, #545
- Cited in code as: #673
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `clientAnalyze.ts`, `analysisPipeline.ts`, `openMeteo.ts`, `forecastReuse.ts`, `constraints.ts`, `tableColumns.ts` and `analyzeOverlay.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useAnalyze.ts` and `useAnalysisReport.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsTable.tsx` and `ResultsTableRow.tsx` bullets; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` bullet
- Supersedes 0101 in one respect: the report no longer waits for the lookup. The overlap 0101 introduced stands.

## Context

0101 (#643) started a pasted list's forecasts beside the pod's elevation lookup rather than after it, and measured 0.7 s saved out of a run that still took 8.8 s when overpass-api.de was busy, because every row still waited for the lookup before it was assembled. The maintainer's list of 100 Washington summits then landed three times in one evening with every Elevation cell blank (the pod's log: `Custom destination elevation lookup gave up after 8s`, 2026-10-06 at 20:44, 22:26 and 22:28), and asked for the rows to land when the forecasts do, with the elevation and whatever depends on it filled in afterwards, the way the Wildfire column already fills in after the rows.

The hard requirement was unchanged: every forecast number must be read at the destination's elevation, not the terrain's. What makes the two compatible is where the elevation enters. Open-Meteo is sent coordinates alone and answers the whole column, 10 m and 2 m plus the five pressure levels; the elevation is read only by the reduce (`weatherMetrics`, `weatherSeries`, `cloudMetrics`, `cloudSeries`), which interpolates the wind and the temperature to it and walks the cloud deck from it. A kept column reduced again at the OSM height produces the same numbers waiting would have, which the test `produces the rows a run that waited would have` in `clientAnalyze.test.ts` holds it to.

## Decision

`fetchWeather` and `fetchCloud` take `onColumn`, which hands the caller each raw column as it lands; `reduceWeather` and `reduceCloud`, the reduce the fetch itself runs, are exported so the same arithmetic reduces a kept column again later and caches the result under the height it was read at. `runClientAnalysis` keeps the column of every row whose elevation is unknown while the lookup is out, assembles the report at once, and returns the lookup's answer as `late`: a `LatePatch` of the rows it changed, each reduced again from its column at the height returned and carrying the name, OSM id and snow depth the lookup gave it, plus the columns still worth holding for rows it could not place. `useAnalyze` lands the patch on the committed report in place (`useAnalysisReport.patch`) and on the held field a later run reuses, under a run counter so an answer arriving after the next Analyze or a reset lands on nothing. `pendingHeights` names the rows waiting, and in the table their Elevation cell and every cell `heightDependentKey` names (wind, temperature, cloud deck, snow depth) tick the flag columns' frame until the patch lands; the rest of the row prints. A held row whose elevation is still unknown carries its column into the next run (`HeldForecasts.columns`), so that run's lookup can place it without a fetch.

The report waits for the lookup in two cases only, both named by `Retrieving elevation…` as before: when the ranking or a bound reads a family in `HEIGHT_FAMILIES` (`namesHeightMetric`), because a row's provisional number would decide its place and a report that reshuffled under the reader is the alternative 0101 rejected; and when an over-cap list keeps its highest, which needs the elevations to choose. A report that waits shows no partial field, for the same reason.

The pod's `ENRICH_DEADLINE_S` moves from 8 s to 24 s, 12 s a mirror under 0111's even split. It bounded how long a reader waited for any row; it now bounds how long a row's cells tick, and 12 s is what a busy mirror was measured to need (15.3 s, 11.4 s and 9 s on 2026-10-06, #655) where a 4 s slice met none of them.

## Evidence

The evening's three empty lists above, and the measurements in 0101 and #655. Before and after, measured 2026-10-07 the way 0101's were: the image built from main and from the branch, each in a fresh container, the same 100 rows of `examples/washington-bulger-list.csv` pasted in headless Chromium, main and branch alternating, times from the Analyze click. Overpass was busy: every main lookup ran to its 8 s deadline with no elevations, and one branch lookup ended at 18 s with none.

| Build | Lookup | Forecasts in | Report on screen | Elevations on screen |
|---|---|---|---|---|
| main | 5.8 s, no elevations | 1.53 s | 6.04 s | never |
| main | 8.0 s, no elevations | 0.82 s | 8.58 s | never |
| main | 8.0 s, no elevations | 0.96 s | 8.68 s | never |
| branch | 18.2 s, no elevations | 0.83 s | 1.01 s | never |
| branch | 5.3 s, 97 elevations | 0.86 s | 0.98 s | 5.36 s |
| branch | 3.4 s, 97 elevations | 1.18 s | 1.35 s | 3.84 s |

The report is on screen 0.2 s after the last forecast lands on the branch, against 0.2 to 0.6 s after the lookup on main: a mean 7.77 s became 1.11 s. The elevations fill in when the lookup answers, 5.4 s and 3.8 s after the click on the two runs that got them, where a main run that got them at the same moment would have shown nothing at all until then.

## Alternatives rejected

- Showing rows at the terrain height under every ranking and reshuffling when the lookup answers. Rejected in 0101 and still: the two height rankings wait instead.
- Keeping the 8 s deadline. It was set for a reader waiting on an empty screen (#545), and three lists in one evening came back with nothing under it.
- A longer-lived elevation cache on the pod, and Open-Meteo's elevation API. Both declined under 0101 and unchanged.

## Consequences

A row whose elevation is still out shows its precipitation, air quality and freezing level at once and its wind, temperature, cloud deck and snow depth a few seconds later; the chart lines and the map popup of such a row read its provisional, terrain-height wind and temperature for those seconds, because neither has a per-cell waiting state. The browser holds a raw Open-Meteo column (two days of fifteen variables) per waiting row until the lookup answers or the held field expires, a few kilobytes a row. The per-address discovery slot on the pod is held for up to 24 s rather than 8 s while a lookup runs.
