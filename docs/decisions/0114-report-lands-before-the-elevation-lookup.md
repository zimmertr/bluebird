# 0114. The elevation lookup starts when the coordinates box is filled, and no report waits for it

- Status: Accepted
- Date: 2026-10-07
- Decider: the maintainer (TJ), on issue #673 (option B, then on PR #674: start at paste time, never block, 24 s)
- Issues and PRs: #673, #643, #655, #207, #545
- Cited in code as: #673
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `clientAnalyze.ts`, `analysisPipeline.ts`, `openMeteo.ts`, `forecastReuse.ts`, `constraints.ts`, `tableColumns.ts` and `analyzeOverlay.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useAnalyze.ts` and `useAnalysisReport.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsTable.tsx` and `ResultsTableRow.tsx` bullets; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` bullet
- Supersedes 0101 in one respect: the report no longer waits for the lookup. The overlap 0101 introduced stands.

## Context

0101 (#643) started a pasted list's forecasts beside the pod's elevation lookup rather than after it, and measured 0.7 s saved out of a run that still took 8.8 s when overpass-api.de was busy, because every row still waited for the lookup before it was assembled. The maintainer's list of 100 Washington summits then landed three times in one evening with every Elevation cell blank (the pod's log: `Custom destination elevation lookup gave up after 8s`, 2026-10-06 at 20:44, 22:26 and 22:28), and asked for the rows to land when the forecasts do, with the elevation and whatever depends on it filled in afterwards, the way the Wildfire column already fills in after the rows.

The hard requirement was unchanged: every forecast number must be read at the destination's elevation, not the terrain's. What makes the two compatible is where the elevation enters. Open-Meteo is sent coordinates alone and answers the whole column, 10 m and 2 m plus the five pressure levels; the elevation is read only by the reduce (`weatherMetrics`, `weatherSeries`, `cloudMetrics`, `cloudSeries`), which interpolates the wind and the temperature to it and walks the cloud deck from it. A kept column reduced again at the OSM height produces the same numbers waiting would have, which the test `produces the rows a run that waited would have` in `clientAnalyze.test.ts` holds it to.

## Decision

**The lookup runs as soon as the box holds rows.** `useElevationLookup` watches the parsed rows and the searched places, and once the box has been still for `LOOKUP_DEBOUNCE_MS` sends every distinct coordinate the browser has no answer for to `POST /api/destinations`, one lookup at a time, however the rows got there: a paste, a typed line, a share link opening, an example. The answers (`Identity`: the peak's elevation and OSM id, or that there is none) are kept for the session, so a row is never asked about twice, an added row asks about itself alone and a removed one costs nothing. The pending rows under the box show the elevation as it lands. A reader takes seconds to pick a window and a model after pasting, which is the time a healthy map server needs, so by Analyze the lookup is usually done.

**The request carries what was learned.** `buildCustomList` fills `elevation_ft` from the identities, and the pod skips the map server for every row that has one (`enrich_custom` looks up only rows with none), so the analysis's own `POST /api/destinations`, which it still makes for today's snow depth, answers in milliseconds. The pipeline resolves its list only after any lookup still in flight has settled, with everything learned by then, so the browser never asks the pod about the same rows twice at once and the second never waits behind the first in the per-address discovery slot.

**No report waits for the lookup.** `fetchWeather` and `fetchCloud` take `onColumn`, which hands the caller each raw column as it lands; `reduceWeather` and `reduceCloud`, the reduce the fetch itself runs, are exported so the same arithmetic reduces a kept column again later and caches the result under the height it was read at. `runClientAnalysis` keeps the column of every row whose elevation is unknown, assembles the report at once, and returns the lookup's answer as `late`: a `LatePatch` of the rows it changed, each reduced again from its column at the height returned (`placeRows`), plus the columns still worth holding. `useAnalyze` lands the patch on the committed report in place (`useAnalysisReport.patch`) and on the held field a later run reuses, under a run counter so an answer arriving after the next Analyze or a reset lands on nothing. `pendingHeights` names the rows waiting, and in the table their Elevation cell and every cell `heightDependentKey` names (wind, temperature, cloud deck, snow depth) tick the flag columns' frame until the patch lands; the rest of the row prints. A ranking on one of those columns reorders once when the answer lands, because `present.ts` re-ranks the patched universe. The one wait left, named by `Retrieving elevation…`, is an over-cap list keeping its highest, which cannot choose without elevations.

**The pod says whether it finished.** A row with no peak beside it and a row the lookup never reached both come back with a null elevation. `enrich_custom_reporting` adds whether the lookup finished, and the destinations route publishes it as `elevation_lookup_complete`, an additive response field. The browser keeps a null only under `true`; under `false` the rows stay unanswered, the hook asks once more after `LOOKUP_RETRY_MS` and then leaves the set until the list changes, and a row placed by that retry after a report has committed reaches the report through `useAnalyze.placeHeld`, reduced from the column the run kept for it.

**The deadline is 24 s**, 12 s a mirror under 0111's even split. It bounded how long a reader waited for any row; it now bounds how long a row's cells tick, and 12 s is what a busy mirror was measured to need (15.3 s, 11.4 s and 9 s on 2026-10-06, #655) where a 4 s slice met none of them.

## Evidence

The evening's three empty lists above, and the measurements in 0101 and #655.

Before and after the first half (the report no longer waiting), measured 2026-10-07 the way 0101's were: the image built from main and from the branch, each in a fresh container, the same 100 rows of `examples/washington-bulger-list.csv` pasted in headless Chromium, main and branch alternating, times from the Analyze click. Overpass was busy: every main lookup ran to its 8 s deadline with no elevations, and one branch lookup ended at 18 s with none.

| Build | Lookup | Forecasts in | Report on screen | Elevations on screen |
|---|---|---|---|---|
| main | 5.8 s, no elevations | 1.53 s | 6.04 s | never |
| main | 8.0 s, no elevations | 0.82 s | 8.58 s | never |
| main | 8.0 s, no elevations | 0.96 s | 8.68 s | never |
| branch | 18.2 s, no elevations | 0.83 s | 1.01 s | never |
| branch | 5.3 s, 97 elevations | 0.86 s | 0.98 s | 5.36 s |
| branch | 3.4 s, 97 elevations | 1.18 s | 1.35 s | 3.84 s |

The same probe over the second half (the lookup at paste time, no ranking waiting), later the same day, with four seconds between the paste and the click as a reader would take. overpass-api.de refused every connection and maps.mail.ru answered 504 or nothing, so no run on either build got an elevation; what the table shows is where the time went.

| Build | Lookup starts after paste | Lookup | Report on screen after click |
|---|---|---|---|
| main | 4.2 s (at the click) | 1.6 s, no elevations | 2.00 s |
| main | 4.2 s (at the click) | 4.5 s, no elevations | 5.08 s |
| main | 4.2 s (at the click) | 4.4 s, no elevations | 5.13 s |
| branch | 1.1 s | 26.7 s over three asks, no elevations | 0.98 s |
| branch | 1.2 s | 14.1 s over three asks, no elevations | 1.52 s |
| branch | 1.1 s | 15.6 s over two asks, no elevations | 1.00 s |

On the branch the report is on screen about a second after the click whatever the map server does, where main waited for the server to fail. The paste-time lookup left 1.1 s after the paste, and the branch asked two or three times (the paste-time ask, the analysis's own, the one retry), each cut by the deadline's 12 s slices, which is the bounded cost of a dead server. The fill-in path, where a late answer places rows, could not be measured against a server that answered nothing, and is held by `places held rows from an answer that arrives after the lookup gave up` in `useAnalyze.test.tsx` and the hook's own tests.

## Alternatives rejected

- Holding the report for the lookup under a ranking on a height-read number, so the table never reorders under the reader. Built first on this PR and rejected by the maintainer on the preview: with Overpass busy it held a temperature ranking for the whole deadline, which is the wait the issue was filed about. The reorder is one event, and with the lookup started at paste time it is rare.
- Splitting the lookup into many small Overpass queries so placed rows land one by one. The slow part is the queue for a slot, not the matching (under a second for 100 points), and overpass-api.de allows two slots per address, so the first small chunk would land no sooner than the whole list and the rest later, on a donated server.
- Keeping the 8 s deadline. It was set for a reader waiting on an empty screen (#545), and three lists in one evening came back with nothing under it.
- A longer-lived elevation cache on the pod, and Open-Meteo's elevation API. Both declined under 0101 and unchanged.

## Consequences

A row whose elevation is still out shows its precipitation, air quality and freezing level at once and its wind, temperature, cloud deck and snow depth when the lookup answers, with a ranking on one of those reordering once at that moment; the chart lines and the map popup of such a row read its provisional, terrain-height wind and temperature until then, because neither has a per-cell waiting state. A share link that opens with a pasted list sends one lookup on load. A list over the analysis cap sends none. The browser holds a raw Open-Meteo column (two days of fifteen variables) per waiting row until the lookup answers or the held field expires, a few kilobytes a row. The per-address discovery slot on the pod is held for up to 24 s rather than 8 s while a lookup runs.
