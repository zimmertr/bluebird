# 0170. A ring reads up to 1,024 of the tiles it touches, at 16 in flight, and the loading card counts them

- Status: Accepted; amends 0118
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #745, 2026-10-16: option A of the issue, the budget, 16 in flight under OpenFreeMap's terms of 2026-10-14, and the two additions (the touched tiles, the bar)
- Issues and PRs: #745, #735 and PR #746 (the fallback this extends to larger rings), #675 and PR #677 (discovery from the tiles)
- Cited in code as: #745
- Guide: root `CLAUDE.md`, Architecture step 2; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `tileDiscovery.ts`, `analysisPipeline.ts` and `analyzeOverlay.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useAnalysisRun.ts` and `useAnalyze.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `AnalysisOverlay.tsx` and `MapStage.tsx`; [`docs/USAGE.md`](../USAGE.md), What happens when you analyze; [`docs/DATA.md`](../DATA.md), Map tiles; [`docs/TRAFFIC.md`](../TRAFFIC.md), the OpenFreeMap row
- Related: 0118 (discovery from the tiles, whose budget and count this changes), 0164 (a search keeps what needed no map server), 0115 (what the tiles are relied on for)

## Context

0164 lets a polygon search survive an Overpass outage with the peaks and lakes its tiles answered. That reached only a ring of 256 zoom-14 tiles under its bounding box, about 700 km² at 47° N. A larger ring sent every kind to Overpass, so an outage failed it whole. The polygon cap is about 140 times that budget.

0118 set the budget where a cold edge stopped beating Overpass's ten-second median. The maintainer's criterion for this issue was that reliability matters more than speed, and that speed still has to be very good.

Measured 2026-10-16 with `curl` from a workstation, square blocks of zoom-14 tiles in the BC interior the edge had not held, each read cold and then again at once:

| Tiles | 16 in flight, cold | 16 in flight, warm | 4 in flight, cold | 4 in flight, warm | Bytes |
|---|---|---|---|---|---|
| 256 | 5.4 s | 0.6 s | 18.6 s | 2.2 s | 1.0 MB |
| 1,024 | 17.9 s | 2.4 s | 65.3 s | 9.1 s | 4.2 MB |

The issue's own table, over sparser ground on the same day, had 1,024 tiles at 21.1 s cold and 5.9 s warm. In the browser, against images built from `main` and the branch, each ring opened by share link with peaks and lakes ticked and analyzed on load, measured from the loading card's first line to its next (`main` sends these rings to Overpass; the branch reads their tiles and decodes them):

| Ring | Tiles | `main` (Overpass) | Branch, cold | Branch, warm | Tiles' rows vs Overpass's |
|---|---|---|---|---|---|
| Glacier Peak country, WA | 1,024 | 47.6 s, answered | 20.3 s, 1.7 MB | 3.9 s | 231 vs 213 |
| South of it | 512 | 26.0 s, `took too long` | 9.4 s, 1.1 MB | 2.6 s | 208 vs none |
| BC Coast Mountains | 1,024 | 26.0 s, `HTTP 504` | 16.3 s, 1.2 MB | 3.3 s | 124 vs none |
| East of it | 512 | 39.7 s, answered | 8.0 s, 0.4 MB | 2.3 s | 27 vs 16 |

Chromium in the pinned Playwright image on 2026-10-17, one browser per run, the branch run first so its cold read was cold. Two of the four Overpass answers were failures; the extra rows on the branch are the lakes the tiles carry and the `water=lake` query does not (0118).

OpenFreeMap changed its terms on 2026-10-14, a week after 0118 (commit `5eacf83` in `hyperknot/openfreemap`). The old line forbade collecting data from the service in automated ways without permission. The new one allows it as an offline download, if each download is at most 3,000 tiles or 50 MB, made with at most 4 parallel requests, and sent with a unique User-Agent naming the app, and asks to be contacted for anything larger.

## Decision

**`DISCOVERY_TILE_BUDGET` is 1,024.** About 2,800 km² at 47° N, a 53 km square. A cold read at the top of the range takes about 18 to 21 s, longer than a good evening's Overpass, and the maintainer took that for a read that cannot fail the way Overpass does. Warm it is 2 to 6 s. Rings over the budget keep today's path and today's all-or-nothing failure.

**The budget counts the tiles the ring touches, not its bounding box.** `tilesCovering` marks a tile when an edge of the ring runs through it, and when the ring's interior covers the tile's centre, found by a scan line through each tile row. A tile with no edge through it lies wholly on one side of the ring, so those two tests together are the tiles the ring touches. The test runs in the plane of longitude and latitude, the plane `pointInRing` reads the rows in, so a feature the ray cast keeps is in a tile the read fetched. A strip drawn along a range now pays for the strip.

**The read stays at 16 in flight.** The maintainer read the search as the map's own use over the drawn area rather than an offline copy of it: the tiles are the files the map loads when zoomed over the ring, fetched at the ceiling MapLibre sets for its own requests, and a browser cannot send a User-Agent of its own. The largest read is about a third of the terms' tile limit and a tenth of their byte limit.

**The loading card's bar fills by tiles read.** `discoverFromTiles` reports each tile against the ring's count, `useAnalysisRun` holds it as `searchProgress`, a second field beside the forecast batches' `progress` because `announce` sets that one while the heading still reads the searching label, and `composeOverlay` draws it under `Searching for destinations…` with the same percent caption the forecast phase shows. No string was added.

**What does not change.** A tile that cannot be read still sends the whole ring to the map server (0118). The map server still answers trailheads and crags. The API's routes keep one Overpass query (0011).

## Evidence

The tables above. The unit suite holds the geometry with a triangle over a four-by-four block (the six tiles past its diagonal are left out), a U over a three-by-three block (the tile in its mouth is left out and the tile its floor crosses is kept), and a strip along the diagonal of a hundred-tile square (a few hundred tiles where the box holds ten times the budget). The pipeline, hook, overlay and card suites hold the bar end to end.

## Alternatives rejected

- **A fallback to the tiles after Overpass fails (the issue's option B).** Slowest in an outage: the mirror chain's wait, up to about 50 s, and then the read. The lake set would also differ between a good evening and a bad one, and the path would run only during outages.
- **Reading the tiles beside the Overpass call (option C).** Every large ring on a healthy day would download tiles it may throw away, which is the collection the terms restrict.
- **Doing nothing (option D).** Rings over 700 km² would keep failing for the length of every outage.
- **4 in flight, as the terms ask of an offline download.** 256 tiles took 18.6 s cold and 1,024 took 65.3 s, so the budget would have had to fall and this issue would have become option B or D.
- **512 tiles.** About even with Overpass cold and three times faster warm, with the slow end near today's, but half the reach.
- **2,048 tiles.** Cold about 35 to 40 s and up to about 8 MB, past what a reader waits for.
- **Emailing OpenFreeMap before deciding.** Offered. The maintainer chose to proceed inside the published limits and record the reading.

## Consequences

A ring up to about 2,800 km² with peaks or lakes ticked reads them from the tiles on every run, and an Overpass outage costs it only the trailheads and crags, which 0164's line names. A cold read of the largest such ring takes about 20 s, with the bar filling, where a good evening's Overpass takes about 10 s. A ring over the budget behaves as before. The app's read sits inside the published count and byte limits of an offline download and above its concurrency, by the maintainer's reading; if OpenFreeMap asks, the concurrency is one constant and the budget another. A diagonal ring that was over the budget by its box may now fit.
