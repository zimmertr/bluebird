# 0269. Every layer on the map stands in one ranked order of slots, with every name over every raster, fill and line

- Status: Accepted
- Date: 2026-11-03
- Decider: the maintainer (TJ), who saw the rain radar paint over the map's names on 2026-11-03 and set the order of the slots the same day
- Issues and PRs: #832, PR #845
- Cited in code as: none
- Guide: `map/` guide: `layerOrder.ts`, `features.ts`, `basemap.ts`, `landmarks.ts`, `terrain.ts`, `resultsLayer.ts`, `overlays/forecastGrid.ts`, `overlays/radar.ts`, `overlays/snow.ts`, `overlays/imagery.ts`, `overlays/fireActivity.ts`, `overlays/closures.ts`; `src/` guide: `testSupport/stubMap.ts`

## Context

The rain radar painted over the names on the map: peaks, lakes, towns and roads. No module ranked its layers against anyone else's. Each called `map.addLayer` with no `beforeId`, so a layer landed on top of whatever stood there when it mounted or its switch came on. A few placed themselves against one neighbour: the radar under the first smoke fill, the snow under the radar, the imagery under Liberty's first road, the relief and contours under the first `ofm-` layer, the basemap patch and the trailhead and crag markers under the style's first label. Nothing ranked an overlay against the style's labels, and every overlay mounted after them, so the grid, the snow, the radar, the smoke, the fires, the closures and the fire detections all drew over every name the basemap carries. (`styles.ts`'s `LAYER`, record [0015](0015-layer-stacking-order.md), is the page's z-index, not the map's.)

## Decision

One module, `frontend/src/map/layerOrder.ts`, owns the stack as `SLOTS`, ranked bottom to top:

1. `ground`: Liberty's ground under the photos
2. `imagery`: the satellite imagery
3. `roads`: the rest of Liberty's ground, its roads, rail, buildings and boundaries
4. `relief`, 5. `slope`, 6. `contours`: the terrain, a slot each
7. `trails`: the trails `basemap.ts` adds and their casing
8. `grid`: the forecast grid's cells
9. `snow`: the snow depth
10. `radar`: every radar frame
11. `smoke`: the smoke fills and outline
12. `closure-areas`: the closed areas, fill and outline
13. `wildfires`: the fire perimeters, fill and outline
14. `closure-trails`: the closed trails and sites
15. `grid-wind`: the forecast grid's wind arrows
16. `hotspots`: the fire detections
17. `contour-labels`: the contour heights
18. `poi-labels`: the peaks and lakes `basemap.ts` adds, with their glows
19. `labels`: the style's own labels
20. `landmarks`: the trailhead and crag markers
21. `ring`: the drawn ring
22. `pending`: the pending dots and their names
23. `results`: the result markers, ranks and names

The rule behind it: every name stands over every raster, fill and line, and the app's markers and names stand over the basemap's, which MapLibre places first in symbol collision because they are higher.

- **One table gives every app layer id its slot.** `addLayerAt(map, spec)` adds a layer under the first layer already on the map from a higher slot, so a layer lands in its slot whenever it is added. Inside a slot each layer goes in at the top, which keeps a module's own order: a fill under its outline, a halo under its dot, the oldest radar frame lowest.
- **The basemap's layers are sorted by where they stand**, being the ones no slot names. The style's last run of symbol layers is its labels. Everything before it is ground, split where the imagery goes by record [0250](0250-layers-palette-and-base-map-opacity.md)'s rule (`imageryIndex` over `basemapGround`, which moved into this module): over the land and water and under the first road.
- **An id the table does not hold throws in development**, so a layer cannot be added unranked. In production it goes on top, as every layer did before, rather than leave the map without it.
- **The stack is read through `getLayersOrder` and `getLayer`**, never `getStyle`.
- **The place labels' glows stay outside it**, each added directly under its own label in the style, and sorted with the style's labels.

The maintainer's list named seventeen slots. Five became more than one here, each to keep a placement an earlier decision made: the ground splits around the imagery (record 0250), the terrain is three slots so any switch order stacks the same, the trails stand over the terrain, and the labels are three slots in the collision order they already had.

## Evidence

The stack before this, read off `features.test.ts` at `397edb6b` (2026-11-03): the style's ground, the basemap patch and the trailhead and crag markers under the style's first label, then the style's labels, then the grid, smoke, fires, closures, fire detections, ring, markers and pending dots, in mount order over them. The radar and the snow went in under the first smoke fill when switched on, over the grid and so over every label.

Liberty's layer list as OpenFreeMap served it on 2026-10-27 (`overlays/fixtures/liberty-layers.json`, 111 layers): its one-way arrows (`road_one_way_arrow`, `road_one_way_arrow_opposite`, indexes 61 and 62) are symbols between its road lines and its bridges, buildings and boundaries (63 to 87). Sorting the basemap by type alone would have ranked the arrows as labels, and every overlay would have gone under the first of them, under 25 layers of bridges, buildings and boundaries. Its labels run unbroken from `waterway_line_label` (88) to the end. The imagery's split falls between `aeroway_fill` and `aeroway_runway`, as before.

No timing was taken. `getStyle` serializes the whole style on every call, sources and every layer's paint included, and the load adds about forty layers through `addLayerAt`. `getLayersOrder` and `getLayer` read what is already held.

## Alternatives rejected

- **Mount order, with each module placing itself against one neighbour.** That is how the radar came to stand over the names. A module had to know which of its neighbours existed, and nothing ranked an overlay against the style's labels.
- **The basemap split into ground and labels by type alone.** Liberty's one-way arrows would have pulled every overlay under its bridges, buildings and boundaries.
- **All of Liberty's ground under the imagery.** The photos would have covered Liberty's roads, rail and boundaries, which record 0250 keeps over them.
- **The trails with the basemap's labels**, by their `ofm-` prefix. They are lines, and would have drawn over every overlay. Under the terrain instead, the slope bands would have shaded over them, which `terrain.ts` had always kept from happening.
- **The slot as an argument at each call site.** That would be a second spelling of each layer's slot, beside the table, free to disagree with it.
- **The table importing every module's id constants.** Every module that adds a layer imports this one, so that would be an import cycle, and `terrain.ts` loads MapLibre, which a node test cannot. The table imports the ids whose home is under `utils/` and spells the rest, and its test holds it to each module's exported ids.

## Consequences

What moved from where it stood before:

- Every overlay now stands under every name on the map: the grid, the snow, the radar, the smoke, the closures, the fires and the fire detections.
- The trailhead and crag markers stand over the style's own labels, where they stood under them.
- The pending dots stand under the result markers, where they stood over them.
- The closed areas stand under the fire perimeters, where they stood over them. The closed trails stay over the fires.
- The grid's wind arrows stand over the fires and closures, where they stood under the smoke.
- The relief, the slope and the contours stand over Liberty's bridges, buildings and boundaries, where they stood under them. They stay under the trails and every label.

Held in place by `layerOrder.test.ts`, which pins the slots and stacks one layer per slot, added in three orders, to one result, and by every map module's own test, which adds its layers through `addLayerAt` and so throws on an id the table does not hold. `features.test.ts` pins the whole stack the load builds, and the radar and the snow switched on after it. The stub map answers `getLayersOrder` and each layer's type and source. A new layer needs a row in the table, and a new basemap style is sorted by the same two rules, which only hold while its labels come last.
