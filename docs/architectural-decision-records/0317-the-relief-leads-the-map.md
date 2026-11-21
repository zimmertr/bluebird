# 0317. The relief leads the map, in a look for each theme

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Supersedes the "What does not change" half of [0243](0243-map-reads-on-a-dark-ground.md) for the basemap: the map's ground now follows the theme.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, choosing "Relief-led basemap" and keeping the dark "before dawn" half in this PR; built while the maintainer was away
- Issues and PRs: #825
- Cited in code as: record 0317
- Guide: `frontend/src/map/CLAUDE.md` (`ground.ts`, `layerOrder.ts`)

## Context

The prototype's map is the ground: a tint by height, valleys darkest and snow on the summits, under a hillshade, with roads, towns and water faint over it. In the dark theme it reads like the ground before dawn. The build's map was Liberty's light street map in both themes, with the shaded relief and the contours as Layers rows that start off.

## Decision

`map/ground.ts` draws the ground on every load: a `color-relief` tint and a hillshade on one `raster-dem` source read straight from Mapterhorn's tiles, in a new bottom slot, `tint`, under every one of Liberty's layers. Liberty's background and its Natural Earth shading go clear. Its land cover, land use and parks thin to a share of their opacity, its roads thin and its casings thin or go, its water takes each theme's colour, and in the dark look every label, the app's peaks, lakes and landmarks among them, goes light on a dark halo, and the roads and buildings take the dark palette. Each colour is the prototype's `PAL`. `MapView` hands the theme in (`theme`, from `useTheme`) and the ground repaints from the style's own values on each switch.

The source reads Mapterhorn's tiles as served, so the ground loads none of `maplibre-contour`, which the Shaded relief, Topographic and Slope angle rows still load on their first switch. Those rows stay: they add to the ground rather than make it.

Buildings keep their opacity: the Satellite row fades them with its own level (`overlays/imagery.ts`), so the ground repaints them and leaves the opacity alone.

## Evidence

- `ground.test.ts` pins each tint running from the water through the valleys to snow, the share each kind of Liberty's layer keeps in each theme, the labels and buildings repainted only in the dark, the app's own layers left alone, the two layers under Liberty's background, and a switch computing from the style's values and putting back what the light look leaves. `layerOrder.test.ts` pins the `tint` slot at the bottom.

## Open

- The peak and settlement icons are Liberty's sprites and keep their colours in the dark look; the markers' rework (task 5) decides them.
- Mapterhorn's tiles now load with every map rather than on a switch.
