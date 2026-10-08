# 0115. The elevation lookup depends on OpenFreeMap's zoom-14 peak layer as published, with the pod's lookup behind it and nothing watching for a change

- Status: Accepted
- Date: 2026-10-07
- Decider: the maintainer (TJ), on PR #674, told that the lookup now rests on the tile schema with no canary: "is fine, just document it as an ADR"
- Issues and PRs: #673, #674, #581 (a clicked summit reads `ele_ft` off the same layer), #118 and #119 (the map's own summit labels do too)
- Cited in code as: #673 (the header of `peakTiles.ts`)
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `peakTiles.ts` bullet; [`docs/DATA.md`](../DATA.md), Map tiles
- Related: 0114 (the lookup's design and its measurements), 0101 (no cache, no index, no elevation API), 0021 (the browser path is the only path)

## Context

A vector tile is one square of the map at one zoom level, a static file the browser fetches and draws itself. Zoom 0 is the whole world in one tile and every zoom level cuts each tile into four, so at zoom 14 a tile covers about 1.7 km on a side over Washington and the planet is about 270 million of them. The basemap reads these from `tiles.openfreemap.org`, which OpenFreeMap builds from OpenStreetMap with Planetiler on the OpenMapTiles schema, and 0114 made the same tiles the first source of a pasted coordinate's elevation.

The lookup can do that only because of how one layer is built. The `mountain_peak` layer holds OpenStreetMap's peak and volcano nodes, but from zoom 7 to 13 the build keeps at most five per label-grid cell so the drawn map is not a wall of summit labels (`MountainPeak.java` in planetiler-openmaptiles), which makes a tile at those zooms a sample of the peaks under it. From zoom 14 it keeps every node. Zoom 14 is therefore the first zoom at which "which peak stands at this coordinate" is a question a tile answers completely, and the lookup reads that zoom and no other (`PEAK_TILE_ZOOM`).

Five facts about the layer are what the lookup relies on, and nobody promises any of them:

1. The layer is named `mountain_peak` and is complete at zoom 14.
2. Its `class` attribute tells a peak or volcano from a saddle, which shares the layer and is left out.
3. Its `ele_ft` attribute is the elevation in feet rounded from OpenStreetMap's raw metres, the same arithmetic as the pod's `_ele_ft` (row 20 of the mirror table, #581), so a tile and Overpass report one number for one node.
4. Its `name` attribute is OpenStreetMap's `name` tag, which the browser's name match within `PEAK_NAME_RADIUS_M` compares.
5. Its feature id is Planetiler's: the OSM id times ten plus one for a node, so `(id - 1) / 10` is the node id a placed row carries, the id the pod would have reported and the one a pasted peak and the same peak discovered by a ring dedupe on.

Two more are operational: the TileJSON at `https://tiles.openfreemap.org/planet` names the current build's tile path (the `latest` path is the fallback when it cannot be read), and OpenFreeMap rebuilds the planet about weekly, so a node edited since the last build is the pod's lookup to find (0114).

Measured 2026-10-07 on the maintainer's 100 Washington summits: the tiles placed 96 with every elevation and node id identical to Overpass's, a 97th by name, and left two nodes with no `ele` anywhere and one edited after the build.

## Decision

**The lookup reads the layer as OpenFreeMap publishes it, and the pod's Overpass lookup stands behind it for every row the tiles do not place.** No copy of the data, no self-hosted tiles, no check of the schema at build time, and no canary against the live host. A change to any fact above degrades the app to the path it had before #673 for the rows it affects, slower and at the mercy of Overpass, and breaks nothing.

**Nothing in CI reads a live tile, and that is deliberate.** `peakTiles.test.ts` decodes tiles the repository's own encoder writes (`testSupport/mvt.ts`), so it proves the decoder and the matching against the schema as this repository understands it, not against the schema as published. The browser suite answers `tiles.openfreemap.org` from fixtures like every third-party host (#412), and Lighthouse measures the cold load with no list in the box. A CI job that reached a donated host on every PR would make the pipeline depend on that host's uptime and spend its bandwidth on nothing a reader asked for.

## Consequences

What each change does, and what notices it:

| If OpenFreeMap changes | A reader sees | What notices |
|---|---|---|
| The layer is renamed, or zoom 14 is thinned | No row placed from tiles; every row goes to the pod and its elevation arrives when Overpass answers, or not | Nothing in CI. The pod's log line `Resolving elevation for N custom destination(s) via OSM` carries whole lists instead of a few rows, and the map's own summit labels, painted from the same layer in `basemap.ts`, go blank |
| `ele_ft` is renamed or dropped | Nodes decode with no elevation and their rows go to the pod | The same two signs, and a clicked summit (#581) loses its elevation |
| `class` values change | Peaks are skipped, or a saddle within 150 m is taken for the summit and its elevation shown | Nothing. The one change that can place a wrong number rather than none |
| The feature id convention changes | Elevations stay right; the node id is wrong or absent, so a pasted peak and the same peak a ring discovers may no longer dedupe | Nothing |
| The TileJSON cannot be read | The `latest` path is used | Nothing |
| The host is down or slow | The first tile not back in `TILE_DEADLINE_MS` ends the pass and its rows go to the pod | The basemap is blank too, which the reader sees first |
| A build goes stale | Rows the tiles place carry an elevation up to a week old; a node that gained an elevation since still reaches the pod | Nothing; by design (0114) |

Since #675 (0118) a ring's discovery reads the same tiles, so two more facts join the list: the `water_name` layer carries every named water body at zoom 14 with the class `lake` (measured 2026-10-07 over three rings, a superset of Overpass's `water=lake` answer), and its feature id follows the same convention for a way (2) and a relation (3). A change there sends rings to the map server the way the first four send rows to the pod, and the sign is the pod's discovery count rising. The repair for any of the first four is in `peakTiles.ts` alone, and for the lakes in `tileDiscovery.ts` (`decodePeaks`, `osmIdOf`, `PEAK_TILE_ZOOM`, `TILEJSON_URL`), with the test encoder in `testSupport/mvt.ts` following the new shape; the pod, the API and the analysis do not change. The same change breaks the map's summit labels and the clicked summit's elevation at the same moment, which are the places it would be seen.

OpenFreeMap publishes no quota and its terms forbid automated bulk collection. The lookup is a reader's own use of the map data for the reader's own list, one to four tiles a row, the same files the map would load zoomed to each point (`docs/DATA.md`, Map tiles). Whether to tell the operator is the maintainer's call and open as of this record.

## Alternatives considered

None was taken; the maintainer chose to document the dependency and leave it (2026-10-07).

- **A real zoom-14 tile committed as a test fixture** (the tile under Mount Rainier, a few kilobytes). Would hold the decoder and the id arithmetic to real bytes rather than to the repository's own encoder, and would catch a decoder regression. Would not catch a change at the publisher, since a committed tile is a copy of what was published the day it was committed.
- **A count of rows per pod lookup, as a metric with an alert.** The pod already logs the count; a metric would turn the sign above into a page within a day of the change. The project has no alerting yet (#287), so the metric alone would be a dashboard nobody reads until a reader reports blank cells.
- **A scheduled live canary**, a job reading one known tile and asserting Rainier's node, id and elevation. The only thing that would catch a publisher change before a reader does. More infrastructure, against a donated host, for a change that degrades to the old path rather than failing.
- **Self-hosted tiles or a self-maintained peak index.** Settled no under #546 and 0101, and the dependency would only move: a self-built tile set has the same schema to keep.
- **Reading the layer from the pod**, so API callers get the tiles too and the schema is read in one language. 0114 says why not: the browser's residual after the tiles is a few rows a list, which the pod's Overpass lookup handles.
