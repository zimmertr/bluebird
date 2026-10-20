# 0176. Destinations come from a places table filled from the planet file and kept current from the daily change files, with Overpass only where it cannot answer

- Status: Accepted. Supersedes 0115, 0118 and 0164. Amends 0114 (where the lookup reads: the pod alone, the places table and then Overpass, where it read the basemap's tiles first; it still starts when the box is filled, and no analysis waits for it).
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: option A, every peak (named, and unnamed with an `ele` for `include_unnamed_peaks`), lake, trailhead and crag in the database, the first fill from the planet file and the daily change files after it, the browser no longer reading peaks and lakes from the tiles, the lakes matching the server's `water=lake` rule, and the pasted-coordinate name match moving to the pod; and, approving the new privacy copy the same day, not naming the Overpass mirror operators on the privacy page any more
- Issues and PRs: #760, #745, #734, #735, #675, #673, #756 and #757 (closed 2026-10-18, their surviving parts ported), #546 (no self-maintained index), #207 (pasted coordinates get OSM elevations)
- Cited in code as: #760, #673
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture step 2, and the Python and TypeScript mirrors (row 34, retired); [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/places/`, `app/services/osm/` and `app/services/candidates.py` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analysisPipeline.ts`, `elevationLookup.ts` and `glacierCell.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useElevationLookup.ts` and `useAnalyzeCommand.ts` bullets; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass, and Map tiles; [`docs/USAGE.md`](../USAGE.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0175 (the shared cache), 0177 (one place per kind and name within 300 m), 0179 (where a relation stands), 0180 (the markers read the same table), 0184 (the fill), 0185 (shapes the change files cannot place), 0011 (one union query, which the Overpass path keeps)

## Context

Since 0118 a ring of up to 256 zoom-14 tiles (`DISCOVERY_TILE_BUDGET`) read its peaks and lakes from the basemap's tiles. A bigger ring sent every kind to Overpass, and trailheads and crags went to Overpass at every size. 0164 kept the tile rows when Overpass failed, so a ring over the budget, or any ring with trailheads or crags ticked, still lost them. On 2026-10-17, two of four peak-and-lake rings of 512 to 1,024 tiles failed on `main`, and the two that answered took 39.7 s and 47.6 s. On 2026-10-18 three trailhead-and-crag searches over Index failed with a 502 after 27 s, 50 s and 50 s. The overpass-api.de 502 for a worldwide trailhead query on 2026-10-16 said the public endpoint is meant for browser and human-operated tools, and pointed automated use at a self-hosted instance.

## Decision

**One worldwide table holds every peak, lake, trailhead and crag OpenStreetMap carries** (`places` in the shared cache, 0175): one PostGIS point per OSM element, for every named one and every unnamed summit with an `ele`. The planet fill builds it (0184). `services/places/update.py` keeps it current from OSM's daily change files: a refresh source that looks every hour and applies each day file not yet applied, in order, one transaction per file, so a missed day is applied the next time a fetch succeeds. The update moves `osm_state.sequence` only from the day before, so a fill that swaps a new table in mid-update makes the update roll back instead of marking a day applied to a table it never touched.

**One definition of each kind.** `services/osm/rules.py`, standard library only, holds the Overpass selectors and `classify` side by side, and the live query, the fill and the update all read it. `tests/test_osm_rules.py` holds the two halves to one table of tagged examples. A new `RULES_VERSION` makes the next fill check rebuild the table, since the update applies a rule only to what it edits.

**Discovery reads the table first.** `candidates.discover` asks `places.discover`, and asks Overpass only when the table cannot answer: no database, no completed fill, or a connection that drops mid-search. A place is inside a ring when its point is. Rows come back in Overpass's order, nodes, then ways, then relations, each by id, and are merged by 0177.

**The browser reads no tiles for destinations.** `tileDiscovery.ts` and `peakTiles.ts` are deleted. Every ring sends every ticked kind to `POST /api/destinations`, `DISCOVERY_TILE_BUDGET` is gone, and a lake is the server's `water=lake` again, so the app and the API answer a ring the same way. 0164's partial discovery is removed whole, since it only ever kept the tile rows when the pod failed; a discovery that fails fails the run. Mirror row 34 (`PEAK_MATCH_RADIUS_M`) is retired. The basemap's tiles still serve the map, a clicked summit's elevation and the snow card's glacier test, and `glacierCell.ts` now holds the tile host code `peakTiles.ts` held.

**The pasted-coordinate lookup is the pod's alone.** `useElevationLookup` still starts when the box is filled (0114) and now sends every row to the pod. The pod asks the table (`places.summits_near`) and then Overpass, and applies one rule to either answer (`osm.enrich._pick`): the nearest summit within 150 m (`CUSTOM_MATCH_RADIUS_M`), with or without an elevation; when that one has none, or there is none, the nearest summit of the row's own normalized name within 300 m that has one (`NAME_MATCH_RADIUS_M`); otherwise the coordinate match alone, which still says which summit the row is. The name match is the browser's `PEAK_NAME_RADIUS_M` rule carried over, so a list keeps the rows the tiles used to place by name. The enrichment cache key carries each row's normalized name. A table answer is not cached on the pod, since the table is already the shared copy.

**The privacy page names no Overpass operator.** It says the server answers a pasted coordinate and every destination search from its own copy of OpenStreetMap. The fallback still reaches the public mirrors when that copy cannot answer, and the maintainer chose on 2026-10-18 not to name their operators any more. `legal.test.ts` now holds the page to the code's order, the table before Overpass, in place of the mirror list. The OpenStreetMap row in `dataSources.ts` and `NOTICES.md` says the server keeps a copy current daily and asks Overpass when it cannot answer, and the OpenFreeMap row names the glaciers the snow card reads in place of the peaks a pasted coordinate was matched to.

## Evidence

Validated 2026-10-18 in Docker on the maintainer's Mac against Geofabrik's Washington extract (364.8 MB, current to 2026-10-17), on PostgreSQL 18 with PostGIS 3.6:

- Against Overpass, over the Washington box clipped to the extract: identical sets and positions, 0.0 m apart, for 3,349 peaks, 2,031 lakes, 1,136 trailheads and 188 crags.
- A planet-sized table of 1.4 million places took 204 MB with its GiST index. A 2,800 km² box answered in 1.7 ms, a 100,000 km² box in 19 ms, and a 60-point ring of that size in 20 ms. Overpass took 78 s for Washington's 3,834 named peaks and 56 s for its 2,247 named lakes that day, and refused 5 of 8 requests with a 502 at once.
- The fill's own run over the whole extract the same day kept 5,612 peaks (2,235 unnamed), 2,044 lakes, 1,139 trailheads and 254 crags: 9,049 rows in a 1.9 MB table.
- Two of Geofabrik's Washington day files (6,359 and 8,835 objects) applied in 0.10 s and 0.12 s, and replaying both over a fill that already held them changed no row. The planet's own day file is measured in 0185.

For the name match: Buck Mountain's OSM node stands 174 m from its listed coordinate (2026-10-07), out of the 150 m reach, and a 500 m name reach took the wrong Reynolds Peak, a named 8,350 ft node 514 m from the 8,510 ft summit.

## Alternatives rejected

- **Raise the tile budget and hold trailheads and crags in memory** (#760's option B: PR #756 with its record 0171, and PR #757 with its record 0170). Rings over the budget, API callers and the pasted-coordinate lookup still used Overpass, and each pod fetched everything on start. Both PRs were closed unmerged on 2026-10-18, and 0180 ports what survived.
- **Self-host Overpass** (option C). A few hundred GB of disk and a service to keep current.
- **Download the planet weekly and compare its hash** (option D). A new planet comes out every week, so the hash always changes and each week costs 95 GB.
- **Keeping no destination index of the app's own**, which #546 settled and 0114 and 0118 repeated. This table is one. What changed is how often Overpass failed from 2026-10-15 to 2026-10-18, and that a fill matched Overpass place for place.
- **A lake as any named water body** (0118's superset). It came from the tiles' `water_name` layer and went with them.

## Consequences

Once the first fill lands, a polygon search of any size up to the cap answers from the table whatever Overpass is doing, and so does a pasted coordinate. Data trails an OSM edit by up to a day, longer while change files fail. Until the first fill, and on a deployment with no database, discovery and the lookup take the Overpass path, with its mirror chain, budgets and deadlines unchanged. A lake whose shore crosses the ring but whose centre is outside was a row from Overpass and is not one from the table, which is also where its marker would stand. The app's lakes shrink to the API's: a pond or tarn the tiles found under 0118 is not found. `POST /api/destinations` still holds the address's discovery slot around discovery (0103), whichever source answers. Ring searches no longer read OpenFreeMap's tiles, so its terms of 2026-10-14 on automated tile reads no longer touch them.
