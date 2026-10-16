# 0164. A polygon search keeps what needed no map server when the map server fails, and names the kinds it is without

- Status: Accepted
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #735, 2026-10-16: option B (one call, and on failure the rows already held), option C dropped to #745, and the warn line's wording
- Issues and PRs: #735, #745 (the oversized ring), #715 and #731 (crags, which take the same path), #675 (discovery from the tiles), #560 (an uncommitted run changes nothing), #734
- Cited in code as: #735
- Guide: root `CLAUDE.md`, Architecture step 2; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analysisPipeline.ts` and `panelMessages.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useAnalyzeCommand.ts` bullet; [`docs/USAGE.md`](../USAGE.md), What happens when you analyze; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass
- Related: 0118 (the tiles first, which this extends), 0011 (one union discovery query, which the pod keeps), 0093 (a run that does not finish changes nothing), 0028 (every notice below Analyze), 0064 (strings need approval)

## Context

Since 0118 a polygon run reads its peaks and lakes from the basemap's zoom-14 tiles and makes one `POST /api/destinations` call carrying three things: the kinds the tiles cannot answer (trailheads, and crags since #731), the tile rows, and the reader's own list, the last two as `custom_destinations` with `elevation_lookup: false`. When Overpass failed, the pod answered that call with an error and the whole run failed with it, tile rows and list included, though neither needed Overpass. Record 0093 then put the previous report back, so the reader got nothing new.

On 2026-10-15 the maintainer's 19 km² ring near Rattlesnake Ridge ranked at once with Peaks alone and failed with `502` after 30 s, then after 6 s, with Trailheads ticked. Between 02:12 and 02:16 UTC on 2026-10-16 all three free Overpass instances with worldwide data were failing at once, to queries sent straight to them with none of the app's code involved (the evidence is in #735), so the outage was Overpass's and more mirrors would not have saved it.

## Decision

**When the destinations call of a tile-first run fails upstream, the run ranks the rows that needed no map server.** "Upstream" is `DiscoveryUnavailableError` in `analysisPipeline.ts`: the pod's 5xx or 429, or an edge's page in place of the pod's answer. A refusal over the cap, a `422` and a reader's cancel fail exactly as before, since asking again cannot change any of them.

**The fallback makes no second call.** A call with `elevation_lookup: false` and no map-server kinds is an echo: the pod returns the rows it was sent, each coordinate once. `distinctRows`, the browser's copy of that rule (it already applies it to a pasted list), stands in for it, so the fallback works even when the thing that failed is the pod. The same is why a run whose kinds were all tile kinds also falls back, with nothing missing, when only the pod fails.

**The report names what it is without, in one warn line below Analyze.** The kinds the pod was asked to find ride on the result as `missingTypes`, onto the report's snapshot (`AnalyzedView.missingTypes`), and `panelMessages.ts` turns them into `Trailheads could not be found. Try again later.`, or `Trailheads and crags not found. Try again later.` with both (the maintainer's wording, 2026-10-16). The second drops "could" to stay on one line: with it the sentence measured 318 px in the panel's notice against about 281 px of line, and without it 265 px, in Chrome on macOS. Trailheads are named before crags whatever order they were ticked in. Warn rather than info, because the report no longer covers what the panel asked for, and the line is the only thing that says so. It is quiet while a run is in flight and while a later run's failure or refusal is on screen.

**A partial report is a committed report, and records no discovery.** It commits like any other, so 0093 is unchanged for a run that fails outright. But the discovery record would claim the missing kinds were searched, and `isDiscoveryRefresh` would make the next identical Analyze a weather-only refresh that never asks for them. So `onCommit` carries `partial`, and `useAnalyzeCommand` leaves the record empty for a partial commit. The next Analyze discovers again: the tiles answer in about a second, the forecast reuse means only new rows' weather is bought, and the pod is asked for the missing kinds.

**A run with nothing to rank still fails with the map server's message**, as does a ring the tiles cannot answer, which sent every kind to Overpass. The second is #745.

## Alternatives rejected

- **Two calls, and keep whichever answers (#735's option A).** As written it still waits for the Overpass call, so it costs a second request and the cap across two answers for the same outcome. Its one real advantage, ranking the tile rows before the trailheads arrive, would change a committed report after commit, against 0093, and was not asked for.
- **A second call with no map-server kinds as the fallback.** It keeps the pod's merge rule by asking the pod, but the pod may be what failed, and the rule is one line the browser already owns.
- **Reading the tiles for an oversized ring when Overpass fails (#735's option C).** Dropped by the maintainer on 2026-10-16 once it turned out the polygon cap is about 140 times the tile budget, so an unbounded fallback could read tens of thousands of tiles. Filed as #745 with measurements.

## Consequences

A ring the tiles can answer survives an Overpass outage with its peaks, lakes and the reader's own destinations, at the cost of the trailheads and crags, and the reader is told which. The wait is unchanged: the fallback lands when the pod's mirror chain gives up, up to about 50 s. A reader who skims past the warn line can mistake a partial report for a complete one; the line is the only signal, by the maintainer's choice of one line over anything louder. The API's routes keep all-or-nothing discovery (0011).
