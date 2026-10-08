# 0118. A ring's peaks and lakes are discovered from the basemap's zoom-14 tiles, the map server keeps the trailheads and the oversized rings, and a lake is any named water body

- Status: Accepted
- Date: 2026-10-07
- Decider: the maintainer (TJ), on issue #675: filed at his request after "OpenStreetMap (Overpass) failed (HTTP 504). Try again later." became the usual end of a polygon search; the lake definition is his pick of 2026-10-07 ("tiles, superset accepted")
- Issues and PRs: #675, #673 (the lookup this extends), #545 and #546 (no self-maintained index), #177 (no hedged Overpass requests)
- Cited in code as: #675
- Guide: root `CLAUDE.md`, Architecture step 2; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `tileDiscovery.ts` and `analysisPipeline.ts` bullets
- Related: 0114 (the lookup from the same tiles), 0115 (what the tiles are relied on for, now with the `water_name` layer), 0011 (one union discovery query, which the pod keeps), 0116 (a lake from the tiles carries no elevation, so its cell shows the terrain height marked)

## Context

Every polygon search was one Overpass query through the pod's mirror chain, and the chain's answer had become the message above. The production pod's own counters (`bluebird_forecast_overpass_requests_total`, read 2026-10-07) show overpass-api.de failing about one attempt in three in mid-September and five in six on October 6 and 7, with maps.mail.ru timing out behind it; the chain raises the last mirror's error, so "HTTP 504" means both failed. The 2026-09-30 audit had the median successful discovery at ten seconds and a quarter over thirty. The app's own changes since then (#548 bounding every attempt, #667 sending a just-failed mirror to the back) made a failure faster to arrive and gave it that wording; they changed nothing about whether a discovery succeeds.

0114 had already made the basemap's zoom-14 tiles the first source of a pasted coordinate's elevation, on the strength of the `mountain_peak` layer being complete at that zoom. A ring's peaks are the same features inside a polygon rather than beside a point, and the `water_name` layer carries the lakes. Measured 2026-10-07 over three rings against Overpass's own answer for the same ring:

| Ring | Zoom-14 tiles | Fetched, cold then warm | Peaks, tiles vs Overpass | Lakes, tiles vs Overpass |
|---|---|---|---|---|
| The Enchantments (19 km by 14 km) | 120 (381 KB) | 0.34 s, 0.35 s | 42 vs 42, the same ids | 46 vs 40, every one of Overpass's among them |
| Mount Baker (29 km by 19 km) | 240 (750 KB) | 0.62 s, 0.61 s | 28 vs 28 | 16 vs 3 |
| Seven Lakes basin, Olympics (19 km by 13 km) | 108 (230 KB) | 0.34 s, 0.30 s | 16 vs 16 | 23 vs 4 |

The peaks are Overpass's exactly. The lakes are a superset, because the pod's query keeps `natural=water` with `water=lake` and a name, while the tiles carry every named water body with the one class `lake` and no subtype: Thor Pond, Gnome Tarn and Baker Lake (a reservoir) are in the tiles and not in the query. Trailheads are in no OpenMapTiles layer. The "cold" fetches above were from an edge that already held these popular areas; a truly cold edge measured 4.7 s for 135 tiles on the preview on 2026-10-07, which is what sets the budget below.

## Decision

**A ring's peaks and lakes come from the tiles.** `tileDiscovery.ts` reads every zoom-14 tile under the ring's bounding box, at `TILE_CONCURRENCY` in flight, decodes the two layers, applies the pod's classification (a named peak or volcano; an unnamed one with an elevation as `Peak N` when the reader asked for those; a named lake), keeps the features inside the ring (`pointInRing`, the same ray cast the fire check uses) and one row per OSM element however many tiles' buffers carry it, and answers rows in the shape discovery reports them, with the node, way or relation id out of Planetiler's feature id.

**A lake is any named water body.** The maintainer took the superset over keeping lakes on the map server: a tarn or a pond is a destination to a hiker, and the alternative kept the whole wait and the failure rate for every ring with lakes ticked. The API's `POST /api/destinations` keeps the `water=lake` query, so the app and the API answer a ring's lakes differently, and `docs/USAGE.md` says so.

**The map server keeps what the tiles cannot answer.** `discoverFromTilesFirst` in `analysisPipeline.ts` sends the pod one destinations call with the trailheads to discover (`destination_types` reduced to the kinds the tiles do not carry, which is usually none), the tile rows and the reader's own list as `custom_destinations`, and `elevation_lookup: false`, so the call takes no map-server slot and answers in milliseconds with today's snow depth for every row unless trailheads are ticked. The rows come back typed `custom`, and the pipeline puts the kinds and ids the tiles gave them back by coordinate. The cap is applied before the call as the pod would apply it to the union: the refusal below the opt-in, the highest kept above it.

**A ring over `DISCOVERY_TILE_BUDGET` (256 tiles) takes the Overpass path as before.** About 700 km² at 47° N. A cold edge read 135 tiles in 4.7 s and 144 in 7.2 s on 2026-10-07, so the budget is ten to thirteen seconds cold, about the map server's median on a good evening and without its failure rate; past it the tiles would be the slower path even when the map server answers. A lower zoom cannot stand in, since the peak layer is sampled below 14.

**A tile that cannot be read sends the whole ring to the map server.** A partial answer would be a field with holes in it that nothing would announce. Bytes that are no tile count as unreadable here, where the lookup reads them as an empty tile (0114): an empty answer from a discovery means "nothing in this ring" and skips the map server, so a stub answering with an image (the browser suite's) must not pass for one.

**The decoder loads on the first polygon run**, as it does on the first lookup, so the cold load the Lighthouse gate measures carries neither the decoder nor the tile library.

## Evidence

The counters and the three rings above, and a before-and-after in Chromium against images built from `main` and the branch (PR #677's body carries the table): the Enchantments ring's report landed at 15.6 s and 18.8 s on `main` against 3.7 s and 2.1 s on the branch, and a Mount Baker ring whose tiles the edge did not hold took 7.5 s against 5.6 s on an evening the map server answered in 4.5 s. The unit suite builds rings of tiles with the repository's own encoder (`testSupport/mvt.ts`) and holds the classification, the deduplication, the ray cast, the budget and the fallback; the pipeline suite scripts what the tiles answer and holds the pod's request and the restored rows.

## Alternatives rejected

- **A third Overpass mirror or a smarter order.** The 2026-09-30 audit found no healthy third mirror, and no order helps when both mirrors are busy at once, which the counters show.
- **The pod reading the tiles**, for the app and the API alike. One implementation and an API that benefits, against a pod that becomes a tile client with its own cache and egress, which 0021's direction (the browser does the fetching) argues against. Open as a later step if API callers ask.
- **A self-maintained destination index.** Settled no under #546.
- **Keeping lakes on the map server.** Offered and declined by the maintainer, 2026-10-07.
- **Answering a ring from the tiles that could be read.** A field with holes in it, with nothing to say so.
- **A lower zoom for large rings.** The peak layer keeps five per label-grid cell below zoom 14, so a large ring would silently lose summits.

## Consequences

A ring with peaks or lakes ticked and no trailheads never asks the map server: its destinations are on screen about a second after Analyze on a warm edge, and the pod answers its one call in milliseconds. A ring with trailheads ticked still waits on Overpass for them, and a ring over the budget behaves exactly as before. A lake from the tiles carries no elevation, so its Elevation cell shows the terrain height marked (0116) where the same lake from Overpass might have carried an `ele` tag. A peak edited in OpenStreetMap since the last tile build reaches a ring through the next build, about a week. The app's lakes are a superset of the API's. The dependency 0115 records now covers the `water_name` layer's `class` and `name` as well, and a change there sends rings to the map server the same way. OpenFreeMap's terms forbid automated bulk collection; a ring read is hundreds of the files the map itself would load zoomed over that ring, for the reader's own search, and the maintainer declined a courtesy note on 2026-10-07.
