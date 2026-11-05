# 0243. The map's own marks read on a dark ground as well as a light one

- Status: Accepted. Amends 0162 (the scale bar's ends are a dark line and a light one, no longer dark alone).
- Date: 2026-10-27
- Decider: the maintainer (TJ), on issue #799, whose acceptance criteria ask that markers, labels and the scale bar clear WCAG AA on imagery as well as on Liberty, in both themes
- Issues and PRs: #799
- Cited in code as: #799
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `mapStyles.ts` and `controls.ts`; [`docs/STYLES.md`](../STYLES.md), Two themes and Map chrome

## Context

The map's own marks were built for one ground. `MARKER_STROKE` is white, the scale bar drew its ends dark "because the basemap is light in both" themes (record [0162](0162-scale-bar-on-the-theme-ground.md)), and `map.css`, `styles.test.ts` and `STYLES.md` said so. The Satellite row (record [0242](0242-imagery-under-liberty.md)) puts them on forest, which is dark, and on snow, which is lighter than Liberty. No single colour clears 3:1 on both: it would need a relative luminance of at least 0.286 to stand off the forest and at most 0.243 to stand off the snow.

## Decision

- **Every marker and pending dot wears a 1px slate-900 ring outside its white stroke** (`MARKER_HALO_PAINT` in `mapStyles.ts`), on a circle layer of its own beneath each: `results-halo` and `pending-destinations-halo`. The white reads on the forest, the ring on the snow and on Liberty, and the two stand apart. The fills keep their colours, which carry the verdict.
- **The scale bar's ends are two lines in both themes, dark outside and light inside.** The outer is the border it had: the recessed surface opaque in the dark theme, the ink in the light. The inner is a 1px `::after` in the other of the two. In a desk's credit line, which is the scale's one ground there, the inner line is off.
- **Haloed text is measured on its halo**, which travels with it onto any ground. The marker labels (slate-50 on slate-900) and the clickable basemap labels (`POI_LABEL_PAINT`, brown on a light halo) stay as they were.
- **The trails wear a light casing while the Satellite row is on.** `ofm-trails-casing` lies directly under `ofm-trails` in `basemap.ts`, on the same features from the same zoom, solid, a pixel wider on each side, in Liberty's own background (#f8f4f0), so the trail stands on the photo the way it stands on the map. `map/overlays/imagery.ts` shows it in the same `update` that shows the photos and hides it with them; on Liberty it stays hidden, where it would only redraw the ground. Added 2026-10-28, when the trail's 1.69:1 on the forest came back from review.
- **The contour lines turn light on a dark edge while the Satellite row is on** (`overImagery` in `map/terrain.ts`, called by `map/features.ts` with the row's state). The ink is Liberty's background (#f8f4f0) at 0.7 on the minor lines and 0.9 on the index lines, over a `contours-casing` line in stone-900 (#1c1917) at 0.5 and 0.6, half a pixel wider on each side; off the imagery they go back to the brown at 0.35 and 0.6 and the edge hides. The labels keep their light halo, which travels with them. Added 2026-10-28, when the maintainer found the brown at 0.35 vanished over the photos, and drawn the way CalTopo draws its contours on imagery.
- **The ring and its handles stay sky-400.** The rule for changing a colour here was that it fail 3:1 on both new grounds, and sky-400 clears 4.44:1 on the forest.

## Evidence

Measured 2026-10-27 (the trail casing and the contours 2026-10-28), WCAG 2 ratios, on three grounds: a forest (#3a4a33), a snowfield (#e8ecef) and Liberty's background (#f8f4f0). The forest and the snow round the means of a USGS z14 tile over the Enchantments (#333e3e) and one on Rainier's summit snowfield (#dfdedf); the EOX tiles at the same places measured #384123 and #f5f3f0. `styles.test.ts` pins every number marked there.

| Mark | Theme | Forest | Snow | Liberty | Before |
|---|---|---|---|---|---|
| Marker edge, white stroke | both | 9.51 | 1.19 | 1.09 | the only edge |
| Marker edge, slate-900 ring | both | 1.87 | 15.01 | 16.29 | none |
| Marker edge, the better of the two | both | 9.51 | 15.01 | 16.29 | 9.51, 1.19, 1.09 |
| White stroke against the ring | both | 17.83 | | | |
| Marker label on its halo | both | 17.04 on any ground | | | unchanged |
| Basemap label on its halo | both | 8.16 on any ground | | | unchanged |
| Scale bar, outer line | dark | | 15.01 | 16.29 | the only end: 1.87 on forest |
| Scale bar, inner line | dark | 7.72 | | | none |
| Scale bar, lines against each other | dark | 14.46 | | | |
| Scale bar, outer line | light | | 14.41 | 15.64 | the only end: 1.80 on forest |
| Scale bar, inner line | light | 9.51 | | | none |
| Scale bar, lines against each other | light | 17.12 | | | |
| Scale label on its 70% scrim | dark | 5.35 to 15.39 on any ground | | | unchanged |
| Scale label on its 70% scrim | light | 8.16 to 17.12 on any ground | | | unchanged |
| Ring, sky-400 | both | 4.44 | 1.80 | 1.96 | unchanged |
| Pending dot fill, blue-500 | both | 2.59 | 3.10 | 3.36 | its edge now carries it |
| Trail line, #a0522d | both | 1.69 | 4.73 | 5.13 | unchanged |
| Trail casing, #f8f4f0 (with Satellite on) | both | 8.69 | 1.09 | | none |
| Trail as drawn, 85% over its casing | both | 3.89 on the casing | | | 1.69 on forest |
| Contour, minor, brown at 35% (off the imagery) | both | 1.25 | | | |
| Contour, minor, light ink at 70% over its edge (Satellite on) | both | 4.89 | | | 1.25 on forest |
| Contour, minor, its edge at 50% (Satellite on) | both | | 3.20 | | none |
| Contour, index, light ink at 90% over its edge (Satellite on) | both | 7.23 | | | |
| Contour, index, its edge at 60% (Satellite on) | both | | 4.34 | | none |

The wind arrow was already two inks, white at 95% with a slate-900 outline at 85%, and reads on both grounds the way the marker's edge now does. The scale label's range is its ratio over a white map and a black one, so it holds on any ground between.

## Alternatives rejected

- **A dark inner ring with the white outside.** The same pair, but on Liberty, where most of the map is read, a white outer edge vanishes and the dot reads a ring smaller. Dark outside matches the wind arrow and the label halo.
- **One stroke in a middle grey.** No grey clears 3:1 on both the forest and the snow.
- **The contours in their brown at full strength on a light edge**, the trails' own treatment over the photos. It cleared both grounds (the brown 4.17:1 on the snow, the edge 8.69:1 on the forest, the brown 4.52:1 on its edge), but every contour then drew the way a trail does, and a slope of them read as a mesh of paths and as more ink than the photo under it.
- **The scale bar's inner line as an inset `box-shadow`.** The same picture, but the scale bar wears no shadow (records 0147 and 0162), and a pseudo-element draws the line without one.
- **A light scrim behind the scale bar on every ground.** It already stands on the recessed scrim at 70%, which keeps its label legible anywhere; the ends were what vanished.

## Consequences

Two more circle layers draw every marker. Each marker reads a pixel larger at its edge, on Liberty as well, where its white stroke had been lost against the ground. `styles.test.ts` holds the marker pair and the scale's four lines against the three grounds, and the contours' ink and edge against the forest and the snow; a change to `MARKER_STROKE`, `MARKER_HALO`, the recessed token or the ink re-measures them. Two things stay under 3:1 and are left: the ring and the draw handles on snow and on Liberty (sky-400 with a white stroke). They were already under 3:1 on Liberty. The trail line on the forest was the third until its casing: the sienna stays `basemap.ts`'s terrain-matched colour, and over the imagery it now reads on its casing rather than on the forest. On snow the casing is lost (1.09:1) and the trail reads on the snow itself (4.73:1). One more line layer draws every trail while the Satellite row is on, and none while it is off, and one more draws every contour while both that row and Topographic are on. The contours' minor edge clears the snow by little (3.20:1), and on a ground between the forest and the snow neither reaches 3:1 alone: on a mid grey (#808080) the ink reads 2.23:1 and the edge 2.14:1. The pair still draws a line there, the ink standing 4.76:1 off its edge.
