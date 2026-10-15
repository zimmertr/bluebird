# 0157. Cities, towns, villages, hamlets and climbing labels are selectable on the map

- Status: Accepted
- Date: 2026-10-15
- Decider: the maintainer (TJ), on issue #710, 2026-10-15
- Issues and PRs: #710, #119, #715
- Cited in code as: #710
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `basemap.ts`, `mapPopups.ts` and `poiPopup.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `basemapPoi.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Click a destination; [`docs/DATA.md`](../DATA.md), Map tiles

## Context

Record [0156](0156-destination-subheadings-say-search.md) gives the panel's Map row the line `Search by name, or select any destination from it.` Since #119 the map let a reader select its peaks and lakes and nothing else, while it labels towns everywhere and, at a crag, dozens of climbing features. #715 is adding a crag destination type found by Overpass. For "any destination" to be true of what the map labels, more of those labels had to be selectable.

## Decision

- **Cities, towns, villages and hamlets are selectable** where the Liberty style already labels them: `label_city`, `label_city_capital`, `label_town`, `label_village` and `label_other`. The app adds no label of its own, only a hidden glow directly beneath each layer the style carries, filtered to those four classes. A click opens the POI card, and Add to analysis registers the place with its class as its kind and no elevation.
- **`label_other` is guarded by class.** It labels every place class the style names no layer for, suburbs, neighbourhoods and islands among them, so a class outside the four is refused, and a target in `mapPopups.ts` can say which features of its layers it accepts, so a refused label shows no pointer and its click passes to whatever is under it.
- **Climbing labels are selectable**, drawn by a layer of the app's own, `ofm-climbing`: the tiles' `poi` features of class `climbing` with a name, from z14, in the peaks' label treatment with the sprite's `circle_stroked_11`, since the sprite has no climbing glyph. A crag and a single route are both selectable and both are added as kind `climbing`. The style's `poi_r1`, `poi_r7` and `poi_r20` lose that class so nothing is labelled twice.
- **A clicked place matches a registered one of the same name within 4 km** (`PLACE_MATCH_M`), where a summit keeps 60 m.
- **Trailheads stay unclickable.**

## Evidence

Tiles decoded from `tiles.openfreemap.org/planet/latest` and the Liberty style read on 2026-10-15:

- North Bend, z14/2649/5729: the `place` layer holds North Bend as `class=town` (rank 11) and Harman Heights as `class=hamlet`. North Bend is in no `poi` feature.
- Index Lower Town Wall, z14/2659/5707: 58 `poi` features of `class=climbing`, `subclass=climbing`, ranks 1 to 20, 57 of them named, none with `ele`. A crag (`Foodbar Crag`) and a route (`Thin Fingers`) carry identical keys: the tile drops OSM's `climbing=` tag. The z12 and z13 tiles over the same point hold no `poi` feature at all, so a climbing floor under 14 would draw nothing more. In the built image at 1389x691, the routes on one wall still overlap at z15.
- Mount Si, z14/2652/5729: no trailhead feature. `Mount Si Trailhead` is a `class=bus`, `subclass=bus_stop` POI and `Mount Si Trailhead Parking` a `parking` POI.
- Liberty draws `place` labels with `label_city` (minzoom 3), `label_city_capital`, `label_town` (minzoom 6), `label_village` (minzoom 9) and `label_other` (minzoom 8, every class not city, continent, country, state, town or village), and `poi` labels with `poi_r1` (minzoom 15), `poi_r7` (16), `poi_r20` (17) and `poi_transit`. Every filter is in expression syntax, so composing onto one is safe. The sprite (`ofm_f384`) has `mountain_11`, `water_11`, `circle_11`, `circle_stroked_11` and no climbing icon.
- A city labelled from z3 stands on a grid of 360/(2^3 × 4096) degrees, 1.22 km at the equator, so one city clicked at two zooms can land over a kilometre apart. 4 km is over three of those cells.

`basemapPoi.test.ts`, `basemap.test.ts`, `mapPopups.test.ts`, `map/poiPopup.test.ts` and `features.test.ts` hold the classes, the layers, the glows and their filters, the composed style filters and the stack.

## Alternatives rejected

- **Trailheads from a second source** (Overpass or another tile set): the basemap draws no trailhead, so a clickable one would be a marker the map otherwise lacks, at the cost of a second data source for one layer.
- **A crag-only click**: the tile cannot tell a crag from a route, so there is no way to offer one and not the other.
- **`label_other` taken whole**: it would make every suburb, neighbourhood and island label a destination, where the four settlement classes are the ones the maintainer asked for.

## Consequences

The place targets are the style's own ids, so a Liberty update that renames one drops it as a target without an error; the glow and the click both skip an id the style does not carry. The Type column and the card show the tile's word, so a clicked town reads `Town` and a clicked crag reads `Climbing`. #715's crag type will link out to Mountain Project, which is that type's link, not a clicked climbing feature's: a click registers kind `climbing` and links to an OpenStreetMap pin.
