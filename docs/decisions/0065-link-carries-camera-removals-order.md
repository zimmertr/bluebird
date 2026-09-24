# 0065. The share link carries the map camera, the removed rows and the table's header sort

- Status: Accepted
- Date: 2026-08-22, confirmed with the key names on 2026-09-24
- Decider: TJ
- Issues and PRs: #292
- Cited in code as: #292
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `urlParams.ts` and `mapView.ts` bullets

## Context

A shared link reopened the analysis but not the report as the sender saw it. The map opened on the default camera or a fit to the ring, rows the sender struck out with × came back, and the table read in the ranking's order whatever header the sender had sorted by. The URL audit in #292 listed all three as state that never reached the link.

## Decision

Four keys join the link, after every other key:

- `removed=lng,lat;lng,lat`: the ×-removed rows at the five-decimal `geoKey` identity `useRemovals` holds, with no length cap. A restored link hides them from its first render, lists them under Removed once its first report lands, and keeps them through its own first Analyze. A key the landed field does not hold is dropped. A real discovery change still clears them.
- `tsort=<column>` and `tdesc=1`: the header sort, written only while it differs from the ranking's own order. It holds for the first report a link opens with, and a Rank-by change drops it.
- `view=lng,lat,zoom`: four decimals of position and two of zoom. It wins over the app's opening fits to the ring, the pasted list and the pins, but not over a search or a paste the reader makes. A pan or a zoom by the reader alone makes a link, and so does a link's own camera, which was the sender's move; the app's own camera moves keep the camera in a link that exists and make none by themselves. The camera reaches the link's writer without React state, so a pan renders nothing.

The camera rides in the query, not in MapLibre's `hash` option, because that would be a second URL writer and a query write drops the hash.

## Evidence

- A pan's cost, measured 2026-09-24 with `make perf` at 946 destinations (a mouse drag after the five existing probes, React commits counted through the DevTools hook, script time from Chrome's `ScriptDuration` over the drag and one second of settle): 0 React commits on both builds, and a median of 32 and 35 ms of script against 27 and 29 ms on the build before, in two pairs run in both orders. The difference is the link's one debounced write per settled pan. The five existing probes did not move.
- The fields a pan hands MapLibre's `moveend`: `originalEvent` for a drag, a wheel, a touch, a key and the zoom buttons, and `geolocateSource: true` for the geolocate button, read in the maplibre-gl 6.10 source on 2026-09-24. The app's own `fitBounds`, `jumpTo` and `flyTo` calls carry neither, and nor does box zoom, which calls `fitScreenCoordinates` with no event data and which the app turns off (`map/controls.ts`).

## Alternatives rejected

- MapLibre's `hash` option for the camera: a second writer of the address bar.
- The camera in App state: every `moveend` would render the memoized map, table and chart.
- Keeping a link's removal whose row never arrives: after a field lands it hides nothing and cannot be listed or restored, so it is dropped rather than carried into every later link.
- A cap on `removed`: a report pruned by hand is exactly the long case, and a link that dropped some removals would share a different report (TJ, 2026-09-24).
- An opening camera that makes a link: a fresh session would write one before anyone touched the map.

## Consequences

`urlParams.test.ts`, `urlState.test.ts` and the golden file pin the four keys; `mapView.test.ts` pins the camera codec and the reader-move rule; `useUrlSync.test.tsx`, `useRemovals.test.tsx` and `usePresentedReport.test.tsx` pin the hooks; two browser tests in `shareLink.spec.ts` open a link with all three and pan a fresh session. The linter's `url-sync-hook` check holds the camera's `useCallback` and keeps it off the sync effect's list. Every link now carries a camera, which adds about 25 bytes.
