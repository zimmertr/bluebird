# 0101. A run with no polygon fetches its forecasts beside the elevation lookup, not after it

- Status: Accepted; the wait for the lookup is superseded by [0114](0114-report-lands-before-the-elevation-lookup.md), the overlap stands
- Date: 2026-10-06
- Decider: the maintainer (TJ), on issue #643 (option A; option B, a longer-lived elevation cache on the pod, declined the same day)
- Issues and PRs: #643, #207, #545, #579
- Cited in code as: #643
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analysisPipeline.ts`, `openMeteo.ts` and `analyzeOverlay.ts` bullets

## Context

A run with no polygon (a pasted list, searched places, clicked places) makes one server call, `POST /api/destinations`, where the pod asks Overpass for the peak within 150 m of each point (#207). The browser awaited that call before it asked Open-Meteo for anything. The lookup is quick to compute and slow to be served: overpass-api.de is donated and often busy, and the pod gives up after 8 s (#545). So the phase a reader watched longest was `Retrieving elevation…`, ahead of forecasts that take a fraction of the time.

The two waits never depended on each other. Open-Meteo is not sent an elevation. The browser reads it only when it reduces a response it already has, to interpolate the wind and the temperature to the destination's height.

## Decision

`runAnalysisPipeline` starts the forecasts on the rows the request carries and runs `resolveCustomOnly` beside them. The lookup's answer goes down as a promise: `runClientAnalysis` binds every row's name, type, elevation, OSM id and snow depth from it before a row is assembled, and `fetchWeather`/`fetchCloud` wait on the elevations (`heights`) before they reduce a batch. No row is shown and then corrected. A batch is reduced outside the request pool, so a reduce that waits on the lookup holds none of the four request slots.

The overlay opens on the forecast count. `Retrieving elevation…` is now a tail label: it stands over a full bar while the lookup is the last thing out, and not at all when the lookup answers first.

Two cases still wait on the lookup first, because they cannot do otherwise: an over-cap list that keeps its highest needs the elevations to choose, and a field with nothing left to fetch has nothing to overlap. An over-cap list without that election is refused at once, where it used to wait out the lookup first.

A polygon run is unchanged. Its lookup rides inside the discovery request, and the browser does not know the field until that answers.

## Evidence

Measured 2026-10-06 with the 100 rows of `examples/washington-bulger-list.csv`:

| Request | Time | Result |
|---|---|---|
| The lookup's Overpass query, sent straight to overpass-api.de, try 1 | 15.8 s | 200 |
| try 2 | 9.0 s | 504, server too busy |
| try 3 | 0.9 s | 200 |
| Production `POST /api/destinations`, try 1 | 8.2 s | deadline hit, 0 of 100 elevations |
| try 2 | 1.2 s | 97 of 100 elevations |
| Open-Meteo forecast request, 50 locations, two tries | 1.4 s and 1.5 s | 200 |

A 100-row list is two forecast batches in flight together, so the run waited the lookup's 1 to 8 s and then the forecasts' time on top. It now waits the longer of the two.

Before and after, the same day: the image built from main and from the branch, each in a fresh container, the same 100 rows pasted in headless Chromium, times from the Analyze click. Overpass was busy, so five of the six lookups ran to the pod's deadline.

| Build | Lookup | First forecast request | Forecasts in | Report on screen |
|---|---|---|---|---|
| main | 8.0 s, no elevations | 8.06 s | 9.46 s | 9.69 s |
| main | 8.0 s, no elevations | 8.69 s | 9.45 s | 9.71 s |
| main | 8.0 s, no elevations | 8.07 s | 8.86 s | 9.06 s |
| branch | 8.2 s, no elevations | 0.10 s | 0.86 s | 8.70 s |
| branch | 8.0 s, no elevations | 0.19 s | 0.96 s | 8.87 s |
| branch | 1.35 s, 97 elevations | 0.33 s | 1.14 s | 2.38 s |

With the lookup at its deadline the report came up at a mean 9.49 s on main and 8.79 s on the branch. That is 0.7 s, less than the forecasts' 0.8 to 1.4 s, because the report's first render (0.4 to 0.7 s after the lookup answered on the branch, against 0.2 s after the last forecast on main) now falls wholly after the lookup, where part of it used to run under the fetch. No main run met a healthy lookup, so the 2.38 s row has no measured twin.

## Alternatives rejected

- A per-point elevation cache on the pod with a long lifetime. Repeats across visitors are rare (the discovery cache measured a 4% hit rate on 2026-09-30), and a visitor's own repeat already skips Overpass, because a window or model change sends the held rows back with their elevations. Declined by the maintainer.
- Open-Meteo's elevation API as the source. It answered 50 points in 0.7 s, from a 90 m terrain model that sat a median 204 ft below OSM's summit figure across the first 50 Bulgers and 826 ft below on Little Tahoma. OSM stays the one source (#207).
- Showing rows at the terrain height and correcting them when the lookup answers. The ranking would reshuffle under the reader.
- Shortening the 8 s deadline. It trades elevations away on slow but successful answers, and it was measured in #545.

## Consequences

A place whose elevation is still being looked up cannot read the browser's per-location forecast cache, because the elevation is part of that key (`cacheKey` in `forecastStore.ts`); its entry is written under the elevation that arrives. Analyzing a pasted list under one model, then another, then the first again inside 15 minutes fetches the first model twice, where the cache used to answer. That costs the visitor's own quota about 150 weighted calls per 100 rows and no wall clock, since the refetch overlaps the lookup it would have waited on. A row that carries its own elevation (a searched place, a held row echoed on a refresh) reads the cache as before.

On a busy spell the run still waits up to 8 s, under a full bar. Every promise derived from the lookup is marked handled where it is made, because an abort rejects it and a fetch that returned early never reads it.
